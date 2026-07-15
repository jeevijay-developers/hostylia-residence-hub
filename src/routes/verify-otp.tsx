import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { sendPhoneOtp } from "@/lib/auth-otp.functions";
import { linkGuardianProfileOnLogin } from "@/lib/parent-link.functions";
import {
  maskPhone,
  otpCodeSchema,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "@/schemas/auth";

const searchSchema = z.object({
  phone: z.string().min(1),
});

export const Route = createFileRoute("/verify-otp")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Verify code — Hostylia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyOtpPage,
});

function VerifyOtpPage() {
  const { phone } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const submitCode = async (value: string) => {
    setInlineError(null);
    const parsed = otpCodeSchema.safeParse(value);
    if (!parsed.success) {
      setInlineError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: value,
        type: "sms",
      });
      if (error) {
        setInlineError(error.message);
        return;
      }
      // Backfill guardians.profile_id for parents whose phone matches an
      // existing guardian record (created by admin ahead of first login).
      try {
        await linkGuardianProfileOnLogin();
      } catch (e) {
        console.warn("guardian backfill failed", e);
      }
      navigate({ to: "/post-login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await sendPhoneOtp({ data: { phone } });
      toast.success("A new code has been sent.");
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Enter verification code"
      subtitle={`We sent a 6-digit code to ${maskPhone(phone)}.`}
    >
      <div className="space-y-6">
        <OtpInput
          value={code}
          onChange={(v) => {
            setInlineError(null);
            setCode(v);
          }}
          onComplete={submitCode}
          disabled={verifying}
          autoFocus
        />
        {inlineError ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {inlineError}
          </p>
        ) : null}
        <Button
          type="button"
          className="min-h-11 w-full"
          disabled={verifying || code.length !== 6}
          onClick={() => submitCode(code)}
        >
          {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Verify &amp; continue
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Change number
          </Link>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
