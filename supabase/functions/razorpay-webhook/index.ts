// Razorpay webhook receiver. verify_jwt = false in supabase/config.toml
// Requires: RAZORPAY_WEBHOOK_SECRET (HMAC-SHA256 signature key from Razorpay dashboard)
// Idempotent via public.webhook_events(provider, event_id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!SECRET) return new Response("Webhook not configured", { status: 503 });

  const signature = req.headers.get("x-razorpay-signature");
  const raw = await req.text();
  if (!signature || !(await verifyHmac(raw, signature, SECRET))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const evt = JSON.parse(raw);
  const eventId: string = evt?.payload?.payment?.entity?.id ?? evt?.id ?? crypto.randomUUID();
  const eventType: string = evt?.event ?? "unknown";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Dedupe
  const { data: existing } = await admin.from("webhook_events")
    .select("id, status")
    .eq("provider", "razorpay")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.status === "PROCESSED") return new Response("ok", { status: 200 });
  if (!existing) {
    await admin.from("webhook_events").insert({
      provider: "razorpay", event_id: eventId, event_type: eventType, payload: evt,
    });
  }

  try {
    if (eventType === "payment.captured") {
      const payment = evt.payload.payment.entity;
      const orderRef: string = payment.order_id;
      const paymentRef: string = payment.id;

      const { data: po } = await admin.from("payment_orders")
        .select("id, tenant_id, property_id, student_id, invoice_id")
        .eq("provider", "razorpay").eq("provider_order_ref", orderRef).maybeSingle();

      if (po) {
        await admin.from("payment_orders").update({ status: "PAID" }).eq("id", po.id);

        // Insert or update payments row (idempotent by provider_payment_ref)
        const { data: existingPay } = await admin.from("payments")
          .select("id").eq("provider", "razorpay")
          .eq("provider_payment_ref", paymentRef).maybeSingle();

        if (!existingPay) {
          await admin.from("payments").insert({
            tenant_id: po.tenant_id,
            property_id: po.property_id,
            student_id: po.student_id,
            invoice_id: po.invoice_id,
            payment_order_id: po.id,
            payment_number: "",
            mode: payment.method === "upi" ? "UPI"
              : payment.method === "card" ? "CARD"
              : payment.method === "netbanking" ? "NETBANKING" : "OTHER",
            provider: "razorpay",
            provider_payment_ref: paymentRef,
            provider_order_ref: orderRef,
            amount_paise: payment.amount,
            status: "CAPTURED",
            paid_at: new Date().toISOString(),
            metadata: payment,
          });
        }
      }
    }
    await admin.from("webhook_events").update({
      status: "PROCESSED", processed_at: new Date().toISOString(),
    }).eq("provider", "razorpay").eq("event_id", eventId);
    return new Response("ok", { status: 200 });
  } catch (e) {
    await admin.from("webhook_events").update({
      status: "FAILED", error: e instanceof Error ? e.message : "unknown",
    }).eq("provider", "razorpay").eq("event_id", eventId);
    return new Response("error", { status: 500 });
  }
});

async function verifyHmac(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
