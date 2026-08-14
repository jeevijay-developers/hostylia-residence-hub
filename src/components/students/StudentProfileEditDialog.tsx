import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { studentStaffProfileEditSchema } from "@/schemas/student";
import { updateStudentProfile } from "@/lib/student.functions";
import { getErrorMessage } from "@/lib/utils";
import { displayIndianPhone } from "@/schemas/auth";
import { fetchStudentGuardians, type StudentGuardianRow } from "@/components/students/GuardianCard";
import { GuardianDetailsEditDialog } from "@/components/students/GuardianDetailsEditDialog";

export interface StudentProfileEditableFields {
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  academic_institute: string | null;
  course_name: string | null;
  academic_year: string | null;
}

interface StudentProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  student: StudentProfileEditableFields;
}

export function StudentProfileEditDialog({
  open,
  onOpenChange,
  studentId,
  student,
}: StudentProfileEditDialogProps) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateStudentProfile);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [institute, setInstitute] = useState("");
  const [course, setCourse] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingGuardian, setEditingGuardian] = useState<StudentGuardianRow | null>(null);

  const guardiansQ = useQuery({
    queryKey: ["student-guardians", studentId],
    queryFn: () => fetchStudentGuardians(studentId),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setFullName(student.full_name ?? "");
    setPhone(student.phone ?? "");
    setEmail(student.email ?? "");
    setDob(student.date_of_birth ?? "");
    setGender(student.gender ?? "");
    setInstitute(student.academic_institute ?? "");
    setCourse(student.course_name ?? "");
    setAcademicYear(student.academic_year ?? "");
    setFieldErrors({});
  }, [open, student]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = studentStaffProfileEditSchema.safeParse({
        student_id: studentId,
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        date_of_birth: dob,
        gender,
        academic_institute: institute.trim(),
        course_name: course.trim(),
        academic_year: academicYear.trim(),
      });
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (typeof key === "string" && !errs[key]) errs[key] = issue.message;
        }
        setFieldErrors(errs);
        throw new Error("Please fix the highlighted fields");
      }
      setFieldErrors({});
      return updateFn({ data: parsed.data });
    },
    onSuccess: () => {
      toast.success("Student profile updated");
      qc.invalidateQueries({ queryKey: ["student", studentId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "Please fix the highlighted fields") return;
      toast.error(getErrorMessage(e, "Could not update student profile"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit student profile</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sp-name">Full name</Label>
            <Input id="sp-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            {fieldErrors.full_name && (
              <p className="text-xs text-destructive">{fieldErrors.full_name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-phone">Phone</Label>
            <Input
              id="sp-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
            {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-email">Email</Label>
            <Input
              id="sp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-dob">Date of birth</Label>
            <Input
              id="sp-dob"
              type="date"
              value={dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDob(e.target.value)}
            />
            {fieldErrors.date_of_birth && (
              <p className="text-xs text-destructive">{fieldErrors.date_of_birth}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-gender">Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="sp-gender">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-institute">Institute</Label>
            <Input
              id="sp-institute"
              value={institute}
              onChange={(e) => setInstitute(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-course">Course</Label>
            <Input id="sp-course" value={course} onChange={(e) => setCourse(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-year">Academic year</Label>
            <Input
              id="sp-year"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </div>
        </div>

        {(guardiansQ.data ?? []).length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label>Guardian / Parent</Label>
            {(guardiansQ.data ?? []).map((row) => {
              const addressLine = [
                row.guardian?.address?.line1,
                row.guardian?.address?.city,
                row.guardian?.address?.state,
                row.guardian?.address?.pincode,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <div
                  key={row.guardian_id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.guardian?.full_name ?? "—"}
                      </p>
                      {row.is_primary && <Badge variant="outline">Primary</Badge>}
                    </div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {row.relationship ?? "Guardian"} ·{" "}
                      {row.guardian?.phone ? displayIndianPhone(row.guardian.phone) : "no phone"}
                    </p>
                    {row.guardian?.email && (
                      <p className="text-xs text-muted-foreground">{row.guardian.email}</p>
                    )}
                    {row.guardian?.occupation && (
                      <p className="text-xs text-muted-foreground">{row.guardian.occupation}</p>
                    )}
                    {addressLine && (
                      <p className="text-xs text-muted-foreground">{addressLine}</p>
                    )}
                  </div>
                  {row.guardian && (
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      title="Edit guardian details"
                      aria-label="Edit guardian details"
                      onClick={() => setEditingGuardian(row)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending || fullName.trim() === ""}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {editingGuardian && editingGuardian.guardian && (
        <GuardianDetailsEditDialog
          open
          onOpenChange={(open) => !open && setEditingGuardian(null)}
          studentId={studentId}
          guardian={editingGuardian.guardian}
        />
      )}
    </Dialog>
  );
}
