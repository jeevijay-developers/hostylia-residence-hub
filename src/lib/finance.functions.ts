import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  feePlanFormSchema,
  recordPaymentSchema,
  initiateRefundSchema,
  approveRefundSchema,
  createRazorpayOrderSchema,
} from "@/schemas/finance";

/**
 * Create or update a fee plan and its components in one call.
 * Accountant / Hostel Admin only (enforced by RLS).
 */
export const upsertFeePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => feePlanFormSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: prop, error: pErr } = await supabase
      .from("properties")
      .select("tenant_id")
      .eq("id", data.property_id)
      .single();
    if (pErr || !prop) throw new Error("Property not found");

    const { data: plan, error: fErr } = await supabase
      .from("fee_plans")
      .insert({
        tenant_id: prop.tenant_id,
        property_id: data.property_id,
        name: data.name,
        code: data.code,
        billing_frequency: data.billing_frequency,
        due_day: data.due_day,
        grace_period_days: data.grace_period_days,
        late_fee_type: data.late_fee_type,
        late_fee_value: data.late_fee_value,
        status: data.status,
        effective_from: data.effective_from,
        effective_until: data.effective_until || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (fErr) throw new Error(fErr.message);

    const rows = data.components.map((c, i) => ({
      tenant_id: prop.tenant_id,
      property_id: data.property_id,
      fee_plan_id: plan.id,
      name: c.name,
      component_type: c.component_type,
      amount_paise: c.amount_paise,
      is_refundable: c.is_refundable,
      is_taxable: c.is_taxable,
      tax_rate_basis_points: c.tax_rate_basis_points,
      display_order: i * 10,
    }));
    const { error: cErr } = await supabase.from("fee_plan_components").insert(rows);
    if (cErr) throw new Error(cErr.message);

    return { fee_plan_id: plan.id };
  });

/**
 * Record a manual (cash/cheque/bank-transfer) payment against an invoice.
 * Payment CAPTURED, trigger recomputes invoice status.
 */
export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recordPaymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: inv, error: iErr } = await supabase
      .from("invoices")
      .select("tenant_id, property_id, student_id, balance_paise")
      .eq("id", data.invoice_id)
      .single();
    if (iErr || !inv) throw new Error("Invoice not found");
    if (data.amount_paise > inv.balance_paise) {
      throw new Error(`Amount exceeds outstanding balance (${inv.balance_paise / 100} INR)`);
    }

    const { data: pay, error: pErr } = await supabase
      .from("payments")
      .insert({
        tenant_id: inv.tenant_id,
        property_id: inv.property_id,
        student_id: inv.student_id,
        invoice_id: data.invoice_id,
        payment_number: "",
        mode: data.mode,
        amount_paise: data.amount_paise,
        status: "CAPTURED",
        paid_at: new Date().toISOString(),
        recorded_by: userId,
        offline_reference: data.offline_reference || null,
        cheque_date: data.cheque_date || null,
        notes: data.notes || null,
      })
      .select("id, payment_number")
      .single();
    if (pErr) throw new Error(pErr.message);

    // Fire-and-forget receipt generation (Edge Function will TODO delivery)
    try {
      await supabase.functions.invoke("generate-receipt", { body: { payment_id: pay.id } });
    } catch (e) {
      console.warn("[recordManualPayment] receipt generation failed", e);
    }

    return { payment_id: pay.id, payment_number: pay.payment_number };
  });

/**
 * Initiate a refund (Accountant). Enters PENDING_APPROVAL.
 * Enforcement: initiated_by=auth.uid() (RLS INSERT policy).
 */
export const initiateRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => initiateRefundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pay, error: pErr } = await supabase
      .from("payments")
      .select("tenant_id, property_id, student_id, amount_paise")
      .eq("id", data.payment_id)
      .single();
    if (pErr || !pay) throw new Error("Payment not found");
    if (data.amount_paise > pay.amount_paise) throw new Error("Refund exceeds payment");

    const { data: ref, error } = await supabase
      .from("refunds")
      .insert({
        tenant_id: pay.tenant_id,
        property_id: pay.property_id,
        student_id: pay.student_id,
        payment_id: data.payment_id,
        amount_paise: data.amount_paise,
        reason: data.reason,
        mode: data.mode,
        status: "PENDING_APPROVAL",
        initiated_by: userId,
      })
      .select("id, refund_number")
      .single();
    if (error) throw new Error(error.message);
    return { refund_id: ref.id, refund_number: ref.refund_number };
  });

/**
 * Approve or reject a refund. Calls the SECURITY DEFINER RPC that enforces
 * Hostel-Admin role + self-approval block.
 */
export const decideRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => approveRefundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("fn_approve_refund", {
      p_refund_id: data.refund_id,
      p_decision: data.decision,
      p_reason: data.reason || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, refund: out };
  });

/**
 * Create a Razorpay checkout order for an invoice.
 * Calls the razorpay-create-order Edge Function which uses RAZORPAY_KEY_ID/SECRET.
 * If Razorpay keys aren't configured yet, the function returns a clear error
 * the UI can surface to the user.
 */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createRazorpayOrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.functions.invoke("razorpay-create-order", {
      body: { invoice_id: data.invoice_id },
    });
    if (error) throw new Error(error.message);
    return out as {
      order_id: string;
      key_id: string;
      amount_paise: number;
      currency: string;
      payment_order_id: string;
    };
  });

/**
 * Revenue & Collections summary (formerly "P&L"). NOTE: schema doc §50 —
 * v1 does NOT include expense data. This is a collections-side report only.
 */
export const getRevenueCollectionsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ property_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invs, error } = await supabase
      .from("invoices")
      .select("total_paise, paid_paise, balance_paise, status, due_date, issue_date")
      .eq("property_id", data.property_id)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);

    const today = Date.now();
    let totalIssued = 0, totalCollected = 0, totalOutstanding = 0;
    const aging = { current: 0, "0-30": 0, "31-60": 0, "60+": 0 };
    for (const i of invs || []) {
      if (i.status === "VOID") continue;
      totalIssued += i.total_paise;
      totalCollected += i.paid_paise;
      totalOutstanding += i.balance_paise;
      if (i.balance_paise > 0) {
        const days = Math.floor((today - new Date(i.due_date).getTime()) / 86400000);
        if (days <= 0) aging.current += i.balance_paise;
        else if (days <= 30) aging["0-30"] += i.balance_paise;
        else if (days <= 60) aging["31-60"] += i.balance_paise;
        else aging["60+"] += i.balance_paise;
      }
    }
    return {
      total_issued_paise: totalIssued,
      total_collected_paise: totalCollected,
      total_outstanding_paise: totalOutstanding,
      collection_rate: totalIssued > 0 ? totalCollected / totalIssued : 0,
      aging_paise: aging,
    };
  });

/**
 * Fetch invoices + student names for a property (staff view).
 */
export const listPropertyInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      property_id: z.string().uuid(),
      status: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("invoices")
      .select("id, invoice_number, student_id, issue_date, due_date, status, total_paise, paid_paise, balance_paise, students(full_name)")
      .eq("property_id", data.property_id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const voidSchema = z.object({
  invoice_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => voidSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "VOID",
        voided_at: new Date().toISOString(),
        voided_by: userId,
        void_reason: data.reason,
      })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
