import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema, type ResetPasswordInput } from "@/schemas/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Hostylia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type SessionState = "checking" | "ready" | "expired" | "updated";

/**
 * Landed on after clicking the password-reset link emailed by
 * resetPasswordForEmail. Supabase auto-detects the recovery tokens in the
 * URL fragment (detectSessionInUrl) and fires PASSWORD_RECOVERY — same
 * pattern as /verify-email, just gating a form instead of a status message.
 */
function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<SessionState>("checking");
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setState(data.session ? "ready" : "expired");
    }

    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) setState("ready");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (values: ResetPasswordInput) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        toast.error(error.message);
        return;
      }
      setState("updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update password. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "checking") {
    return (
      <AuthLayout title="Just a moment…">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (state === "expired") {
    return (
      <AuthLayout title="Link expired">
        <div className="animate-rise space-y-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
            <XCircle className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground">
            This reset link has expired or was already used. Request a fresh one.
          </p>
          <Button asChild className="min-h-11 w-full">
            <Link to="/forgot-password">{t("auth.forgotPasswordLink")}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (state === "updated") {
    return (
      <AuthLayout title="Password updated">
        <div className="animate-rise space-y-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground">
            Your password has been updated. Sign in with your new password.
          </p>
          <Button className="min-h-11 w-full" onClick={() => navigate({ to: "/login" })}>
            {t("auth.goToSignIn")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.resetPasswordTitle")} subtitle={t("auth.resetPasswordSubtitle")}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.newPasswordLabel")}</Label>
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
            <p className="text-sm text-destructive" role="alert">{errors.password.message}</p>
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
            <p className="text-sm text-destructive" role="alert">{errors.confirmPassword.message}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={submitting} className="min-h-11 w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {t("auth.updatePassword")}
        </Button>
      </form>
    </AuthLayout>
  );
}
