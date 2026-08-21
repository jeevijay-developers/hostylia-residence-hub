import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BedDouble,
  Cake,
  GraduationCap,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycStatus } from "@/components/students/KycStatus";
import { AgreementViewer } from "@/components/students/AgreementViewer";
import { StudentProfileEditDialog } from "@/components/students/StudentProfileEditDialog";
import { supabase } from "@/integrations/supabase/client";
import { displayIndianPhone } from "@/schemas/auth";
import { confirmStudentAdmission } from "@/lib/student.functions";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/students/$id")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: WardenStudentDetailPage,
});

interface AllocationRow {
  id: string;
  status: string;
  start_date: string;
  expected_end_date: string | null;
  actual_end_date: string | null;
  bed: {
    code: string;
    room: { room_number: string } | null;
    floor: { name: string; floor_number: number | null } | null;
    block: { name: string } | null;
  } | null;
}

function WardenStudentDetailPage() {
  const { id } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);
  const [stayOpen, setStayOpen] = useState(false);
  const { can } = useWardenPermissions();

  const studentQ = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, property_id, profile_id, full_name, admission_number, phone, email, date_of_birth, gender, is_minor, academic_institute, course_name, academic_year, status",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const allocationsQ = useQuery({
    queryKey: ["student-allocations", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, start_date, expected_end_date, actual_end_date, bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))",
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Warden scope = VE on Student profiles (PRD 7, assigned block); the
  // /warden/students list is already restricted to the warden's assigned
  // property, so any student reachable here is read-in-scope. The edit
  // warden_can_write_scope against it,
  // the same pattern updateGuardianPhone uses for property scope.
  const confirmAdmissionFn = useServerFn(confirmStudentAdmission);
  const qc = useQueryClient();

  const confirmAdmission = useMutation({
    mutationFn: () => confirmAdmissionFn({ data: { student_id: id } }),
    onSuccess: () => {
      toast.success("Account linked — the student can now sign in to their portal");
      qc.invalidateQueries({ queryKey: ["student", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not link the account"),
  });

  if (studentQ.isLoading || !studentQ.data) return <Skeleton className="h-80 w-full rounded-xl" />;
  const s = studentQ.data;
  const currentAllocation =
    allocationsQ.data?.find((a) => !a.actual_end_date) ?? allocationsQ.data?.[0];
  const profileDetails = [
    { label: "Phone", value: s.phone ? displayIndianPhone(s.phone) : null, icon: Phone },
    { label: "Email", value: s.email, icon: Mail },
    { label: "Date of birth", value: s.date_of_birth, icon: Cake },
    { label: "Gender", value: s.gender, icon: UserRound },
    { label: "Minor", value: s.is_minor ? "Yes" : "No", icon: Users },
    { label: "Institute", value: s.academic_institute, icon: GraduationCap },
    { label: "Course", value: s.course_name, icon: GraduationCap },
    { label: "Academic year", value: s.academic_year, icon: GraduationCap },
  ].filter((detail) => detail.value);

  return (
    <div className="space-y-5 pb-3">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/warden/students">
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
      </Button>

      <PageHeader
        title={s.full_name}
        description={[`Admission #${s.admission_number}`, s.phone].filter(Boolean).join(" · ")}
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
          </div>
        }
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Student profile</p>
          {can("students_edit") && (
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-3">
          {profileDetails.map((detail) => (
            <Info key={detail.label} {...detail} />
          ))}
        </div>
      </section>

      <section>
        <Card className="min-w-0 shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Current stay</CardTitle>
            {currentAllocation && can("allocations_edit") && (
              <StayEditor
                allocation={currentAllocation}
                propertyId={s.property_id}
                studentId={id}
                open={stayOpen}
                onOpenChange={setStayOpen}
              />
            )}
          </CardHeader>
          <CardContent>
            {allocationsQ.isLoading ? (
              <Skeleton className="h-14 w-full" />
            ) : currentAllocation ? (
              <AllocationDetails allocation={currentAllocation} />
            ) : (
              <p className="text-sm text-muted-foreground">No accommodation allocation recorded.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-5">
        <Card className="min-w-0 shadow-none">
          <CardHeader className="flex-col items-start gap-3 space-y-0">
            <CardTitle className="text-base">KYC documents</CardTitle>
            <KycStatus studentId={id} />
          </CardHeader>
        </Card>
        <Card className="min-w-0 shadow-none">
          <CardHeader className="flex-col items-start gap-3 space-y-0">
            <CardTitle className="text-base">Boarding agreement</CardTitle>
            <AgreementViewer studentId={id} readOnly />
          </CardHeader>
        </Card>
      </section>

      <StudentProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        studentId={id}
        student={s}
      />
    </div>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | boolean;
  icon: LucideIcon;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function AllocationDetails({ allocation }: { allocation: AllocationRow }) {
  const bed = allocation.bed;
  const location = [
    bed?.block?.name && `Block ${bed.block.name}`,
    bed?.floor?.name,
    bed?.room?.room_number && `Room ${bed.room.room_number}`,
    bed?.code && `Bed ${bed.code}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
        <BedDouble className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-foreground">
          {location || "Accommodation details unavailable"}
        </p>
        <p className="text-xs text-muted-foreground">
          {allocation.start_date} →{" "}
          {allocation.actual_end_date ?? allocation.expected_end_date ?? "Current"}
        </p>
      </div>
    </div>
  );
}

function StayEditor({
  allocation,
  propertyId,
  studentId,
  open,
  onOpenChange,
}: {
  allocation: AllocationRow;
  propertyId: string;
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [bedId, setBedId] = useState("");
  const bedsQ = useQuery({
    queryKey: ["vacant-beds", propertyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds")
        .select(
          "id, code, room_id, floor_id, block_id, rooms(room_number), floors(name), blocks(name)",
        )
        .eq("property_id", propertyId)
        .eq("status", "VACANT")
        .is("deleted_at", null)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const changeStay = useMutation({
    mutationFn: async () => {
      const bed = bedsQ.data?.find((item) => item.id === bedId);
      if (!bed) throw new Error("Choose a vacant bed");
      const { error } = await supabase
        .from("allocations")
        .update({
          bed_id: bed.id,
          room_id: bed.room_id,
          floor_id: bed.floor_id,
          block_id: bed.block_id,
        })
        .eq("id", allocation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Current stay updated");
      qc.invalidateQueries({ queryKey: ["student-allocations", studentId] });
      qc.invalidateQueries({ queryKey: ["vacant-beds", propertyId] });
      onOpenChange(false);
      setBedId("");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update stay"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BedDouble className="h-4 w-4" /> Change stay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change current stay</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>New vacant bed</Label>
          <Select value={bedId} onValueChange={setBedId}>
            <SelectTrigger>
              <SelectValue
                placeholder={bedsQ.isLoading ? "Loading available beds…" : "Select a bed"}
              />
            </SelectTrigger>
            <SelectContent>
              {(bedsQ.data ?? []).map((bed) => (
                <SelectItem key={bed.id} value={bed.id}>
                  {[
                    bed.blocks?.name && `Block ${bed.blocks.name}`,
                    bed.floors?.name,
                    bed.rooms?.room_number && `Room ${bed.rooms.room_number}`,
                    `Bed ${bed.code}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!bedsQ.isLoading && (bedsQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No vacant beds are available in this property.
            </p>
          )}
        </div>
        <DialogFooter className="flex-row justify-between gap-3 sm:justify-between">
          <Button
            className="flex-1 sm:flex-none"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            disabled={!bedId || changeStay.isPending}
            onClick={() => changeStay.mutate()}
          >
            {changeStay.isPending ? "Updating…" : "Confirm change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
