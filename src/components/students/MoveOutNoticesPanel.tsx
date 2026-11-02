import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DoorOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface NoticeRow {
  id: string;
  notice_given_at: string | null;
  requested_move_out_date: string | null;
  notice_reason: string | null;
  student: { id: string; full_name: string; admission_number: string } | null;
  property: { name: string } | null;
  bed: { code: string; room: { room_number: string } | null } | null;
}

interface MoveOutNoticesPanelProps {
  tenantId: string;
  propertyId: string;
  /** Which panel's move-out wizard the Review action opens. */
  area: "admin" | "warden";
  /** Warden: only with allocations_edit (the DB enforces it in complete_move_out). */
  canReview: boolean;
}

/**
 * Submitted move-out notices (allocations in NOTICE_GIVEN) for the property.
 * Read through the caller's own RLS, so a Warden only ever sees notices in
 * their property/block scope. Review opens the shared MoveOutWizard, where
 * dues, deposit and the actual move-out are handled.
 */
export function MoveOutNoticesPanel({
  tenantId,
  propertyId,
  area,
  canReview,
}: MoveOutNoticesPanelProps) {
  const q = useQuery({
    queryKey: ["move-out-notices", tenantId, propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, notice_given_at, requested_move_out_date, notice_reason, student:students(id, full_name, admission_number), property:properties(name), bed:beds(code, room:rooms(room_number))",
        )
        .eq("tenant_id", tenantId)
        .eq("property_id", propertyId)
        .eq("status", "NOTICE_GIVEN")
        .is("deleted_at", null)
        .order("requested_move_out_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as NoticeRow[];
    },
  });

  if (q.isLoading) return <Skeleton className="h-24 w-full rounded-2xl" />;
  const rows = q.data ?? [];
  if (q.isError || rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-xl sm:p-5">
      <div className="flex items-center gap-2">
        <DoorOpen className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold text-foreground">
          Move-out notices
          <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            {rows.length}
          </span>
        </h2>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((n) => (
          <li
            key={n.id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {n.student?.full_name ?? "Student"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  #{n.student?.admission_number}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {n.property?.name ?? "—"} · Room {n.bed?.room?.room_number ?? "—"} / Bed{" "}
                {n.bed?.code ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Notice{" "}
                {n.notice_given_at ? new Date(n.notice_given_at).toLocaleDateString("en-IN") : "—"}{" "}
                · Moving out {n.requested_move_out_date ?? "—"}
              </p>
              {n.notice_reason && (
                <p className="truncate text-xs text-muted-foreground">Reason: {n.notice_reason}</p>
              )}
            </div>
            {canReview && n.student && (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                {area === "admin" ? (
                  <Link to="/admin/students/$id/move-out" params={{ id: n.student.id }}>
                    Review & move out
                  </Link>
                ) : (
                  <Link to="/warden/move-out/$id" params={{ id: n.student.id }}>
                    Review & move out
                  </Link>
                )}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
