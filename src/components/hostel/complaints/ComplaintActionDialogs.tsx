import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  ComplaintNumberPill,
  ComplaintStatusPill,
} from "@/components/hostel/complaints/ComplaintBadges";
import type { WardenData } from "@/components/hostel/complaints/ComplaintFormDialog";
import { statusLabel, type StatusTarget } from "@/components/hostel/complaints/complaint-display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { reopenComplaintWithOverride } from "@/lib/complaint";
import {
  useAssignableComplaints,
  wardensForBlock,
  type PropertyComplaint,
} from "@/lib/property-complaints";
import { saveAdminComplaint } from "@/lib/property-complaints.functions";
import { cn, getErrorMessage } from "@/lib/utils";
import { reopenOverrideReasonError, resolutionSummaryError } from "@/schemas/complaint";

/** One status change: Assign (pick a warden), Start working, Resolve (summary), Reopen override. */
export function ComplaintStatusDialog({
  complaint,
  target,
  wardens,
  onClose,
  onDone,
}: {
  complaint: PropertyComplaint;
  target: StatusTarget;
  wardens: WardenData | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const saveFn = useServerFn(saveAdminComplaint);
  const [warden, setWarden] = useState(complaint.assigned_to ?? "");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => wardensForBlock(wardens?.assignable ?? [], complaint.block_id),
    [wardens, complaint.block_id],
  );
  const error =
    target === "RESOLVED"
      ? resolutionSummaryError(text)
      : target === "REOPENED"
        ? reopenOverrideReasonError(text)
        : target === "ASSIGNED" && !warden
          ? "Choose a warden."
          : null;

  const run = async () => {
    setBusy(true);
    try {
      if (target === "REOPENED") {
        await reopenComplaintWithOverride(complaint.id, text);
        toast.success("Complaint reopened (override recorded)");
      } else {
        await saveFn({
          data: {
            mode: "update",
            complaint_id: complaint.id,
            status: target,
            ...(target === "ASSIGNED" ? { assigned_to: warden } : {}),
            ...(target === "RESOLVED" ? { resolution_summary: text } : {}),
          },
        });
        toast.success(
          target === "ASSIGNED"
            ? "Complaint assigned"
            : target === "RESOLVED"
              ? "Marked resolved"
              : "Work started",
        );
      }
      onDone();
      onClose();
    } catch (e) {
      setConfirmReopen(false);
      toast.error(getErrorMessage(e, "We couldn't update the complaint."));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    setTouched(true);
    if (error) return;
    if (target === "REOPENED") setConfirmReopen(true);
    else void run();
  };

  const title =
    target === "ASSIGNED"
      ? "Assign complaint"
      : target === "IN_PROGRESS"
        ? "Start working on this complaint?"
        : target === "RESOLVED"
          ? "Resolve complaint"
          : "Reopen override";

  return (
    <>
      <Dialog open={!confirmReopen} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
        <DialogContent className="grid-cols-1 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <ComplaintNumberPill number={complaint.complaint_number} />
              <span className="truncate">{complaint.title}</span>
            </DialogDescription>
          </DialogHeader>

          {target === "ASSIGNED" ? (
            <div className="space-y-1.5">
              <Label>Warden</Label>
              <Select value={warden} onValueChange={setWarden}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a warden" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((w) => (
                    <SelectItem key={w.user_id} value={w.user_id}>
                      {w.name}
                    </SelectItem>
                  ))}
                  {wardens && options.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No wardens cover this complaint’s block.
                    </div>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {target === "IN_PROGRESS" ? (
            <p className="text-sm text-muted-foreground">
              The complaint moves from {statusLabel(complaint.status).toLowerCase()} to in progress.
            </p>
          ) : null}
          {target === "RESOLVED" || target === "REOPENED" ? (
            <div className="space-y-1.5">
              {target === "REOPENED" ? (
                <p className="text-sm text-muted-foreground">
                  An exceptional action outside the student’s 48-hour reopen window. Your name, the
                  time and your reason are recorded in the complaint history.
                </p>
              ) : null}
              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setTouched(true);
                }}
                rows={4}
                aria-label={target === "RESOLVED" ? "Resolution summary" : "Reason for reopening"}
                placeholder={
                  target === "RESOLVED"
                    ? "Example: Water leakage repaired and plumbing issue fixed."
                    : "Why is this complaint being reopened?"
                }
              />
            </div>
          ) : null}
          {touched && error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || (touched && !!error)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {target === "ASSIGNED"
                ? "Assign"
                : target === "IN_PROGRESS"
                  ? "Start working"
                  : target === "RESOLVED"
                    ? "Mark resolved"
                    : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReopen} onOpenChange={(o) => (!busy ? setConfirmReopen(o) : null)}>
        <AlertDialogContent className="grid-cols-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this complaint?</AlertDialogTitle>
            <AlertDialogDescription>
              {complaint.complaint_number} will return to Reopened status. The override and your
              reason will be recorded in its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              Confirm reopen override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Quick action: pick an open complaint (unassigned by default) and a warden for it. */
export function AssignWardenDialog({
  propertyId,
  wardens,
  onClose,
  onDone,
}: {
  propertyId: string;
  wardens: WardenData | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const saveFn = useServerFn(saveAdminComplaint);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(true);
  const [complaint, setComplaint] = useState<PropertyComplaint | null>(null);
  const [warden, setWarden] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useDebouncedValue(search.trim(), 250);
  const listQ = useAssignableComplaints(propertyId, q, unassignedOnly, true);
  const options = useMemo(
    () => (complaint ? wardensForBlock(wardens?.assignable ?? [], complaint.block_id) : []),
    [wardens, complaint],
  );

  const assign = async () => {
    if (!complaint || !warden) return;
    setBusy(true);
    try {
      await saveFn({
        data: { mode: "update", complaint_id: complaint.id, assigned_to: warden },
      });
      toast.success(
        `${complaint.complaint_number} assigned to ${wardens?.names.get(warden) ?? "the warden"}`,
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "We couldn't assign the complaint."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign warden</DialogTitle>
          <DialogDescription>
            Pick an open complaint and the warden who should handle it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Complaint</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={unassignedOnly} onCheckedChange={setUnassignedOnly} />
                Unassigned only
              </label>
            </div>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="h-auto min-h-11 w-full justify-between rounded-xl py-2 font-normal"
                >
                  {complaint ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <ComplaintNumberPill number={complaint.complaint_number} />
                      <span className="truncate">{complaint.title}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search open complaints…</span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Number, title, student or room…"
                  />
                  <CommandList>
                    {listQ.isLoading ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
                    ) : listQ.isError ? (
                      <div className="py-6 text-center text-sm text-destructive">
                        Couldn’t load complaints. Please try again.
                      </div>
                    ) : (
                      <CommandEmpty>
                        {unassignedOnly
                          ? "No unassigned open complaints match."
                          : "No open complaints match."}
                      </CommandEmpty>
                    )}
                    <CommandGroup>
                      {(listQ.data ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setComplaint(c);
                            setWarden(c.assigned_to ?? "");
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "h-4 w-4",
                              complaint?.id === c.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              <span className="font-mono text-xs">{c.complaint_number}</span> ·{" "}
                              {c.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.is_anonymous ? "Anonymous" : (c.student_full_name ?? "—")}
                              {c.room_number ? ` · ${c.room_number}` : ""}
                              {c.assigned_to
                                ? ` · ${wardens?.names.get(c.assigned_to) ?? "assigned"}`
                                : ""}
                            </p>
                          </div>
                          <ComplaintStatusPill status={c.status} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Warden</Label>
            <Select value={warden} onValueChange={setWarden} disabled={!complaint}>
              <SelectTrigger>
                <SelectValue
                  placeholder={complaint ? "Choose a warden" : "Choose a complaint first"}
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((w) => (
                  <SelectItem key={w.user_id} value={w.user_id}>
                    {w.name}
                  </SelectItem>
                ))}
                {complaint && wardens && options.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No wardens cover this complaint’s block.
                  </div>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={assign}
            disabled={busy || !complaint || !warden || warden === complaint.assigned_to}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
