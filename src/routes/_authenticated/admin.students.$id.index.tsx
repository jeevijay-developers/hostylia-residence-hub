import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, DoorOpen, Link2, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DetailPageSkeleton } from "@/components/dashboard/DetailPageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycStatus } from "@/components/students/KycStatus";
import { AgreementViewer } from "@/components/students/AgreementViewer";
import { GuardianCard } from "@/components/students/GuardianCard";
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
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, start_date, expected_end_date, actual_end_date, bed_id, rent_snapshot_paise, " +
            "bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))",
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (studentQ.isLoading || !studentQ.data) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/students">
            <ArrowLeft className="h-4 w-4" /> Back to students
          </Link>
        </Button>
        <DetailPageSkeleton />
      </div>
    );
  }
  const s = studentQ.data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/students">
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
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
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 text-sm sm:grid-cols-2">
            <Info label="Email" value={s.email ?? "—"} />
            <Info label="Date of birth" value={s.date_of_birth ?? "—"} />
            <Info label="Gender" value={s.gender ?? "—"} />
            <Info label="Minor" value={s.is_minor ? "Yes" : "No"} />
            <Info label="Institute" value={s.academic_institute ?? "—"} />
            <Info label="Course" value={s.course_name ?? "—"} />
            <Info label="Portal access" value={s.profile_id ? "Linked" : "Not linked yet"} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <GuardianCard studentId={id} canEdit />

          <Card>
            <CardHeader>
              <CardTitle>Allocation history</CardTitle>
            </CardHeader>
            <CardContent>
              {allocQ.isError ? (
                <p className="text-sm text-destructive">
                  Couldn't load allocations:{" "}
                  {allocQ.error instanceof Error ? allocQ.error.message : "unknown error"}
                </p>
              ) : (allocQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No allocations yet. Assign a bed from Allocations.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {((allocQ.data as any[]) ?? []).map((a: any) => {
                    const bed = a.bed as {
                      code: string;
                      room: { room_number: string } | null;
                      floor: { name: string; floor_number: number | null } | null;
                      block: { name: string } | null;
                    } | null;
                    return (
                      <li key={a.id} className="space-y-1 rounded-md border border-border p-2">
                        <div className="flex items-center justify-between">
                          <span>
                            {a.start_date} → {a.actual_end_date ?? a.expected_end_date ?? "open"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {bed
                            ? [
                                bed.block?.name && `Block ${bed.block.name}`,
                                bed.floor?.name ??
                                  (bed.floor?.floor_number != null
                                    ? `Floor ${bed.floor.floor_number}`
                                    : null),
                                bed.room?.room_number && `Room ${bed.room.room_number}`,
                                `Bed ${bed.code}`,
                              ]
                                .filter(Boolean)
                                .join(" • ")
                            : "Bed details unavailable"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col items-start gap-3 space-y-0">
              <CardTitle>KYC documents</CardTitle>
              <KycStatus studentId={s.id} />
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="flex-col items-start gap-3 space-y-0">
              <CardTitle>Boarding agreement</CardTitle>
              <AgreementViewer studentId={s.id} readOnly />
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
