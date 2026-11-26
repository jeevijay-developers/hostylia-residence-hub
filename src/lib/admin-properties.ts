import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { usePropertyStore } from "@/stores/property-store";

export interface PropertyOverview {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  /** Upper-cased (rows created before the enum was enforced may be lower-case). */
  status: string;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  /** occupied / (occupied + vacant) — same rule as v_occupancy_summary and the dashboard. */
  occupancyPct: number;
  residents: number;
  blocks: number;
}

export interface PropertiesOverview {
  properties: PropertyOverview[];
  totals: {
    properties: number;
    beds: number;
    residents: number;
    occupancyPct: number;
  };
}

const pct = (occupied: number, vacant: number) =>
  occupied + vacant > 0 ? Math.round((occupied / (occupied + vacant)) * 100) : 0;

/** Placeholder address values the "Add property" dialog writes until Setup is completed. */
export function cleanPlace(value: string | null | undefined) {
  return value && value !== "TBD" ? value : null;
}

/**
 * Admin Properties page data. Bed counts come from v_occupancy_summary (one
 * row per property+block, aggregated in Postgres) instead of reading every
 * bed row — the old list fetched all beds in one request, which PostgREST
 * caps at 1000 rows, so larger portfolios showed wrong totals. Residents are
 * per-property head counts of ACTIVE students (the dashboard's definition).
 * Keyed ["admin-properties", tenantId] so the create/setup flows' existing
 * invalidations keep refreshing it.
 */
export function usePropertiesOverview(tenantId: string | null) {
  return useQuery({
    queryKey: ["admin-properties", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<PropertiesOverview> => {
      if (!tenantId) throw new Error("Missing tenant id");
      const { data: props, error } = await supabase
        .from("properties")
        .select("id, slug, name, city, state, status")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      const list = props ?? [];
      if (list.length === 0) {
        return {
          properties: [],
          totals: { properties: 0, beds: 0, residents: 0, occupancyPct: 0 },
        };
      }
      const ids = list.map((p) => p.id);

      const [occRes, blocksRes, ...residentRes] = await Promise.all([
        supabase
          .from("v_occupancy_summary")
          .select("property_id, total_beds, occupied_beds, vacant_beds")
          .in("property_id", ids),
        supabase
          .from("blocks")
          .select("id, property_id")
          .in("property_id", ids)
          .is("deleted_at", null),
        ...ids.map((id) =>
          supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("property_id", id)
            .is("deleted_at", null)
            .eq("status", "ACTIVE"),
        ),
      ]);
      if (occRes.error) throw new Error(occRes.error.message);
      if (blocksRes.error) throw new Error(blocksRes.error.message);

      const beds = new Map<string, { total: number; occupied: number; vacant: number }>();
      for (const r of occRes.data ?? []) {
        if (!r.property_id) continue;
        const b = beds.get(r.property_id) ?? { total: 0, occupied: 0, vacant: 0 };
        b.total += r.total_beds ?? 0;
        b.occupied += r.occupied_beds ?? 0;
        b.vacant += r.vacant_beds ?? 0;
        beds.set(r.property_id, b);
      }
      const blocks = new Map<string, number>();
      for (const b of blocksRes.data ?? []) {
        blocks.set(b.property_id, (blocks.get(b.property_id) ?? 0) + 1);
      }

      for (const r of residentRes) if (r.error) throw new Error(r.error.message);

      const properties: PropertyOverview[] = list.map((p, i) => {
        const b = beds.get(p.id) ?? { total: 0, occupied: 0, vacant: 0 };
        const res = residentRes[i];
        return {
          id: p.id,
          slug: String(p.slug),
          name: p.name,
          city: p.city,
          state: p.state,
          status: (p.status ?? "").toUpperCase(),
          totalBeds: b.total,
          occupiedBeds: b.occupied,
          vacantBeds: b.vacant,
          occupancyPct: pct(b.occupied, b.vacant),
          residents: res?.count ?? 0,
          blocks: blocks.get(p.id) ?? 0,
        };
      });

      const sum = (f: (p: PropertyOverview) => number) =>
        properties.reduce((acc, p) => acc + f(p), 0);
      return {
        properties,
        totals: {
          properties: properties.length,
          beds: sum((p) => p.totalBeds),
          residents: sum((p) => p.residents),
          occupancyPct: pct(
            sum((p) => p.occupiedBeds),
            sum((p) => p.vacantBeds),
          ),
        },
      };
    },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The property a /admin/properties/$slug/... URL points at. Slugs are unique
 * per tenant among non-deleted properties (and RLS limits the lookup to the
 * admin's own tenant). A UUID is still accepted so links and bookmarks from
 * before the switch to slugs keep working — callers redirect those to the
 * slug URL once the row is loaded. Null when nothing matches.
 */
export function usePropertyByRouteParam(param: string | null) {
  return useQuery({
    queryKey: ["property-by-slug", param],
    enabled: !!param,
    queryFn: async () => {
      if (!param) return null;
      const base = supabase.from("properties").select("*").is("deleted_at", null);
      const { data, error } = await (
        UUID_RE.test(param) ? base.eq("id", param) : base.eq("slug", param.toLowerCase())
      ).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Slug for a property id (for links built from the active-property store). */
export function usePropertySlug(propertyId: string | null) {
  return useQuery({
    queryKey: ["property-slug", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!propertyId) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("slug")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data ? String(data.slug) : null;
    },
  });
}

/**
 * Opening a property's own pages makes it the active property, so the tabs
 * that lead into the shared admin pages (Residents, Finance, Attendance…) and
 * the sidebar switcher all show the same property. Runs once per property —
 * picking another one in the switcher afterwards is not overridden.
 */
export function useMakePropertyActive(propertyId: string | null | undefined) {
  const setActivePropertyId = usePropertyStore((s) => s.setActivePropertyId);
  useEffect(() => {
    if (!propertyId) return;
    if (usePropertyStore.getState().activePropertyId !== propertyId) {
      setActivePropertyId(propertyId);
    }
  }, [propertyId, setActivePropertyId]);
}
