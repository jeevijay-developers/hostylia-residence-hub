import type { ComplaintRow } from "@/lib/complaint";

interface Event {
  label: string;
  at: string | null;
}

export function ComplaintTimeline({ complaint }: { complaint: ComplaintRow }) {
  const events: Event[] = [
    { label: "Created", at: complaint.created_at },
    { label: "Assigned", at: complaint.assigned_at },
    { label: "SLA due", at: complaint.sla_due_at },
    { label: "SLA breached", at: complaint.sla_breached_at },
    { label: "Resolved", at: complaint.resolved_at },
    { label: "Closed", at: complaint.closed_at },
  ].filter((e) => e.at);
  return (
    <ol className="space-y-3 text-sm">
      {events.map((e, i) => (
        <li key={e.label} className="relative flex items-start gap-3 pb-0.5">
          {i < events.length - 1 && (
            <span className="absolute left-[3px] top-3 h-[calc(100%-4px)] w-px bg-border" aria-hidden="true" />
          )}
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px] shadow-primary/15" />
          <div className="min-w-0">
            <div className="font-medium text-foreground">{e.label}</div>
            <div className="text-xs text-muted-foreground">
              {e.at ? new Date(e.at).toLocaleString() : "—"}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
