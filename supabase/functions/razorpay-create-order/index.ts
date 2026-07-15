// Razorpay: create checkout order for an invoice.
// Requires secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
// If they aren't set, this returns a clear 503 the UI surfaces.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!KEY_ID || !KEY_SECRET) {
      return json({ error: "Razorpay is not configured — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." }, 503, cors);
    }

    const { invoice_id } = await req.json();
    if (!invoice_id) return json({ error: "invoice_id required" }, 400, cors);

    const authz = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv, error: iErr } = await admin
      .from("invoices")
      .select("id, tenant_id, property_id, student_id, balance_paise, currency, status")
      .eq("id", invoice_id)
      .single();
    if (iErr || !inv) return json({ error: "Invoice not found" }, 404, cors);
    if (inv.balance_paise <= 0) return json({ error: "Invoice already paid" }, 400, cors);

    const idempotencyKey = `inv:${invoice_id}:${Date.now()}`;
    const basic = btoa(`${KEY_ID}:${KEY_SECRET}`);
    const rzp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({
        amount: inv.balance_paise,
        currency: inv.currency,
        notes: { invoice_id: inv.id, student_id: inv.student_id },
      }),
    });
    const order = await rzp.json();
    if (!rzp.ok) return json({ error: "Razorpay error", detail: order }, 502, cors);

    const { data: po, error: poErr } = await admin.from("payment_orders").insert({
      tenant_id: inv.tenant_id,
      property_id: inv.property_id,
      student_id: inv.student_id,
      invoice_id: inv.id,
      created_by_user_id: userId,
      provider: "razorpay",
      provider_order_ref: order.id,
      amount_paise: inv.balance_paise,
      currency: inv.currency,
      status: "PENDING",
      idempotency_key: idempotencyKey,
    }).select("id").single();
    if (poErr) return json({ error: poErr.message }, 500, cors);

    return json({
      order_id: order.id,
      key_id: KEY_ID,
      amount_paise: inv.balance_paise,
      currency: inv.currency,
      payment_order_id: po.id,
    }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500, cors);
  }
});

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}
