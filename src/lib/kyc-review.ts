import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface DecideKycDocumentInput {
  documentId: string;
  /** The student who owns the document (documents.owner_id). */
  ownerId: string;
  decision: "VERIFIED" | "REJECTED";
  /** Required when rejecting; shown to the student. */
  reason?: string;
}

/**
 * Approve or reject one KYC document through fn_decide_kyc_document (row lock,
 * PENDING guard, review history) — never a direct documents update. Callers
 * own the toasts. Caches refresh on success and on error, since a failure is
 * often "already reviewed" by someone else.
 */
export function useDecideKycDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, decision, reason }: DecideKycDocumentInput) => {
      const trimmed = reason?.trim() ?? "";
      if (decision === "REJECTED" && !trimmed) {
        throw new Error("Enter a reason so the student knows what to fix");
      }
      const { data, error } = await supabase.rpc("fn_decide_kyc_document", {
        p_document_id: documentId,
        p_decision: decision,
        ...(decision === "REJECTED" ? { p_rejection_reason: trimmed } : {}),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSettled: (_data, _error, { ownerId }) => {
      const keys: unknown[][] = [
        ["kyc-pending-queue"],
        ["kyc-decided-queue"],
        ["kyc-decided-count"],
        ["kyc-decided-all"],
        ["student-docs", ownerId],
        ["student-docs-status", ownerId],
        ["kyc-complete", ownerId],
        ["students-tab"],
      ];
      return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
  });
}
