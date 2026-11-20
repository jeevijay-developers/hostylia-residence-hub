import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TurnstileWidget, useCaptchaToken } from "@/components/site/TurnstileWidget";
import { submitPublicAdmission } from "@/lib/student.functions";
import { sanitizePhoneKeystroke } from "@/schemas/auth";
import { publicAdmissionSchema, type PublicAdmissionInput } from "@/schemas/student";

interface Props {
  propertySlug: string;
  onSuccess: (admissionNumber: string) => void;
}

type FormValues = Omit<PublicAdmissionInput, "turnstileToken">;
// Every text field that can show an error, in the order they appear on the page
// (so "focus the first invalid field" lands on the topmost one).
type FieldKey =
  | "full_name"
  | "phone"
  | "email"
  | "date_of_birth"
  | "academic_institute"
  | "course_name"
  | "academic_year"
  | "guardian_name"
  | "guardian_phone"
  | "guardian_relationship";
const FIELD_ORDER: FieldKey[] = [
  "full_name",
  "phone",
  "email",
  "date_of_birth",
  "academic_institute",
  "course_name",
  "academic_year",
  "guardian_name",
  "guardian_phone",
  "guardian_relationship",
];
const FIELD_IDS: Record<FieldKey, string> = {
  full_name: "fn",
  phone: "ph",
  email: "em",
  date_of_birth: "dob",
  academic_institute: "ai",
  course_name: "cn",
  academic_year: "ay",
  guardian_name: "gn",
  guardian_phone: "gp",
  guardian_relationship: "gr",
};
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Validates one field with the SAME rule the server applies (publicAdmissionSchema). */
function validateField(key: FieldKey, value: string | undefined): string | null {
  const result = publicAdmissionSchema.shape[key].safeParse(value ?? "");
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}

/** Maps a server rejection (Zod issues as JSON, or a duplicate-student message) onto fields. */
function serverFieldErrors(message: string): FieldErrors {
  const errors: FieldErrors = {};
  try {
    const issues: unknown = JSON.parse(message);
    if (Array.isArray(issues)) {
      for (const issue of issues as { path?: unknown[]; message?: string }[]) {
        const key = issue.path?.[0];
        if (typeof key === "string" && key in FIELD_IDS && issue.message) {
          errors[key as FieldKey] ??= issue.message;
        }
      }
    }
  } catch {
    if (/phone number/i.test(message)) errors.phone = message;
    else if (/email address/i.test(message)) errors.email = message;
  }
  return errors;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function AdmissionForm({ propertySlug, onSuccess }: Props) {
  const submit = useServerFn(submitPublicAdmission);
  const captcha = useCaptchaToken();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<FormValues>({
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
    onError: (e) => {
      captcha.reset();
      const message = e instanceof Error ? e.message : "Failed to submit";
      const fieldErrors = serverFieldErrors(message);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        const first = FIELD_ORDER.find((k) => fieldErrors[k]);
        if (first) focusField(first);
        toast.error("Please correct the highlighted fields.");
        return;
      }
      toast.error(message);
    },
  });

  function focusField(key: FieldKey) {
    const el = document.getElementById(FIELD_IDS[key]);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    for (const key of FIELD_ORDER) {
      const error = validateField(key, form[key]);
      if (error) next[key] = error;
    }
    setErrors(next);
    const firstInvalid = FIELD_ORDER.find((k) => next[k]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }
    if (!captcha.token) {
      toast.error("Complete the verification check before submitting.");
      return;
    }
    const parsed = publicAdmissionSchema.safeParse({
      ...form,
      turnstileToken: captcha.token,
      origin: "apply_form",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    // parsed.data carries the normalized "+91XXXXXXXXXX" phone numbers.
    mut.mutate(parsed.data);
  }

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Props shared by every validated text field: validates as the user types and on
  // blur, shows the message under the field, and clears it the moment it is corrected.
  function field(key: FieldKey, transform: (v: string) => string = (v) => v) {
    const error = errors[key];
    return {
      id: FIELD_IDS[key],
      value: form[key] ?? "",
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${FIELD_IDS[key]}-error` : undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = transform(e.target.value);
        set(key, value);
        setErrors((prev) => ({ ...prev, [key]: validateField(key, value) ?? undefined }));
      },
      onBlur: () =>
        setErrors((prev) => ({ ...prev, [key]: validateField(key, form[key]) ?? undefined })),
    };
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Student details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fn">Full name *</Label>
            <Input {...field("full_name")} aria-required />
            <FieldError id="fn" message={errors.full_name} />
          </div>
          <div>
            <Label htmlFor="ph">Phone (+91 optional) *</Label>
            <Input
              {...field("phone", sanitizePhoneKeystroke)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="9876543210"
              aria-required
            />
            <FieldError id="ph" message={errors.phone} />
          </div>
          <div>
            <Label htmlFor="em">Email</Label>
            <Input {...field("email")} type="email" />
            <FieldError id="em" message={errors.email} />
          </div>
          <div>
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              {...field("date_of_birth")}
              type="date"
              // Chrome draws the native picker icon dark unless told otherwise, so it vanished on
              // the dark field. Pin the icon to dark (light scheme) and invert it in the dark
              // theme — fully opaque and clickable in both. Only this field is touched.
              className="[color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 dark:[&::-webkit-calendar-picker-indicator]:invert"
            />
            <FieldError id="dob" message={errors.date_of_birth} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select
              value={form.gender ?? ""}
              onValueChange={(v) => set("gender", v as PublicAdmissionInput["gender"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
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
            <Input {...field("academic_institute")} />
            <FieldError id="ai" message={errors.academic_institute} />
          </div>
          <div>
            <Label htmlFor="cn">Course</Label>
            <Input {...field("course_name")} />
            <FieldError id="cn" message={errors.course_name} />
          </div>
          <div>
            <Label htmlFor="ay">Academic year</Label>
            <Input {...field("academic_year")} placeholder="2026-27" />
            <FieldError id="ay" message={errors.academic_year} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Guardian</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="gn">Guardian name *</Label>
            <Input {...field("guardian_name")} aria-required />
            <FieldError id="gn" message={errors.guardian_name} />
          </div>
          <div>
            <Label htmlFor="gp">Guardian phone (+91 optional) *</Label>
            <Input
              {...field("guardian_phone", sanitizePhoneKeystroke)}
              inputMode="tel"
              autoComplete="off"
              placeholder="9876543210"
              aria-required
            />
            <FieldError id="gp" message={errors.guardian_phone} />
          </div>
          <div>
            <Label htmlFor="gr">Relationship *</Label>
            <Input
              {...field("guardian_relationship")}
              placeholder="Parent / Guardian / Sibling"
              aria-required
            />
            <FieldError id="gr" message={errors.guardian_relationship} />
          </div>
        </div>
      </section>

      <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
      <Button
        type="submit"
        className="min-h-11 w-full sm:w-auto"
        disabled={mut.isPending || !captcha.token}
      >
        {mut.isPending ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
