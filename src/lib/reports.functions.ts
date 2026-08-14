import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      const { data: bl } = await supabase
        .from("blocks")
        .select("id, name")
        .in("id", blockIds);
      blockNames = Object.fromEntries((bl ?? []).map((b) => [b.id, b.name]));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      block_name: r.block_id ? blockNames[r.block_id] ?? "(unnamed block)" : "(no block)",
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
      .select("id, invoice_number, student_id, issue_date, due_date, status, total_paise, paid_paise, balance_paise, days_overdue, aging_bucket, students(full_name)" as never)
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

    const catIds = Array.from(new Set((rows ?? []).map((r: any) => r.category_id).filter(Boolean))) as string[];
    const wardenIds = Array.from(new Set((rows ?? []).map((r: any) => r.assigned_to).filter(Boolean))) as string[];
    const [catRes, wardenRes] = await Promise.all([
      catIds.length
        ? supabase.from("complaint_categories").select("id, name").in("id", catIds)
        : Promise.resolve({ data: [] as any[] }),
      wardenIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", wardenIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const catMap = Object.fromEntries(((catRes.data ?? []) as any[]).map((c) => [c.id, c.name]));
    const wardenMap = Object.fromEntries(((wardenRes.data ?? []) as any[]).map((w) => [w.id, w.full_name]));

    return (rows ?? []).map((r: any) => ({
      ...r,
      category_name: r.category_id ? catMap[r.category_id] ?? "(unknown)" : "(uncategorised)",
      warden_name: r.assigned_to ? wardenMap[r.assigned_to] ?? "(unknown)" : "(unassigned)",
    }));
  });

/**
 * Monthly attendance summary, one row per student, for a given calendar
 * month. Reads v_attendance_monthly_summary (security_invoker — RLS on
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
    const { data: rows, error } = await supabase
      .from("v_attendance_monthly_summary" as never)
      .select("*")
      .eq("property_id", data.property_id)
      .eq("month", data.month);
    if (error) throw new Error(error.message);

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
        (st ?? []).map((s) => [s.id, { full_name: s.full_name, admission_number: s.admission_number }]),
      );
    }

    return (rows ?? []).map((r: any) => ({
      ...r,
      full_name: studentInfo[r.student_id]?.full_name ?? "(unknown)",
      admission_number: studentInfo[r.student_id]?.admission_number ?? "—",
    }));
  });
