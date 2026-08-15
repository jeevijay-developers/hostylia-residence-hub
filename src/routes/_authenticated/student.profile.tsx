import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Clock, Loader2, Save, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycUploadForm } from "@/components/students/KycUploadForm";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { updateMyProfile } from "@/lib/student.functions";
import { studentSelfProfileSchema } from "@/schemas/student";

export const Route = createFileRoute("/_authenticated/student/profile")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: StudentProfilePage,
});

const OPEN_ALLOCATION_STATUSES = [
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
];

function StudentProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();

  const studentQ = useQuery({
    queryKey: ["my-profile-record", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, tenant_id, property_id, admission_number, status, full_name, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year",
        )
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const docsQ = useQuery({
    queryKey: ["student-docs", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, verification_status, rejection_reason")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentQ.data!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const allocQ = useQuery({
    queryKey: ["my-current-allocation", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))",
        )
        .eq("student_id", studentQ.data!.id)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [institute, setInstitute] = useState("");
  const [course, setCourse] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [kycDialogOpen, setKycDialogOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!studentQ.data) return;
    setFullName(studentQ.data.full_name ?? "");
    setPhone(studentQ.data.phone ?? "");
    setEmail(studentQ.data.email ?? "");
    setDob(studentQ.data.date_of_birth ?? "");
    setGender(studentQ.data.gender ?? "");
    setInstitute(studentQ.data.academic_institute ?? "");
    setCourse(studentQ.data.course_name ?? "");
    setAcademicYear(studentQ.data.academic_year ?? "");
  }, [studentQ.data]);

  const updateProfileFn = useServerFn(updateMyProfile);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = studentSelfProfileSchema.safeParse({
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
      return updateProfileFn({ data: parsed.data });
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile-record", userId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update profile"),
  });

  if (studentQ.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!studentQ.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="" />
        <p className="text-sm text-muted-foreground">
          No student record is linked to your account yet.
        </p>
      </div>
    );
  }

  const s = studentQ.data;
  const docs = docsQ.data ?? [];
  // Mirrors KycUploadForm's own lock condition, so the collapsed summary and
  // the form agree on when KYC counts as "done".
  const kycSubmitted = docs.some(
    (d) => d.verification_status === "PENDING" || d.verification_status === "VERIFIED",
  );
  const kycRejected = !kycSubmitted && docs.some((d) => d.verification_status === "REJECTED");

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
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title=""
        description={`Admission #${s.admission_number}`}
        actions={<StudentStatusBadge status={s.status} />}
      />

      <Card className="gap-3 py-4">
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-2 px-4 pt-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="p-name" className="text-xs">
              Full name
            </Label>
            <Input
              id="p-name"
              className="h-9"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {fieldErrors.full_name && (
              <p className="text-xs text-destructive">{fieldErrors.full_name}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="p-phone"
              className="h-9"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
            />
            {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-email" className="text-xs">
              Email
            </Label>
            <Input
              id="p-email"
              className="h-9"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-dob" className="text-xs">
              Date of birth
            </Label>
            <Input
              id="p-dob"
              className="h-9"
              type="date"
              value={dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDob(e.target.value)}
            />
            {fieldErrors.date_of_birth && (
              <p className="text-xs text-destructive">{fieldErrors.date_of_birth}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-gender" className="text-xs">
              Gender
            </Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="p-gender" className="h-9">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-institute" className="text-xs">
              Institute
            </Label>
            <Input
              id="p-institute"
              className="h-9"
              value={institute}
              onChange={(e) => setInstitute(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="p-course" className="text-xs">
              Course
            </Label>
            <Input
              id="p-course"
              className="h-9"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-year" className="text-xs">
              Academic year
            </Label>
            <Input
              id="p-year"
              className="h-9"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">KYC documents</Label>
            <button
              type="button"
              onClick={() => setKycDialogOpen(true)}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <span>{kycSubmitted ? "Submitted" : "Tap to complete"}</span>
              <KycOverallBadge docs={docs} />
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Room / bed assigned</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
              {stayText}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={kycDialogOpen} onOpenChange={setKycDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>KYC documents</DialogTitle>
          </DialogHeader>
          {kycRejected && (
            <p className="text-xs text-destructive">
              Your last submission was rejected — please upload again.
            </p>
          )}
          <KycUploadForm
            tenantId={s.tenant_id}
            propertyId={s.property_id}
            studentId={s.id}
            existingDocs={docs}
            onUploaded={() => docsQ.refetch()}
          />
        </DialogContent>
      </Dialog>

      <Button
        className="min-h-10 w-full sm:w-auto"
        disabled={save.isPending || !fullName.trim()}
        onClick={() => save.mutate()}
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save changes
      </Button>
    </div>
  );
}

type KycDoc = { verification_status: string };

/** Mirrors the staff-side KycStatus widget's logic: complete only once the
 * warden has verified every uploaded document. */
function KycOverallBadge({ docs }: { docs: KycDoc[] }) {
  if (docs.length === 0) return null;
  const hasRejected = docs.some((d) => d.verification_status === "REJECTED");
  const allVerified = docs.every((d) => d.verification_status === "VERIFIED");

  if (hasRejected) {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" /> Rejected
      </span>
    );
  }
  if (allVerified) {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
        <ShieldCheck className="h-3.5 w-3.5" /> Complete
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
      <Clock className="h-3.5 w-3.5" /> Awaiting warden review
    </span>
  );
}
