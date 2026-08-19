import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [{ title: "Email verified — Hostylia" }, { name: "robots", content: "noindex" }],
  }),
  component: VerifyEmailPage,
});

type Status = "checking" | "verified" | "failed";

/**
 * Landed on after clicking the "Confirm your email" link. The Supabase
 * client auto-detects the access/refresh tokens Supabase Auth appends to
 * this URL (detectSessionInUrl, on by default) before this component even
 * mounts, so by the time we check, the session is either already live
 * (success) or absent (expired/already-used link).
 */
function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setStatus(data.session ? "verified" : "failed");
    }

    check();
    // Supabase can take a tick to finish parsing the URL fragment on first
    // load — listen for the resulting sign-in event too, not just the
    // initial getSession() snapshot.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !cancelled) setStatus("verified");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthLayout
      title={
        status === "checking"
          ? "Confirming your email…"
          : status === "verified"
            ? "Email verified"
            : "Link expired"
      }
    >
      <div className="animate-rise space-y-6 text-center">
        {status === "checking" ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Just a moment…</p>
          </>
        ) : status === "verified" ? (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground">
              Your email is confirmed and your account is ready. Sign in to continue.
            </p>
            <Button asChild className="min-h-11 w-full">
              <Link to="/login">Go to sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
              <XCircle className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground">
              This confirmation link has expired or was already used. Sign in — if your email still
              needs confirming, we'll send a fresh link.
            </p>
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link to="/login">Go to sign in</Link>
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
