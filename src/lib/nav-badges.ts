import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { OPEN_COMPLAINT_STATUSES } from "@/lib/complaint";
import type { NavBadgeKey } from "@/lib/dashboard-nav";

export type NavBadgeCounts = Partial<Record<NavBadgeKey, number>>;

/** What each badge counts — also used as the badge's accessible description. */
export const NAV_BADGE_DESCRIPTION: Record<NavBadgeKey, string> = {
  complaints: "open complaints",
  finance: "refunds awaiting your approval",
  support: "support tickets waiting for your reply",
};

/**
 * Live counts for the Hostel Admin sidebar badges. RLS-scoped head-count
 * queries only (no rows fetched):
 *  - complaints: open complaints at the active property (same statuses as the
 *    dashboard's "Needs Your Attention" tile)
 *  - finance: refunds in PENDING_APPROVAL at the active property (the queue on
 *    Finance → P&L that only a Hostel Admin can decide)
 *  - support: the tenant's Hostylia support tickets in WAITING_FOR_ADMIN
 * Disabled (no requests) for any nav that has no badge items.
 */
export function useNavBadges(
  enabled: boolean,
  tenantId: string | null,
  propertyId: string | null,
): NavBadgeCounts {
  const q = useQuery({
    queryKey: ["nav-badges", tenantId, propertyId],
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<NavBadgeCounts> => {
      if (!tenantId) return {};
      const [support, complaints, finance] = await Promise.all([
        supabase
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "WAITING_FOR_ADMIN"),
        propertyId
          ? supabase
              .from("complaints")
              .select("id", { count: "exact", head: true })
              .eq("property_id", propertyId)
              .is("deleted_at", null)
              .in("status", OPEN_COMPLAINT_STATUSES)
          : null,
        propertyId
          ? supabase
              .from("refunds")
              .select("id", { count: "exact", head: true })
              .eq("property_id", propertyId)
              .eq("status", "PENDING_APPROVAL")
          : null,
      ]);
      // A failed count just hides that badge — navigation must never break on it.
      const count = (r: { count: number | null; error: unknown } | null) =>
        r && !r.error ? (r.count ?? 0) : undefined;
      return {
        support: count(support),
        complaints: count(complaints),
        finance: count(finance),
      };
    },
  });
  return q.data ?? {};
}
