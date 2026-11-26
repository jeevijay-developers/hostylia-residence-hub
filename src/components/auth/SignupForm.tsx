import { useState, type ReactNode } from "react";
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
import { TurnstileWidget, useCaptchaToken } from "@/components/site/TurnstileWidget";
import { supabase } from "@/integrations/supabase/client";
import { sendPhoneOtp } from "@/lib/auth-otp.functions";
import { listPublicActiveProperties } from "@/lib/public-property.functions";
import { checkStudentAdmissionDuplicate, submitPublicAdmission } from "@/lib/student.functions";

type Mode = "phone" | "email";
/** 0 = your details (incl. role), 1 = sign-in details, 2 = check inbox (email only). */
type Step = 0 | 1 | 2;
const FORM_STEPS = 2;
type IdentityValues = {
  fullName: string;
  hostelName?: string;
  guardianName?: string;
  guardianPhone?: string;
  propertySlug?: string;
};

/**
 * Two-step signup (+ a confirmation step for email): your details, with the
 * role picked at the top, then sign-in details. Required fields carry a `*`.
 *
 * The role is what makes the rest of the flow work: it's stored as
 * `signup_role` user metadata, and a HOSTEL_ADMIN also carries `hostel_name`,
 * which `RoleRedirect` uses on first sign-in to provision the tenant and drop
 * them straight on /admin/dashboard. It is never preselected, because picking
 * the wrong one would provision a tenant for a student.
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
      {step < FORM_STEPS ? <StepHeader current={step} /> : null}

      {/* `key` forces React to remount on step change so the CSS entry
          animation replays each time. */}
      <div key={step} className={anim}>
        {step === 0 ? (
          <div className="space-y-5">
            <RolePicker
              value={role}
              onChange={(r) => {
                setRole(r);
                // Details typed for the other role don't carry over.
                if (r !== role) setIdentity(null);
              }}
            />
            {role ? (
              <IdentityStep
                key={role}
                role={role}
                initial={identity}
                onNext={(values) => {
                  setIdentity(values);
                  go(1, "next");
                }}
              />
            ) : null}
          </div>
        ) : null}

        {step === 1 && role && identity ? (
          <CredentialsStep
            role={role}
            identity={identity}
            defaultMode={defaultMode}
            onBack={() => go(0, "prev")}
            onEmailSignedUp={(email) => {
              setSignedUpEmail(email);
              go(2, "next");
            }}
          />
        ) : null}

        {step === 2 && signedUpEmail ? <CheckInboxStep email={signedUpEmail} /> : null}
      </div>

      {step < FORM_STEPS ? (
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

/** "Step 1 of 2 · Your details" with a thin progress bar and the required-field legend. */
function StepHeader({ current }: { current: Step }) {
  const { t } = useTranslation();
  const label = current === 0 ? t("auth.stepDetails") : t("auth.stepCredentials");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <p className="font-medium text-foreground">
          <span className="text-muted-foreground">
            {t("auth.stepOf", { current: current + 1, total: FORM_STEPS })} ·{" "}
          </span>
          {label}
        </p>
        <p className="text-muted-foreground">
          <span className="text-destructive" aria-hidden>
            *
          </span>{" "}
          {t("auth.requiredHint")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5" aria-hidden>
        {Array.from({ length: FORM_STEPS }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 rounded-full transition-colors duration-300",
              i <= current ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Form label with a red `*` for required fields (the `*` is hidden from screen readers; inputs carry aria-required). */
function RequiredLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor}>
      {children}
      <span className="text-destructive" aria-hidden>
        {" "}
        *
      </span>
    </Label>
  );
}

const ROLE_OPTIONS = [
  { value: "HOSTEL_ADMIN" as const, icon: Building2, labelKey: "auth.roleOwnerShort" },
  { value: "STUDENT" as const, icon: GraduationCap, labelKey: "auth.roleStudentShort" },
];

/** Compact two-option toggle; nothing is selected until the user picks. */
function RolePicker({
  value,
  onChange,
}: {
  value: SignupRole | null;
  onChange: (role: SignupRole) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <RequiredLabel>{t("auth.signupAs")}</RequiredLabel>
      <div
        role="radiogroup"
        aria-label={t("auth.signupAs")}
        aria-required="true"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {ROLE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", selected && "text-primary")} aria-hidden />
              {t(option.labelKey)}
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
  onNext,
}: {
  role: SignupRole;
  initial: IdentityValues | null;
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

  // Every currently registered hostel (ACTIVE or still-DRAFT) a
  // self-registering student can pick from — always fresh, never a
  // hardcoded/stale list; new properties appear as soon as they're created.
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
        <RequiredLabel htmlFor="fullName">{t("auth.fullNameLabel")}</RequiredLabel>
        <Input
          id="fullName"
          aria-required="true"
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
          <RequiredLabel htmlFor="hostelName">{t("auth.hostelNameLabel")}</RequiredLabel>
          <Input
            id="hostelName"
            aria-required="true"
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
            <RequiredLabel htmlFor="guardianName">{t("auth.guardianNameLabel")}</RequiredLabel>
            <Input
              id="guardianName"
              aria-required="true"
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
            <RequiredLabel htmlFor="guardianPhone">{t("auth.guardianPhoneLabel")}</RequiredLabel>
            <Input
              id="guardianPhone"
              aria-required="true"
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
            <RequiredLabel htmlFor="propertySlug">{t("auth.selectHostelLabel")}</RequiredLabel>
            <input type="hidden" {...register("propertySlug")} />
            <Select
              value={propertySlugValue || undefined}
              onValueChange={(v) => setValue("propertySlug", v, { shouldValidate: true })}
            >
              <SelectTrigger id="propertySlug" aria-required="true" className="min-h-11">
                <SelectValue
                  placeholder={
                    propertiesQ.isLoading ? t("common.loading") : t("auth.selectHostelPlaceholder")
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
            ) : (
              <p className="text-xs text-muted-foreground">{t("auth.studentJoinNote")}</p>
            )}
          </div>
        </>
      ) : null}

      <StepButtons
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
    ...(role === "STUDENT" && identity.propertySlug
      ? { property_slug: identity.propertySlug }
      : {}),
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
/**
 * Runs BEFORE the account is created: a student whose phone / email is already
 * registered is stopped here with a clear message instead of getting an account
 * and a silently-failed application. Returns the message to show, or null when
 * clear to continue. The database guard behind submitPublicAdmission remains the
 * authoritative check (this one is only for failing early and clearly).
 */
async function findDuplicateStudentMessage(
  checkFn: ReturnType<typeof useServerFn<typeof checkStudentAdmissionDuplicate>>,
  identity: IdentityValues,
  contact: { email?: string; phone?: string },
): Promise<string | null> {
  if (!identity.propertySlug) return null;
  const result = await checkFn({
    data: {
      property_slug: identity.propertySlug,
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      guardian_phone: identity.guardianPhone ?? "",
    },
  });
  return result.duplicate ? result.message : null;
}

async function submitStudentApplication(
  submitFn: ReturnType<typeof useServerFn<typeof submitPublicAdmission>>,
  identity: IdentityValues,
  contact: { email?: string; phone?: string; turnstileToken: string },
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
        turnstileToken: contact.turnstileToken,
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
  const authCaptcha = useCaptchaToken();
  const applicationCaptcha = useCaptchaToken();
  const submitApplicationFn = useServerFn(submitPublicAdmission);
  const duplicateCheckFn = useServerFn(checkStudentAdmissionDuplicate);
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
    if (!authCaptcha.token || (role === "STUDENT" && !applicationCaptcha.token)) {
      toast.error("Complete the captcha to continue.");
      return;
    }
    setSubmitting(true);
    try {
      if (role === "STUDENT") {
        const duplicate = await findDuplicateStudentMessage(duplicateCheckFn, identity, {
          email: values.email,
        });
        if (duplicate) {
          authCaptcha.reset();
          applicationCaptcha.reset();
          toast.error(duplicate);
          return;
        }
      }
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          captchaToken: authCaptcha.token,
          data: signupMetadata(role, identity),
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });
      if (error) {
        authCaptcha.reset();
        applicationCaptcha.reset();
        toast.error(error.message);
        return;
      }
      // Supabase returns a "success" response for an already-registered,
      // confirmed email without sending a new confirmation mail (anti
      // enumeration) — the only client-visible tell is an empty
      // `identities` array, so surface that as an explicit error instead of
      // showing the misleading "check your inbox" step.
      if (data.user && data.user.identities?.length === 0) {
        authCaptcha.reset();
        applicationCaptcha.reset();
        toast.error("This email is already registered. Please sign in instead.");
        return;
      }
      if (role === "STUDENT") {
        await submitStudentApplication(submitApplicationFn, identity, {
          email: values.email,
          turnstileToken: applicationCaptcha.token,
        });
      }
      onSignedUp(values.email);
    } catch (err) {
      authCaptcha.reset();
      applicationCaptcha.reset();
      const message = err instanceof Error ? err.message : "Sign-up failed. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <RequiredLabel htmlFor="email">{t("auth.emailLabel")}</RequiredLabel>
        <Input
          id="email"
          aria-required="true"
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
        <RequiredLabel htmlFor="password">{t("auth.passwordLabel")}</RequiredLabel>
        <PasswordInput
          id="password"
          aria-required="true"
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
        <RequiredLabel htmlFor="confirmPassword">{t("auth.confirmPasswordLabel")}</RequiredLabel>
        <PasswordInput
          id="confirmPassword"
          aria-required="true"
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
      <TurnstileWidget key={authCaptcha.key} onToken={authCaptcha.setToken} />
      {role === "STUDENT" ? (
        <TurnstileWidget key={applicationCaptcha.key} onToken={applicationCaptcha.setToken} />
      ) : null}
      <StepButtons
        onBack={onBack}
        nextLabel={t("auth.createAccount")}
        submitting={submitting}
        disabled={!authCaptcha.token || (role === "STUDENT" && !applicationCaptcha.token)}
      />
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
  const authCaptcha = useCaptchaToken();
  const applicationCaptcha = useCaptchaToken();
  const submitApplicationFn = useServerFn(submitPublicAdmission);
  const duplicateCheckFn = useServerFn(checkStudentAdmissionDuplicate);
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
    if (!authCaptcha.token || (role === "STUDENT" && !applicationCaptcha.token)) {
      toast.error("Complete the captcha to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const phone = normalizeIndianPhone(values.phone);
      if (role === "STUDENT") {
        const duplicate = await findDuplicateStudentMessage(duplicateCheckFn, identity, { phone });
        if (duplicate) {
          authCaptcha.reset();
          applicationCaptcha.reset();
          toast.error(duplicate);
          return;
        }
      }
      const result = await sendPhoneOtp({
        data: {
          phone,
          intent: "signup",
          metadata: signupMetadata(role, identity),
          captchaToken: authCaptcha.token,
        },
      });
      if (!result.ok) {
        authCaptcha.reset();
        applicationCaptcha.reset();
        toast.error(result.message ?? "Could not send OTP. Please try again.");
        return;
      }
      if (role === "STUDENT") {
        await submitStudentApplication(submitApplicationFn, identity, {
          phone,
          turnstileToken: applicationCaptcha.token,
        });
      }
      navigate({ to: "/verify-otp", search: { phone } });
    } catch (err) {
      authCaptcha.reset();
      applicationCaptcha.reset();
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
        <RequiredLabel htmlFor="phone">{t("auth.phoneLabel")}</RequiredLabel>
        <Input
          id="phone"
          aria-required="true"
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
      <TurnstileWidget key={authCaptcha.key} onToken={authCaptcha.setToken} />
      {role === "STUDENT" ? (
        <TurnstileWidget key={applicationCaptcha.key} onToken={applicationCaptcha.setToken} />
      ) : null}
      <StepButtons
        onBack={onBack}
        nextLabel={t("auth.sendCode")}
        submitting={submitting}
        disabled={
          !phoneValid || !authCaptcha.token || (role === "STUDENT" && !applicationCaptcha.token)
        }
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
  onBack?: () => void;
  nextLabel: string;
  submitting?: boolean;
  /** Blocks only the forward/submit button — e.g. current step has an invalid field. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 pt-1">
      {onBack ? (
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
      ) : null}
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
