// Razorpay refund helpers. Pure logic (no Deno / Supabase APIs) so it can be tested with a
// fake gateway. Used by razorpay-refund (create / check) and razorpay-webhook (verdicts).

export type GatewayVerdict = "pending" | "processed" | "failed";

export interface GatewayRefund {
  id: string;
  status: string;
  amount: number;
  payment_id?: string;
  notes?: Record<string, string> | unknown[] | null;
  receipt?: string | null;
}

export interface GatewayDeps {
  fetchFn: typeof fetch;
  keyId: string;
  keySecret: string;
  timeoutMs?: number;
}

export type GatewayResult =
  | { ok: true; refund: GatewayRefund; reused: boolean }
  // The gateway answered and refused (4xx): definitive, safe to mark the attempt failed.
  | { ok: false; kind: "rejected"; message: string }
  // No usable answer (timeout, network, 429, 5xx): the refund MAY exist at the gateway, so the
  // caller must leave it PROCESSING and re-check — never mark it failed or completed.
  | { ok: false; kind: "unknown"; message: string };

const BASE = "https://api.razorpay.com/v1";

/** Razorpay refund status -> our verdict. 'created' / 'pending' / anything else = not final. */
export function mapGatewayStatus(status: string): GatewayVerdict {
  if (status === "processed") return "processed";
  if (status === "failed") return "failed";
  return "pending";
}

function authHeader(d: GatewayDeps): string {
  return `Basic ${btoa(`${d.keyId}:${d.keySecret}`)}`;
}

async function call(
  d: GatewayDeps,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; json: unknown } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), d.timeoutMs ?? 20000);
  try {
    const res = await d.fetchFn(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(d),
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "network error" };
  } finally {
    clearTimeout(timer);
  }
}

function errorText(json: unknown, fallback: string): string {
  const err = (json as { error?: { description?: string; code?: string } } | null)?.error;
  return err?.description || err?.code || fallback;
}

function noteRefundId(r: GatewayRefund): string | undefined {
  const notes = r.notes;
  if (notes && !Array.isArray(notes) && typeof notes === "object") return notes.refund_id;
  return undefined;
}

/** Fetch one gateway refund by its id (used to confirm a PROCESSING refund). */
export async function fetchGatewayRefund(
  d: GatewayDeps,
  gatewayRefundId: string,
): Promise<GatewayResult> {
  const r = await call(d, "GET", `/refunds/${encodeURIComponent(gatewayRefundId)}`);
  if ("error" in r) return { ok: false, kind: "unknown", message: r.error };
  if (r.status === 200 && (r.json as GatewayRefund)?.id) {
    return { ok: true, refund: r.json as GatewayRefund, reused: true };
  }
  // Anything but a clean 200 is "no usable answer": the refund stays PROCESSING and is re-checked.
  return { ok: false, kind: "unknown", message: errorText(r.json, `gateway HTTP ${r.status}`) };
}

/**
 * Create the gateway refund for one of OUR refunds — or return the one that already exists.
 * Idempotent in three layers: (1) the caller holds a DB claim, (2) we look for an existing gateway
 * refund tagged with our refund id before creating (covers "created but we never saw the answer"),
 * (3) the create call carries an idempotency header and the same refund id in `notes`.
 */
export async function createOrFindGatewayRefund(
  d: GatewayDeps,
  input: { paymentRef: string; amountPaise: number; refundId: string; refundNumber: string },
): Promise<GatewayResult> {
  const list = await call(
    d,
    "GET",
    `/payments/${encodeURIComponent(input.paymentRef)}/refunds?count=100`,
  );
  if ("error" in list) return { ok: false, kind: "unknown", message: list.error };
  if (list.status === 200) {
    const items = ((list.json as { items?: GatewayRefund[] } | null)?.items ??
      []) as GatewayRefund[];
    const existing = items.find((x) => noteRefundId(x) === input.refundId);
    if (existing) return { ok: true, refund: existing, reused: true };
  } else if (list.status >= 500 || list.status === 429) {
    return {
      ok: false,
      kind: "unknown",
      message: errorText(list.json, `gateway HTTP ${list.status}`),
    };
  }

  const created = await call(
    d,
    "POST",
    `/payments/${encodeURIComponent(input.paymentRef)}/refund`,
    {
      amount: input.amountPaise,
      speed: "normal",
      receipt: input.refundNumber,
      notes: { refund_id: input.refundId, refund_number: input.refundNumber },
    },
    { "X-Refund-Idempotency": input.refundId },
  );
  if ("error" in created) return { ok: false, kind: "unknown", message: created.error };
  if ((created.status === 200 || created.status === 201) && (created.json as GatewayRefund)?.id) {
    return { ok: true, refund: created.json as GatewayRefund, reused: false };
  }
  if (created.status >= 500 || created.status === 429) {
    return {
      ok: false,
      kind: "unknown",
      message: errorText(created.json, `gateway HTTP ${created.status}`),
    };
  }
  return {
    ok: false,
    kind: "rejected",
    message: errorText(created.json, `gateway HTTP ${created.status}`),
  };
}
