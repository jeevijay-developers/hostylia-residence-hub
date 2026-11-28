import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarX2,
  CircleCheck,
  CircleX,
  Loader2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DESIGNATION_LABEL,
  addDays,
  cancelStaffLeave,
  recordStaffLeave,
  saveStaffAttendance,
  shiftLabel,
  shiftTimesIssues,
  staffLeaveSchema,
  staffShiftSchema,
  updateRosterStaff,
  useStaffLeaves,
  type RosterStaff,
  type StaffAttendanceStatus,
  type StaffBlock,
  type StaffLeaveFormValues,
  type StaffLeaveInput,
  type StaffShiftFormValues,
  type StaffShiftInput,
} from "@/lib/property-staff";
import { cn } from "@/lib/utils";
import { FieldError, ShiftFields, type ShiftValues } from "./StaffFormDialog";
import { StaffAvatar } from "./staff-display";
import { fmtStaffDate, focusFirstError, issuesToErrors, timeForInput } from "./staff-meta";

function StaffSelect({
  id,
  staff,
  value,
  onChange,
}: {
  id: string;
  staff: RosterStaff[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="mt-1.5">
        <SelectValue placeholder="Choose a staff member" />
      </SelectTrigger>
      <SelectContent>
        {staff.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.full_name} · {DESIGNATION_LABEL[s.designation]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const EMPTY_SHIFT: ShiftValues = {
  block_id: null,
  work_area: "",
  shift_name: "",
  shift_start: "",
  shift_end: "",
};

/** Set one staff member's shift and block / work area. */
export function AssignShiftDialog({
  open,
  onOpenChange,
  staff,
  blocks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: RosterStaff[];
  blocks: StaffBlock[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<StaffShiftFormValues>({ staff_id: "", ...EMPTY_SHIFT });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const assignable = staff.filter((s) => s.status !== "INACTIVE");

  const pick = (id: string) => {
    const s = staff.find((x) => x.id === id);
    setErrors({});
    setValues({
      staff_id: id,
      block_id: s?.block_id ?? null,
      work_area: s?.work_area ?? "",
      shift_name: s?.shift_name ?? "",
      shift_start: timeForInput(s?.shift_start ?? null),
      shift_end: timeForInput(s?.shift_end ?? null),
    });
  };

  const submit = () => {
    const parsed = staffShiftSchema.safeParse(values);
    if (!parsed.success) {
      const next = issuesToErrors([...parsed.error.issues, ...shiftTimesIssues(values)]);
      setErrors(next);
      focusFirstError("as", next);
      return;
    }
    save.mutate(parsed.data);
  };

  const save = useMutation({
    mutationFn: ({ staff_id, ...shift }: StaffShiftInput) => updateRosterStaff(staff_id, shift),
    onSuccess: (_, { staff_id, ...shift }) => {
      const s = staff.find((x) => x.id === staff_id);
      toast.success(
        `Shift saved for ${s?.full_name ?? "staff member"}${shiftLabel(shift) ? ` — ${shiftLabel(shift)}` : ""}`,
      );
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign shift</DialogTitle>
          <DialogDescription>
            Choose who, when they work and where. Night shifts may end the next morning.
          </DialogDescription>
        </DialogHeader>
        {assignable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active staff yet. Add staff first, then assign their shifts.
          </p>
        ) : (
          <form
            className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="sm:col-span-2">
              <Label htmlFor="as-staff">Staff member</Label>
              <StaffSelect
                id="as-staff"
                staff={assignable}
                value={values.staff_id}
                onChange={pick}
              />
              <FieldError message={errors.staff_id} />
            </div>
            {values.staff_id ? (
              <ShiftFields
                idPrefix="as"
                values={values}
                blocks={blocks}
                errors={errors}
                onChange={(p) => {
                  setValues((v) => ({ ...v, ...p }));
                  setErrors({});
                }}
              />
            ) : null}
            <DialogFooter className="gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending || !values.staff_id}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save shift
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const MARK_META: Record<StaffAttendanceStatus, { label: string; icon: LucideIcon; on: string }> = {
  PRESENT: { label: "Present", icon: CircleCheck, on: "border-success bg-success/10 text-success" },
  ABSENT: {
    label: "Absent",
    icon: CircleX,
    on: "border-destructive bg-destructive/10 text-destructive",
  },
  ON_LEAVE: {
    label: "On leave",
    icon: CalendarClock,
    on: "border-warning bg-warning/10 text-warning",
  },
};

/** Today's (property-local) attendance for active staff — Present / Absent / On leave. */
export function MarkAttendanceDialog({
  open,
  onOpenChange,
  staff,
  existing,
  today,
  tenantId,
  propertyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: RosterStaff[];
  existing: Map<string, StaffAttendanceStatus>;
  today: string;
  tenantId: string;
  propertyId: string;
  onSaved: () => void;
}) {
  const active = useMemo(() => staff.filter((s) => s.status === "ACTIVE"), [staff]);
  const [marks, setMarks] = useState<Map<string, StaffAttendanceStatus>>(() => new Map(existing));
  const changed = active.filter((s) => {
    const m = marks.get(s.id);
    return m !== undefined && m !== existing.get(s.id);
  });
  const markedCount = active.filter((s) => marks.has(s.id)).length;

  const setMark = (id: string, status: StaffAttendanceStatus) =>
    setMarks((prev) => new Map(prev).set(id, status));

  const save = useMutation({
    mutationFn: () =>
      saveStaffAttendance({
        tenantId,
        propertyId,
        date: today,
        marks: changed.flatMap((s) => {
          const status = marks.get(s.id);
          return status ? [{ staff_id: s.id, status }] : [];
        }),
      }),
    onSuccess: () => {
      toast.success(`Attendance saved for ${changed.length} staff member(s)`);
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark attendance</DialogTitle>
          <DialogDescription>
            {fmtStaffDate(today)} (property's local date) · {markedCount} of {active.length} active
            staff marked.
          </DialogDescription>
        </DialogHeader>
        {active.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active staff to mark. Staff on leave or inactive aren't listed.
          </p>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMarks((prev) => {
                    const next = new Map(prev);
                    for (const s of active) if (!next.has(s.id)) next.set(s.id, "PRESENT");
                    return next;
                  })
                }
              >
                <Users className="h-4 w-4" />
                Mark the rest present
              </Button>
            </div>
            <ul className="min-w-0 divide-y divide-border/60">
              {active.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StaffAvatar id={s.id} name={s.full_name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{s.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {DESIGNATION_LABEL[s.designation]}
                        {shiftLabel(s) ? ` · ${shiftLabel(s)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 gap-1.5"
                    role="radiogroup"
                    aria-label={`Attendance for ${s.full_name}`}
                  >
                    {(Object.keys(MARK_META) as StaffAttendanceStatus[]).map((k) => {
                      const meta = MARK_META[k];
                      const on = marks.get(s.id) === k;
                      const Icon = meta.icon;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setMark(s.id, k)}
                          className={cn(
                            "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                              ? meta.on
                              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending || changed.length === 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save attendance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Record leave for a staff member over a date range (ON_LEAVE attendance for
 * each day) and see / cancel current and upcoming leave.
 */
export function LeaveRequestsDialog({
  open,
  onOpenChange,
  staff,
  today,
  tenantId,
  propertyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: RosterStaff[];
  today: string;
  tenantId: string;
  propertyId: string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const leavesQ = useStaffLeaves(propertyId, today, open);
  const leaves = leavesQ.data ?? [];
  const names = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const eligible = staff.filter((s) => s.status !== "INACTIVE");

  const [values, setValues] = useState<StaffLeaveFormValues>({
    staff_id: "",
    from: today,
    to: today,
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<StaffLeaveFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors({});
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-staff", propertyId, "leaves"] });
    onSaved();
  };

  const submit = () => {
    const parsed = staffLeaveSchema.safeParse(values);
    if (!parsed.success) {
      const next = issuesToErrors(parsed.error.issues);
      setErrors(next);
      focusFirstError("lv", next);
      return;
    }
    record.mutate(parsed.data);
  };

  const record = useMutation({
    mutationFn: (v: StaffLeaveInput) =>
      recordStaffLeave({
        tenantId,
        propertyId,
        staffId: v.staff_id,
        from: v.from,
        to: v.to,
        note: v.note,
      }),
    onSuccess: (_, v) => {
      const s = names.get(v.staff_id);
      toast.success(
        `Leave recorded for ${s?.full_name ?? "staff member"}: ${fmtStaffDate(v.from)}${v.to !== v.from ? ` – ${fmtStaffDate(v.to)}` : ""}`,
      );
      setValues({ staff_id: "", from: today, to: today, note: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (r: { staff_id: string; from: string; to: string }) =>
      cancelStaffLeave({
        propertyId,
        staffId: r.staff_id,
        from: r.from < today ? today : r.from,
        to: r.to,
      }),
    onSuccess: () => {
      toast.success("Leave cancelled");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Leave requests</DialogTitle>
          <DialogDescription>
            Record approved leave for a staff member. Each day is marked "On leave" in staff
            attendance.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="sm:col-span-2">
            <Label htmlFor="lv-staff">Staff member</Label>
            <StaffSelect
              id="lv-staff"
              staff={eligible}
              value={values.staff_id}
              onChange={(id) => set({ staff_id: id })}
            />
            <FieldError message={errors.staff_id} />
          </div>
          <div>
            <Label htmlFor="lv-from">From</Label>
            <Input
              id="lv-from"
              type="date"
              className="mt-1.5"
              min={today}
              value={values.from}
              onChange={(e) =>
                set({
                  from: e.target.value,
                  to: values.to < e.target.value ? e.target.value : values.to,
                })
              }
            />
            <FieldError message={errors.from} />
          </div>
          <div>
            <Label htmlFor="lv-to">To</Label>
            <Input
              id="lv-to"
              type="date"
              className="mt-1.5"
              min={values.from || today}
              max={values.from ? addDays(values.from, 89) : undefined}
              value={values.to}
              onChange={(e) => set({ to: e.target.value })}
            />
            <FieldError message={errors.to} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lv-note">Reason</Label>
            <Input
              id="lv-note"
              className="mt-1.5"
              maxLength={500}
              value={values.note}
              placeholder="Optional — e.g. family function"
              onChange={(e) => set({ note: e.target.value })}
            />
            <FieldError message={errors.note} />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={record.isPending || !values.staff_id}>
              {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record leave
            </Button>
          </div>
        </form>

        <div className="min-w-0 border-t border-border/60 pt-4">
          <h3 className="text-sm font-semibold text-foreground">Current & upcoming leave</h3>
          {leavesQ.isLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : leavesQ.isError ? (
            <div className="mt-3 text-sm text-muted-foreground">
              Couldn’t load leave.{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => leavesQ.refetch()}>
                Try again
              </Button>
            </div>
          ) : leaves.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No staff leave from today on.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border/60">
              {leaves.map((r) => {
                const s = names.get(r.staff_id);
                return (
                  <li key={r.key} className="flex items-center gap-3 py-2.5">
                    <StaffAvatar id={r.staff_id} name={s?.full_name ?? "?"} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-foreground">
                        {s?.full_name ?? "Removed staff member"}
                      </p>
                      <p className="break-words text-xs text-muted-foreground">
                        {fmtStaffDate(r.from)}
                        {r.to !== r.from ? ` – ${fmtStaffDate(r.to)}` : ""}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(r)}
                    >
                      <CalendarX2 className="h-4 w-4" />
                      Cancel
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
