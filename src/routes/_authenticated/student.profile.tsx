import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Clock, Loader2, Save, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycUploadForm } from "@/components/students/KycUploadForm";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/student/profile")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: StudentProfilePage,
});

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
        .select("id, tenant_id, property_id, admission_number, status, full_name, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year")
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

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [institute, setInstitute] = useState("");
  const [course, setCourse] = useState("");
  const [academicYear, setAcademicYear] = useState("");

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

  const save = useMutation({
    mutationFn: async () => {
      if (!studentQ.data?.id) throw new Error("No profile to update");
      const { error } = await supabase
        .from("students")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          date_of_birth: dob || null,
          gender: gender || null,
          academic_institute: institute.trim() || null,
          course_name: course.trim() || null,
          academic_year: academicYear.trim() || null,
        })
        .eq("id", studentQ.data.id);
      if (error) throw error;
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
        <PageHeader title="My Profile" />
        <p className="text-sm text-muted-foreground">
          No student record is linked to your account yet.
        </p>
      </div>
    );
  }

  const s = studentQ.data;

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="My Profile"
        description={`Admission #${s.admission_number}`}
        actions={<StudentStatusBadge status={s.status} />}
      />

      <Card className="gap-3 py-4">
        <CardHeader className="flex-row items-center justify-between px-4">
          <CardTitle className="text-sm">KYC documents</CardTitle>
          <KycOverallBadge docs={docsQ.data ?? []} />
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <KycUploadForm
            tenantId={s.tenant_id}
            propertyId={s.property_id}
            studentId={s.id}
            onUploaded={() => docsQ.refetch()}
          />
          {(docsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents uploaded yet — upload at least one to unlock fees, gate pass, mess and complaints.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(docsQ.data ?? []).map((d) => (
                <li key={d.id} className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{d.document_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.original_filename} •{" "}
                      {d.verification_status === "PENDING"
                        ? "Uploaded, awaiting warden review"
                        : d.verification_status === "VERIFIED"
                          ? "Verified"
                          : "Rejected"}
                    </span>
                  </div>
                  {d.verification_status === "REJECTED" && d.rejection_reason && (
                    <p className="text-xs text-destructive">Reason: {d.rejection_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4"><CardTitle className="text-sm">Your details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-3 gap-y-2 px-4">
          <div className="space-y-1">
            <Label htmlFor="p-name" className="text-xs">Full name</Label>
            <Input id="p-name" className="h-9" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-phone" className="text-xs">Phone</Label>
            <Input id="p-phone" className="h-9" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-email" className="text-xs">Email</Label>
            <Input id="p-email" className="h-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-dob" className="text-xs">Date of birth</Label>
            <Input id="p-dob" className="h-9" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-gender" className="text-xs">Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="p-gender" className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-institute" className="text-xs">Institute</Label>
            <Input id="p-institute" className="h-9" value={institute} onChange={(e) => setInstitute(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-course" className="text-xs">Course</Label>
            <Input id="p-course" className="h-9" value={course} onChange={(e) => setCourse(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-year" className="text-xs">Academic year</Label>
            <Input id="p-year" className="h-9" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button className="min-h-10 w-full sm:w-auto" disabled={save.isPending || !fullName.trim()} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
