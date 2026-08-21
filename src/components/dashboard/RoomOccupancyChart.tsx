import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Same bed-status tokens BedGrid uses (--bed-occupied/--bed-vacant), not the
 * generic success/muted pair, so this donut stays visually tied to the rest
 * of the occupancy UI in both themes.
 */
const OCCUPIED_COLOR = "var(--bed-occupied)";
const VACANT_COLOR = "var(--bed-vacant)";

interface RoomOccupancyChartProps {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyPct: number;
  loading?: boolean;
}

export function RoomOccupancyChart({
  totalBeds,
  occupiedBeds,
  vacantBeds,
  occupancyPct,
  loading,
}: RoomOccupancyChartProps) {
  const data = [
    { name: "Occupied", value: occupiedBeds, color: OCCUPIED_COLOR },
    { name: "Available", value: vacantBeds, color: VACANT_COLOR },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Room Occupancy</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-6">
            <Skeleton className="h-40 w-40 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ) : totalBeds === 0 ? (
          <EmptyState
            title="No beds set up yet"
            description="Add rooms and beds to this property to start tracking occupancy."
          />
        ) : (
          <div
            className="flex flex-col items-center gap-6 sm:flex-row"
            role="img"
            aria-label={`Room occupancy: ${occupiedBeds} of ${totalBeds} beds occupied, ${vacantBeds} available, ${occupancyPct}% occupancy.`}
          >
            <div className="relative h-40 w-40 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="70%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {data.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  {occupancyPct}%
                </span>
                <span className="text-xs text-muted-foreground">occupied</span>
              </div>
            </div>
            <dl className="w-full flex-1 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">Total beds</dt>
                <dd className="font-semibold text-foreground">{totalBeds}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-bed-occupied"
                  />
                  Occupied
                </dt>
                <dd className="font-semibold text-foreground">{occupiedBeds}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-bed-vacant"
                  />
                  Available
                </dt>
                <dd className="font-semibold text-foreground">{vacantBeds}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
