import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const KYC_LOCKED_MESSAGE = "Complete your KYC to access this feature.";

/** Student routes that stay reachable before KYC is verified. Everything else
 * under /student is gated (default-deny), so a newly added module is locked
 * unless it is deliberately listed here. */
const KYC_OPEN_STUDENT_PATHS = ["/student/home", "/student/profile"];

export function isKycGatedStudentPath(pathname: string): boolean {
  return !KYC_OPEN_STUDENT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type KycStatus = "NONE" | "PENDING" | "REJECTED" | "VERIFIED";

/**
 * A student's KYC gate is open only once KYC is VERIFIED: at least one active
 * document, and every one of them verified — the same definition the
 * `KycStatus` widget and the profile badge use, and the one the database
 * enforces via `is_student_kyc_verified()`. Uploaded-but-pending and rejected
 * documents keep the gate closed. `complete` stays false while loading or on
 * error so protected UI never flashes open.
 *
 * Refetches on focus/interval while unverified so approval by staff restores
 * access without a manual reload.
 */
export function useKycComplete(studentId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["kyc-complete", studentId],
    enabled: !!studentId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data === "VERIFIED" ? false : 30_000),
    queryFn: async (): Promise<KycStatus> => {
      const { data, error } = await supabase
        .from("documents")
        .select("verification_status")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentId!)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      const docs = data ?? [];
      if (docs.length === 0) return "NONE";
      if (docs.some((d) => d.verification_status === "REJECTED")) return "REJECTED";
      if (docs.every((d) => d.verification_status === "VERIFIED")) return "VERIFIED";
      return "PENDING";
    },
  });
  const status: KycStatus = q.data ?? "NONE";
  return { complete: status === "VERIFIED", status, isLoading: q.isLoading };
}

/** Toast for a click on a locked feature, with a shortcut to My Profile. */
export function useKycLockedToast() {
  const navigate = useNavigate();
  return () =>
    toast.error(KYC_LOCKED_MESSAGE, {
      action: { label: "My Profile", onClick: () => void navigate({ to: "/student/profile" }) },
    });
}
