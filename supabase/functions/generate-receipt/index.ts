// Generate a simple text-based receipt PDF-ish (plain text as placeholder),
// upload to `receipts` bucket, register a documents row.
// WhatsApp/email delivery is stubbed with a TODO — Phase 2 flagged Twilio as
// pending manual setup, so no real provider is wired.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "payment_id required" }, 400, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pay, error } = await admin
      .from("payments")
      .select("id, tenant_id, property_id, student_id, invoice_id, payment_number, amount_paise, mode, paid_at, students(full_name), invoices(invoice_number)")
      .eq("id", payment_id)
      .single();
    if (error || !pay) return json({ error: "Payment not found" }, 404, cors);

    const contents = [
      "HOSTYLIA — PAYMENT RECEIPT",
      "===========================",
      `Receipt No: ${pay.payment_number}`,
      `Date: ${pay.paid_at ?? new Date().toISOString()}`,
      `Student: ${pay.students?.full_name ?? "—"}`,
      `Invoice: ${pay.invoices?.invoice_number ?? "—"}`,
      `Mode: ${pay.mode}`,
      `Amount (INR): ${(pay.amount_paise / 100).toFixed(2)}`,
      "",
      "Thank you.",
    ].join("\n");

    const path = `${pay.tenant_id}/${pay.property_id}/${pay.id}.txt`;
    const { error: upErr } = await admin.storage.from("receipts").upload(path, contents, {
      contentType: "text/plain",
      upsert: true,
    });
    if (upErr) return json({ error: upErr.message }, 500, cors);

    await admin.from("documents").insert({
      tenant_id: pay.tenant_id,
      property_id: pay.property_id,
      owner_type: "RECEIPT",
      owner_id: pay.id,
      document_type: "PAYMENT_RECEIPT",
      storage_bucket: "receipts",
      storage_path: path,
      original_filename: `${pay.payment_number}.txt`,
      mime_type: "text/plain",
      size_bytes: contents.length,
      status: "AVAILABLE",
      verification_status: "PENDING",
    });

    // Dispatch notifications via unified sender (Phase 10).
    try {
      const { data: student } = await admin
        .from("students").select("id, profile_id").eq("id", pay.student_id).maybeSingle();

      const dispatch = async (opts: { channel: "IN_APP" | "SMS" | "WHATSAPP" | "EMAIL"; userId?: string; phone?: string }) => {
        await admin.functions.invoke("send-notification", {
          body: {
            channel: opts.channel,
            templateKey: "payment_receipt",
            recipient: { userId: opts.userId, phone: opts.phone },
            variables: { payment_number: pay.payment_number, amount_paise: pay.amount_paise },
            eventType: "PAYMENT_RECEIPT",
            tenantId: pay.tenant_id,
            propertyId: pay.property_id,
            referenceId: pay.id,
          },
        });
      };
      if (student?.profile_id) await dispatch({ channel: "IN_APP", userId: student.profile_id });
      // Parents with can_pay_fees
      const { data: gs } = await admin
        .from("student_guardians")
        .select("can_pay_fees, guardians(profile_id, phone)")
        .eq("student_id", pay.student_id)
        .is("unlinked_at", null);
      for (const g of gs ?? []) {
        if (!g.can_pay_fees) continue;
        const uid = (g as any).guardians?.profile_id ?? undefined;
        const phone = (g as any).guardians?.phone ?? undefined;
        if (uid) await dispatch({ channel: "IN_APP", userId: uid });
        if (phone) await dispatch({ channel: "WHATSAPP", phone });
      }
    } catch (e) {
      console.warn("[generate-receipt] notify failed", e);
    }

    return json({ ok: true, path }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal" }, 500, cors);
  }
});

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}
