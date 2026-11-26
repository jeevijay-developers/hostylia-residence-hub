import { Building2 } from "lucide-react";

import occupancyTower from "@/assets/illustrations/occupancy-tower.webp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface OccupancyTowerCardProps {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyPct: number;
  isLoading?: boolean;
  onManage: () => void;
}

/**
 * Bed occupancy for the active property: illustration + headline % + the same
 * bed-status tokens BedGrid uses (--bed-occupied / --bed-vacant), so this card
 * stays visually tied to the rest of the occupancy UI in both themes.
 * Beds in MAINTENANCE/BLOCKED are outside the % (same as v_occupancy_summary)
 * and are called out separately when present.
 */
export function OccupancyTowerCard({
  totalBeds,
  occupiedBeds,
  vacantBeds,
  occupancyPct,
  isLoading,
  onManage,
}: OccupancyTowerCardProps) {
  const unavailable = Math.max(0, totalBeds - occupiedBeds - vacantBeds);
  const occupiable = occupiedBeds + vacantBeds;

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Occupancy Tower
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center">
        {isLoading ? (
          <div className="flex w-full items-center gap-6">
            <Skeleton className="aspect-[5/4] w-1/2 rounded-2xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ) : (
          <div
            className="grid w-full grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:gap-6"
            role="group"
            aria-label={`Room occupancy: ${occupiedBeds} of ${occupiable} beds occupied, ${vacantBeds} available, ${occupancyPct}% occupancy.`}
          >
            <img
              src={occupancyTower}
              alt=""
              aria-hidden="true"
              width={720}
              height={575}
              loading="lazy"
              decoding="async"
              className="mx-auto w-full max-w-[300px] select-none object-contain sm:max-w-[320px]"
              draggable={false}
            />
            <div className="min-w-0">
              <p className="font-display text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[44px]">
                {occupancyPct}%
              </p>
              <p className="text-base text-muted-foreground">Occupied</p>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-foreground/80">
                    <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-primary" />
                    Occupied
                  </dt>
                  <dd className="font-semibold text-foreground tabular-nums">{occupiedBeds}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2.5 text-foreground/80">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/35"
                    />
                    Available
                  </dt>
                  <dd className="font-semibold text-foreground tabular-nums">{vacantBeds}</dd>
                </div>
              </dl>
              {totalBeds === 0 ? (
                <button
                  type="button"
                  onClick={onManage}
                  className="mt-3 text-left text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  No beds set up yet — add rooms and beds
                </button>
              ) : unavailable > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {unavailable} under maintenance or blocked — not counted.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
