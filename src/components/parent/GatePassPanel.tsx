import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowRight, Calendar, Check, ChevronRight, Clock, IdCard, Loader2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { decideGatePass } from "@/lib/operations.functions";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeading } from "@/components/parent/SectionHeading";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, toneClasses, type SemanticTone } from "@/lib/utils";

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

const STATUS_TONE: Record<string, SemanticTone> = {
  APPROVED: "info",
  REJECTED: "destructive",
  ACTIVE: "success",
  PENDING_WARDEN: "warning",
  PENDING_PARENT: "warning",
};

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  APPROVED: "info",
  REJECTED: "destructive",
  ACTIVE: "success",
  PENDING_WARDEN: "warning",
  PENDING_PARENT: "warning",
};

function toneFor(status: string): SemanticTone {
  return STATUS_TONE[status] ?? "muted";
}

function badgeVariantFor(status: string): BadgeProps["variant"] {
  return STATUS_BADGE_VARIANT[status] ?? "secondary";
}

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

  if (passesQ.isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      {canApprove && (
        <div className="space-y-3">
          <SectionHeading>{t("parent.gatePass.needsApproval")}</SectionHeading>
          {pending.length === 0 && (
            <EmptyState
              title={t("parent.gatePass.noPendingTitle")}
              description={t("parent.gatePass.noPendingBody")}
            />
          )}
          {pending.map((p) => (
            <Card key={p.id} className="overflow-hidden rounded-2xl">
              <CardContent className="p-4">
                <PassCardBody pass={p} />
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 min-h-10"
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
                    className="flex-1 min-h-10"
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

      <div className="space-y-3">
        <SectionHeading>{t("parent.gatePass.recentTitle")}</SectionHeading>
        {others.length === 0 && (
          <EmptyState
            title={t("parent.gatePass.emptyTitle")}
            description={t("parent.gatePass.emptyBody")}
          />
        )}
        {others.map((p) => (
          <Card key={p.id} className="overflow-hidden rounded-2xl">
            <CardContent className="p-4">
              <PassCardBody pass={p} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PassCardBody({ pass: p }: { pass: GatePass }) {
  const { t } = useTranslation();
  const tone = toneFor(p.status);
  const statusLabel = PENDING_STATUSES.includes(p.status) ? t("parent.gatePass.pending") : p.status;

  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full",
          toneClasses[tone],
        )}
      >
        <IdCard className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate font-display text-base font-semibold text-foreground">
            {p.pass_number}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant={badgeVariantFor(p.status)} className="rounded-full">
              {statusLabel}
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {p.reason}
          {p.destination ? ` · ${p.destination}` : ""}
        </p>
        <div className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{new Date(p.out_at).toLocaleString()}</span>
            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{new Date(p.expected_in_at).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
