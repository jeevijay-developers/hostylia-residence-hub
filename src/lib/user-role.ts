import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "SUPER_ADMIN"
  | "HOSTEL_ADMIN"
  | "ACCOUNTANT"
  | "WARDEN"
  | "STUDENT"
  | "PARENT"
  | null;

export interface ResolvedRole {
  role: AppRole;
  tenantId: string | null;
  userId: string | null;
}

async function fetchResolvedRole(): Promise<ResolvedRole> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { role: null, tenantId: null, userId: null };

  // Platform super admin
  const { data: platformRows } = await supabase
    .from("platform_role_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);
  if (platformRows && platformRows.length > 0) {
    return { role: "SUPER_ADMIN", tenantId: null, userId: user.id };
  }

  // Active tenant membership + role via RPC
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, status")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1);

  if (memberships && memberships.length > 0) {
    const tenantId = memberships[0].tenant_id;
    const { data: role } = await supabase.rpc("get_user_role", {
      p_user_id: user.id,
      p_tenant_id: tenantId,
    });
    return { role: (role as AppRole) ?? null, tenantId, userId: user.id };
  }

  // Parent fallback
  if (user.phone) {
    const normalized = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
    const { data: guardianRows } = await supabase
      .from("guardians")
      .select("id")
      .eq("phone", normalized)
      .limit(1);
    if (guardianRows && guardianRows.length > 0) {
      return { role: "PARENT", tenantId: null, userId: user.id };
    }
  }

  return { role: null, tenantId: null, userId: user.id };
}

export function useResolvedRole() {
  return useQuery({
    queryKey: ["resolved-role"],
    queryFn: fetchResolvedRole,
    staleTime: 5 * 60_000,
  });
}
