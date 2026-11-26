import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BedDouble,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  CirclePause,
  IndianRupee,
  MapPin,
  PencilRuler,
  Rows3,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import propertyDefault from "@/assets/illustrations/property-default.webp";
import { PropertyActionsMenu } from "@/components/hostel/PropertyActionsMenu";
import { cleanPlace, type PropertyOverview } from "@/lib/admin-properties";
import { cn } from "@/lib/utils";

export type PropertyQuickAction = "students" | "finance" | "reports";

const STATUS: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  ACTIVE: { label: "Active", icon: CircleCheck, className: "bg-success/10 text-success" },
  DRAFT: { label: "Setup pending", icon: PencilRuler, className: "bg-warning/10 text-warning" },
  INACTIVE: { label: "Inactive", icon: CirclePause, className: "bg-muted text-muted-foreground" },
  SUSPENDED: { label: "Suspended", icon: Ban, className: "bg-destructive/10 text-destructive" },
};

/** Status chip — always icon + label, never colour alone. */
export function PropertyStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? {
    label: status.charAt(0) + status.slice(1).toLowerCase(),
    icon: CirclePause,
    className: "bg-muted text-muted-foreground",
  };
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function OccupancyRing({
  percent,
  size = 96,
  stroke = 9,
  label = "Occupied",
  showValue = true,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string | null;
  /** Hide the centred % (when the value is already printed beside the ring). */
  showValue?: boolean;
}) {
  const p = Math.min(100, Math.max(0, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${p}% occupied`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`}
          className="stroke-primary transition-[stroke-dasharray] duration-500"
        />
      </svg>
      {showValue ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-semibold leading-none text-foreground tabular-nums">
            {p}%
          </span>
          {label ? <span className="mt-1 text-[11px] text-muted-foreground">{label}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

interface PropertyCardProps {
  property: PropertyOverview;
  isCurrent: boolean;
  onOpen: () => void;
  onQuickAction: (action: PropertyQuickAction) => void;
}

export function PropertyCard({ property: p, isCurrent, onOpen, onQuickAction }: PropertyCardProps) {
  const place = [cleanPlace(p.city), cleanPlace(p.state)].filter(Boolean).join(", ");
  const stats: { icon: LucideIcon; label: string; value: number }[] = [
    { icon: BedDouble, label: "Beds", value: p.totalBeds },
    { icon: Users, label: "Residents", value: p.residents },
    { icon: Rows3, label: "Blocks", value: p.blocks },
  ];
  const actionClass =
    "flex flex-col items-center gap-1 rounded-xl border border-border/80 px-1 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card-ambient transition-[border-color,box-shadow]",
        isCurrent ? "border-primary/40" : "border-border/80 hover:border-primary/25",
      )}
    >
      {/* Cover: the shared default property photo (properties have no photo of their own). */}
      <div className="relative h-40 overflow-hidden bg-muted">
        <img
          src={propertyDefault}
          alt=""
          aria-hidden="true"
          width={960}
          height={480}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <PropertyStatusBadge status={p.status} className="bg-card/90 shadow-sm backdrop-blur" />
          {isCurrent ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground shadow-sm">
              Selected
            </span>
          ) : null}
        </div>
        <div className="absolute right-3 top-3">
          <PropertyActionsMenu property={p} variant="overlay" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="truncate font-display text-lg font-semibold text-foreground"
              title={p.name}
            >
              {p.name}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{place || "Address not set"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${p.name} overview`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-5 border-t border-border/60 pt-4">
          <OccupancyRing percent={p.occupancyPct} />
          <dl className="min-w-0 flex-1 space-y-2.5 text-sm">
            {stats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </dt>
                <dd className="font-semibold text-foreground tabular-nums">
                  {value.toLocaleString("en-IN")}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <Link
            to="/admin/properties/$slug/rooms"
            params={{ slug: p.slug }}
            className={actionClass}
          >
            <BedDouble className="h-4 w-4" aria-hidden="true" />
            Rooms
          </Link>
          <button type="button" onClick={() => onQuickAction("students")} className={actionClass}>
            <Users className="h-4 w-4" aria-hidden="true" />
            Students
          </button>
          <button type="button" onClick={() => onQuickAction("finance")} className={actionClass}>
            <IndianRupee className="h-4 w-4" aria-hidden="true" />
            Finance
          </button>
          <button type="button" onClick={() => onQuickAction("reports")} className={actionClass}>
            <ChartColumn className="h-4 w-4" aria-hidden="true" />
            Reports
          </button>
        </div>
      </div>
    </article>
  );
}
