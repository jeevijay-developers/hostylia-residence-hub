import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BedDouble, Pencil, Save } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/warden/students/$id")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: WardenStudentDetailPage,
});

const STATUSES = [
  "APPLICANT",
  "VERIFIED",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVED_OUT",
  "ARCHIVED",
  "REJECTED",
] as const;

function WardenStudentDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [stayOpen, setStayOpen] = useState(false);

  const studentQ = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
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

  const guardiansQ = useQuery({
    queryKey: ["student-guardians", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_guardians")
        .select("is_primary, guardian:guardians(id, full_name, phone)")
        .eq("student_id", id)
        .is("unlinked_at", null)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStudent = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      const { error } = await supabase
        .from("students")
        .update({
          full_name: values.full_name.trim(),
          admission_number: values.admission_number.trim(),
          phone: emptyToNull(values.phone),
          email: emptyToNull(values.email),
          date_of_birth: emptyToNull(values.date_of_birth),
          gender: emptyToNull(values.gender),
          academic_institute: emptyToNull(values.academic_institute),
          course_name: emptyToNull(values.course_name),
          academic_year: emptyToNull(values.academic_year),
          joined_at: emptyToNull(values.joined_at),
          status: values.status,
          is_minor: values.is_minor,
        })
        .eq("id", id);
      if (error) throw error;

      const guardian = guardiansQ.data?.[0]?.guardian;
      if (
        guardian &&
        (guardian.full_name !== values.guardian_name.trim() ||
          guardian.phone !== values.guardian_phone.trim())
      ) {
        const { error: guardianError } = await supabase
          .from("guardians")
          .update({ full_name: values.guardian_name.trim(), phone: values.guardian_phone.trim() })
          .eq("id", guardian.id);
        if (guardianError) throw guardianError;
      }
    },
    onSuccess: () => {
      toast.success("Student details updated");
      qc.invalidateQueries({ queryKey: ["student", id] });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student-guardians", id] });
      setEditOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update student"),
  });

  if (studentQ.isLoading || !studentQ.data) return <Skeleton className="h-80 w-full rounded-xl" />;
  const s = studentQ.data;
  const currentAllocation =
    allocationsQ.data?.find((a) => !a.actual_end_date) ?? allocationsQ.data?.[0];
  const profileDetails = [
    { label: "Phone", value: s.phone },
    { label: "Email", value: s.email },
    { label: "Date of birth", value: s.date_of_birth },
    { label: "Gender", value: s.gender },
    { label: "Minor", value: s.is_minor ? "Yes" : "No" },
    { label: "Joined", value: s.joined_at },
    { label: "Institute", value: s.academic_institute },
    { label: "Course", value: s.course_name },
    { label: "Academic year", value: s.academic_year },
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
          <StudentEditor
            student={s}
            guardian={guardiansQ.data?.[0]?.guardian ?? null}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSave={(values) => updateStudent.mutate(values)}
            saving={updateStudent.isPending}
          />
        }
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Student profile</p>
          <StudentStatusBadge status={s.status} />
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
            {currentAllocation && (
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
    </div>
  );
}

type StudentFormValues = {
  full_name: string;
  admission_number: string;
  phone: string;
  email: string;
  date_of_birth: string;
  gender: string;
  academic_institute: string;
  course_name: string;
  academic_year: string;
  joined_at: string;
  status: (typeof STATUSES)[number];
  is_minor: boolean;
  guardian_name: string;
  guardian_phone: string;
};

function StudentEditor({
  student,
  guardian,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  student: Record<string, any>;
  guardian: { id: string; full_name: string; phone: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: StudentFormValues) => void;
  saving: boolean;
}) {
  const [values, setValues] = useState<StudentFormValues>(toFormValues(student, guardian));
  useEffect(() => setValues(toFormValues(student, guardian)), [student, guardian]);
  const set = (key: keyof StudentFormValues, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Pencil className="h-4 w-4" /> Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit student details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field
            label="Full name"
            value={values.full_name}
            onChange={(v) => set("full_name", v)}
            required
          />
          <Field
            label="Admission number"
            value={values.admission_number}
            onChange={(v) => set("admission_number", v)}
            required
          />
          <Field label="Phone" type="tel" value={values.phone} onChange={(v) => set("phone", v)} />{" "}
          <Field
            label="Email"
            type="email"
            value={values.email}
            onChange={(v) => set("email", v)}
          />
          <Field
            label="Date of birth"
            type="date"
            value={values.date_of_birth}
            onChange={(v) => set("date_of_birth", v)}
          />
          <div className="grid gap-2">
            <Label>Gender</Label>
            <Input
              value={values.gender}
              onChange={(e) => set("gender", e.target.value)}
              placeholder="e.g. Male"
            />
          </div>
          <Field
            label="Institute"
            value={values.academic_institute}
            onChange={(v) => set("academic_institute", v)}
          />{" "}
          <Field
            label="Course"
            value={values.course_name}
            onChange={(v) => set("course_name", v)}
          />
          <Field
            label="Academic year"
            value={values.academic_year}
            onChange={(v) => set("academic_year", v)}
          />{" "}
          <Field
            label="Joined on"
            type="date"
            value={values.joined_at}
            onChange={(v) => set("joined_at", v)}
          />
          {guardian && (
            <>
              <p className="col-span-full border-t border-border pt-4 text-sm font-semibold">
                Guardian / parent contact
              </p>
              <Field
                label="Guardian name"
                value={values.guardian_name}
                onChange={(v) => set("guardian_name", v)}
              />
              <Field
                label="Guardian phone"
                type="tel"
                value={values.guardian_phone}
                onChange={(v) => set("guardian_phone", v)}
              />
            </>
          )}
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={values.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pt-7 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.is_minor}
              onChange={(e) => set("is_minor", e.target.checked)}
              className="h-4 w-4 accent-primary"
            />{" "}
            Minor
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={() => onSave(values)}
            disabled={saving || !values.full_name.trim() || !values.admission_number.trim()}
          >
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Save className="h-4 w-4" /> Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
function Info({ label, value }: { label: string; value: string | null | boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
function AllocationDetails({ allocation }: { allocation: any }) {
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
    <div className="space-y-1">
      <p className="font-medium text-foreground">
        {location || "Accommodation details unavailable"}
      </p>
      <p className="text-xs text-muted-foreground">
        {allocation.start_date} →{" "}
        {allocation.actual_end_date ?? allocation.expected_end_date ?? "Current"}
      </p>
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
  allocation: any;
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
function toFormValues(
  student: Record<string, any>,
  guardian: { full_name: string; phone: string } | null,
): StudentFormValues {
  return {
    full_name: student.full_name ?? "",
    admission_number: student.admission_number ?? "",
    phone: student.phone ?? "",
    email: student.email ?? "",
    date_of_birth: student.date_of_birth ?? "",
    gender: student.gender ?? "",
    academic_institute: student.academic_institute ?? "",
    course_name: student.course_name ?? "",
    academic_year: student.academic_year ?? "",
    joined_at: student.joined_at ?? "",
    status: STATUSES.includes(student.status) ? student.status : "APPLICANT",
    is_minor: student.is_minor ?? false,
    guardian_name: guardian?.full_name ?? "",
    guardian_phone: guardian?.phone ?? "",
  };
}
function emptyToNull(value: string) {
  return value.trim() || null;
}
