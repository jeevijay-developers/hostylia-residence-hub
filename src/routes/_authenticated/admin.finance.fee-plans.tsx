import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FeePlanForm } from "@/components/finance/FeePlanForm";
import { supabase } from "@/integrations/supabase/client";
import { usePropertyStore } from "@/stores/property-store";
import { formatInr } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/admin/finance/fee-plans")({
  component: FeePlansPage,
});

function FeePlansPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const q = useQuery({
    queryKey: ["fee_plans", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select("id, name, code, billing_frequency, due_day, status, fee_plan_components(amount_paise, component_type, name)")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (!propertyId) return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Fee plans" description="Rent, mess, deposit and other charges by property." />
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
                  (p.fee_plan_components ?? []).reduce((s: number, c: { amount_paise: number }) => s + c.amount_paise, 0),
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
