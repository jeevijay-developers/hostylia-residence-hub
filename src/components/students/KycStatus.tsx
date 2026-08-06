import { useQuery } from "@tanstack/react-query";
import { Clock, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Props {
  studentId: string;
}

/** Admin/staff view: status only — uploading KYC documents is a student-side
 * action from their own portal, not something staff do on their behalf. */
export function KycStatus({ studentId }: Props) {
  const docsQ = useQuery({
    queryKey: ["student-docs-status", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentId)
        .is("deleted_at", null)
        .limit(1);
      return data ?? [];
    },
  });

  const complete = (docsQ.data?.length ?? 0) > 0;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <h3 className="font-display text-base font-semibold">KYC documents</h3>
      {complete ? (
        <span className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
          <ShieldCheck className="h-4 w-4" />
          Complete
        </span>
      ) : (
        <span className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning">
          <Clock className="h-4 w-4" />
          Pending — awaiting student upload
        </span>
      )}
    </div>
  );
}
