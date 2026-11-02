import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** The student's own allocation notice fields (RLS: "allocations student read"). */
export function useMyNotice(allocationId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-move-out-notice", allocationId],
    enabled: !!allocationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, notice_period_days, lock_in_until, notice_given_at, requested_move_out_date, notice_reason, notice_remarks",
        )
        .eq("id", allocationId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
