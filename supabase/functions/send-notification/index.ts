// Phase 10 — Unified notification dispatcher.
// Signature: { channel, templateKey, recipient, variables, eventType, tenantId, propertyId, referenceId?, locale? }
// recipient: { userId?, phone?, email? }
// Behavior:
//  1) Compute idempotency_key from (eventType, recipientIdent, templateKey, referenceId||minute-bucket).
//  2) Upsert-safe insert notifications row (PENDING).
//  3) IN_APP → mark SENT+DELIVERED immediately (client Realtime picks it up).
//  4) SMS/WHATSAPP/EMAIL → check provider secrets; if missing return structured
//     { ok:false, error_code:"PROVIDER_NOT_CONFIGURED" } and log a FAILED attempt.
//     If configured — call provider, log STARTED then ACCEPTED/FAILED.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Channel = "IN_APP" | "SMS" | "WHATSAPP" | "EMAIL";

interface Body {
  channel: Channel;
  templateKey: string;
  recipient: { userId?: string; phone?: string; email?: string };
  variables?: Record<string, unknown>;
  eventType: string;
  tenantId: string;
  propertyId?: string;
  referenceId?: string;
  locale?: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const b = (await req.json()) as Body;
    if (!b?.channel || !b?.templateKey || !b?.eventType || !b?.tenantId) {
      return json({ ok: false, error_code: "BAD_REQUEST", error: "missing fields" }, 400);
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const recipientIdent =
      b.recipient?.userId ?? b.recipient?.phone ?? b.recipient?.email ?? "unknown";
    const bucket = b.referenceId ?? String(Math.floor(Date.now() / 60000));
    const idempotencyKey = `${b.eventType}:${b.channel}:${b.templateKey}:${recipientIdent}:${bucket}`;

    const insertRow = {
      tenant_id: b.tenantId,
      property_id: b.propertyId ?? null,
      recipient_user_id: b.recipient?.userId ?? null,
      recipient_phone: b.recipient?.phone ?? null,
      recipient_email: b.recipient?.email ?? null,
      event_type: b.eventType,
      channel: b.channel,
      template_key: b.templateKey,
      locale: b.locale ?? "en",
      payload: b.variables ?? {},
      status: "PENDING",
      idempotency_key: idempotencyKey,
    };

    // Insert (idempotent on tenant_id+idempotency_key)
    const { data: existing } = await admin
      .from("notifications")
      .select("id, status")
      .eq("tenant_id", b.tenantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    let notifId: string;
    if (existing) {
      notifId = existing.id;
      if (existing.status === "DELIVERED" || existing.status === "SENT") {
        return json({ ok: true, notification_id: notifId, deduped: true });
      }
    } else {
      const { data, error } = await admin
        .from("notifications")
        .insert(insertRow)
        .select("id")
        .single();
      if (error) return json({ ok: false, error_code: "DB_ERROR", error: error.message }, 500);
      notifId = data.id;
    }

    // --- Channel dispatch ---
    if (b.channel === "IN_APP") {
      await admin
        .from("notifications")
        .update({
          status: "DELIVERED",
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
        })
        .eq("id", notifId);
      return json({ ok: true, notification_id: notifId, status: "DELIVERED" });
    }

    // External channels — check provider config
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioTok = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
    const twilioWaFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const resendKey = Deno.env.get("RESEND_API_KEY");

    let provider = "none";
    let configured = false;
    if (b.channel === "SMS") { provider = "twilio"; configured = !!(twilioSid && twilioTok && twilioFrom); }
    if (b.channel === "WHATSAPP") { provider = "twilio"; configured = !!(twilioSid && twilioTok && twilioWaFrom); }
    if (b.channel === "EMAIL") { provider = "resend"; configured = !!resendKey; }

    const attempt = {
      notification_id: notifId,
      attempt_number: 1,
      provider,
      status: "STARTED" as const,
      attempted_at: new Date().toISOString(),
    };
    const { data: attemptRow } = await admin
      .from("notification_attempts")
      .insert(attempt)
      .select("id")
      .single();

    if (!configured) {
      await admin.from("notification_attempts").update({
        status: "FAILED",
        error_code: "PROVIDER_NOT_CONFIGURED",
        error_message: `Provider ${provider} for channel ${b.channel} has no credentials configured.`,
        completed_at: new Date().toISOString(),
      }).eq("id", attemptRow!.id);
      await admin.from("notifications").update({ status: "FAILED" }).eq("id", notifId);
      return json({
        ok: false,
        notification_id: notifId,
        error_code: "PROVIDER_NOT_CONFIGURED",
        message: `${b.channel} not configured — add ${b.channel === "EMAIL" ? "RESEND_API_KEY" : "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_" + (b.channel === "WHATSAPP" ? "WHATSAPP_FROM" : "FROM_NUMBER")}.`,
      }, 200);
    }

    // Configured path — minimal Twilio/Resend calls
    try {
      let providerRef: string | null = null;
      if (b.channel === "SMS" || b.channel === "WHATSAPP") {
        const to = b.channel === "WHATSAPP" ? `whatsapp:${b.recipient.phone}` : b.recipient.phone!;
        const from = b.channel === "WHATSAPP" ? `whatsapp:${twilioWaFrom}` : twilioFrom!;
        const body = renderTemplate(b.templateKey, b.variables ?? {});
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${twilioSid}:${twilioTok}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: to, From: from, Body: body }),
          },
        );
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message ?? "twilio_error");
        providerRef = j.sid ?? null;
      } else if (b.channel === "EMAIL") {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM") ?? "noreply@hostylia.com",
            to: b.recipient.email,
            subject: renderTemplate(b.templateKey + "_subject", b.variables ?? {}),
            text: renderTemplate(b.templateKey, b.variables ?? {}),
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message ?? "resend_error");
        providerRef = j.id ?? null;
      }
      await admin.from("notification_attempts").update({
        status: "ACCEPTED",
        provider_message_ref: providerRef,
        completed_at: new Date().toISOString(),
      }).eq("id", attemptRow!.id);
      await admin.from("notifications").update({
        status: "SENT",
        sent_at: new Date().toISOString(),
      }).eq("id", notifId);
      return json({ ok: true, notification_id: notifId, provider_message_ref: providerRef });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 500) : "unknown";
      await admin.from("notification_attempts").update({
        status: "FAILED",
        error_code: "PROVIDER_ERROR",
        error_message: msg,
        completed_at: new Date().toISOString(),
      }).eq("id", attemptRow!.id);
      await admin.from("notifications").update({ status: "FAILED" }).eq("id", notifId);
      return json({ ok: false, notification_id: notifId, error_code: "PROVIDER_ERROR", message: msg }, 200);
    }
  } catch (e) {
    return json({ ok: false, error_code: "INTERNAL", error: e instanceof Error ? e.message : "err" }, 500);
  }
});

function renderTemplate(key: string, vars: Record<string, unknown>): string {
  // Minimal built-in templates; real templating lives in a later phase.
  const T: Record<string, string> = {
    complaint_sla_breach_warden: "Complaint {{complaint_number}} has breached SLA.",
    complaint_sla_breach_warden_subject: "SLA Breach — Complaint {{complaint_number}}",
    complaint_sla_breach_admin: "Complaint {{complaint_number}} SLA breach (property).",
    complaint_sla_breach_admin_subject: "SLA Breach — Complaint {{complaint_number}}",
    fee_reminder_student: "Invoice {{invoice_number}} due {{due_date}} — balance ₹{{balance_rupees}}.",
    fee_reminder_student_subject: "Fee Reminder — Invoice {{invoice_number}} due {{due_date}}",
    fee_reminder_parent: "Reminder: invoice {{invoice_number}} for your child is due {{due_date}}.",
    fee_reminder_parent_subject: "Fee Reminder — Invoice {{invoice_number}} due {{due_date}}",
    payment_receipt: "Receipt {{payment_number}} for ₹{{amount_rupees}} received. Thank you.",
    payment_receipt_subject: "Payment Receipt {{payment_number}} — Hostylia",
    notice_broadcast_subject: "{{title}}",
    notice_broadcast: "{{body}}",
    staff_invite_subject: "You've been invited to Hostylia as {{role}}",
    staff_invite:
      "You've been added as {{role}} on Hostylia. Sign in with this email address to get started.",
    gate_event: "Gate {{direction}} recorded for pass {{pass_number}}.",
    late_entry: "Late entry on pass {{pass_number}}.",
    visitor_gate: "Visitor {{name}} — {{direction}}.",
  };
  let s = T[key] ?? key;
  const merged: Record<string, unknown> = { ...vars };
  if (typeof merged.balance_paise === "number") merged.balance_rupees = (merged.balance_paise as number) / 100;
  if (typeof merged.amount_paise === "number") merged.amount_rupees = (merged.amount_paise as number) / 100;
  for (const [k, v] of Object.entries(merged)) s = s.replaceAll(`{{${k}}}`, String(v ?? ""));
  return s;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
