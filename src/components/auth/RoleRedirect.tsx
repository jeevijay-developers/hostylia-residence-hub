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
 *  3. No tenant yet, but signed up with a hostel name → provision a tenant
 *     (fn_provision_tenant RPC) and land on /admin/dashboard
 *  4. Otherwise: guardians.phone match → /parent; unmatched phone → /access-pending
 */
export function RoleRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }
      const user = userData.user;

      // 1) Platform SUPER_ADMIN check. platform_role_assignments has no
      //    client-readable RLS policy by design (service_role only), so this
      //    must go through the SECURITY DEFINER RPC, not a direct query.
      const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
        _user_id: user.id,
      });
      if (isSuperAdmin) {
        if (!cancelled) navigate({ to: "/super-admin/dashboard" });
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

      // 3) No tenant yet — if they signed up as a Hostel Admin (hostel name
      //    captured at signup), provision their tenant now and send them
      //    straight to the admin dashboard.
      const hostelName =
        (user.user_metadata?.hostel_name as string | undefined) ??
        (user.user_metadata?.hostelName as string | undefined);
      if (hostelName && hostelName.trim()) {
        if (!cancelled) setProvisioning(true);
        const { data: provisioned, error: provisionErr } = await supabase
          .rpc("fn_provision_tenant", { p_hostel_name: hostelName })
          .single();
        if (provisionErr) {
          if (!cancelled) {
            setProvisioning(false);
            setError(provisionErr.message);
          }
          return;
        }
        if (!cancelled) navigate({ to: "/admin/dashboard" });
        return;
      }

      // 4) Parent flow: match phone against guardians
      if (user.phone) {
        const normalized = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
        const { data: guardianRows } = await supabase
          .from("guardians")
          .select("id")
          .eq("phone", normalized)
          .limit(1);
        if (guardianRows && guardianRows.length > 0) {
          if (!cancelled) navigate({ to: "/parent/overview" });
          return;
        }
      }

      // 5) Fallback — nothing matched yet. If they signed up choosing "I'm a
      //    student", show student-specific waiting copy instead of the
      //    default parent-oriented one.
      const signupRole = user.user_metadata?.signup_role as string | undefined;
      if (!cancelled) {
        navigate({ to: "/access-pending", search: signupRole === "STUDENT" ? { as: "student" } : undefined });
      }
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
      <p className="text-sm text-muted-foreground">
        {provisioning ? "Setting up your hostel…" : "Signing you in…"}
      </p>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

type RoleDestination =
  | "/super-admin/dashboard"
  | "/admin/dashboard"
  | "/accountant/dashboard"
  | "/warden/daily-brief"
  | "/student/home"
  | "/parent/overview";

function destinationForRole(role: string | null | undefined): RoleDestination | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin/dashboard";
    case "HOSTEL_ADMIN":
      return "/admin/dashboard";
    case "ACCOUNTANT":
      return "/accountant/dashboard";
    case "WARDEN":
      return "/warden/daily-brief";
    case "STUDENT":
      return "/student/home";
    case "PARENT":
      return "/parent/overview";
    default:
      return null;
  }
}
