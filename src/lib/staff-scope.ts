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
 */
export function useMyStaffProperty(userId: string | null | undefined, fallbackId?: string | null) {
  return useQuery({
    queryKey: ["my-staff-property", userId, fallbackId],
    enabled: !!userId,
    queryFn: async () => {
      if (fallbackId) return fallbackId;
      const { data } = await supabase
        .from("role_assignments")
        .select("property_id")
        .eq("user_id", userId!)
        .eq("is_active", true)
        .not("property_id", "is", null)
        .order("granted_at", { ascending: false })
        .limit(1);
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
  const propQ = useMyStaffProperty(role?.userId);
  return { propertyId: propQ.data ?? null, isLoading: propQ.isLoading };
}
