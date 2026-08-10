import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FeePlanForm } from "@/components/finance/FeePlanForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePropertyStore } from "@/stores/property-store";
import { formatInr } from "@/lib/finance";
import { deleteOrDeactivateFeePlan } from "@/lib/finance.functions";
import type { FeePlanFormInput } from "@/schemas/finance";

export const Route = createFileRoute("/_authenticated/admin/finance/fee-plans")({
  component: FeePlansPage,
});

interface FeePlanRow {
  id: string;
  name: string;
  code: string;
  billing_frequency: string;
  due_day: number;
  grace_period_days: number;
  late_fee_type: string;
  late_fee_value: number;
  status: string;
  effective_from: string;
  effective_until: string | null;
  fee_plan_components: {
    id: string;
    name: string;
    component_type: string;
    amount_paise: number;
    allow_zero_amount: boolean;
    is_refundable: boolean;
    is_taxable: boolean;
    tax_rate_basis_points: number;
    is_active: boolean;
  }[];
}

function toFormInput(p: FeePlanRow): FeePlanFormInput {
  return {
    id: p.id,
    property_id: "", // overwritten by caller (needs live propertyId, not stored on row)
    name: p.name,
    code: p.code,
    billing_frequency: p.billing_frequency as FeePlanFormInput["billing_frequency"],
    due_day: p.due_day,
    grace_period_days: p.grace_period_days,
    late_fee_type: p.late_fee_type as FeePlanFormInput["late_fee_type"],
    late_fee_value: p.late_fee_value,
    status: p.status as FeePlanFormInput["status"],
    effective_from: p.effective_from,
    effective_until: p.effective_until ?? "",
    components: p.fee_plan_components
      .filter((c) => c.is_active)
      .map((c) => ({
        id: c.id,
        name: c.name,
        component_type:
          c.component_type as FeePlanFormInput["components"][number]["component_type"],
        amount_paise: c.amount_paise,
        allow_zero_amount: c.allow_zero_amount,
        is_refundable: c.is_refundable,
        is_taxable: c.is_taxable,
        tax_rate_basis_points: c.tax_rate_basis_points,
      })),
  };
}

function FeePlansPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteOrDeactivateFeePlan);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeePlanRow | null>(null);

  const q = useQuery({
    queryKey: ["fee_plans", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select(
          "id, name, code, billing_frequency, due_day, grace_period_days, late_fee_type, late_fee_value, status, effective_from, effective_until, fee_plan_components(id, name, component_type, amount_paise, allow_zero_amount, is_refundable, is_taxable, tax_rate_basis_points, is_active)",
        )
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FeePlanRow[];
    },
  });

  const del = useMutation({
    mutationFn: async (feePlanId: string) => deleteFn({ data: { fee_plan_id: feePlanId } }),
    onSuccess: (r) => {
      toast.success(
        r.mode === "deactivated"
          ? `Deactivated — still used by ${r.active_allocations} active allocation(s)`
          : "Fee plan deleted",
      );
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["fee_plans", propertyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!propertyId)
    return <p className="p-6 text-sm text-muted-foreground">Choose a property first.</p>;

  const editingPlan = editingId ? q.data?.find((p) => p.id === editingId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee plans"
        description="Rent, mess, deposit and other charges by property."
      />

      {editingPlan ? (
        <FeePlanForm
          propertyId={propertyId}
          plan={{ ...toFormInput(editingPlan), property_id: propertyId }}
          onSaved={() => setEditingId(null)}
        />
      ) : (
        <FeePlanForm propertyId={propertyId} />
      )}

      <div className="space-y-2">
        {(q.data ?? []).map((p) => (
          <div key={p.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{p.name}</p>
                  <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>
                    {p.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.code} · {p.billing_frequency} · due day {p.due_day}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className="text-sm font-mono">
                  {formatInr(
                    p.fee_plan_components
                      .filter((c) => c.is_active)
                      .reduce((s, c) => s + c.amount_paise, 0),
                  )}
                </p>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingDelete(p)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No fee plans yet.</p>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              If this plan is still backing an active allocation it will be deactivated instead of
              deleted, so current billing isn't disrupted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && del.mutate(pendingDelete.id)}
              disabled={del.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
