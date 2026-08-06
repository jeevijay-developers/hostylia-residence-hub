import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Props {
  studentId: string;
}

/** Admin/staff view: status only — uploading KYC documents is a student-side
 * action from their own portal, not something staff do on their behalf.
 * Verification itself happens from the Warden's daily brief. */
export function KycStatus({ studentId }: Props) {
  const docsQ = useQuery({
    queryKey: ["student-docs-status", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, verification_status")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentId)
        .is("deleted_at", null);
      return data ?? [];
    },
  });

  const docs = docsQ.data ?? [];
  const hasRejected = docs.some((d) => d.verification_status === "REJECTED");
  const allVerified = docs.length > 0 && docs.every((d) => d.verification_status === "VERIFIED");

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <h3 className="font-display text-base font-semibold">KYC documents</h3>
      {docs.length === 0 ? (
        <span className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning">
          <Clock className="h-4 w-4" />
          Pending — awaiting student upload
        </span>
      ) : hasRejected ? (
        <span className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Rejected — awaiting re-upload
        </span>
      ) : allVerified ? (
        <span className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
          <ShieldCheck className="h-4 w-4" />
          Complete
        </span>
      ) : (
        <span className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning">
          <Clock className="h-4 w-4" />
          Uploaded — awaiting warden review
        </span>
      )}
    </div>
  );
}
