import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatGateTime, formatOverdue, useOverdueOutPasses } from "@/lib/out-pass";

/**
 * Students who left on a gate pass, whose expected return time has passed and who
 * have no return scan. Derived live from the gate records, so a row disappears the
 * moment the return is scanned — there is nothing to dismiss. Renders nothing when
 * nobody is overdue.
 */
export function OverdueOutPassAlerts({ propertyId }: { propertyId: string | null }) {
  const q = useOverdueOutPasses(propertyId);
  const rows = q.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card
      role="alert"
      className="space-y-3 rounded-2xl border-destructive/30 bg-destructive/5 p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {rows.length} overdue {rows.length === 1 ? "return" : "returns"} — out on a gate pass, no
        return scan
      </div>
      <ul className="divide-y divide-destructive/15">
        {rows.map((r) => (
          <li
            key={r.gate_pass_id}
            className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{r.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.admission_number}
                {r.room_number
                  ? ` · Room ${r.room_number}${r.bed_code ? ` / Bed ${r.bed_code}` : ""}`
                  : ""}
                {` · ${r.pass_number}`}
              </p>
            </div>
            <div className="text-xs text-muted-foreground sm:text-right">
              <p>Left {formatGateTime(r.out_at, r.tz)}</p>
              <p>
                Due back {formatGateTime(r.expected_in_at, r.tz)} ·{" "}
                <span className="font-semibold text-destructive">
                  {formatOverdue(r.overdue_minutes)} overdue
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
