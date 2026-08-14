import { useQuery } from "@tanstack/react-query";
import { FeePlanForm } from "@/components/finance/FeePlanForm";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";

/**
 * Shared fee-plan view (create form + list) — reused by both the Admin and
 * Accountant fee-plans routes so the query/list rendering isn't duplicated.
 * RLS (`fee_plans_staff_all` via `is_finance_staff`) already allows both
 * HOSTEL_ADMIN and ACCOUNTANT, so no policy changes were needed.
 */
export function FeePlansPanel({ propertyId }: { propertyId: string }) {
  const q = useQuery({
    queryKey: ["fee_plans", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select(
          "id, name, code, billing_frequency, due_day, status, fee_plan_components(amount_paise, component_type, name)",
        )
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <FeePlanForm propertyId={propertyId} />
      <div className="space-y-2">
        {(q.data ?? []).map((p) => (
          <div key={p.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.code} · {p.billing_frequency} · due day {p.due_day} · {p.status}
                </p>
              </div>
              <p className="text-sm font-mono">
                {formatInr(
                  (p.fee_plan_components ?? []).reduce(
                    (s: number, c: { amount_paise: number }) => s + c.amount_paise,
                    0,
                  ),
                )}
              </p>
            </div>
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No fee plans yet.
          </p>
        )}
      </div>
    </div>
  );
}
