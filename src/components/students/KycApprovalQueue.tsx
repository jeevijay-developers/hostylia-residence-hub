import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileWarning, ShieldCheck, XCircle } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KycDocumentViewButton } from "@/components/students/KycDocumentViewButton";
import { supabase } from "@/integrations/supabase/client";

interface PendingKycDoc {
  id: string;
  document_type: string;
  original_filename: string;
  owner_id: string;
  created_at: string;
  student: { id: string; full_name: string; admission_number: string } | null;
}

interface DecidedKycDoc {
  id: string;
  document_type: string;
  original_filename: string;
  owner_id: string;
  verification_status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  reviewer_role: string | null;
  reviewer_name: string | null;
  student: { id: string; full_name: string; admission_number: string } | null;
}

const REVIEWER_ROLE_LABEL: Record<string, string> = {
  HOSTEL_ADMIN: "Admin",
  WARDEN: "Warden",
};

function usePendingKycQueue() {
  return useQuery({
    queryKey: ["kyc-pending-queue"],
    queryFn: async (): Promise<PendingKycDoc[]> => {
      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, owner_id, created_at")
        .eq("owner_type", "STUDENT")
        .eq("verification_status", "PENDING")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ownerIds = [...new Set((docs ?? []).map((d) => d.owner_id))];
      if (ownerIds.length === 0) return [];
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, admission_number")
        .in("id", ownerIds);
      const byId = new Map((students ?? []).map((s) => [s.id, s]));
      return (docs ?? []).map((d) => ({ ...d, student: byId.get(d.owner_id) ?? null }));
    },
  });
}

/** Documents already VERIFIED or REJECTED — shown read-only, with who
 * decided it (reviewer name + role, captured at decision time by
 * fn_decide_kyc_document, not reconstructed from role_assignments) and
 * when. Same shared query for both the Admin dashboard and Warden daily
 * brief, since they already read the same underlying rows. */
function useDecidedKycQueue() {
  return useQuery({
    queryKey: ["kyc-decided-queue"],
    queryFn: async (): Promise<DecidedKycDoc[]> => {
      const { data: docs, error } = await supabase
        .from("documents")
        .select(
          "id, document_type, original_filename, owner_id, verification_status, verified_at, rejection_reason, verified_by",
        )
        .eq("owner_type", "STUDENT")
        .in("verification_status", ["VERIFIED", "REJECTED"])
        .is("deleted_at", null)
        .order("verified_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = docs ?? [];
      if (rows.length === 0) return [];

      const ownerIds = [...new Set(rows.map((d) => d.owner_id))];
      const reviewerIds = [...new Set(rows.map((d) => d.verified_by).filter((v): v is string => !!v))];

      // document_reviews/fn_decide_kyc_document aren't in the generated
      // Database types yet — types.ts is only regenerated once the
      // migration that adds them has actually been applied. Cast + narrow
      // manually here rather than waiting on that regeneration.
      const [{ data: students }, { data: reviews }, { data: reviewers }] = await Promise.all([
        supabase.from("students").select("id, full_name, admission_number").in("id", ownerIds),
        supabase
          .from("document_reviews" as never)
          .select("document_id, reviewer_role")
          .in(
            "document_id",
            rows.map((d) => d.id),
          ) as unknown as Promise<{
          data: { document_id: string; reviewer_role: string }[] | null;
        }>,
        reviewerIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", reviewerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      ]);

      const studentById = new Map((students ?? []).map((s) => [s.id, s]));
      const roleByDocId = new Map((reviews ?? []).map((r) => [r.document_id, r.reviewer_role]));
      const reviewerById = new Map((reviewers ?? []).map((r) => [r.id, r.full_name]));

      return rows.map((d) => ({
        ...d,
        student: studentById.get(d.owner_id) ?? null,
        reviewer_role: roleByDocId.get(d.id) ?? null,
        reviewer_name: d.verified_by ? (reviewerById.get(d.verified_by) ?? null) : null,
      }));
    },
  });
}

/** Shared KYC approvals card — used on both the Warden daily brief and the
 * Hostel Admin dashboard. Both the Pending and Reviewed sections below read
 * the same underlying `documents` rows, so a decision made from either
 * surface is immediately visible on the other (same data, two views) — not
 * two independent queues that need separate syncing. Approve/reject go
 * through fn_decide_kyc_document (row-locked, PENDING-gated, writes
 * document_reviews) instead of updating `documents` directly, so two
 * reviewers racing the same document can't both "win". */
export function KycApprovalQueueCard() {
  const pendingQ = usePendingKycQueue();
  const decidedQ = useDecidedKycQueue();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> KYC Approvals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending
          </p>
          {pendingQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!pendingQ.isLoading && (pendingQ.data ?? []).length === 0 && (
            <EmptyState title="No KYC documents awaiting review" />
          )}
          {(pendingQ.data ?? []).map((doc) => (
            <KycQueueRow key={doc.id} doc={doc} />
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewed
          </p>
          {decidedQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!decidedQ.isLoading && (decidedQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No documents reviewed yet.</p>
          )}
          {(decidedQ.data ?? []).map((doc) => (
            <DecidedKycRow key={doc.id} doc={doc} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DecidedKycRow({ doc }: { doc: DecidedKycDoc }) {
  const verified = doc.verification_status === "VERIFIED";
  const roleLabel = doc.reviewer_role ? (REVIEWER_ROLE_LABEL[doc.reviewer_role] ?? doc.reviewer_role) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {doc.student?.full_name ?? "Unknown student"}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {doc.student?.admission_number}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {doc.document_type} • {doc.original_filename}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {verified ? "Approved" : "Rejected"}
          {roleLabel ? ` by ${roleLabel}` : ""}
          {doc.reviewer_name ? ` — ${doc.reviewer_name}` : ""}
          {doc.verified_at ? ` · ${new Date(doc.verified_at).toLocaleString()}` : ""}
        </p>
        {!verified && doc.rejection_reason && (
          <p className="mt-0.5 text-xs text-destructive">Reason: {doc.rejection_reason}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className={verified ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
          {doc.verification_status}
        </Badge>
        <KycDocumentViewButton documentId={doc.id} documentType={doc.document_type} />
      </div>
    </div>
  );
}

function KycQueueRow({ doc }: { doc: PendingKycDoc }) {
  const qc = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["kyc-pending-queue"] });
    qc.invalidateQueries({ queryKey: ["kyc-decided-queue"] });
    qc.invalidateQueries({ queryKey: ["student-docs", doc.owner_id] });
    qc.invalidateQueries({ queryKey: ["student-docs-status", doc.owner_id] });
    qc.invalidateQueries({ queryKey: ["kyc-complete", doc.owner_id] });
  };

  // "This document has already been reviewed" is fn_decide_kyc_document's
  // own error text when another reviewer won the race — surfaced verbatim
  // rather than a generic failure message, then the queues are refreshed so
  // this row moves itself into Reviewed instead of staying stuck as pending.
  const approve = useMutation({
    mutationFn: async () => {
      // Not in the generated types until types.ts is regenerated after
      // this migration is applied.
      const { error } = await supabase.rpc("fn_decide_kyc_document" as never, {
        p_document_id: doc.id,
        p_decision: "VERIFIED",
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${doc.document_type} approved`);
      invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not approve");
      invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason is required");
      const { error } = await supabase.rpc("fn_decide_kyc_document" as never, {
        p_document_id: doc.id,
        p_decision: "REJECTED",
        p_rejection_reason: reason.trim(),
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${doc.document_type} rejected`);
      setRejectOpen(false);
      setReason("");
      invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not reject");
      invalidate();
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {doc.student?.full_name ?? "Unknown student"}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {doc.student?.admission_number}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {doc.document_type} • {doc.original_filename}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <KycDocumentViewButton documentId={doc.id} documentType={doc.document_type} />
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject {doc.document_type}</DialogTitle>
            </DialogHeader>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this document being rejected?"
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={reject.isPending || !reason.trim()}
                onClick={() => reject.mutate()}
              >
                <FileWarning className="h-4 w-4" /> Confirm reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
          <CheckCircle2 className="h-4 w-4" /> Approve
        </Button>
      </div>
    </div>
  );
}
