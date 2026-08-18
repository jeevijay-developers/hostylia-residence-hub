import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { decideGatePass } from "@/lib/operations.functions";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface GatePass {
  id: string;
  pass_number: string;
  status: string;
  reason: string;
  destination: string | null;
  out_at: string;
  expected_in_at: string;
}

const PENDING_STATUSES = ["PENDING_WARDEN", "PENDING_PARENT"];

/**
 * Parent-facing gate-pass panel: shows passes awaiting this parent's
 * approval (only when the linked guardian has can_approve_gate_pass) plus a
 * read-only recent history. Approve/reject reuses the same decideGatePass
 * server fn the warden console uses, with role "PARENT" — the fn itself
 * checks the pass is still PENDING_PARENT before applying the decision.
 */
export function GatePassPanel({
  studentId,
  canApprove,
}: {
  studentId: string;
  canApprove: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const decide = useServerFn(decideGatePass);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const passesQ = useQuery({
    queryKey: ["parent-gate-passes", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("gate_passes")
        .select("id, pass_number, status, reason, destination, out_at, expected_in_at")
        .eq("student_id", studentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as GatePass[];
    },
  });

  const pending = (passesQ.data ?? []).filter((p) => p.status === "PENDING_PARENT");
  const others = (passesQ.data ?? []).filter((p) => p.status !== "PENDING_PARENT");

  async function handleDecision(passId: string, decision: "APPROVED" | "REJECTED") {
    setDecidingId(passId);
    try {
      await decide({ data: { pass_id: passId, role: "PARENT", decision } });
      toast.success(
        decision === "APPROVED" ? t("parent.gatePass.approved") : t("parent.gatePass.rejected"),
      );
      qc.invalidateQueries({ queryKey: ["parent-gate-passes", studentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("parent.gatePass.decisionFailed"));
    } finally {
      setDecidingId(null);
    }
  }

  if (passesQ.isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      {canApprove && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("parent.gatePass.needsApproval")}</div>
          {pending.length === 0 && (
            <EmptyState
              title={t("parent.gatePass.noPendingTitle")}
              description={t("parent.gatePass.noPendingBody")}
            />
          )}
          {pending.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-3 space-y-2">
                <div className="font-medium">{p.pass_number}</div>
                <div className="text-xs text-muted-foreground">
                  {p.reason}
                  {p.destination ? ` · ${p.destination}` : ""}
                  {" · "}
                  {new Date(p.out_at).toLocaleString()} →{" "}
                  {new Date(p.expected_in_at).toLocaleString()}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={decidingId === p.id}
                    onClick={() => handleDecision(p.id, "APPROVED")}
                  >
                    {decidingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {t("parent.gatePass.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decidingId === p.id}
                    onClick={() => handleDecision(p.id, "REJECTED")}
                  >
                    <X className="h-4 w-4" />
                    {t("parent.gatePass.reject")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm font-medium">{t("parent.gatePass.recentTitle")}</div>
        {others.length === 0 && (
          <EmptyState
            title={t("parent.gatePass.emptyTitle")}
            description={t("parent.gatePass.emptyBody")}
          />
        )}
        {others.map((p) => (
          <div
            key={p.id}
            className="rounded border p-3 flex items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium">{p.pass_number}</div>
              <div className="text-xs text-muted-foreground">
                {p.reason}
                {p.destination ? ` · ${p.destination}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(p.out_at).toLocaleString()} →{" "}
                {new Date(p.expected_in_at).toLocaleString()}
              </div>
            </div>
            <Badge
              variant={p.status === "REJECTED" ? "destructive" : "secondary"}
              className="shrink-0"
            >
              {PENDING_STATUSES.includes(p.status) ? t("parent.gatePass.pending") : p.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
