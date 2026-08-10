import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KycGateNotice } from "@/components/students/KycGateNotice";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { useKycComplete } from "@/lib/kyc";

export const Route = createFileRoute("/_authenticated/student/home")({
  component: StudentHomePage,
});

function StudentHomePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;

  const studentQ = useQuery({
    queryKey: ["my-student-record", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, tenant_id, property_id")
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { complete: kycComplete, isLoading: kycLoading } = useKycComplete(studentQ.data?.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Welcome" />

      {!kycLoading && !kycComplete && (
        <KycGateNotice message="Complete your KYC to unlock fees, gate pass, mess and complaints." />
      )}

      <EmptyState
        title="Welcome"
        description="Your fees and notices will appear here."
      />
    </div>
  );
}
