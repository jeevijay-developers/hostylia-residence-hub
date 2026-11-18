// Executes / confirms the gateway side of an APPROVED refund.
// Requires secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (same as razorpay-create-order).
// Called by the app with the signed-in staff member's JWT (verify_jwt stays on).
//
//   { refund_id, action: "process" }  APPROVED (or a FAILED gateway refund = retry) -> PROCESSING,
//                                     creates the refund at Razorpay (or re-uses the one already
//                                     created for this refund) and records the gateway's verdict.
//   { refund_id, action: "sync" }     re-reads a PROCESSING refund from Razorpay and records the verdict.
//
// A refund is COMPLETED only by fn_record_refund_gateway_result with a 'processed' verdict from
// Razorpay itself — never by this request succeeding, and never by approval. Timeouts / 5xx leave
// the refund PROCESSING (the money may have moved); a 4xx refusal marks the attempt FAILED (retryable).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createOrFindGatewayRefund,
  fetchGatewayRefund,
  mapGatewayStatus,
  type GatewayDeps,
  type GatewayResult,
} from "../_shared/razorpay-refund.ts";

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
  const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!KEY_ID || !KEY_SECRET) {
    return json(
      { error: "Razorpay is not configured — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
      503,
      cors,
    );
  }

  let body: { refund_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }
  const refundId = body.refund_id;
  const action = body.action === "sync" ? "sync" : "process";
  if (!refundId) return json({ error: "refund_id required" }, 400, cors);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, serviceKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, serviceKey);

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (userErr || !userId) return json({ error: "Unauthorized" }, 401, cors);

  // RLS: the caller must be able to read the refund; then it must be one they may manage.
  const { data: refund } = await userClient
    .from("refunds")
    .select(
      "id, tenant_id, property_id, payment_id, refund_number, amount_paise, status, provider_refund_ref, attempt_count",
    )
    .eq("id", refundId)
    .maybeSingle();
  if (!refund) return json({ error: "Refund not found" }, 404, cors);
  const { data: canManage } = await userClient.rpc("can_manage_refunds", {
    _user_id: userId,
    _tenant_id: refund.tenant_id,
    _property_id: refund.property_id,
  });
  if (!canManage) return json({ error: "Not authorized to process refunds" }, 403, cors);

  const { data: pay } = await admin
    .from("payments")
    .select("provider, provider_payment_ref")
    .eq("id", refund.payment_id)
    .maybeSingle();
  if (!pay || pay.provider !== "razorpay" || !pay.provider_payment_ref) {
    return json(
      {
        error: "This refund is not for a gateway payment — record the payout manually.",
        manual: true,
      },
      409,
      cors,
    );
  }

  const deps: GatewayDeps = { fetchFn: fetch, keyId: KEY_ID, keySecret: KEY_SECRET };

  const record = async (
    status: "pending" | "processed" | "failed",
    gwId: string | null,
    amount: number | null,
    error: string | null,
  ) => {
    const { data, error: rpcErr } = await admin.rpc("fn_record_refund_gateway_result", {
      p_refund_id: refund.id,
      p_gateway_refund_id: gwId,
      p_gateway_status: status,
      p_amount_paise: amount,
      p_error: error,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return Array.isArray(data) ? data[0] : data;
  };

  const settle = async (result: GatewayResult) => {
    if (!result.ok) {
      if (result.kind === "rejected") {
        const r = await record("failed", null, null, result.message);
        return json({ state: r?.status ?? "FAILED", message: result.message }, 200, cors);
      }
      const r = await record("pending", null, null, result.message);
      return json(
        {
          state: r?.status ?? "PROCESSING",
          message: `Gateway outcome unknown (${result.message}). Check status shortly.`,
        },
        202,
        cors,
      );
    }
    const gw = result.refund;
    const r = await record(mapGatewayStatus(gw.status), gw.id, gw.amount, null);
    return json({ state: r?.status, gateway_status: gw.status }, 200, cors);
  };

  try {
    if (action === "sync") {
      if (!refund.provider_refund_ref) {
        return json(
          { state: refund.status, message: "No gateway refund has been created yet." },
          200,
          cors,
        );
      }
      return await settle(await fetchGatewayRefund(deps, refund.provider_refund_ref));
    }

    // process
    if (refund.status === "APPROVED" || refund.status === "FAILED") {
      const { error: startErr } = await userClient.rpc("fn_start_refund_processing", {
        p_refund_id: refund.id,
      });
      if (startErr) return json({ error: startErr.message }, 409, cors);
    } else if (refund.status === "PROCESSING") {
      if (refund.provider_refund_ref) {
        return await settle(await fetchGatewayRefund(deps, refund.provider_refund_ref));
      }
      const { data: claimed } = await admin.rpc("fn_claim_refund_gateway_attempt", {
        p_refund_id: refund.id,
      });
      if (!claimed)
        return json(
          { state: "PROCESSING", message: "A gateway attempt is already in progress." },
          202,
          cors,
        );
    } else {
      return json({ error: `Refund cannot be processed from status ${refund.status}` }, 409, cors);
    }

    return await settle(
      await createOrFindGatewayRefund(deps, {
        paymentRef: pay.provider_payment_ref,
        amountPaise: refund.amount_paise,
        refundId: refund.id,
        refundNumber: refund.refund_number,
      }),
    );
  } catch (e) {
    console.error("razorpay-refund failed", e instanceof Error ? e.message : e);
    return json(
      {
        error:
          "Refund processing hit an error; it is left in its current state. Check status shortly.",
      },
      500,
      cors,
    );
  }
});
