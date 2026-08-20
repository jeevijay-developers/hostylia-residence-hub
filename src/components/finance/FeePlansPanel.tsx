import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { FeePlanForm } from "@/components/finance/FeePlanForm";
import { Button } from "@/components/ui/button";
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
import { formatInr } from "@/lib/finance";
import { deleteOrDeactivateFeePlan } from "@/lib/finance.functions";
import type { FeePlanFormInput } from "@/schemas/finance";

/**
 * Shared fee-plan view (create/edit form + list) — reused by both the Admin
 * and Accountant fee-plans routes so the query/list rendering isn't
 * duplicated. RLS (`fee_plans_staff_all` via `is_finance_staff`) already
 * allows both HOSTEL_ADMIN and ACCOUNTANT, so no policy changes were needed.
 */
export function FeePlansPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteOrDeactivateFeePlan);
  const [editingPlan, setEditingPlan] = useState<FeePlanFormInput | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["fee_plans", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select(
          "id, property_id, name, code, billing_frequency, due_day, grace_period_days, late_fee_type, late_fee_value, effective_from, effective_until, status, fee_plan_components(id, name, component_type, amount_paise, allow_zero_amount, is_refundable, is_taxable, tax_rate_basis_points, is_active)",
        )
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: (feePlanId: string) => deleteFn({ data: { fee_plan_id: feePlanId } }),
    onSuccess: (out) => {
      toast.success(
        out.mode === "deactivated"
          ? "This plan still has active allocations, so it was deactivated instead of deleted."
          : "Fee plan deleted",
      );
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["fee_plans", propertyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete fee plan"),
  });

  return (
    <div className="space-y-6">
      <FeePlanForm
        propertyId={propertyId}
        plan={editingPlan ?? undefined}
        onSaved={() => setEditingPlan(null)}
      />
      <div className="space-y-2.5">
        {(q.data ?? []).map((p) => {
          const activeComponents = (p.fee_plan_components ?? []).filter(
            (c) => c.is_active !== false,
          );
          return (
            <div
              key={p.id}
              className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-colors hover:border-border"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.code} · {p.billing_frequency} · due day {p.due_day} · {p.status}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <p className="mr-2 font-mono text-sm font-semibold text-foreground">
                    {formatInr(
                      activeComponents.reduce(
                        (s: number, c: { amount_paise: number }) => s + c.amount_paise,
                        0,
                      ),
                    )}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Edit"
                    aria-label="Edit"
                    onClick={() =>
                      setEditingPlan({
                        id: p.id,
                        property_id: p.property_id,
                        name: p.name,
                        code: p.code,
                        billing_frequency: p.billing_frequency,
                        due_day: p.due_day,
                        grace_period_days: p.grace_period_days,
                        late_fee_type: p.late_fee_type,
                        late_fee_value: p.late_fee_value,
                        effective_from: p.effective_from,
                        effective_until: p.effective_until ?? "",
                        status: p.status,
                        components: activeComponents.map((c) => ({
                          id: c.id,
                          name: c.name,
                          component_type: c.component_type,
                          amount_paise: c.amount_paise,
                          allow_zero_amount: c.allow_zero_amount,
                          is_refundable: c.is_refundable,
                          is_taxable: c.is_taxable,
                          tax_rate_basis_points: c.tax_rate_basis_points,
                        })),
                      } as FeePlanFormInput)
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete"
                    aria-label="Delete"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setPendingDelete({ id: p.id, name: p.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {q.data && q.data.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-center text-sm text-muted-foreground">
            No fee plans yet.
          </p>
        )}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name ?? "this fee plan"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing invoices and payments already generated from this plan are never affected.
              If it still backs an active allocation, it's deactivated instead of deleted so
              current tenants keep billing correctly; otherwise it's soft-deleted and disappears
              from this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete.id);
              }}
              disabled={del.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
