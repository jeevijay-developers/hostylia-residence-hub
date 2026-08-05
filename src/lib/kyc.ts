import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A student's KYC gate is "complete" once they've uploaded at least one
 * document — matches the definition the admin-side `KycStatus` widget
 * already uses. Admin verification (`documents.verification_status`) is a
 * separate, later step and isn't required to unlock the portal, since
 * there's no staff-side verify action built yet.
 */
export function useKycComplete(studentId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["kyc-complete", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentId!)
        .is("deleted_at", null)
        .limit(1);
      return (data ?? []).length > 0;
    },
  });
  return { complete: q.data ?? false, isLoading: q.isLoading };
}
