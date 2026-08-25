import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  feePlanFormSchema,
  recordPaymentSchema,
  initiateRefundSchema,
  approveRefundSchema,
  createRazorpayOrderSchema,
  createInvoiceSchema,
  editInvoiceSchema,
} from "@/schemas/finance";

/**
 * Create or update a fee plan and its components in one call.
 * Accountant / Hostel Admin only (enforced by RLS).
 *
 * When `data.id` is present this edits the existing plan + reconciles its
 * components in place (update by id / insert new / soft-remove dropped
 * ones) instead of inserting a fresh row — otherwise every "edit" from the
 * UI would silently create a duplicate fee plan.
 */
export const upsertFeePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => feePlanFormSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: prop, error: pErr } = await supabase
      .from("properties")
      .select("tenant_id")
      .eq("id", data.property_id)
      .single();
    if (pErr || !prop) throw new Error("Property not found");

    if (!data.id) {
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
        allow_zero_amount: c.allow_zero_amount,
        is_refundable: c.is_refundable,
        is_taxable: c.is_taxable,
        tax_rate_basis_points: c.tax_rate_basis_points,
        display_order: i * 10,
      }));
      const { error: cErr } = await supabase.from("fee_plan_components").insert(rows);
      if (cErr) throw new Error(cErr.message);

      return { fee_plan_id: plan.id };
    }

    // Edit path — same plan row, no duplicate.
    const { data: existing, error: exErr } = await supabase
      .from("fee_plans")
      .select("id")
      .eq("id", data.id)
      .eq("property_id", data.property_id)
      .is("deleted_at", null)
      .single();
    if (exErr || !existing) throw new Error("Fee plan not found");

    const { error: uErr } = await supabase
      .from("fee_plans")
      .update({
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
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    const { data: currentComps, error: ccErr } = await supabase
      .from("fee_plan_components")
      .select("id")
      .eq("fee_plan_id", data.id)
      .eq("is_active", true);
    if (ccErr) throw new Error(ccErr.message);

    const submittedIds = new Set(data.components.filter((c) => c.id).map((c) => c.id as string));
    const removedIds = (currentComps ?? []).map((c) => c.id).filter((id) => !submittedIds.has(id));
    if (removedIds.length) {
      // Soft-remove, not delete — a component already baked into historical
      // invoice totals must stay resolvable; it just stops appearing in the plan.
      const { error: dErr } = await supabase
        .from("fee_plan_components")
        .update({ is_active: false })
        .in("id", removedIds);
      if (dErr) throw new Error(dErr.message);
    }

    for (const [i, c] of data.components.entries()) {
      if (c.id) {
        const { error: ucErr } = await supabase
          .from("fee_plan_components")
          .update({
            name: c.name,
            component_type: c.component_type,
            amount_paise: c.amount_paise,
            allow_zero_amount: c.allow_zero_amount,
            is_refundable: c.is_refundable,
            is_taxable: c.is_taxable,
            tax_rate_basis_points: c.tax_rate_basis_points,
            display_order: i * 10,
            is_active: true,
          })
          .eq("id", c.id);
        if (ucErr) throw new Error(ucErr.message);
      } else {
        const { error: icErr } = await supabase.from("fee_plan_components").insert({
          tenant_id: prop.tenant_id,
          property_id: data.property_id,
          fee_plan_id: data.id,
          name: c.name,
          component_type: c.component_type,
          amount_paise: c.amount_paise,
          allow_zero_amount: c.allow_zero_amount,
          is_refundable: c.is_refundable,
          is_taxable: c.is_taxable,
          tax_rate_basis_points: c.tax_rate_basis_points,
          display_order: i * 10,
        });
        if (icErr) throw new Error(icErr.message);
      }
    }

    return { fee_plan_id: data.id };
  });

/**
 * Delete (VCEDX) for fee plans. A plan still backing an active allocation
 * can't be safely removed — deactivating it (status=INACTIVE) blocks it
 * from new billing while leaving current tenants' invoicing intact.
 * Otherwise it's soft-deleted outright.
 */
const feePlanIdSchema = z.object({ fee_plan_id: z.string().uuid() });

export const deleteOrDeactivateFeePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => feePlanIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { count, error: cErr } = await supabase
      .from("allocations")
      .select("id", { count: "exact", head: true })
      .eq("fee_plan_id", data.fee_plan_id)
      .eq("status", "ACTIVE")
      .is("deleted_at", null);
    if (cErr) throw new Error(cErr.message);

    if (count && count > 0) {
      const { error } = await supabase
        .from("fee_plans")
        .update({ status: "INACTIVE" })
        .eq("id", data.fee_plan_id);
      if (error) throw new Error(error.message);
      return { mode: "deactivated" as const, active_allocations: count };
    }

    const { error } = await supabase
      .from("fee_plans")
      .update({ status: "ARCHIVED", deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", data.fee_plan_id);
    if (error) throw new Error(error.message);
    return { mode: "deleted" as const, active_allocations: 0 };
  });

const propertyIdSchema = z.object({ property_id: z.string().uuid() });

/**
 * Active fee plans for a property — same query/shape as Admin's own
 * client-side fetch (admin.allocations.tsx's feePlansQ), so the Warden
 * "Allocate Bed" flow (which reuses that same board) sees the identical
 * plan list. Fee plans are otherwise a finance-permission-gated resource
 * (fee_plans_view, default false for Warden) — allocation creation
 * shouldn't depend on an Admin separately granting that finance
 * permission just so a Warden can pick the plan required to complete an
 * allocation they're already authorized to create. Authorization here is
 * narrow: the caller must have an active staff assignment at this
 * property (any role), not the fee_plans_view permission itself.
 */
export const listActiveFeePlansForAllocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: assignment, error: aErr } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .or(`property_id.eq.${data.property_id},property_id.is.null`)
      .limit(1)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!assignment) throw new Error("Not staff at this property");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans, error } = await supabaseAdmin
      .from("fee_plans")
      .select("id, name, code")
      .eq("property_id", data.property_id)
      .eq("status", "ACTIVE")
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    return plans ?? [];
  });

/**
 * Record a manual (cash/cheque/bank-transfer) payment against an invoice.
 * Payment CAPTURED, trigger recomputes invoice status.
 *
 * The status/balance check, the insert, and (RULES.md 19.3/19.5) the
 * first-payment allocation/student/bed activation all happen atomically
 * inside record_manual_payment() (SELECT ... FOR UPDATE on the invoice row,
 * PENDING_PAYMENT allocation lookup + activate_allocation() in the same
 * transaction). This used to be a separate client-driven round-trip after
 * the payment RPC — depending on correctly reading `student_id` back off a
 * non-SETOF RPC response — which is why payments were landing CAPTURED
 * while the allocation stayed stuck at PENDING_PAYMENT.
 */
export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => recordPaymentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: pay, error: pErr } = await supabase
      .rpc("record_manual_payment", {
        p_invoice_id: data.invoice_id,
        p_mode: data.mode,
        p_amount_paise: data.amount_paise,
        p_offline_reference: data.offline_reference || null,
        p_cheque_date: data.cheque_date || null,
        p_notes: data.notes || null,
      })
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
  .validator((d) => initiateRefundSchema.parse(d))
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
        refund_number: "",
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
  .validator((d) => approveRefundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("fn_approve_refund", {
      p_refund_id: data.refund_id,
      p_decision: data.decision,
      p_reason: data.reason || undefined,
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
  .validator((d) => createRazorpayOrderSchema.parse(d))
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
  .validator((d) => z.object({ property_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Phase 9: aging math is centralised in v_invoice_aging so this page
    // and /admin/reports agree exactly on every number.
    const { data: rows, error } = await supabase
      .from("v_invoice_aging" as never)
      .select("total_paise, paid_paise, balance_paise, aging_bucket, status" as never)
      .eq("property_id", data.property_id);
    if (error) throw new Error(error.message);

    let totalIssued = 0,
      totalCollected = 0,
      totalOutstanding = 0;
    const aging = { current: 0, "0-30": 0, "31-60": 0, "60+": 0 } as Record<string, number>;
    for (const i of (rows ?? []) as any[]) {
      if (i.status === "VOID") continue;
      totalIssued += i.total_paise;
      totalCollected += i.paid_paise;
      if (i.balance_paise > 0 && i.aging_bucket !== "paid") {
        aging[i.aging_bucket] = (aging[i.aging_bucket] ?? 0) + i.balance_paise;
        totalOutstanding += i.balance_paise;
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
  .validator((d) =>
    z
      .object({
        property_id: z.string().uuid(),
        status: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().min(0).default(0),
        // Capped well above the UI's own page size (20) so a bulk CSV export
        // can request everything in one call without needing a separate
        // "export" endpoint, while still bounding the worst case.
        pageSize: z.number().int().min(1).max(5000).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Search matches invoice_number OR student name. The student name lives
    // on a joined table, which the JS client can't .ilike() directly — so a
    // matching student_id list is resolved first (scoped to this property,
    // same RLS-bound client) and combined into a single .or() filter, rather
    // than filtering client-side after the fact (which would only search
    // whatever happened to be on the current page).
    let studentIds: string[] = [];
    if (data.search) {
      const { data: matches } = await supabase
        .from("students")
        .select("id")
        .eq("property_id", data.property_id)
        .ilike("full_name", `%${data.search}%`);
      studentIds = (matches ?? []).map((m) => m.id);
    }

    let q = supabase
      .from("invoices")
      .select(
        "id, invoice_number, student_id, allocation_id, billing_period_start, billing_period_end, issue_date, due_date, status, subtotal_paise, tax_paise, total_paise, paid_paise, balance_paise, notes, void_reason, students(full_name)",
        { count: "exact" },
      )
      .eq("property_id", data.property_id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) {
      const idList = studentIds.length
        ? studentIds.join(",")
        : "00000000-0000-0000-0000-000000000000";
      q = q.or(`invoice_number.ilike.%${data.search}%,student_id.in.(${idList})`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

/**
 * Manual/ad-hoc invoice creation (Create — VCEDX). Covers one-off charges
 * and corrections; the recurring monthly case is already handled by the
 * `fn_generate_invoices` pg_cron job. Mirrors that function's component
 * rollup exactly so a manually-created invoice totals the same way an
 * automated one would. RLS (`invoices_staff_all`) restricts this to
 * HOSTEL_ADMIN/ACCOUNTANT already; the uniqueness index on
 * (allocation_id, billing_period, fee_plan_id) blocks double-billing a
 * period that the cron job (or a prior manual create) already covered.
 */
export const createManualInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => createInvoiceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: alloc, error: aErr } = await supabase
      .from("allocations")
      .select("tenant_id, property_id, student_id, fee_plan_id, status")
      .eq("id", data.allocation_id)
      .single();
    if (aErr || !alloc) throw new Error("Allocation not found");
    if (alloc.status !== "ACTIVE") throw new Error("Allocation is not active");
    if (!alloc.fee_plan_id) throw new Error("Allocation has no fee plan assigned");

    const { data: comps, error: cErr } = await supabase
      .from("fee_plan_components")
      .select("amount_paise, is_taxable, tax_rate_basis_points")
      .eq("fee_plan_id", alloc.fee_plan_id)
      .eq("is_active", true)
      .in("component_type", ["RENT", "MESS", "MAINTENANCE", "OTHER"]);
    if (cErr) throw new Error(cErr.message);

    let subtotal = 0;
    let tax = 0;
    for (const c of comps ?? []) {
      subtotal += c.amount_paise;
      if (c.is_taxable) tax += Math.floor((c.amount_paise * c.tax_rate_basis_points) / 10000);
    }
    if (subtotal <= 0) throw new Error("Fee plan has no billable components");

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        tenant_id: alloc.tenant_id,
        property_id: alloc.property_id,
        student_id: alloc.student_id,
        allocation_id: data.allocation_id,
        fee_plan_id: alloc.fee_plan_id,
        billing_period_start: data.billing_period_start,
        billing_period_end: data.billing_period_end,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: data.due_date,
        status: "ISSUED",
        subtotal_paise: subtotal,
        discount_paise: 0,
        tax_paise: tax,
        late_fee_paise: 0,
        total_paise: subtotal + tax,
        paid_paise: 0,
        refunded_paise: 0,
        balance_paise: subtotal + tax,
        issued_at: new Date().toISOString(),
        notes: data.notes || null,
        created_by: userId,
      })
      .select("id, invoice_number")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("An invoice for this allocation + billing period already exists");
      }
      throw new Error(error.message);
    }
    return { invoice_id: inv.id, invoice_number: inv.invoice_number };
  });

/**
 * Edit (VCEDX) — restricted to due_date/notes. "Issued invoices are never
 * silently edited" (CLAUDE.md money rules): amount corrections go through
 * void + reissue, not a raw UPDATE here.
 */
export const editInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => editInvoiceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inv, error: iErr } = await supabase
      .from("invoices")
      .select("status")
      .eq("id", data.invoice_id)
      .single();
    if (iErr || !inv) throw new Error("Invoice not found");
    if (["VOID", "REFUNDED"].includes(inv.status)) {
      throw new Error(`Cannot edit a ${inv.status.toLowerCase()} invoice`);
    }
    const { error } = await supabase
      .from("invoices")
      .update({ due_date: data.due_date, notes: data.notes || null })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const voidSchema = z.object({
  invoice_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => voidSchema.parse(d))
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
