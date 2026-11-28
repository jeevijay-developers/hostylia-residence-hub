import { CalendarClock, EyeOff, Pencil, UserCheck, UserRound } from "lucide-react";

import { ComplaintCommentThread } from "@/components/complaints/ComplaintCommentThread";
import { ComplaintTimeline } from "@/components/complaints/ComplaintTimeline";
import {
  ComplaintCategoryChip,
  ComplaintNumberPill,
  ComplaintPriorityPill,
  ComplaintSlaPill,
  ComplaintStatusPill,
} from "@/components/hostel/complaints/ComplaintBadges";
import {
  TARGET_LABEL,
  useStatusTargets,
  type StatusTarget,
} from "@/components/hostel/complaints/complaint-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useResolvedByLabel } from "@/lib/complaint";
import { formatRaised, useRoomBeds, type PropertyComplaint } from "@/lib/property-complaints";

/**
 * A complaint's details for the property Complaints tab: everything on the row plus the
 * description, resolution, timeline and conversation, with Edit and the allowed status moves.
 * (The Warden's ComplaintDetailsDialog has no slot for an Edit action, so the timeline and
 * conversation components are reused here instead.)
 */
export function ComplaintDetailsSheet({
  complaint,
  userId,
  wardenName,
  onClose,
  onEdit,
  onStatus,
}: {
  complaint: PropertyComplaint;
  userId: string | null;
  wardenName: string | null;
  onClose: () => void;
  onEdit: () => void;
  onStatus: (target: StatusTarget) => void;
}) {
  const targets = useStatusTargets(complaint);
  const resolvedByQ = useResolvedByLabel(complaint.resolved_by);
  const bedsQ = useRoomBeds(complaint.bed_id ? complaint.room_id : null);
  const bed = (bedsQ.data ?? []).find((b) => b.id === complaint.bed_id);

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] grid-cols-1 overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <ComplaintNumberPill number={complaint.complaint_number} />
            <ComplaintStatusPill status={complaint.status} />
            <ComplaintPriorityPill priority={complaint.priority} />
            <ComplaintSlaPill complaint={complaint} />
          </div>
          <DialogTitle className="text-lg">{complaint.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm text-foreground/80">
            {complaint.description}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border/80 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Student</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-foreground">
              {complaint.is_anonymous ? (
                <>
                  <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Anonymous student
                </>
              ) : (
                <>
                  <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {complaint.student_full_name ?? "—"}
                  {complaint.student_admission_number ? (
                    <span className="text-muted-foreground">
                      · {complaint.student_admission_number}
                    </span>
                  ) : null}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Room / bed</dt>
            <dd className="mt-0.5 text-foreground">
              {complaint.room_number ? `Room ${complaint.room_number}` : "No room"}
              {bed ? ` / Bed ${bed.code}` : ""}
              {complaint.block_name ? (
                <span className="text-muted-foreground"> · {complaint.block_name}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Category</dt>
            <dd className="mt-1">
              <ComplaintCategoryChip name={complaint.category_name} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Assigned warden</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-foreground">
              <UserCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {complaint.assigned_to ? (wardenName ?? "Assigned staff member") : "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Raised</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-foreground">
              <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {formatRaised(complaint.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">SLA due</dt>
            <dd className="mt-0.5 text-foreground">{formatRaised(complaint.sla_due_at)}</dd>
          </div>
        </dl>

        {complaint.resolution_summary ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
            <p className="font-medium text-success">Resolution</p>
            <p className="mt-1 whitespace-pre-wrap text-foreground">
              {complaint.resolution_summary}
            </p>
            {complaint.resolved_at ? (
              <p className="mt-1 text-xs text-muted-foreground">
                By {resolvedByQ.data ?? "—"} on {formatRaised(complaint.resolved_at)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {targets.map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => onStatus(t)}>
              {TARGET_LABEL[t]}
            </Button>
          ))}
        </div>

        <div className="rounded-xl border border-border/80 p-3">
          <ComplaintTimeline complaint={complaint} />
        </div>
        <ComplaintCommentThread complaint={complaint} userId={userId} />
      </DialogContent>
    </Dialog>
  );
}
