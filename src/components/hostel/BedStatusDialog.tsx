import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { BedTile } from "@/components/hostel/BedGrid";
import { setBedStatus } from "@/lib/hostel.functions";
import { describeBedRestriction, formatBedLabel } from "@/lib/bed-label";
import { bedStatusChangeSchema, type ManualBedStatus } from "@/schemas/hostel";
import { getErrorMessage } from "@/lib/utils";

/**
 * Manage Status for one bed. VACANT -> MAINTENANCE / BLOCKED (reason required,
 * plus an expected completion date for maintenance) and back to VACANT.
 * OCCUPIED beds are shown read-only: that status belongs to the allocation
 * flow. The database re-checks everything (open allocations, transitions,
 * permissions) — this form only gives early, field-level feedback.
 */
export function BedStatusDialog({
  bed,
  open,
  onOpenChange,
  onDone,
}: {
  bed: BedTile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const setStatusFn = useServerFn(setBedStatus);
  const [target, setTarget] = useState<Exclude<ManualBedStatus, "VACANT">>("MAINTENANCE");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; until?: string }>({});

  useEffect(() => {
    if (open) {
      setTarget("MAINTENANCE");
      setReason("");
      setUntil("");
      setErrors({});
    }
  }, [open, bed?.id]);

  const mut = useMutation({
    mutationFn: async (input: {
      new_status: ManualBedStatus;
      reason?: string;
      maintenance_until?: string;
    }) => {
      if (!bed) throw new Error("No bed selected");
      return setStatusFn({ data: { bed_id: bed.id, ...input } });
    },
    onSuccess: (_res, vars) => {
      toast.success(
        vars.new_status === "VACANT"
          ? "Bed returned to vacant"
          : `Bed marked ${vars.new_status.toLowerCase()}`,
      );
      onDone();
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Couldn't update the bed status")),
  });

  function submitRestriction() {
    if (!bed) return;
    const parsed = bedStatusChangeSchema.safeParse({
      bed_id: bed.id,
      new_status: target,
      reason,
      maintenance_until: until,
    });
    if (!parsed.success) {
      const next: { reason?: string; until?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "reason") next.reason = issue.message;
        if (issue.path[0] === "maintenance_until") next.until = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mut.mutate({
      new_status: target,
      reason: reason.trim(),
      maintenance_until: target === "MAINTENANCE" ? until : undefined,
    });
  }

  const restriction = bed ? describeBedRestriction(bed) : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Manage status — {bed ? formatBedLabel(bed.roomNumber, bed.code) : ""}
          </DialogTitle>
          <DialogDescription>
            Current status: <span className="font-medium text-foreground">{bed?.status}</span>
            {restriction ? ` — ${restriction}` : ""}
          </DialogDescription>
        </DialogHeader>

        {bed?.status === "OCCUPIED" && (
          <p className="text-sm text-muted-foreground">
            This bed is occupied. Its status changes automatically with the student's allocation —
            use move-out or swap to free it first.
          </p>
        )}

        {bed?.status === "VACANT" && (
          <div className="space-y-4">
            <RadioGroup
              value={target}
              onValueChange={(v) => setTarget(v as typeof target)}
              className="grid grid-cols-2 gap-2"
            >
              <Label
                htmlFor="bed-status-maintenance"
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3"
              >
                <RadioGroupItem id="bed-status-maintenance" value="MAINTENANCE" />
                <Wrench className="h-4 w-4 text-bed-maintenance" aria-hidden /> Maintenance
              </Label>
              <Label
                htmlFor="bed-status-blocked"
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3"
              >
                <RadioGroupItem id="bed-status-blocked" value="BLOCKED" />
                <Ban className="h-4 w-4 text-bed-blocked" aria-hidden /> Blocked
              </Label>
            </RadioGroup>
            <div>
              <Label htmlFor="bed-status-reason">Reason</Label>
              <Textarea
                id="bed-status-reason"
                value={reason}
                maxLength={500}
                placeholder={
                  target === "MAINTENANCE"
                    ? "e.g. Broken cot, repainting"
                    : "e.g. Reserved, safety issue"
                }
                aria-invalid={!!errors.reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErrors((p) => ({ ...p, reason: undefined }));
                }}
              />
              {errors.reason && <p className="mt-1 text-sm text-destructive">{errors.reason}</p>}
            </div>
            {target === "MAINTENANCE" && (
              <div>
                <Label htmlFor="bed-status-until">Expected completion date</Label>
                <Input
                  id="bed-status-until"
                  type="date"
                  min={today}
                  value={until}
                  // The native picker icon follows the browser colour scheme, which the app
                  // never sets, so it was dark-on-dark in the dark theme. Same fix as the
                  // Start date input on the Allocation page.
                  className="[color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  aria-invalid={!!errors.until}
                  onChange={(e) => {
                    setUntil(e.target.value);
                    setErrors((p) => ({ ...p, until: undefined }));
                  }}
                />
                {errors.until && <p className="mt-1 text-sm text-destructive">{errors.until}</p>}
              </div>
            )}
          </div>
        )}

        {(bed?.status === "MAINTENANCE" || bed?.status === "BLOCKED") && (
          <p className="text-sm text-muted-foreground">
            Once the{" "}
            {bed.status === "MAINTENANCE" ? "maintenance is complete" : "restriction is lifted"},
            return the bed to vacant so it can be allocated again.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {bed?.status === "VACANT" && (
            <Button onClick={submitRestriction} disabled={mut.isPending}>
              Mark {target === "MAINTENANCE" ? "under maintenance" : "blocked"}
            </Button>
          )}
          {(bed?.status === "MAINTENANCE" || bed?.status === "BLOCKED") && (
            <Button onClick={() => mut.mutate({ new_status: "VACANT" })} disabled={mut.isPending}>
              Return to vacant
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
