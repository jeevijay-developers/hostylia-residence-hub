import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileWarning, ShieldCheck, XCircle } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/warden/daily-brief")({
  component: WardenBriefPage,
});

interface PendingKycDoc {
  id: string;
  document_type: string;
  original_filename: string;
  owner_id: string;
  created_at: string;
  student: { id: string; full_name: string; admission_number: string } | null;
}

function useKycQueue() {
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

function WardenBriefPage() {
  const kycQ = useKycQueue();

  return (
    <div className="space-y-6">
      <PageHeader title="Daily brief" description="Your day at a glance." />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4" /> KYC approvals
        </h2>
        {kycQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!kycQ.isLoading && (kycQ.data ?? []).length === 0 && (
          <EmptyState title="No KYC documents awaiting review" />
        )}
        <div className="space-y-2">
          {(kycQ.data ?? []).map((doc) => (
            <KycQueueRow key={doc.id} doc={doc} />
          ))}
        </div>
      </section>

      {(kycQ.data ?? []).length === 0 && <EmptyState title="No attendance or complaints yet today" />}
    </div>
  );
}

function KycQueueRow({ doc }: { doc: PendingKycDoc }) {
  const qc = useQueryClient();
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["kyc-pending-queue"] });
    qc.invalidateQueries({ queryKey: ["student-docs", doc.owner_id] });
    qc.invalidateQueries({ queryKey: ["student-docs-status", doc.owner_id] });
    qc.invalidateQueries({ queryKey: ["kyc-complete", doc.owner_id] });
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
      <div>
        <p className="text-sm font-medium">
          {doc.student?.full_name ?? "Unknown student"}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {doc.student?.admission_number}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {doc.document_type} • {doc.original_filename}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject {doc.document_type}</DialogTitle></DialogHeader>
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
