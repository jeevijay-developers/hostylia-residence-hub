import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  Building2,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Save,
  Shield,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";

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
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
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
  const [signOutOpen, setSignOutOpen] = useState(false);
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
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
          Admission #{s.admission_number}
        </h1>
        <StudentStatusBadge status={s.status} />
      </div>

      <Card className="gap-3 border-primary/30 py-4">
        <CardContent className="space-y-5 px-4 pt-4">
          <SectionHeading icon={User} title="Personal Information" tone="info" />
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <IconField icon={User} label="Full name" htmlFor="p-name" error={fieldErrors.full_name}>
              <Input
                id="p-name"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </IconField>
            <IconField icon={Phone} label="Phone" htmlFor="p-phone" trailingIcon={Phone} error={fieldErrors.phone}>
              <Input
                id="p-phone"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
              />
            </IconField>
            <IconField icon={Mail} label="Email" htmlFor="p-email" trailingIcon={Mail} error={fieldErrors.email}>
              <Input
                id="p-email"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </IconField>
            <IconField
              icon={CalendarDays}
              label="Date of birth"
              htmlFor="p-dob"
              trailingIcon={CalendarDays}
              error={fieldErrors.date_of_birth}
            >
              <Input
                id="p-dob"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                type="date"
                value={dob}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDob(e.target.value)}
              />
            </IconField>
            <IconField icon={User} label="Gender" htmlFor="p-gender">
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger
                  id="p-gender"
                  className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus:ring-0"
                >
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </IconField>
          </div>

          <div className="border-t border-border" />

          <SectionHeading icon={GraduationCap} title="Academic Information" tone="primary" />
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-3">
            <IconField icon={Building2} label="Institute" htmlFor="p-institute" trailingIcon={Building2}>
              <Input
                id="p-institute"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                value={institute}
                onChange={(e) => setInstitute(e.target.value)}
              />
            </IconField>
            <IconField icon={BookOpen} label="Course" htmlFor="p-course" trailingIcon={BookOpen}>
              <Input
                id="p-course"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
              />
            </IconField>
            <IconField icon={CalendarDays} label="Academic year" htmlFor="p-year" trailingIcon={CalendarDays}>
              <Input
                id="p-year"
                className="h-auto border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="—"
              />
            </IconField>
          </div>

          <div className="border-t border-border" />

          <SectionHeading icon={Shield} title="KYC & Accommodation" tone="success" />
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <button type="button" onClick={() => setKycDialogOpen(true)} className="w-full text-left">
              <IconField icon={FileText} label="KYC documents" trailingSlot={<KycOverallBadge docs={docs} />}>
                <span className="text-base text-foreground">
                  {kycSubmitted ? "Submitted" : "Tap to complete"}
                </span>
              </IconField>
            </button>
            <IconField icon={BedDouble} label="Room / bed assigned" trailingIcon={BedDouble}>
              <span className="text-base text-foreground">{stayText}</span>
            </IconField>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button
              variant="outline"
              className="min-h-10 border-primary/40 text-primary hover:text-primary"
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
            <Button
              variant="ghost"
              className="min-h-10 text-muted-foreground hover:text-foreground"
              onClick={() => setSignOutOpen(true)}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
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

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Logout?"
        confirmLabel="Logout"
      />
    </div>
  );
}

const SECTION_TONE = {
  info: "bg-info/15 text-info",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
} as const;

function SectionHeading({
  icon: Icon,
  title,
  tone = "primary",
}: {
  icon: LucideIcon;
  title: string;
  tone?: keyof typeof SECTION_TONE;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${SECTION_TONE[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

function IconField({
  icon: Icon,
  label,
  htmlFor,
  trailingIcon: TrailingIcon,
  trailingSlot,
  error,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  trailingIcon?: LucideIcon;
  trailingSlot?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="rounded-md border border-input bg-muted/20 px-3 py-2">
        <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-info" />
          {label}
        </Label>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {TrailingIcon && <TrailingIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          {trailingSlot}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
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
