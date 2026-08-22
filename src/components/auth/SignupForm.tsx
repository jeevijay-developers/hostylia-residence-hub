import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  GraduationCap,
  Loader2,
  LogIn,
  MailCheck,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  signupIdentitySchema,
  emailCredentialsSchema,
  phoneCredentialsSchema,
  indianMobileSchema,
  normalizeIndianPhone,
  sanitizePhoneKeystroke,
  type SignupRole,
  type SignupIdentityInput,
  type EmailCredentialsInput,
  type PhoneCredentialsInput,
} from "@/schemas/auth";
import { supabase } from "@/integrations/supabase/client";
import { sendPhoneOtp } from "@/lib/auth-otp.functions";
import { listPublicActiveProperties } from "@/lib/public-property.functions";
import { submitPublicAdmission } from "@/lib/student.functions";

type Mode = "phone" | "email";
type Step = 0 | 1 | 2 | 3;
type IdentityValues = {
  fullName: string;
  hostelName?: string;
  guardianName?: string;
  guardianPhone?: string;
  propertySlug?: string;
};

/**
 * Three-step signup wizard (+ a confirmation step), rather than one long
 * form: pick who you are → tell us about you → create credentials.
 *
 * The role picked in step 1 is what makes the rest of the flow work —
 * it's stored as `signup_role` user metadata, and a HOSTEL_ADMIN also
 * carries `hostel_name`, which `RoleRedirect` uses on first sign-in to
 * provision the tenant and drop them straight on /admin/dashboard.
 */
export function SignupForm({ defaultMode = "email" as Mode }: { defaultMode?: Mode }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  // Drives the directional slide — forward steps enter from the right,
  // going back enters from the left.
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [role, setRole] = useState<SignupRole | null>(null);
  const [identity, setIdentity] = useState<IdentityValues | null>(null);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  const go = (next: Step, dir: "next" | "prev" = "next") => {
    setDirection(dir);
    setStep(next);
  };

  const anim = direction === "next" ? "animate-step-next" : "animate-step-prev";

  return (
    <div className="space-y-6">
      {step < 3 ? <StepIndicator current={step} /> : null}

      {/* `key` forces React to remount on step change so the CSS entry
          animation replays each time. */}
      <div key={step} className={anim}>
        {step === 0 ? (
          <RoleStep
            value={role}
            onSelect={(r) => {
              setRole(r);
              go(1, "next");
            }}
          />
        ) : null}

        {step === 1 && role ? (
          <IdentityStep
            role={role}
            initial={identity}
            onBack={() => go(0, "prev")}
            onNext={(values) => {
              setIdentity(values);
              go(2, "next");
            }}
          />
        ) : null}

        {step === 2 && role && identity ? (
          <CredentialsStep
            role={role}
            identity={identity}
            defaultMode={defaultMode}
            onBack={() => go(1, "prev")}
            onEmailSignedUp={(email) => {
              setSignedUpEmail(email);
              go(3, "next");
            }}
          />
        ) : null}

        {step === 3 && signedUpEmail ? <CheckInboxStep email={signedUpEmail} /> : null}
      </div>

      {step < 3 ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            {t("auth.signIn")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StepIndicator({ current }: { current: Step }) {
  const { t } = useTranslation();
  const labels = [t("auth.stepRole"), t("auth.stepAbout"), t("auth.stepCredentials")];

  return (
    <div className="flex items-center gap-2" aria-hidden>
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <div
              className={cn(
                "h-1 rounded-full transition-colors duration-300",
                done || active ? "bg-primary" : "bg-border",
              )}
            />
            <span
              className={cn(
                "text-[11px] font-medium transition-colors duration-300",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ROLE_OPTIONS = [
  {
    value: "HOSTEL_ADMIN" as const,
    icon: Building2,
    titleKey: "auth.roleOwnerTitle",
    descKey: "auth.roleOwnerDesc",
  },
  {
    value: "STUDENT" as const,
    icon: GraduationCap,
    titleKey: "auth.roleStudentTitle",
    descKey: "auth.roleStudentDesc",
  },
];

function RoleStep({
  value,
  onSelect,
}: {
  value: SignupRole | null;
  onSelect: (role: SignupRole) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("auth.rolePrompt")}</p>
      <div className="grid gap-3" role="radiogroup" aria-label={t("auth.rolePrompt")}>
        {ROLE_OPTIONS.map((option, i) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option.value)}
              style={{ animationDelay: `${i * 70}ms` }}
              className={cn(
                "animate-rise group flex items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200",
                "hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected ? "border-primary bg-primary/5" : "border-border bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary group-hover:bg-primary/20",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{t(option.titleKey)}</span>
                  {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {t(option.descKey)}
                </span>
              </span>
              <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IdentityStep({
  role,
  initial,
  onBack,
  onNext,
}: {
  role: SignupRole;
  initial: IdentityValues | null;
  onBack: () => void;
  onNext: (values: IdentityValues) => void;
}) {
  const { t } = useTranslation();
  const isOwner = role === "HOSTEL_ADMIN";
  const isStudent = role === "STUDENT";
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupIdentityInput>({
    resolver: zodResolver(signupIdentitySchema),
    defaultValues: {
      role,
      fullName: initial?.fullName ?? "",
      hostelName: initial?.hostelName ?? "",
      guardianName: initial?.guardianName ?? "",
      guardianPhone: initial?.guardianPhone ?? "",
      propertySlug: initial?.propertySlug ?? "",
    },
    mode: "onChange",
  });
  const guardianPhoneField = register("guardianPhone");
  const guardianPhoneValid =
    !isStudent || indianMobileSchema.safeParse(watch("guardianPhone")).success;
  const propertySlugValue = watch("propertySlug");

  // Active hostels a self-registering student can pick from — same
  // property-selection surface the public /apply/$slug admission form uses,
  // just listing every ACTIVE property instead of resolving one by slug.
  const listPropertiesFn = useServerFn(listPublicActiveProperties);
  const propertiesQ = useQuery({
    queryKey: ["signup-active-properties"],
    queryFn: () => listPropertiesFn(),
    enabled: isStudent,
    staleTime: 60_000,
  });

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onNext({
          fullName: values.fullName,
          hostelName: values.hostelName,
          guardianName: values.guardianName,
          guardianPhone: values.guardianPhone,
          propertySlug: values.propertySlug,
        }),
      )}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" value={role} {...register("role")} />

      <div className="space-y-2">
        <Label htmlFor="fullName">{t("auth.fullNameLabel")}</Label>
        <Input
          id="fullName"
          type="text"
          autoComplete="name"
          autoFocus
          placeholder="Rahul Sharma"
          className="min-h-11"
          aria-invalid={errors.fullName ? "true" : undefined}
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      {isOwner ? (
        <div className="space-y-2">
          <Label htmlFor="hostelName">{t("auth.hostelNameLabel")}</Label>
          <Input
            id="hostelName"
            type="text"
            autoComplete="organization"
            placeholder="e.g. Sunrise Hostels"
            className="min-h-11"
            aria-invalid={errors.hostelName ? "true" : undefined}
            {...register("hostelName")}
          />
          {errors.hostelName ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.hostelName.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("auth.hostelNameHelp")}</p>
          )}
        </div>
      ) : null}

      {isStudent ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="guardianName">{t("auth.guardianNameLabel")}</Label>
            <Input
              id="guardianName"
              type="text"
              autoComplete="off"
              placeholder="Parent/guardian's name"
              className="min-h-11"
              aria-invalid={errors.guardianName ? "true" : undefined}
              {...register("guardianName")}
            />
            {errors.guardianName ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.guardianName.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianPhone">{t("auth.guardianPhoneLabel")}</Label>
            <Input
              id="guardianPhone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              className="min-h-11"
              aria-invalid={errors.guardianPhone ? "true" : undefined}
              {...guardianPhoneField}
              onChange={(e) => {
                e.target.value = sanitizePhoneKeystroke(e.target.value);
                guardianPhoneField.onChange(e);
              }}
            />
            {errors.guardianPhone ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.guardianPhone.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="propertySlug">{t("auth.selectHostelLabel")}</Label>
            <input type="hidden" {...register("propertySlug")} />
            <Select
              value={propertySlugValue || undefined}
              onValueChange={(v) => setValue("propertySlug", v, { shouldValidate: true })}
            >
              <SelectTrigger id="propertySlug" className="min-h-11">
                <SelectValue
                  placeholder={
                    propertiesQ.isLoading
                      ? t("common.loading")
                      : t("auth.selectHostelPlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(propertiesQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.slug}>
                    {p.name}
                    {p.city ? ` — ${p.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.propertySlug ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.propertySlug.message}
              </p>
            ) : null}
          </div>
          <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {t("auth.studentJoinNote")}
          </p>
        </>
      ) : null}

      <StepButtons
        onBack={onBack}
        nextLabel={t("auth.continue")}
        disabled={!guardianPhoneValid || (isStudent && !propertySlugValue)}
      />
    </form>
  );
}

function CredentialsStep({
  role,
  identity,
  defaultMode,
  onBack,
  onEmailSignedUp,
}: {
  role: SignupRole;
  identity: IdentityValues;
  defaultMode: Mode;
  onBack: () => void;
  onEmailSignedUp: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(defaultMode);

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="email" className="min-h-11">
            {t("auth.tabEmail")}
          </TabsTrigger>
          <TabsTrigger value="phone" className="min-h-11">
            {t("auth.tabPhone")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email" className="mt-5">
          <EmailCredentialsForm
            role={role}
            identity={identity}
            onBack={onBack}
            onSignedUp={onEmailSignedUp}
          />
        </TabsContent>
        <TabsContent value="phone" className="mt-5">
          <PhoneCredentialsForm role={role} identity={identity} onBack={onBack} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Metadata written onto the auth user — read later by RoleRedirect, and by
 * confirmStudentAdmission to create the guardian record once an admin links
 * this account to an admission.
 */
function signupMetadata(role: SignupRole, identity: IdentityValues) {
  return {
    full_name: identity.fullName,
    signup_role: role,
    ...(role === "HOSTEL_ADMIN" && identity.hostelName ? { hostel_name: identity.hostelName } : {}),
    ...(role === "STUDENT" && identity.guardianName && identity.guardianPhone
      ? { guardian_name: identity.guardianName, guardian_phone: identity.guardianPhone }
      : {}),
    ...(role === "STUDENT" && identity.propertySlug ? { property_slug: identity.propertySlug } : {}),
  };
}

/**
 * Submits the student's chosen hostel as a real admission application —
 * reuses `submitPublicAdmission`/`publicAdmissionSchema`, the exact same
 * API the public /apply/$slug form uses, so it lands in that hostel's
 * existing Admin/Warden approval workflow (admin.students, APPLICANT
 * status) instead of a signup that no one can ever confirm.
 *
 * `phone` is the applicant's own contact — email-mode signup never collects
 * one, so it falls back to the guardian's number already captured in step 1
 * (email is still the primary match key `confirmStudentAdmission` uses, so
 * this fallback never affects account linking for email signups).
 */
async function submitStudentApplication(
  submitFn: ReturnType<typeof useServerFn<typeof submitPublicAdmission>>,
  identity: IdentityValues,
  contact: { email?: string; phone?: string },
) {
  if (!identity.propertySlug || !identity.guardianName || !identity.guardianPhone) return;
  try {
    await submitFn({
      data: {
        property_slug: identity.propertySlug,
        full_name: identity.fullName,
        phone: normalizeIndianPhone(contact.phone ?? identity.guardianPhone),
        email: contact.email ?? "",
        guardian_name: identity.guardianName,
        guardian_phone: identity.guardianPhone,
        guardian_relationship: "Guardian",
      },
    });
  } catch (e) {
    // Account creation must never fail because the admission application
    // couldn't be filed — same fire-and-forget stance as the staff invite
    // notification path.
    console.warn("submitStudentApplication failed (account was still created)", e);
  }
}

function EmailCredentialsForm({
  role,
  identity,
  onBack,
  onSignedUp,
}: {
  role: SignupRole;
  identity: IdentityValues;
  onBack: () => void;
  onSignedUp: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submitApplicationFn = useServerFn(submitPublicAdmission);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailCredentialsInput>({
    resolver: zodResolver(emailCredentialsSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const onSubmit = async (values: EmailCredentialsInput) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: signupMetadata(role, identity),
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      // Supabase returns a "success" response for an already-registered,
      // confirmed email without sending a new confirmation mail (anti
      // enumeration) — the only client-visible tell is an empty
      // `identities` array, so surface that as an explicit error instead of
      // showing the misleading "check your inbox" step.
      if (data.user && data.user.identities?.length === 0) {
        toast.error("This email is already registered. Please sign in instead.");
        return;
      }
      if (role === "STUDENT") {
        await submitStudentApplication(submitApplicationFn, identity, { email: values.email });
      }
      onSignedUp(values.email);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-up failed. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.emailLabel")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@hostel.com"
          className="min-h-11"
          aria-invalid={errors.email ? "true" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          className="min-h-11"
          showLabel={t("auth.showPassword")}
          hideLabel={t("auth.hidePassword")}
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.password.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("auth.confirmPasswordLabel")}</Label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          className="min-h-11"
          showLabel={t("auth.showPassword")}
          hideLabel={t("auth.hidePassword")}
          aria-invalid={errors.confirmPassword ? "true" : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>
      <StepButtons onBack={onBack} nextLabel={t("auth.createAccount")} submitting={submitting} />
    </form>
  );
}

function PhoneCredentialsForm({
  role,
  identity,
  onBack,
}: {
  role: SignupRole;
  identity: IdentityValues;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const submitApplicationFn = useServerFn(submitPublicAdmission);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PhoneCredentialsInput>({
    resolver: zodResolver(phoneCredentialsSchema),
    defaultValues: { phone: "" },
    mode: "onChange",
  });
  const phoneField = register("phone");
  const phoneValid = indianMobileSchema.safeParse(watch("phone")).success;

  const onSubmit = async (values: PhoneCredentialsInput) => {
    setSubmitting(true);
    try {
      const phone = normalizeIndianPhone(values.phone);
      const result = await sendPhoneOtp({
        data: { phone, intent: "signup", metadata: signupMetadata(role, identity) },
      });
      if (!result.ok) {
        toast.error(result.message ?? "Could not send OTP. Please try again.");
        return;
      }
      if (role === "STUDENT") {
        await submitStudentApplication(submitApplicationFn, identity, { phone });
      }
      navigate({ to: "/verify-otp", search: { phone } });
    } catch (err) {
      console.error("sendPhoneOtp (signup) failed:", err);
      const message =
        err instanceof Error && err.message ? err.message : "Could not send OTP. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="phone">{t("auth.phoneLabel")}</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          className="min-h-11"
          aria-invalid={errors.phone ? "true" : undefined}
          {...phoneField}
          onChange={(e) => {
            e.target.value = sanitizePhoneKeystroke(e.target.value);
            phoneField.onChange(e);
          }}
        />
        {errors.phone ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.phone.message}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("auth.phoneHelp")}</p>
        )}
      </div>
      <StepButtons
        onBack={onBack}
        nextLabel={t("auth.sendCode")}
        submitting={submitting}
        disabled={!phoneValid}
      />
    </form>
  );
}

function StepButtons({
  onBack,
  nextLabel,
  submitting,
  disabled,
}: {
  onBack: () => void;
  nextLabel: string;
  submitting?: boolean;
  /** Blocks only the forward/submit button — e.g. current step has an invalid field. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        disabled={submitting}
        className="min-h-11 shrink-0 px-3"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">{t("common.back")}</span>
      </Button>
      <Button type="submit" disabled={submitting || disabled} className="min-h-11 flex-1">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {nextLabel}
        {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
      </Button>
    </div>
  );
}

function CheckInboxStep({ email }: { email: string }) {
  const { t } = useTranslation();
  return (
    <div className="animate-rise space-y-5 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
        <MailCheck className="h-7 w-7" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {t("auth.checkInboxTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("auth.checkInboxBody")} <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{t("auth.checkInboxHint")}</p>
      <Button asChild variant="outline" className="min-h-11 w-full">
        <Link to="/login">
          <LogIn className="h-4 w-4" /> {t("auth.goToSignIn")}
        </Link>
      </Button>
    </div>
  );
}
