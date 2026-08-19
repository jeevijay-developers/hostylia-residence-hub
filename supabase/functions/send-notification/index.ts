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
    if (b.channel === "SMS") {
      provider = "twilio";
      configured = !!(twilioSid && twilioTok && twilioFrom);
    }
    if (b.channel === "WHATSAPP") {
      provider = "twilio";
      configured = !!(twilioSid && twilioTok && twilioWaFrom);
    }
    if (b.channel === "EMAIL") {
      provider = "resend";
      configured = !!resendKey;
    }

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
      await admin
        .from("notification_attempts")
        .update({
          status: "FAILED",
          error_code: "PROVIDER_NOT_CONFIGURED",
          error_message: `Provider ${provider} for channel ${b.channel} has no credentials configured.`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", attemptRow!.id);
      await admin.from("notifications").update({ status: "FAILED" }).eq("id", notifId);
      return json(
        {
          ok: false,
          notification_id: notifId,
          error_code: "PROVIDER_NOT_CONFIGURED",
          message: `${b.channel} not configured — add ${b.channel === "EMAIL" ? "RESEND_API_KEY" : "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_" + (b.channel === "WHATSAPP" ? "WHATSAPP_FROM" : "FROM_NUMBER")}.`,
        },
        200,
      );
    }

    // Configured path — Twilio/Resend calls
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
        const vars = b.variables ?? {};
        const textBody = renderTemplate(b.templateKey, vars);
        const htmlBody = renderHtmlTemplate(b.templateKey, vars);
        const subject = renderTemplate(b.templateKey + "_subject", vars);

        const emailPayload: Record<string, unknown> = {
          // Staff Invitation (this Resend-based pipeline) intentionally keeps
          // its own sender identity, separate from Supabase Auth SMTP's
          // team@hostylia.com (Reset Password / Forgot Password) — the two
          // are deliberately distinct delivery systems with distinct senders.
          from: Deno.env.get("RESEND_FROM") ?? "noreply@hostylia.com",
          to: b.recipient.email,
          subject,
          text: textBody,
        };
        if (htmlBody) emailPayload.html = htmlBody;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message ?? "resend_error");
        providerRef = j.id ?? null;
      }
      await admin
        .from("notification_attempts")
        .update({
          status: "ACCEPTED",
          provider_message_ref: providerRef,
          completed_at: new Date().toISOString(),
        })
        .eq("id", attemptRow!.id);
      await admin
        .from("notifications")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
        })
        .eq("id", notifId);
      return json({ ok: true, notification_id: notifId, provider_message_ref: providerRef });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 500) : "unknown";
      await admin
        .from("notification_attempts")
        .update({
          status: "FAILED",
          error_code: "PROVIDER_ERROR",
          error_message: msg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", attemptRow!.id);
      await admin.from("notifications").update({ status: "FAILED" }).eq("id", notifId);
      return json(
        { ok: false, notification_id: notifId, error_code: "PROVIDER_ERROR", message: msg },
        200,
      );
    }
  } catch (e) {
    return json(
      { ok: false, error_code: "INTERNAL", error: e instanceof Error ? e.message : "err" },
      500,
    );
  }
});

// ---------------------------------------------------------------------------
// Plain-text templates (SMS / WhatsApp / email fallback)
// ---------------------------------------------------------------------------
function renderTemplate(key: string, vars: Record<string, unknown>): string {
  const T: Record<string, string> = {
    complaint_sla_breach_warden: "Complaint {{complaint_number}} has breached SLA.",
    complaint_sla_breach_warden_subject: "SLA Breach — Complaint {{complaint_number}}",
    complaint_sla_breach_admin: "Complaint {{complaint_number}} SLA breach (property).",
    complaint_sla_breach_admin_subject: "SLA Breach — Complaint {{complaint_number}}",
    fee_reminder_student:
      "Invoice {{invoice_number}} due {{due_date}} — balance ₹{{balance_rupees}}.",
    fee_reminder_student_subject: "Fee Reminder — Invoice {{invoice_number}} due {{due_date}}",
    fee_reminder_parent: "Reminder: invoice {{invoice_number}} for your child is due {{due_date}}.",
    fee_reminder_parent_subject: "Fee Reminder — Invoice {{invoice_number}} due {{due_date}}",
    payment_receipt: "Receipt {{payment_number}} for ₹{{amount_rupees}} received. Thank you.",
    payment_receipt_subject: "Payment Receipt {{payment_number}} — Hostylia",
    notice_broadcast_subject: "{{title}}",
    notice_broadcast: "{{body}}",
    staff_invite_subject: "You've been invited to join {{hostel_name}} on Hostylia as {{role}}",
    staff_invite:
      "Hi {{invitee_name}}, you've been invited to join {{hostel_name}} on Hostylia as {{role}}. Set your password to get started: {{setup_url}}",
    gate_event: "Gate {{direction}} recorded for pass {{pass_number}}.",
    late_entry: "Late entry on pass {{pass_number}}.",
    visitor_gate: "Visitor {{name}} — {{direction}}.",
  };
  let s = T[key] ?? key;
  const merged: Record<string, unknown> = { ...vars };
  if (typeof merged.balance_paise === "number")
    merged.balance_rupees = (merged.balance_paise as number) / 100;
  if (typeof merged.amount_paise === "number")
    merged.amount_rupees = (merged.amount_paise as number) / 100;
  for (const [k, v] of Object.entries(merged)) s = s.replaceAll(`{{${k}}}`, String(v ?? ""));
  return s;
}

// ---------------------------------------------------------------------------
// HTML email templates — rendered for the EMAIL channel only.
// Returns null when no HTML template is defined for the key (falls back to
// text-only for providers that support it, or is simply omitted).
// Variables use the same {{placeholder}} syntax as renderTemplate.
// ---------------------------------------------------------------------------
function renderHtmlTemplate(key: string, vars: Record<string, unknown>): string | null {
  const merged: Record<string, unknown> = {
    year: new Date().getFullYear().toString(),
    ...vars,
  };
  if (typeof merged.balance_paise === "number")
    merged.balance_rupees = (merged.balance_paise as number) / 100;
  if (typeof merged.amount_paise === "number")
    merged.amount_rupees = (merged.amount_paise as number) / 100;

  const H: Record<string, string> = {
    // -----------------------------------------------------------------------
    // Staff Invitation Email
    // Variables: invitee_name, hostel_name, role, invite_date, setup_url,
    //            expiry_days, year
    // -----------------------------------------------------------------------
    staff_invite: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>You've Been Invited — Hostylia</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;mso-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;">
    <tr><td align="center" style="padding:32px 16px;">

      <!-- ===== Email Card ===== -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(15,31,61,0.12);">

        <!-- HEADER -->
        <tr>
          <td style="background-color:#0f1f3d;padding:20px 32px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <div style="width:36px;height:36px;background:#2563eb;border-radius:8px;text-align:center;line-height:36px;font-size:20px;font-weight:900;color:#ffffff;display:inline-block;">H</div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:1px;font-family:Arial,Helvetica,sans-serif;">HOSTYLIA</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ILLUSTRATION + HEADING -->
        <tr>
          <td style="padding:40px 32px 20px;text-align:center;background:#ffffff;">
            <!-- Envelope + person SVG illustration -->
            <svg width="140" height="118" viewBox="0 0 140 118" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 8px;">
              <!-- Sparkles -->
              <circle cx="22" cy="22" r="4.5" fill="#fbbf24" opacity="0.85"/>
              <circle cx="118" cy="16" r="3.5" fill="#fbbf24" opacity="0.6"/>
              <circle cx="16" cy="60" r="3" fill="#93c5fd" opacity="0.7"/>
              <circle cx="124" cy="55" r="3" fill="#93c5fd" opacity="0.7"/>
              <circle cx="38" cy="10" r="2.5" fill="#60a5fa" opacity="0.6"/>
              <circle cx="102" cy="8" r="2.5" fill="#60a5fa" opacity="0.6"/>
              <!-- Envelope shadow -->
              <ellipse cx="70" cy="115" rx="44" ry="4" fill="#cbd5e1" opacity="0.35"/>
              <!-- Letter sheet (white card peeking out) -->
              <rect x="38" y="28" width="64" height="72" rx="6" fill="white" stroke="#e2e8f0" stroke-width="1.5"/>
              <!-- Letter lines on card -->
              <rect x="50" y="44" width="40" height="4" rx="2" fill="#bfdbfe"/>
              <rect x="50" y="54" width="32" height="3" rx="1.5" fill="#dbeafe"/>
              <rect x="50" y="63" width="36" height="3" rx="1.5" fill="#dbeafe"/>
              <!-- Envelope body -->
              <rect x="15" y="52" width="110" height="62" rx="9" fill="#bfdbfe"/>
              <!-- Envelope flap (triangle) -->
              <path d="M15 52 L70 84 L125 52 Z" fill="#93c5fd"/>
              <!-- Envelope bottom fold lines -->
              <path d="M15 114 L50 88 M125 114 L90 88" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
              <!-- Person avatar circle -->
              <circle cx="70" cy="20" r="14" fill="#2563eb"/>
              <!-- Person head -->
              <circle cx="70" cy="15" r="5.5" fill="white"/>
              <!-- Person shoulders arc -->
              <path d="M59 27.5 Q70 21 81 27.5" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
            </svg>
            <h1 style="margin:12px 0 0;font-size:30px;font-weight:800;color:#0f1f3d;letter-spacing:-0.5px;font-family:Arial,Helvetica,sans-serif;">You're Invited!</h1>
          </td>
        </tr>

        <!-- BODY TEXT -->
        <tr>
          <td style="padding:4px 36px 8px;">
            <p style="margin:0 0 12px;font-size:15px;color:#334155;font-family:Arial,Helvetica,sans-serif;">Hello <strong style="color:#2563eb;">{{invitee_name}}</strong>,</p>
            <p style="margin:0 0 10px;font-size:15px;color:#334155;line-height:1.65;font-family:Arial,Helvetica,sans-serif;">
              You have been invited to join <strong>{{hostel_name}}</strong> on Hostylia.<br/>
              Your role is <strong style="color:#2563eb;">{{role}}</strong>.
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.65;font-family:Arial,Helvetica,sans-serif;">
              Please set your password to activate your account and get started.
            </p>
          </td>
        </tr>

        <!-- CTA BUTTON -->
        <tr>
          <td style="padding:0 36px 28px;text-align:center;">
            <a href="{{setup_url}}"
               style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 44px;border-radius:8px;letter-spacing:0.3px;font-family:Arial,Helvetica,sans-serif;">
              Set Your Password
            </a>
          </td>
        </tr>

        <!-- INFO CARDS -->
        <tr>
          <td style="padding:0 36px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">

              <!-- Organization row -->
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px;width:36px;">
                        <div style="width:36px;height:36px;background:#eff6ff;border-radius:7px;text-align:center;line-height:36px;">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:9px;">
                            <path d="M3 21h18M6 21V7l6-4 6 4v14M9 21v-4h6v4" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;font-family:Arial,Helvetica,sans-serif;">Organization</p>
                        <p style="margin:0;font-size:14px;font-weight:600;color:#0f1f3d;font-family:Arial,Helvetica,sans-serif;">{{hostel_name}}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Role row -->
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px;width:36px;">
                        <div style="width:36px;height:36px;background:#eff6ff;border-radius:7px;text-align:center;line-height:36px;">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:9px;">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <circle cx="12" cy="7" r="4" stroke="#2563eb" stroke-width="2"/>
                          </svg>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;font-family:Arial,Helvetica,sans-serif;">Your Role</p>
                        <p style="margin:0;font-size:14px;font-weight:600;color:#0f1f3d;font-family:Arial,Helvetica,sans-serif;">{{role}}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Invited on row -->
              <tr>
                <td style="padding:14px 16px;background:#ffffff;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px;width:36px;">
                        <div style="width:36px;height:36px;background:#eff6ff;border-radius:7px;text-align:center;line-height:36px;">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:9px;">
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="#2563eb" stroke-width="2"/>
                            <line x1="16" y1="2" x2="16" y2="6" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
                            <line x1="8" y1="2" x2="8" y2="6" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
                            <line x1="3" y1="10" x2="21" y2="10" stroke="#2563eb" stroke-width="2"/>
                          </svg>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;font-family:Arial,Helvetica,sans-serif;">Invited On</p>
                        <p style="margin:0;font-size:14px;font-weight:600;color:#0f1f3d;font-family:Arial,Helvetica,sans-serif;">{{invite_date}}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- SECURE & CONFIDENTIAL NOTICE -->
        <tr>
          <td style="padding:0 36px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
              <tr>
                <td style="padding:14px 16px;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:top;padding-right:10px;width:22px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-top:1px;">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </td>
                      <td style="vertical-align:top;">
                        <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;">Secure &amp; Confidential</p>
                        <p style="margin:0;font-size:12px;color:#3b82f6;line-height:1.55;font-family:Arial,Helvetica,sans-serif;">This invitation link is unique to you and will expire in {{expiry_days}} days.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:#0f1f3d;padding:22px 32px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">&copy; {{year}} Hostylia. All rights reserved.</p>
            <p style="margin:0;font-size:11px;color:#475569;font-family:Arial,Helvetica,sans-serif;">If you did not expect this invitation, you can safely ignore this email.</p>
          </td>
        </tr>

      </table>
      <!-- ===== End Email Card ===== -->

    </td></tr>
  </table>
</body>
</html>`,
  };

  const tmpl = H[key];
  if (!tmpl) return null;

  let s = tmpl;
  for (const [k, v] of Object.entries(merged)) s = s.replaceAll(`{{${k}}}`, String(v ?? ""));
  return s;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
