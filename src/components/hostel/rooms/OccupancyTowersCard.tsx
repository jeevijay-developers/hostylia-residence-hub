import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BedCounts } from "@/lib/rooms-beds";
import { cn } from "@/lib/utils";

export interface TowerFloor {
  id: string;
  name: string;
  /** "GF", "F1", "B1"… */
  label: string;
  rooms: number;
  counts: BedCounts;
}

export interface TowerBlock {
  id: string;
  name: string;
  counts: BedCounts;
  /** Bottom floor first. */
  floors: TowerFloor[];
}

const PER_PAGE = 3;

/**
 * One block drawn as a building: one band per floor, filled green from the
 * ground up to the block's occupancy. The selected floor is outlined.
 */
function Tower({
  block,
  isSelected,
  selectedFloorId,
}: {
  block: TowerBlock;
  isSelected: boolean;
  selectedFloorId: string | null;
}) {
  const uid = useId().replace(/:/g, "");
  const n = block.floors.length;
  const ground = 194;
  const bodyH = n === 0 ? 90 : Math.min(166, Math.max(104, n * 30));
  const top = ground - bodyH;
  const x0 = 28;
  const w = 74;
  const depth = 20;
  const lift = 10;
  const band = n > 0 ? bodyH / n : bodyH;
  const fillH = (bodyH * block.counts.occupancyPct) / 100;
  const selIndex = block.floors.findIndex((f) => f.id === selectedFloorId);

  const front = `${x0},${top} ${x0 + w},${top} ${x0 + w},${ground} ${x0},${ground}`;
  const side = `${x0 + w},${top} ${x0 + w + depth},${top - lift} ${x0 + w + depth},${ground - lift} ${x0 + w},${ground}`;
  const roof = `${x0},${top} ${x0 + depth},${top - lift} ${x0 + w + depth},${top - lift} ${x0 + w},${top}`;

  return (
    <svg viewBox="0 0 140 204" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--success)" stopOpacity={0.72} />
          <stop offset="100%" stopColor="var(--success)" stopOpacity={1} />
        </linearGradient>
        <clipPath id={`c-${uid}`}>
          <rect x="0" y={ground - fillH - lift} width="140" height={fillH + lift + 2} />
        </clipPath>
      </defs>

      {/* ground + trees */}
      <ellipse cx="74" cy={ground + 3} rx="64" ry="6" fill="var(--muted)" />
      {[
        [16, 10],
        [27, 7],
        [124, 9],
        [113, 6],
      ].map(([cx, r]) => (
        <g key={cx}>
          <rect
            x={cx - 1}
            y={ground - r - 2}
            width="2"
            height={r + 2}
            fill="var(--muted-foreground)"
            opacity={0.35}
          />
          <circle cx={cx} cy={ground - r - 4} r={r} fill="var(--success)" opacity={0.28} />
        </g>
      ))}

      {/* empty building */}
      <polygon points={front} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
      <polygon points={side} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
      <polygon points={side} fill="var(--foreground)" opacity={0.08} />

      {/* occupancy fill */}
      {fillH > 0 ? (
        <g clipPath={`url(#c-${uid})`}>
          <polygon points={front} fill={`url(#g-${uid})`} />
          <polygon points={side} fill={`url(#g-${uid})`} />
          <polygon points={side} fill="var(--foreground)" opacity={0.18} />
        </g>
      ) : null}

      {/* floors: separators + windows */}
      {block.floors.map((f, i) => {
        const yb = ground - i * band;
        const yt = yb - band;
        const windows = band >= 10 ? 4 : 0;
        return (
          <g key={f.id}>
            {i > 0 ? (
              <>
                <line
                  x1={x0}
                  y1={yb}
                  x2={x0 + w}
                  y2={yb}
                  stroke="var(--card)"
                  strokeOpacity={0.75}
                  strokeWidth={1.4}
                />
                <line
                  x1={x0 + w}
                  y1={yb}
                  x2={x0 + w + depth}
                  y2={yb - lift}
                  stroke="var(--card)"
                  strokeOpacity={0.5}
                  strokeWidth={1.2}
                />
              </>
            ) : null}
            {Array.from({ length: windows }).map((_, k) => (
              <rect
                key={k}
                x={x0 + 4 + k * ((w - 8) / 4) + ((w - 8) / 4 - 10) / 2}
                y={yt + band * 0.28}
                width={10}
                height={Math.max(3, band * 0.44)}
                rx={1}
                fill="var(--card)"
                opacity={0.38}
              />
            ))}
          </g>
        );
      })}

      {n === 0 ? (
        <text
          x={x0 + w / 2}
          y={top + bodyH / 2 + 4}
          textAnchor="middle"
          fontSize="10"
          fill="var(--muted-foreground)"
        >
          No floors
        </text>
      ) : null}

      <polygon points={roof} fill="var(--muted-foreground)" opacity={0.3} />

      {isSelected && selIndex >= 0 ? (
        <rect
          x={x0 - 1.5}
          y={ground - (selIndex + 1) * band}
          width={w + 3}
          height={band}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          rx={1.5}
        />
      ) : null}
    </svg>
  );
}

function StatRow({ dot, label, value }: { dot?: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <dt className="flex items-center gap-2 text-muted-foreground">
        {dot ? <span className={cn("h-2.5 w-2.5 rounded-full", dot)} aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd className="font-semibold text-foreground tabular-nums">
        {value.toLocaleString("en-IN")}
      </dd>
    </div>
  );
}

/**
 * Room structure & occupancy: three blocks at a time (arrows and the block
 * picker move between them), a floor picker for the selected block, and that
 * floor's room and bed counts.
 */
export function OccupancyTowersCard({
  blocks,
  selectedBlockId,
  selectedFloorId,
  onSelectBlock,
  onSelectFloor,
  structureSlug,
}: {
  blocks: TowerBlock[];
  selectedBlockId: string | null;
  selectedFloorId: string | null;
  onSelectBlock: (id: string) => void;
  onSelectFloor: (id: string) => void;
  /** Shows a "Setup" link to the structure editor when given. */
  structureSlug?: string;
}) {
  const selectedIndex = Math.max(
    0,
    blocks.findIndex((b) => b.id === selectedBlockId),
  );
  const pages = Math.max(1, Math.ceil(blocks.length / PER_PAGE));
  const [page, setPage] = useState(Math.floor(selectedIndex / PER_PAGE));
  // Keep the selected block on screen when it is picked from the dropdown.
  const pageOfSelected = Math.floor(selectedIndex / PER_PAGE);
  const [trackedSelection, setTrackedSelection] = useState(selectedBlockId);
  if (trackedSelection !== selectedBlockId) {
    setTrackedSelection(selectedBlockId);
    setPage(pageOfSelected);
  }
  const visible = blocks.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const block = blocks[selectedIndex];
  const floor = block?.floors.find((f) => f.id === selectedFloorId) ?? null;

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Room structure &amp; occupancy
        </CardTitle>
        <div className="flex items-center gap-2">
          {blocks.length > 1 ? (
            <Select value={block?.id} onValueChange={onSelectBlock}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Choose a block">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {blocks.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {structureSlug ? (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link to="/admin/properties/$slug/structure" params={{ slug: structureSlug }}>
                <Settings2 className="h-3.5 w-3.5" /> Setup
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_200px]">
        {/* floor picker (top floor first) */}
        <div
          role="radiogroup"
          aria-label={block ? `Floors of ${block.name}` : "Floors"}
          className="flex gap-1.5 overflow-x-auto md:max-h-[260px] md:flex-col md:justify-center md:overflow-y-auto md:overflow-x-visible md:pr-1"
        >
          {[...(block?.floors ?? [])].reverse().map((f) => {
            const on = f.id === selectedFloorId;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={f.name}
                onClick={() => onSelectFloor(f.id)}
                className={cn(
                  "h-8 min-w-12 shrink-0 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* towers */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-stretch gap-1">
            {pages > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 self-center"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous blocks"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              {visible.map((b) => {
                const on = b.id === block?.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBlock(b.id)}
                    aria-pressed={on}
                    aria-label={`${b.name}: ${b.counts.occupancyPct}% occupied`}
                    className={cn(
                      "flex min-w-0 flex-col items-center rounded-xl px-1 pt-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-primary/5" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "max-w-full truncate text-sm font-medium",
                        on ? "text-primary" : "text-foreground",
                      )}
                    >
                      {b.name}
                    </span>
                    <span className="font-display text-xl font-semibold text-foreground tabular-nums">
                      {b.counts.occupancyPct}%
                    </span>
                    <span className="block aspect-[140/204] w-full max-w-[160px]">
                      <Tower block={b} isSelected={on} selectedFloorId={selectedFloorId} />
                    </span>
                  </button>
                );
              })}
            </div>
            {pages > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 self-center"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
                aria-label="Next blocks"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-success" aria-hidden="true" /> Occupied
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm border border-border bg-muted"
                aria-hidden="true"
              />{" "}
              Available
            </span>
            {pages > 1 ? (
              <span className="tabular-nums">
                Blocks {page * PER_PAGE + 1}–{Math.min(blocks.length, (page + 1) * PER_PAGE)} of{" "}
                {blocks.length}
              </span>
            ) : null}
          </div>
        </div>

        {/* selected floor */}
        <div className="border-t border-border/70 pt-3 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{block?.name ?? "No block"}</span>
          </p>
          {floor ? (
            <p className="mt-0.5 truncate pl-6 text-sm text-muted-foreground" title={floor.name}>
              {floor.name}
            </p>
          ) : null}
          {floor ? (
            <dl className="mt-2 divide-y divide-border/50">
              <StatRow label="Rooms" value={floor.rooms} />
              <StatRow label="Beds" value={floor.counts.beds} />
              <StatRow dot="bg-success" label="Occupied" value={floor.counts.occupied} />
              <StatRow dot="bg-muted-foreground/60" label="Vacant" value={floor.counts.vacant} />
              <StatRow dot="bg-warning" label="Maintenance" value={floor.counts.maintenance} />
              <StatRow dot="bg-destructive" label="Blocked" value={floor.counts.blocked} />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {block?.floors.length
                ? "Pick a floor to see its rooms and beds."
                : "This block has no floors yet."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
