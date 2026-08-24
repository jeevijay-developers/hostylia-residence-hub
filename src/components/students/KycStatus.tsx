import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FileWarning,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useResolvedRole } from "@/lib/user-role";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  studentId: string;
  /** When true, renders the same Approve/Reject actions as the Warden's KYC
   * approval queue (`KycApprovalQueueCard`) inline for each pending document.
   * Defaults to false so existing status-only usages (Warden, Student) are
   * unaffected. */
  canReview?: boolean;
}

interface DocRow {
  id: string;
  document_type: string;
  verification_status: string;
  rejection_reason: string | null;
}

const DOC_STATUS_STYLE: Record<string, string> = {
  VERIFIED: "bg-success/15 text-success",
  PENDING: "bg-warning/15 text-warning",
  REJECTED: "bg-destructive/15 text-destructive",
  NOT_REQUIRED: "bg-muted text-muted-foreground",
};

/** Admin/staff view: status only by default — uploading KYC documents is a
 * student-side action from their own portal, not something staff do on
 * their behalf. Verification itself happens from the Warden's daily brief
 * (`KycApprovalQueueCard`); pass `canReview` to surface the same Approve/
 * Reject actions inline here (used by the Admin student detail page). */
export function KycStatus({ studentId, canReview }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const docsQ = useQuery({
    queryKey: ["student-docs-status", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, document_type, verification_status, rejection_reason")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentId)
        .is("deleted_at", null);
      return (data ?? []) as DocRow[];
    },
  });

  const docs = docsQ.data ?? [];
  const hasRejected = docs.some((d) => d.verification_status === "REJECTED");
  const allVerified = docs.length > 0 && docs.every((d) => d.verification_status === "VERIFIED");

  const state =
    docs.length === 0
      ? {
          tone: "warning" as const,
          icon: Clock,
          text: "Pending — awaiting student upload",
        }
      : hasRejected
        ? {
            tone: "destructive" as const,
            icon: AlertTriangle,
            text: "Rejected — awaiting re-upload",
          }
        : allVerified
          ? {
              tone: "success" as const,
              icon: ShieldCheck,
              text: "Complete",
            }
          : {
              tone: "warning" as const,
              icon: Clock,
              text: "Uploaded — awaiting warden review",
            };

  const Icon = state.icon;
  const toneClasses: Record<typeof state.tone, string> = {
    warning: "border-warning/30 bg-warning/10 text-warning",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive",
    success: "border-success/30 bg-success/10 text-success",
  };
  const buttonToneClasses: Record<typeof state.tone, string> = {
    warning: "border-warning/40 text-warning hover:bg-warning/10",
    destructive: "border-destructive/40 text-destructive hover:bg-destructive/10",
    success: "border-success/40 text-success hover:bg-success/10",
  };

  return (
    <div className={`w-full space-y-2.5 rounded-lg border p-3 ${toneClasses[state.tone]}`}>
      <p className="flex items-start gap-2 text-sm font-medium leading-snug">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {state.text}
      </p>
      <Button
        size="sm"
        variant="outline"
        className={`h-8 bg-transparent ${buttonToneClasses[state.tone]}`}
        onClick={() => setDetailsOpen(true)}
        disabled={docs.length === 0}
      >
        View details
      </Button>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>KYC documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {docs.map((doc) => (
              <KycDocRow key={doc.id} doc={doc} studentId={studentId} canReview={canReview} />
            ))}
            {docs.length === 0 && (
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One document row inside the details dialog. When `canReview` is set and
 * the document is still PENDING, renders the same Approve/Reject actions and
 * mutation logic as `KycApprovalQueueCard`'s queue row. */
function KycDocRow({
  doc,
  studentId,
  canReview,
}: {
  doc: DocRow;
  studentId: string;
  canReview?: boolean;
}) {
  const qc = useQueryClient();
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["student-docs-status", studentId] });
    qc.invalidateQueries({ queryKey: ["student-docs", studentId] });
    qc.invalidateQueries({ queryKey: ["kyc-complete", studentId] });
    qc.invalidateQueries({ queryKey: ["kyc-pending-queue"] });
  };

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("documents")
        .update({
          verification_status: "VERIFIED",
          verified_by: userId,
          verified_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${doc.document_type} approved`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve"),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason is required");
      const { error } = await supabase
        .from("documents")
        .update({
          verification_status: "REJECTED",
          verified_by: userId,
          verified_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
        })
        .eq("id", doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${doc.document_type} rejected`);
      setRejectOpen(false);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reject"),
  });

  const showActions = canReview && doc.verification_status === "PENDING";

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {doc.document_type.replace(/_/g, " ")}
          </p>
          {doc.rejection_reason && (
            <p className="mt-0.5 text-xs text-destructive">{doc.rejection_reason}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className={DOC_STATUS_STYLE[doc.verification_status] ?? ""}>
          {doc.verification_status.replace(/_/g, " ")}
        </Badge>
        {showActions && (
          <>
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
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
            <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
              <XCircle className="h-4 w-4" /> Reject
            </Button>
            <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
              <CheckCircle2 className="h-4 w-4" /> Approve
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
