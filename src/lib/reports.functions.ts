import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRangeValid, isoDateSchema } from "@/lib/report-range";

const propertyFilter = z.object({
  property_id: z.string().uuid(),
});

const monthlyAttendanceFilter = z.object({
  property_id: z.string().uuid(),
  // First-of-month date, e.g. "2026-08-01" — matches v_attendance_monthly_summary.month.
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
});

/**
 * Occupancy accuracy per block for a property.
 * View v_occupancy_summary has security_invoker so RLS on `beds` applies.
 */
export const getOccupancyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyFilter.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("v_occupancy_summary" as never)
      .select("*")
      .eq("property_id", data.property_id);
    if (error) throw new Error(error.message);
    // Join block names
    const blockIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.block_id).filter(Boolean)),
    ) as string[];
    let blockNames: Record<string, string> = {};
    if (blockIds.length > 0) {
      const { data: bl } = await supabase.from("blocks").select("id, name").in("id", blockIds);
      blockNames = Object.fromEntries((bl ?? []).map((b) => [b.id, b.name]));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      block_name: r.block_id ? (blockNames[r.block_id] ?? "(unnamed block)") : "(no block)",
    }));
  });

/**
 * Aging summary — read from the same v_invoice_aging view the
 * finance summary page uses, so both surfaces agree exactly.
 */
export const getAgingReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyFilter.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("v_invoice_aging" as never)
      .select(
        "id, invoice_number, student_id, issue_date, due_date, status, total_paise, paid_paise, balance_paise, days_overdue, aging_bucket, students(full_name)" as never,
      )
      .eq("property_id", data.property_id)
      .order("days_overdue", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const buckets: Record<string, number> = { current: 0, "0-30": 0, "31-60": 0, "60+": 0 };
    let totalOutstanding = 0;
    let totalCollected = 0;
    let totalIssued = 0;
    let overdueDaysSum = 0;
    let overdueCount = 0;
    for (const r of (rows ?? []) as any[]) {
      totalIssued += r.total_paise;
      totalCollected += r.paid_paise;
      if (r.aging_bucket !== "paid") {
        buckets[r.aging_bucket] = (buckets[r.aging_bucket] ?? 0) + r.balance_paise;
        totalOutstanding += r.balance_paise;
        if (r.days_overdue > 0) {
          overdueDaysSum += r.days_overdue;
          overdueCount += 1;
        }
      }
    }
    const dso = overdueCount > 0 ? Math.round(overdueDaysSum / overdueCount) : 0;
    return {
      rows: (rows ?? []) as any[],
      aging_paise: buckets,
      total_issued_paise: totalIssued,
      total_collected_paise: totalCollected,
      total_outstanding_paise: totalOutstanding,
      dso_days: dso,
    };
  });

/* --------------------------------------------------------------------------------------------------
 * DSO & Aging (admin): Collection Rate, Overdue Invoices, aging buckets and list - all aggregated in the
 * database (fn_collection_report / fn_aging_buckets / fn_aging_invoices, migration 20261123090000), so no
 * invoice is dropped by a row limit. They run with the caller's rights (SECURITY INVOKER), so RLS and the
 * property permissions apply exactly as for every other report query.
 * ------------------------------------------------------------------------------------------------ */

const collectionFilter = z
  .object({
    property_id: z.string().uuid(),
    // Inclusive range on invoices.issue_date; omitted / null = unbounded on that side.
    from: isoDateSchema.nullable().optional(),
    to: isoDateSchema.nullable().optional(),
  })
  .refine((v) => isRangeValid(v.from, v.to), "The start date must not be after the end date");

export interface CollectionReport {
  /** The property-local "today" used to decide what is overdue. */
  as_of: string;
  eligible_invoice_count: number;
  billed_paise: number;
  received_paise: number;
  refunded_paise: number;
  collected_paise: number;
  collection_rate_pct: number;
  pending_paise: number;
  due_unpaid_count: number;
  overdue_count: number;
  overdue_balance_paise: number;
  overdue_pct: number;
}

interface RpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function callRpc<T>(
  supabase: unknown,
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const { data, error } = await (supabase as RpcClient).rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const getCollectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => collectionFilter.parse(d))
  .handler(async ({ data, context }): Promise<CollectionReport> => {
    const rows = await callRpc<Record<string, unknown>>(context.supabase, "fn_collection_report", {
      p_property_id: data.property_id,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    const r = rows[0] ?? {};
    const n = (k: string) => Number(r[k] ?? 0);
    return {
      as_of: String(r.as_of ?? ""),
      eligible_invoice_count: n("eligible_invoice_count"),
      billed_paise: n("billed_paise"),
      received_paise: n("received_paise"),
      refunded_paise: n("refunded_paise"),
      collected_paise: n("collected_paise"),
      collection_rate_pct: n("collection_rate_pct"),
      pending_paise: n("pending_paise"),
      due_unpaid_count: n("due_unpaid_count"),
      overdue_count: n("overdue_count"),
      overdue_balance_paise: n("overdue_balance_paise"),
      overdue_pct: n("overdue_pct"),
    };
  });

/** Aging buckets (same view and rules as before), summed over EVERY unpaid invoice of the property. */
export const getAgingBuckets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyFilter.parse(d))
  .handler(async ({ data, context }) => {
    const rows = await callRpc<{ aging_bucket: string; balance_paise: number | string }>(
      context.supabase,
      "fn_aging_buckets",
      { p_property_id: data.property_id },
    );
    const aging_paise: Record<string, number> = { current: 0, "0-30": 0, "31-60": 0, "60+": 0 };
    for (const r of rows) aging_paise[r.aging_bucket] = Number(r.balance_paise);
    return { aging_paise };
  });

export interface AgingInvoice {
  id: string;
  invoice_number: string;
  student_name: string | null;
  due_date: string;
  days_overdue: number;
  aging_bucket: string;
  balance_paise: number;
  status: string;
}

async function fetchAgingPage(
  supabase: unknown,
  propertyId: string,
  page: number,
  pageSize: number,
) {
  const rows = await callRpc<Record<string, unknown>>(supabase, "fn_aging_invoices", {
    p_property_id: propertyId,
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  return {
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    rows: rows.map((r): AgingInvoice => ({
      id: String(r.id),
      invoice_number: String(r.invoice_number),
      student_name: r.student_name == null ? null : String(r.student_name),
      due_date: String(r.due_date),
      days_overdue: Number(r.days_overdue),
      aging_bucket: String(r.aging_bucket),
      balance_paise: Number(r.balance_paise),
      status: String(r.status),
    })),
  };
}

const agingPageFilter = z.object({
  property_id: z.string().uuid(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(25),
});

/** One page of the unpaid-invoice list plus the exact total (server-side pagination). */
export const listAgingInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => agingPageFilter.parse(d))
  .handler(async ({ data, context }) =>
    fetchAgingPage(context.supabase, data.property_id, data.page, data.pageSize),
  );

/** Every unpaid invoice (for CSV / PDF export), fetched page by page - never truncated. */
export const exportAgingInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyFilter.parse(d))
  .handler(async ({ data, context }) => {
    const all: AgingInvoice[] = [];
    const size = 1000;
    for (let page = 0; ; page++) {
      const { rows, total } = await fetchAgingPage(context.supabase, data.property_id, page, size);
      all.push(...rows);
      if (all.length >= total || rows.length === 0) break;
    }
    return all;
  });

/**
 * Complaint SLA compliance grouped by category & warden.
 */
export const getSlaComplianceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyFilter.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("v_complaint_sla_summary" as never)
      .select("*")
      .eq("property_id", data.property_id);
    if (error) throw new Error(error.message);

    const catIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.category_id).filter(Boolean)),
    ) as string[];
    const wardenIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean)),
    ) as string[];
    const [catRes, wardenRes] = await Promise.all([
      catIds.length
        ? supabase.from("complaint_categories").select("id, name").in("id", catIds)
        : Promise.resolve({ data: [] as any[] }),
      wardenIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", wardenIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const catMap = Object.fromEntries(((catRes.data ?? []) as any[]).map((c) => [c.id, c.name]));
    const wardenMap = Object.fromEntries(
      ((wardenRes.data ?? []) as any[]).map((w) => [w.id, w.full_name]),
    );

    return (rows ?? []).map((r: any) => ({
      ...r,
      category_name: r.category_id ? (catMap[r.category_id] ?? "(unknown)") : "(uncategorised)",
      warden_name: r.assigned_to ? (wardenMap[r.assigned_to] ?? "(unknown)") : "(unassigned)",
    }));
  });

/**
 * Monthly attendance summary, one row per student, for a given calendar
 * month. Reads fn_attendance_monthly_report (falls back to
 * v_attendance_monthly_summary; both security_invoker — RLS on
 * `attendance` applies: Admin gets the whole property, Warden gets their
 * assigned property/block only, since `att_warden_write` is FOR ALL and
 * already gates SELECT). `.eq("property_id", ...)` further narrows within
 * whatever RLS already allowed.
 */
export const getAttendanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => monthlyAttendanceFilter.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Admin / Warden report: fn_attendance_monthly_report adds gate-derived Out-Pass
    // (separate category, out of the percentage denominator) on top of the same
    // rules as the view. Student / Parent reports keep reading the view unchanged.
    // If the function is not deployed yet, fall back to the view so the report
    // still loads exactly as before.
    const rpcClient = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    const withOutPass = await rpcClient.rpc("fn_attendance_monthly_report", {
      p_property_id: data.property_id,
      p_month: data.month,
    });
    let rows: unknown[] | null = withOutPass.data;
    if (withOutPass.error) {
      console.warn(
        "[attendance report] Out-Pass report unavailable, using the plain view",
        withOutPass.error.message,
      );
      const { data: viewRows, error } = await supabase
        .from("v_attendance_monthly_summary" as never)
        .select("*")
        .eq("property_id", data.property_id)
        .eq("month", data.month);
      if (error) throw new Error(error.message);
      rows = viewRows as unknown[] | null;
    }

    const studentIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.student_id).filter(Boolean)),
    ) as string[];
    let studentInfo: Record<string, { full_name: string; admission_number: string }> = {};
    if (studentIds.length > 0) {
      const { data: st } = await supabase
        .from("students")
        .select("id, full_name, admission_number")
        .in("id", studentIds);
      studentInfo = Object.fromEntries(
        (st ?? []).map((s) => [
          s.id,
          { full_name: s.full_name, admission_number: s.admission_number },
        ]),
      );
    }

    return (rows ?? []).map((r: any) => ({
      ...r,
      full_name: studentInfo[r.student_id]?.full_name ?? "(unknown)",
      admission_number: studentInfo[r.student_id]?.admission_number ?? "—",
    }));
  });
