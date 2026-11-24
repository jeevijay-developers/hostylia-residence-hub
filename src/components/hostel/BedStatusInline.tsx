import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { BedTile } from "@/components/hostel/BedGrid";
import { setBedStatus } from "@/lib/hostel.functions";
import { bedStatusChangeSchema, type ManualBedStatus } from "@/schemas/hostel";
import { getErrorMessage } from "@/lib/utils";

type Target = Exclude<ManualBedStatus, "VACANT">;

/**
 * Inline (no overlay) VACANT -> MAINTENANCE / BLOCKED form, shown inside the
 * Allocate dialog. Same schema, server function and validation as
 * BedStatusDialog; the database still re-checks everything.
 */
export function BedStatusInline({
  bed,
  onClose,
  onDone,
}: {
  bed: BedTile;
  onClose: () => void;
  onDone: () => void;
}) {
  const setStatusFn = useServerFn(setBedStatus);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; until?: string }>({});

  const mut = useMutation({
    mutationFn: async (input: { new_status: Target; reason: string; maintenance_until?: string }) =>
      setStatusFn({ data: { bed_id: bed.id, ...input } }),
    onSuccess: (_res, vars) => {
      toast.success(`Bed marked ${vars.new_status.toLowerCase()}`);
      onDone();
    },
    onError: (e) => toast.error(getErrorMessage(e, "Couldn't update the bed status")),
  });

  function submit() {
    if (!target) return;
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

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
      <RadioGroup
        value={target ?? ""}
        onValueChange={(v) => {
          setTarget(v as Target);
          setErrors({});
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <Label
          htmlFor="inline-status-maintenance"
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3"
        >
          <RadioGroupItem id="inline-status-maintenance" value="MAINTENANCE" />
          <Wrench className="h-4 w-4 text-bed-maintenance" aria-hidden /> Maintenance
        </Label>
        <Label
          htmlFor="inline-status-blocked"
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3"
        >
          <RadioGroupItem id="inline-status-blocked" value="BLOCKED" />
          <Ban className="h-4 w-4 text-bed-blocked" aria-hidden /> Blocked
        </Label>
      </RadioGroup>

      {target && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="inline-status-reason">Reason</Label>
            <Textarea
              id="inline-status-reason"
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
              <Label htmlFor="inline-status-until">Expected completion date</Label>
              <Input
                id="inline-status-until"
                type="date"
                min={today}
                value={until}
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

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={mut.isPending}>
          Cancel
        </Button>
        {target && (
          <Button type="button" onClick={submit} disabled={mut.isPending}>
            Mark {target === "MAINTENANCE" ? "under maintenance" : "blocked"}
          </Button>
        )}
      </div>
    </div>
  );
}
