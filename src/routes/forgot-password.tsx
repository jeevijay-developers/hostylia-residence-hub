import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { TurnstileWidget, useCaptchaToken } from "@/components/site/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth";
import { supabase } from "@/integrations/supabase/client";

const forgotPasswordSearchSchema = z.object({
  email: z.string().email().optional().catch(undefined),
});

export const Route = createFileRoute("/forgot-password")({
  validateSearch: forgotPasswordSearchSchema,
  head: () => ({
    meta: [
      { title: "Forgot password — Hostylia" },
      { name: "description", content: "Reset your Hostylia account password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { email: prefilledEmail } = Route.useSearch();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const captcha = useCaptchaToken();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: prefilledEmail ?? "" },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    if (!captcha.token) {
      toast.error("Complete the captcha to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken: captcha.token,
      });
      if (error) {
        captcha.reset();
        toast.error(error.message);
        return;
      }
      setSentTo(values.email);
    } catch (err) {
      captcha.reset();
      const message =
        err instanceof Error ? err.message : "Could not send reset link. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title={t("auth.checkInboxTitle")}>
        <div className="animate-rise space-y-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
            <Mail className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("auth.resetEmailSentBody")}{" "}
            <span className="font-medium text-foreground">{sentTo}</span>.{" "}
            {t("auth.resetEmailSentHint")}
          </p>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to="/login">{t("auth.goToSignIn")}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.forgotPasswordTitle")} subtitle={t("auth.forgotPasswordSubtitle")}>
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
        <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />
        <Button type="submit" disabled={submitting || !captcha.token} className="min-h-11 w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t("auth.sendResetLink")}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            {t("auth.goToSignIn")}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
