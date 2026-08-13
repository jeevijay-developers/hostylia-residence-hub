import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { displayIndianPhone } from "@/schemas/auth";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycStatus } from "@/components/students/KycStatus";
import { GuardianCard } from "@/components/students/GuardianCard";
import { StudentProfileEditDialog } from "@/components/students/StudentProfileEditDialog";

export const Route = createFileRoute("/_authenticated/warden/students/$id")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: WardenStudentDetailPage,
});

// Matches uidx_allocations_active_student — the statuses that count as a
// student's current (not yet closed/cancelled) stay.
const OPEN_ALLOCATION_STATUSES = [
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
];

function WardenStudentDetailPage() {
  const { id } = Route.useParams();
  const [editing, setEditing] = useState(false);

  const studentQ = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, admission_number, phone, email, date_of_birth, gender, is_minor, academic_institute, course_name, academic_year, status",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // "Current" allocation only — Warden scope is view/edit of the assigned
  // student, not the full move-in/move-out history the Admin detail page shows.
  const allocQ = useQuery({
    queryKey: ["student-current-allocation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, start_date, expected_end_date, bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))",
        )
        .eq("student_id", id)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const docsQ = useQuery({
    queryKey: ["student-docs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, verification_status")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (studentQ.isLoading || !studentQ.data) {
    return <Skeleton className="h-64 w-full" />;
  }
  const s = studentQ.data;

  const bed = allocQ.data?.bed as
    | {
        code: string;
        room: { room_number: string } | null;
        floor: { name: string; floor_number: number | null } | null;
        block: { name: string } | null;
      }
    | null
    | undefined;
  const stayText = bed
    ? [
        bed.block?.name && `Block ${bed.block.name}`,
        bed.floor?.name ??
          (bed.floor?.floor_number != null ? `Floor ${bed.floor.floor_number}` : null),
        bed.room?.room_number && `Room ${bed.room.room_number}`,
        `Bed ${bed.code}`,
      ]
        .filter(Boolean)
        .join(" • ")
    : "Not allocated yet";

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/warden/students">
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
      </Button>

      <PageHeader
        title={s.full_name}
        description={`Admission #${s.admission_number} • ${s.phone ? displayIndianPhone(s.phone) : "no phone"}`}
        actions={<StudentStatusBadge status={s.status} />}
      />

      {/* Warden scope = VE on Student profiles (PRD 7, assigned block); the
          /warden/students list is already restricted to the warden's assigned
          property, so any student reachable here is read-in-scope. The edit
          server function re-verifies the student's current block before
          writing, per PRD 7.1. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Personal & academic info</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              title="Edit"
              aria-label="Edit"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Email" value={s.email ?? "—"} />
            <Info label="Date of birth" value={s.date_of_birth ?? "—"} />
            <Info label="Gender" value={s.gender ?? "—"} />
            <Info label="Minor" value={s.is_minor ? "Yes" : "No"} />
            <Info label="Institute" value={s.academic_institute ?? "—"} />
            <Info label="Course" value={s.course_name ?? "—"} />
            <Info label="Academic year" value={s.academic_year ?? "—"} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <GuardianCard studentId={id} canEdit />

          <Card>
            <CardHeader>
              <CardTitle>Current room / bed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{stayText}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>KYC documents</CardTitle>
              <KycStatus studentId={id} />
            </CardHeader>
            {(docsQ.data ?? []).length > 0 && (
              <CardContent className="space-y-2">
                {(docsQ.data ?? []).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{doc.document_type}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.original_filename}
                      </p>
                    </div>
                    <Badge
                      variant={
                        doc.verification_status === "VERIFIED"
                          ? "secondary"
                          : doc.verification_status === "REJECTED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {doc.verification_status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <StudentProfileEditDialog
        open={editing}
        onOpenChange={setEditing}
        studentId={id}
        student={s}
      />
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
