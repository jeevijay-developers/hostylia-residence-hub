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

  if (docs.length === 0) {
    return (
      <span className="inline-flex max-w-full items-start gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-sm font-medium leading-snug text-warning">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        Pending — awaiting student upload
      </span>
    );
  }
  if (hasRejected) {
    return (
      <span className="inline-flex max-w-full items-start gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium leading-snug text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Rejected — awaiting re-upload
      </span>
    );
  }
  if (allVerified) {
    return (
      <span className="inline-flex max-w-full items-start gap-2 rounded-md bg-success/10 px-3 py-1.5 text-sm font-medium leading-snug text-success">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-start gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-sm font-medium leading-snug text-warning">
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      Uploaded — awaiting warden review
    </span>
  );
}
