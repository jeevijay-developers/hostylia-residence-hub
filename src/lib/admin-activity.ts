import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ActivityItem } from "@/lib/warden-activity";

export type { ActivityItem };

const SOURCE_LIMIT = 5;

/**
 * Admin Dashboard's "Recent Activity" feed — assembled the same way
 * warden-activity.ts's useRecentActivity is (several small, capped,
 * RLS-scoped queries fanned out via Promise.all, merged and sorted
 * client-side), just sourced from the tables an Admin actually cares about
 * instead of a Warden's daily-ops ones. Each source is limited to
 * `SOURCE_LIMIT` rows ordered by its own recency column, so this stays a
 * handful of small indexed-by-property lookups rather than one large scan —
 * there's no dedicated "activity log" table exposed to clients to read
 * instead (`audit_logs` exists, but its RLS is service-role-only by design,
 * see the 20260715104920/20260717112956 migrations, so a dashboard widget
 * can't read it without bypassing RLS).
 */
export function useAdminRecentActivity(tenantId: string | null, propertyId: string | null) {
  const studentsQ = useQuery({
    queryKey: ["admin-activity-students", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, created_at")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffQ = useQuery({
    queryKey: ["admin-activity-staff", tenantId, propertyId],
    enabled: !!tenantId && !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_assignments")
        .select("id, role, granted_at")
        .eq("tenant_id", tenantId!)
        .eq("property_id", propertyId!)
        .in("role", ["WARDEN", "ACCOUNTANT"])
        .order("granted_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const allocationsQ = useQuery({
    queryKey: ["admin-activity-allocations", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select("id, created_at, students(full_name)")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        created_at: string;
        students: { full_name: string } | null;
      }[];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["admin-activity-payments", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, payment_number, amount_paise, paid_at, students(full_name)")
        .eq("property_id", propertyId!)
        .eq("status", "CAPTURED")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        payment_number: string;
        amount_paise: number;
        paid_at: string;
        students: { full_name: string } | null;
      }[];
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["admin-activity-invoices", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, students(full_name)")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        invoice_number: string;
        created_at: string;
        students: { full_name: string } | null;
      }[];
    },
  });

  const complaintsCreatedQ = useQuery({
    queryKey: ["admin-activity-complaints-created", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, complaint_number, title, created_at")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const complaintsResolvedQ = useQuery({
    queryKey: ["admin-activity-complaints-resolved", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, complaint_number, title, resolved_at")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const noticesQ = useQuery({
    queryKey: ["admin-activity-notices", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notices")
        .select("id, title, created_at")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    for (const s of studentsQ.data ?? []) {
      list.push({
        type: "Student Added",
        detail: `${s.full_name} (${s.admission_number})`,
        at: s.created_at,
      });
    }
    for (const r of staffQ.data ?? []) {
      list.push({
        type: "Staff Invited",
        detail: r.role === "WARDEN" ? "New Warden invited" : "New Accountant invited",
        at: r.granted_at,
      });
    }
    for (const a of allocationsQ.data ?? []) {
      list.push({
        type: "Allocation Created",
        detail: a.students?.full_name ?? "Student allocated a bed",
        at: a.created_at,
      });
    }
    for (const p of paymentsQ.data ?? []) {
      list.push({
        type: "Payment Received",
        detail: `${p.payment_number} — ₹${(p.amount_paise / 100).toFixed(2)}${p.students?.full_name ? ` from ${p.students.full_name}` : ""}`,
        at: p.paid_at,
      });
    }
    for (const i of invoicesQ.data ?? []) {
      list.push({
        type: "Invoice Created",
        detail: `${i.invoice_number}${i.students?.full_name ? ` — ${i.students.full_name}` : ""}`,
        at: i.created_at,
      });
    }
    for (const c of complaintsCreatedQ.data ?? []) {
      list.push({
        type: "Complaint Created",
        detail: `${c.complaint_number} — ${c.title}`,
        at: c.created_at,
      });
    }
    for (const c of complaintsResolvedQ.data ?? []) {
      list.push({
        type: "Complaint Resolved",
        detail: `${c.complaint_number} — ${c.title}`,
        at: c.resolved_at!,
      });
    }
    for (const n of noticesQ.data ?? []) {
      list.push({ type: "Notice Created", detail: n.title, at: n.created_at });
    }

    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [
    studentsQ.data,
    staffQ.data,
    allocationsQ.data,
    paymentsQ.data,
    invoicesQ.data,
    complaintsCreatedQ.data,
    complaintsResolvedQ.data,
    noticesQ.data,
  ]);

  const isLoading =
    studentsQ.isLoading ||
    staffQ.isLoading ||
    allocationsQ.isLoading ||
    paymentsQ.isLoading ||
    invoicesQ.isLoading ||
    complaintsCreatedQ.isLoading ||
    complaintsResolvedQ.isLoading ||
    noticesQ.isLoading;

  return { items, isLoading };
}
