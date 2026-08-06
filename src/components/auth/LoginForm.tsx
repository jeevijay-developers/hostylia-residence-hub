import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LogIn, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  emailLoginSchema,
  phoneLoginSchema,
  normalizeIndianPhone,
  type EmailLoginInput,
  type PhoneLoginInput,
} from "@/schemas/auth";
import { supabase } from "@/integrations/supabase/client";
import { sendPhoneOtp } from "@/lib/auth-otp.functions";

type Mode = "phone" | "email";

export function LoginForm({ defaultMode = "phone" as Mode }: { defaultMode?: Mode }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(defaultMode);

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="phone" className="min-h-11">{t("auth.tabPhone")}</TabsTrigger>
          <TabsTrigger value="email" className="min-h-11">{t("auth.tabEmail")}</TabsTrigger>
        </TabsList>
        <TabsContent value="phone" className="mt-6">
          <PhoneForm />
        </TabsContent>
        <TabsContent value="email" className="mt-6">
          <EmailForm />
        </TabsContent>
      </Tabs>

      <p className="text-center text-sm text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
          {t("auth.signUpLink")}
        </Link>
      </p>
    </div>
  );
}

function PhoneForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneLoginInput>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: { phone: "" },
  });

  const onSubmit = async (values: PhoneLoginInput) => {
    setSubmitting(true);
    try {
      const phone = normalizeIndianPhone(values.phone);
      const result = await sendPhoneOtp({ data: { phone } });
      if (!result.ok) {
        toast.error(result.message ?? "Could not send OTP. Please try again.");
        return;
      }
      navigate({ to: "/verify-otp", search: { phone } });
    } catch (err) {
      // Truly unexpected failures (network, etc.) still land here — server-fn
      // errors don't always round-trip as a plain Error with a populated
      // `.message` (TanStack Start's serializer can drop it), so log the raw
      // value too instead of just showing a blank/"{}" toast.
      console.error("sendPhoneOtp failed:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not send OTP. Please try again.";
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
          {...register("phone")}
        />
        {errors.phone ? (
          <p className="text-sm text-destructive" role="alert">{errors.phone.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("auth.phoneHelp")}</p>
        )}
      </div>
      <Button type="submit" disabled={submitting} className="min-h-11 w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {t("auth.sendCode")}
      </Button>
    </form>
  );
}

function EmailForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailLoginInput>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: EmailLoginInput) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      try {
        const { activateMyInvites } = await import("@/lib/admin-staff.functions");
        await activateMyInvites();
      } catch (e) {
        console.warn("invite activation failed", e);
      }
      navigate({ to: "/post-login" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
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
          <p className="text-sm text-destructive" role="alert">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          className="min-h-11"
          showLabel={t("auth.showPassword")}
          hideLabel={t("auth.hidePassword")}
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-sm text-destructive" role="alert">{errors.password.message}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={submitting} className="min-h-11 w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {t("auth.signIn")}
      </Button>
      <Button asChild type="button" variant="ghost" className="min-h-11 w-full">
        <Link to="/forgot-password">{t("auth.forgotPasswordLink")}</Link>
      </Button>
    </form>
  );
}
