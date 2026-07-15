import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * After successful auth, resolve the user's role and navigate to the right shell.
 *
 * Resolution order:
 *  1. platform_role_assignments (SUPER_ADMIN) → /super-admin
 *  2. First active tenant_memberships row → get_user_role() RPC → role route
 *  3. Otherwise: guardians.phone match → /parent; unmatched phone → /access-pending
 */
export function RoleRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }
      const user = userData.user;

      // 1) Platform SUPER_ADMIN check (RLS hides this from clients, so a null
      //    result here just means "not a super admin" — carry on).
      const { data: platformRows } = await supabase
        .from("platform_role_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      if (platformRows && platformRows.length > 0) {
        if (!cancelled) navigate({ to: "/super-admin" });
        return;
      }

      // 2) Active tenant memberships
      const { data: memberships } = await supabase
        .from("tenant_memberships")
        .select("tenant_id, status")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .limit(1);

      if (memberships && memberships.length > 0) {
        const tenantId = memberships[0].tenant_id;
        const { data: role, error: roleErr } = await supabase.rpc("get_user_role", {
          p_user_id: user.id,
          p_tenant_id: tenantId,
        });
        if (roleErr) {
          if (!cancelled) setError(roleErr.message);
          return;
        }
        const dest = destinationForRole(role);
        if (dest && !cancelled) {
          navigate({ to: dest });
          return;
        }
      }

      // 3) Parent flow: match phone against guardians
      if (user.phone) {
        const normalized = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
        const { data: guardianRows } = await supabase
          .from("guardians")
          .select("id")
          .eq("phone", normalized)
          .limit(1);
        if (guardianRows && guardianRows.length > 0) {
          if (!cancelled) navigate({ to: "/parent" });
          return;
        }
        if (!cancelled) navigate({ to: "/access-pending" });
        return;
      }

      if (!cancelled) navigate({ to: "/access-pending" });
    }

    resolve().catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

type RoleDestination =
  | "/super-admin"
  | "/admin"
  | "/warden"
  | "/student"
  | "/parent";

function destinationForRole(role: string | null | undefined): RoleDestination | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin";
    case "HOSTEL_ADMIN":
    case "ACCOUNTANT":
      return "/admin";
    case "WARDEN":
      return "/warden";
    case "STUDENT":
      return "/student";
    case "PARENT":
      return "/parent";
    default:
      return null;
  }
}
