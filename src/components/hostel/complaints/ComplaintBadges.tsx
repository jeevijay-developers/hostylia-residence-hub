import { Clock } from "lucide-react";

import {
  PRIORITY_META,
  SLA_TONE,
  STATUS_META,
  categoryIcon,
  statusLabel,
} from "@/components/hostel/complaints/complaint-display";
import { complaintSla, type PropertyComplaint } from "@/lib/property-complaints";
import { cn } from "@/lib/utils";

// max-w-full + a truncating label: a pill never grows past its table column.
const pill =
  "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";

export function ComplaintStatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? {
    label: statusLabel(status),
    icon: Clock,
    className: "bg-muted text-muted-foreground",
  };
  const Icon = m.icon;
  return (
    <span className={cn(pill, m.className)} title={m.label}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{m.label}</span>
    </span>
  );
}

export function ComplaintPriorityPill({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.MEDIUM;
  if (!m) return null;
  const Icon = m.icon;
  return (
    <span className={cn(pill, m.className)} title={m.label}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{m.label}</span>
    </span>
  );
}

export function ComplaintCategoryChip({ name }: { name: string | null }) {
  const Icon = categoryIcon(name);
  return (
    <span
      className={cn(pill, "border border-border/80 bg-card text-foreground")}
      title={name ?? "Uncategorised"}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{name ?? "Uncategorised"}</span>
    </span>
  );
}

export function ComplaintSlaPill({
  complaint,
}: {
  complaint: Pick<PropertyComplaint, "status" | "sla_due_at" | "sla_breached_at">;
}) {
  const s = complaintSla(complaint);
  const t = SLA_TONE[s.tone];
  const Icon = t.icon;
  return (
    <span
      className={cn(pill, t.className)}
      title={`${s.label} · SLA due ${new Date(complaint.sla_due_at).toLocaleString("en-IN")}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{s.label}</span>
    </span>
  );
}

/** The SLA state as a compact icon + text line (no pill), for tight table cells. */
export function ComplaintSlaText({
  complaint,
  className,
}: {
  complaint: Pick<PropertyComplaint, "status" | "sla_due_at" | "sla_breached_at">;
  className?: string;
}) {
  const s = complaintSla(complaint);
  const t = SLA_TONE[s.tone];
  const Icon = t.icon;
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1 text-xs font-medium", t.text, className)}
      title={`${s.label} · SLA due ${new Date(complaint.sla_due_at).toLocaleString("en-IN")}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{s.label}</span>
    </span>
  );
}

export function ComplaintNumberPill({ number }: { number: string }) {
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center rounded-lg border border-border/80 bg-muted/40 px-2 py-1 font-mono text-xs font-semibold text-foreground"
      title={number}
    >
      <span className="truncate">{number}</span>
    </span>
  );
}
