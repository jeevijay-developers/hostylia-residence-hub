import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, DoorOpen, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { moveOutAllocation, previewMoveOut } from "@/lib/student.functions";

export const Route = createFileRoute("/_authenticated/admin/students/$id/move-out")({
  head: () => ({ meta: [{ title: "Move out — Hostylia" }] }),
  component: MoveOutWizard,
});

function MoveOutWizard() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [actualEnd, setActualEnd] = useState<string>(new Date().toISOString().slice(0, 10));

  const allocQ = useQuery({
    queryKey: ["active-allocation", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select("*")
        .eq("student_id", id)
        .in("status", ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION", "PENDING_PAYMENT", "PENDING_AGREEMENT"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const previewFn = useServerFn(previewMoveOut);
  const previewQ = useQuery({
    queryKey: ["moveout-preview", allocQ.data?.id],
    enabled: !!allocQ.data?.id,
    queryFn: async () => previewFn({ data: { allocation_id: allocQ.data!.id } }),
  });

  const moveOutFn = useServerFn(moveOutAllocation);
  const mut = useMutation({
    mutationFn: async () => moveOutFn({ data: { allocation_id: allocQ.data!.id, actual_end_date: actualEnd } }),
    onSuccess: () => {
      toast.success("Student moved out — record archived");
      nav({ to: "/admin/students/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/students/$id" params={{ id }}><ArrowLeft className="h-4 w-4" /> Back</Link>
      </Button>
      <PageHeader title="Move out" />

      {allocQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !allocQ.data ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No active allocation found.
        </p>
      ) : (
        <Card>
          <CardHeader><CardTitle>Move-out details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="Notice period" value={`${allocQ.data.notice_period_days ?? 0} days`} />
              <Info label="Lock-in until" value={allocQ.data.lock_in_until ?? "—"} />
              <Info
                label="Earliest permissible move-out"
                value={previewQ.data?.earliest_move_out_date ?? "…"}
              />
              <Info
                label="Provisional refund"
                value={`₹ ${((previewQ.data?.provisional_refund_paise ?? 0) / 100).toFixed(2)}`}
              />
            </div>
            <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              Note: Refund is the deposit snapshot only. Outstanding invoice dues will be netted out
              once billing is enabled (Phase 8+).
            </p>
            <div>
              <Label htmlFor="ae">Actual move-out date</Label>
              <Input id="ae" type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
            </div>
            <Button className="min-h-11" disabled={mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              Confirm move-out & archive
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
