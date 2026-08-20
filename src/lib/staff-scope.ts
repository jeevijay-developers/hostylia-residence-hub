import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

/**
 * Returns the property scope for the current staff user (any role assigned a
 * property — Warden, Accountant, or Hostel Admin). Falls back to the Zustand
 * active property (for Hostel Admin, who can switch between all of a
 * tenant's properties) or the first property their own `role_assignments`
 * row is scoped to (RLS: "own role_assignments readable", `user_id =
 * auth.uid()` — works identically for every role, no per-role filter here).
 *
 * `tenantId` is optional (and unfiltered when omitted) for backward
 * compatibility with existing callers, but should be passed whenever it's
 * available: a staff member can hold `role_assignments` rows across more
 * than one tenant (re-invited, a second demo property, a stale duplicate
 * grant, etc.), and without a tenant filter this picks the most-recently
 * -granted row *for that user_id regardless of tenant* — which can resolve a
 * property belonging to a different tenant than the one the rest of the app
 * (sidebar, dashboard, `useResolvedRole`) currently has them signed into.
 * That property then legitimately has zero rows for whatever's being
 * queried (invoices, students, ...), which just looks like "data missing"
 * rather than a permissions error, since RLS itself is satisfied — the
 * property really is one this user is assigned to, just the wrong tenant's.
 */
export function useMyStaffProperty(
  userId: string | null | undefined,
  fallbackId?: string | null,
  tenantId?: string | null,
) {
  return useQuery({
    queryKey: ["my-staff-property", userId, fallbackId, tenantId],
    enabled: !!userId,
    queryFn: async () => {
      if (fallbackId) return fallbackId;
      let q = supabase
        .from("role_assignments")
        .select("property_id")
        .eq("user_id", userId!)
        .eq("is_active", true)
        .not("property_id", "is", null)
        .order("granted_at", { ascending: false })
        .limit(1);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data } = await q;
      return data?.[0]?.property_id ?? null;
    },
  });
}

/**
 * Convenience wrapper for Accountant pages: resolves the signed-in
 * Accountant's authorized property automatically via `useMyStaffProperty`,
 * instead of relying on the Zustand `activePropertyId` store — that store is
 * only ever populated by `PropertySwitcher` (Hostel-Admin-only UI), so
 * Accountant pages that read it directly always saw `null` and got stuck on
 * "Choose a property first" even when the Accountant has a real, RLS-scoped
 * property assignment. Every Accountant page should use this instead of
 * `usePropertyStore` directly.
 */
export function useAccountantProperty() {
  const { data: role } = useResolvedRole();
  const propQ = useMyStaffProperty(role?.userId, undefined, role?.tenantId);
  return { propertyId: propQ.data ?? null, isLoading: propQ.isLoading };
}
