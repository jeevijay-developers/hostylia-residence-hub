import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KycUploadForm } from "@/components/students/KycUploadForm";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

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

  const docsQ = useQuery({
    queryKey: ["student-docs", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, verification_status")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentQ.data!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Welcome" />
      <EmptyState
        title="Welcome"
        description="Your fees and notices will appear here."
      />

      {studentQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : studentQ.data ? (
        <Card>
          <CardHeader><CardTitle>KYC documents</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <KycUploadForm
              tenantId={studentQ.data.tenant_id}
              propertyId={studentQ.data.property_id}
              studentId={studentQ.data.id}
              onUploaded={() => docsQ.refetch()}
            />
            {(docsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(docsQ.data ?? []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="font-medium">{d.document_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.original_filename} • {d.verification_status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
