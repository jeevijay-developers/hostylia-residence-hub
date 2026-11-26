import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPropertyOverviewStats } from "@/lib/property-overview.functions";

/** Shared by the property's Overview and Rooms & Beds tabs (one cache entry). */
export function usePropertyOverviewStats(propertyId: string) {
  const statsFn = useServerFn(getPropertyOverviewStats);
  return useQuery({
    queryKey: ["property-overview", propertyId, "stats"],
    staleTime: 60_000,
    queryFn: () => statsFn({ data: { property_id: propertyId } }),
  });
}
