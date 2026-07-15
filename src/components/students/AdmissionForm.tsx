import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { submitPublicAdmission } from "@/lib/student.functions";
import { publicAdmissionSchema, type PublicAdmissionInput } from "@/schemas/student";

interface Props {
  propertySlug: string;
  onSuccess: (admissionNumber: string) => void;
}

export function AdmissionForm({ propertySlug, onSuccess }: Props) {
  const submit = useServerFn(submitPublicAdmission);
  const [form, setForm] = useState<PublicAdmissionInput>({
    property_slug: propertySlug,
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: undefined,
    academic_institute: "",
    course_name: "",
    academic_year: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_relationship: "",
  });

  const mut = useMutation({
    mutationFn: async (input: PublicAdmissionInput) => submit({ data: input }),
    onSuccess: (res) => {
      toast.success(`Application submitted. Reference: ${res.admission_number}`);
      onSuccess(res.admission_number);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = publicAdmissionSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    mut.mutate(parsed.data);
  }

  const set = <K extends keyof PublicAdmissionInput>(k: K, v: PublicAdmissionInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Student details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fn">Full name *</Label>
            <Input id="fn" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="ph">Phone (with +91) *</Label>
            <Input id="ph" inputMode="tel" placeholder="+919999999999" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender ?? ""} onValueChange={(v) => set("gender", v as PublicAdmissionInput["gender"])}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Academic details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ai">Institute</Label>
            <Input id="ai" value={form.academic_institute} onChange={(e) => set("academic_institute", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cn">Course</Label>
            <Input id="cn" value={form.course_name} onChange={(e) => set("course_name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ay">Academic year</Label>
            <Input id="ay" placeholder="2026-27" value={form.academic_year} onChange={(e) => set("academic_year", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Guardian</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="gn">Guardian name *</Label>
            <Input id="gn" value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="gp">Guardian phone *</Label>
            <Input id="gp" inputMode="tel" placeholder="+919999999999" value={form.guardian_phone} onChange={(e) => set("guardian_phone", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="gr">Relationship *</Label>
            <Input id="gr" placeholder="Parent / Guardian / Sibling" value={form.guardian_relationship} onChange={(e) => set("guardian_relationship", e.target.value)} required />
          </div>
        </div>
      </section>

      <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={mut.isPending}>
        {mut.isPending ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
