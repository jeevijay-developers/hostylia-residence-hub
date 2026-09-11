import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { resolvePostLoginDestination } from "@/lib/post-login.functions";

/**
 * After successful auth, resolve the user's role and navigate to the right shell.
 * Delegates to `resolvePostLoginDestination` (server) so phone→guardian/student
 * linking and invite activation happen before role checks.
 */
export function RoleRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        setProvisioning(true);
        const result = await resolvePostLoginDestination();

        if (cancelled) return;

        if (result.kind === "login") {
          navigate({ to: "/login" });
          return;
        }
        if (result.kind === "destination") {
          navigate({ to: result.destination });
          return;
        }
        navigate({
          to: "/access-pending",
          search: result.as ? { as: result.as } : undefined,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) setProvisioning(false);
      }
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        {provisioning ? "Signing you in…" : "Taking you to your dashboard…"}
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
