import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, DoorOpen, Link2, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycUploadForm } from "@/components/students/KycUploadForm";
import { AgreementViewer } from "@/components/students/AgreementViewer";
import { confirmStudentAdmission } from "@/lib/student.functions";

export const Route = createFileRoute("/_authenticated/admin/students/$id/")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: StudentDetailPage,
});

function StudentDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const confirmAdmissionFn = useServerFn(confirmStudentAdmission);

  const studentQ = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const confirmAdmission = useMutation({
    mutationFn: () => confirmAdmissionFn({ data: { student_id: id } }),
    onSuccess: () => {
      toast.success("Account linked — the student can now sign in to their portal");
      qc.invalidateQueries({ queryKey: ["student", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not link the account"),
  });

  const allocQ = useQuery({
    queryKey: ["student-allocations", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select("id, status, start_date, expected_end_date, actual_end_date, bed_id, rent_snapshot_paise")
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const docsQ = useQuery({
    queryKey: ["student-docs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, status, verification_status, created_at")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (studentQ.isLoading || !studentQ.data) {
    return <Skeleton className="h-64 w-full" />;
  }
  const s = studentQ.data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/students"><ArrowLeft className="h-4 w-4" /> Back to students</Link>
      </Button>

      <PageHeader
        title={s.full_name}
        description={`Admission #${s.admission_number} • ${s.phone ?? "no phone"}`}
        actions={
          <div className="flex items-center gap-2">
            <StudentStatusBadge status={s.status} />
            {!s.profile_id && (
              <Button
                variant="outline"
                disabled={confirmAdmission.isPending}
                onClick={() => confirmAdmission.mutate()}
              >
                {confirmAdmission.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Confirm & link account
              </Button>
            )}
            {(s.status === "ACTIVE" || s.status === "NOTICE_GIVEN") && (
              <Button asChild variant="outline">
                <Link to="/admin/students/$id/move-out" params={{ id }}>
                  <DoorOpen className="h-4 w-4" /> Move out
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Email" value={s.email ?? "—"} />
            <Info label="Date of birth" value={s.date_of_birth ?? "—"} />
            <Info label="Gender" value={s.gender ?? "—"} />
            <Info label="Minor" value={s.is_minor ? "Yes" : "No"} />
            <Info label="Institute" value={s.academic_institute ?? "—"} />
            <Info label="Course" value={s.course_name ?? "—"} />
            <Info label="Portal access" value={s.profile_id ? "Linked" : "Not linked yet"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Allocation history</CardTitle></CardHeader>
          <CardContent>
            {(allocQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No allocations yet. Assign a bed from Allocations.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(allocQ.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-md border border-border p-2">
                    <span>
                      {a.start_date} → {a.actual_end_date ?? a.expected_end_date ?? "open"}
                    </span>
                    <span className="text-xs font-medium">{a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>KYC documents</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <KycUploadForm
            tenantId={s.tenant_id}
            propertyId={s.property_id}
            studentId={s.id}
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

      <AgreementViewer studentId={s.id} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
