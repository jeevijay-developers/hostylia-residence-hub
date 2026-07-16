import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the property scope for the current staff user (Warden or Hostel Admin).
 * Falls back to the Zustand active property (for Hostel Admin) or the first assigned.
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
