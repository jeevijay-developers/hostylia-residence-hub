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
    <ol className="space-y-2 text-sm">
      {events.map((e) => (
        <li key={e.label} className="flex items-start gap-3">
          <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
          <div>
            <div className="font-medium">{e.label}</div>
            <div className="text-xs text-muted-foreground">
              {e.at ? new Date(e.at).toLocaleString() : "—"}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
