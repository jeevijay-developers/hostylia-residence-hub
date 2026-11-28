import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Loader2, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { STATUS_META } from "@/components/hostel/complaints/complaint-display";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  reopenComplaintWithOverride,
  useCanOverrideReopen,
  useComplaintCategories,
  type CategoryRow,
} from "@/lib/complaint";
import {
  fromLocalInput,
  formatDuration,
  toLocalInput,
  usePropertyBlocks,
  usePropertyRooms,
  useResident,
  useResidentSearch,
  useRoomBeds,
  wardensForBlock,
  type PropertyComplaint,
  type ResidentOption,
  type WardenOption,
} from "@/lib/property-complaints";
import { createComplaintCategory, saveAdminComplaint } from "@/lib/property-complaints.functions";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  adminComplaintFieldsSchema,
  adminCreatableStatuses,
  complaintCategoryCreateSchema,
  complaintPriorityEnum,
  COMPLAINT_STATUS_TRANSITIONS,
  reopenOverrideReasonError,
  resolutionSummaryError,
  type ComplaintPriority,
  type ComplaintStatus,
} from "@/schemas/complaint";

const NONE = "__none";

/** Form fields top to bottom, so the error shown is the first one on screen. */
const FIELD_ORDER = [
  "student_id",
  "room_id",
  "bed_id",
  "title",
  "description",
  "category_id",
  "priority",
  "status",
  "resolution_summary",
  "assigned_to",
  "created_at",
  "sla_due_at",
] as const;

type CategoryOption = Pick<
  CategoryRow,
  "id" | "name" | "sla_minutes" | "default_priority" | "display_order"
>;

export interface WardenData {
  assignable: WardenOption[];
  names: Map<string, string>;
}

function addMinutes(localValue: string, minutes: number) {
  const iso = fromLocalInput(localValue);
  if (!iso) return "";
  return toLocalInput(new Date(new Date(iso).getTime() + minutes * 60_000).toISOString());
}

/** Searchable picker over this property's residents (searched in the database). */
function ResidentPicker({
  propertyId,
  value,
  onChange,
}: {
  propertyId: string;
  value: ResidentOption | null;
  onChange: (r: ResidentOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 250);
  const resultsQ = useResidentSearch(propertyId, q, open);
  const results = resultsQ.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-between rounded-xl font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? `${value.full_name} · ${value.admission_number}` : "Search residents…"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Name or admission number…"
          />
          <CommandList>
            {resultsQ.isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : resultsQ.isError ? (
              <div className="py-6 text-center text-sm text-destructive">
                Couldn’t search residents. Please try again.
              </div>
            ) : (
              <CommandEmpty>No residents match.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((r) => (
                <CommandItem
                  key={r.id}
                  value={r.id}
                  onSelect={() => {
                    onChange(r);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("h-4 w-4", value?.id === r.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.admission_number}
                      {r.stay?.room ? ` · Room ${r.stay.room}` : ""}
                      {r.stay?.bed ? ` / ${r.stay.bed}` : ""}
                      {r.status !== "ACTIVE"
                        ? ` · ${r.status.replaceAll("_", " ").toLowerCase()}`
                        : ""}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RoomPicker({
  rooms,
  blockNames,
  value,
  onChange,
  isLoading,
}: {
  rooms: { id: string; room_number: string; block_id: string | null }[];
  blockNames: Map<string, string>;
  value: string | null;
  onChange: (id: string | null) => void;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = rooms.find((r) => r.id === value);
  const label = (r: { room_number: string; block_id: string | null }) =>
    `${r.room_number}${r.block_id && blockNames.get(r.block_id) ? ` · ${blockNames.get(r.block_id)}` : ""}`;
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-between rounded-xl font-normal"
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current ? `Room ${label(current)}` : isLoading ? "Loading rooms…" : "No room"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Room number…" />
          <CommandList>
            <CommandEmpty>No rooms match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no room"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                No room
              </CommandItem>
              {rooms.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${label(r)} ${r.id}`}
                  onSelect={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value === r.id ? "opacity-100" : "opacity-0")} />
                  Room {label(r)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Inline "New category" (name, SLA hours, default priority) for this property. */
function NewCategoryForm({
  propertyId,
  onCreated,
  onCancel,
}: {
  propertyId: string;
  onCreated: (c: CategoryRow) => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createComplaintCategory);
  const [name, setName] = useState("");
  const [hours, setHours] = useState("24");
  const [priority, setPriority] = useState<ComplaintPriority>("MEDIUM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = complaintCategoryCreateSchema.safeParse({
      property_id: propertyId,
      name,
      sla_hours: hours.trim() === "" ? Number.NaN : Number(hours),
      default_priority: priority,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the category details.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createFn({ data: parsed.data });
      qc.setQueryData<CategoryRow[]>(["complaint-categories", propertyId], (old) =>
        [...(old ?? []), created].sort((a, b) => a.display_order - b.display_order),
      );
      qc.invalidateQueries({ queryKey: ["complaint-categories", propertyId] });
      toast.success(`Category “${created.name}” added`);
      onCreated(created);
    } catch (e) {
      setError(getErrorMessage(e, "We couldn't create the category."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 p-3">
      <p className="text-xs font-medium text-foreground">New category for this property</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_110px_130px]">
        <div className="space-y-1">
          <Label htmlFor="cat-name" className="text-xs">
            Name
          </Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Plumbing"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cat-sla" className="text-xs">
            SLA (hours)
          </Label>
          <Input
            id="cat-sla"
            type="number"
            min={0.25}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Default priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as ComplaintPriority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {complaintPriorityEnum.options.map((p) => (
                <SelectItem key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add category
        </Button>
      </div>
    </div>
  );
}

/**
 * New / Edit complaint. Every column the Complaints tab shows is set here: student (this
 * property's residents), room / bed (defaults to the student's current bed), title, description,
 * category (with inline New category), priority, status (only the workflow's allowed moves; a
 * resolution summary to resolve, the reopen override with a reason to reopen), warden, raised time
 * and SLA due (defaults to the category SLA from the raised time). The complaint number is
 * generated by the system and read-only.
 */
export function ComplaintFormDialog({
  property,
  complaint,
  wardens,
  onClose,
  onSaved,
}: {
  property: { id: string; tenant_id: string };
  /** null = New complaint. */
  complaint: PropertyComplaint | null;
  wardens: WardenData | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = complaint !== null;
  const saveFn = useServerFn(saveAdminComplaint);
  const categoriesQ = useComplaintCategories(property.id);
  const roomsQ = usePropertyRooms(property.id);
  const blocksQ = usePropertyBlocks(property.id);
  const canOverrideQ = useCanOverrideReopen({
    tenant_id: property.tenant_id,
    property_id: property.id,
    status: complaint?.status ?? "OPEN",
  });
  const existingStudentQ = useResident(
    property.id,
    // Never look up the student behind an anonymous complaint.
    complaint && !complaint.is_anonymous ? complaint.student_id : null,
  );

  const initialRaised = toLocalInput(complaint?.created_at ?? new Date().toISOString());
  const initialSla = toLocalInput(complaint?.sla_due_at ?? null);

  const [student, setStudent] = useState<ResidentOption | null>(null);
  const [roomId, setRoomId] = useState<string | null>(complaint?.room_id ?? null);
  const [bedId, setBedId] = useState<string | null>(complaint?.bed_id ?? null);
  const [title, setTitle] = useState(complaint?.title ?? "");
  const [description, setDescription] = useState(complaint?.description ?? "");
  const [categoryId, setCategoryId] = useState(complaint?.category_id ?? "");
  const [priority, setPriority] = useState<ComplaintPriority>(
    (complaint?.priority as ComplaintPriority | undefined) ?? "MEDIUM",
  );
  const [priorityTouched, setPriorityTouched] = useState(isEdit);
  const [status, setStatus] = useState<ComplaintStatus>(
    (complaint?.status as ComplaintStatus | undefined) ?? "OPEN",
  );
  const [summary, setSummary] = useState(complaint?.resolution_summary ?? "");
  const [reopenReason, setReopenReason] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(complaint?.assigned_to ?? null);
  const [raisedAt, setRaisedAt] = useState(initialRaised);
  const [slaDue, setSlaDue] = useState(initialSla);
  const [slaTouched, setSlaTouched] = useState(isEdit);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  // The reopen override is its own database call, run before the field save. Once it has gone
  // through, a failed field save must not repeat it (the complaint is already Reopened).
  const [reopenedDone, setReopenedDone] = useState(false);
  const baseStatus = reopenedDone ? "REOPENED" : complaint?.status;

  const categories = useMemo((): CategoryOption[] => {
    const list: CategoryOption[] = categoriesQ.data ?? [];
    // Keep a complaint's current (since switched-off) category selectable.
    if (complaint && complaint.category_id && !list.some((c) => c.id === complaint.category_id)) {
      return [
        ...list,
        {
          id: complaint.category_id,
          name: complaint.category_name ?? "Current category",
          sla_minutes: 0,
          default_priority: complaint.priority,
          display_order: Number.MAX_SAFE_INTEGER,
        },
      ];
    }
    return list;
  }, [categoriesQ.data, complaint]);
  const noCategories = categoriesQ.isSuccess && (categoriesQ.data ?? []).length === 0;
  const category = categories.find((c) => c.id === categoryId) ?? null;

  const rooms = roomsQ.data ?? [];
  const blockNames = useMemo(
    () => new Map((blocksQ.data ?? []).map((b) => [b.id, b.name])),
    [blocksQ.data],
  );
  const bedsQ = useRoomBeds(roomId);
  const blockId = roomId
    ? (rooms.find((r) => r.id === roomId)?.block_id ?? complaint?.block_id ?? null)
    : null;

  const wardenOptions = useMemo(() => {
    const list = wardensForBlock(wardens?.assignable ?? [], blockId);
    if (assignedTo && !list.some((w) => w.user_id === assignedTo)) {
      list.push({
        user_id: assignedTo,
        name: `${wardens?.names.get(assignedTo) ?? "Current assignee"} (current)`,
        block_id: null,
      });
    }
    return list;
  }, [wardens, blockId, assignedTo]);

  const currentStudent = student ?? existingStudentQ.data ?? null;
  const studentId = student?.id ?? complaint?.student_id ?? null;

  // Status choices: creation states, or the workflow's allowed moves from the current status.
  const statusOptions: ComplaintStatus[] = useMemo(() => {
    if (!complaint) return [...adminCreatableStatuses];
    const from = (baseStatus ?? complaint.status) as ComplaintStatus;
    const next = (COMPLAINT_STATUS_TRANSITIONS[from] ?? []).filter(
      (s) => s !== "CLOSED" && s !== "REOPENED",
    );
    const reopen =
      (from === "RESOLVED" || from === "CLOSED") && canOverrideQ.data === true
        ? (["REOPENED"] as ComplaintStatus[])
        : [];
    return Array.from(new Set<ComplaintStatus>([from, ...next, ...reopen]));
  }, [complaint, baseStatus, canOverrideQ.data]);

  const pickCategory = (id: string, from?: CategoryOption) => {
    setCategoryId(id);
    const c = from ?? categories.find((x) => x.id === id);
    if (!c) return;
    if (!priorityTouched) setPriority(c.default_priority as ComplaintPriority);
    if (!slaTouched && c.sla_minutes > 0) setSlaDue(addMinutes(raisedAt, c.sla_minutes));
  };

  const pickStudent = (r: ResidentOption) => {
    setStudent(r);
    if (r.stay) {
      setRoomId(r.stay.room_id);
      setBedId(r.stay.bed_id);
      const nextBlock = rooms.find((x) => x.id === r.stay?.room_id)?.block_id ?? null;
      if (
        assignedTo &&
        !wardensForBlock(wardens?.assignable ?? [], nextBlock).some((w) => w.user_id === assignedTo)
      ) {
        setAssignedTo(null);
      }
    }
  };

  const pickRoom = (id: string | null) => {
    setRoomId(id);
    setBedId(null);
    const nextBlock = id ? (rooms.find((r) => r.id === id)?.block_id ?? null) : null;
    if (
      assignedTo &&
      assignedTo !== complaint?.assigned_to &&
      !wardensForBlock(wardens?.assignable ?? [], nextBlock).some((w) => w.user_id === assignedTo)
    ) {
      setAssignedTo(null);
    }
  };

  const pickWarden = (v: string) => {
    const id = v === NONE ? null : v;
    setAssignedTo(id);
    if (id && (status === "OPEN" || status === "REOPENED") && statusOptions.includes("ASSIGNED")) {
      setStatus("ASSIGNED");
    }
    if (!id && !isEdit && status === "ASSIGNED") setStatus("OPEN");
  };

  const changeRaised = (v: string) => {
    setRaisedAt(v);
    if (!slaTouched && category && category.sla_minutes > 0) {
      setSlaDue(addMinutes(v, category.sla_minutes));
    }
  };

  const enteringResolved = status === "RESOLVED" && baseStatus !== "RESOLVED";
  const summaryChanged =
    status === "RESOLVED" && summary.trim() !== (complaint?.resolution_summary ?? "").trim();
  const reopening = status === "REOPENED" && baseStatus !== "REOPENED";

  // Validation (shown after the first Save attempt).
  const raisedIso = fromLocalInput(raisedAt);
  const slaIso = fromLocalInput(slaDue);
  const fieldsCheck = adminComplaintFieldsSchema.safeParse({
    student_id: studentId ?? "",
    room_id: roomId,
    bed_id: bedId,
    title,
    description,
    category_id: categoryId,
    priority,
    status,
    resolution_summary: status === "RESOLVED" ? summary : null,
    assigned_to: assignedTo,
    created_at: raisedIso ?? "",
    sla_due_at: slaIso ?? "",
  });
  let formError: string | null = null;
  if (!fieldsCheck.success) {
    // The first problem in the order the fields appear on the form (not the schema's key order).
    const issues = fieldsCheck.error.issues;
    const issue =
      FIELD_ORDER.map((f) => issues.find((i) => i.path[0] === f)).find((i) => i !== undefined) ??
      issues[0];
    const field = issue?.path[0];
    formError =
      field === "student_id"
        ? "Choose the student."
        : field === "category_id"
          ? "Choose a category."
          : field === "title"
            ? "Enter a title of 3 to 160 characters."
            : field === "description"
              ? "Enter a description of 5 to 4,000 characters."
              : field === "created_at"
                ? "Enter the raised date and time."
                : field === "sla_due_at"
                  ? "Enter the SLA due date and time."
                  : `${String(field ?? "A field")}: ${issue?.message ?? "check this value"}`.replace(
                      /^(\w)/,
                      (m) => m.toUpperCase(),
                    );
  } else if (raisedIso && slaIso && new Date(slaIso) <= new Date(raisedIso)) {
    formError = "The SLA due time must be after the raised time.";
  } else if (raisedIso && new Date(raisedIso).getTime() > Date.now() + 5 * 60_000) {
    formError = "The raised time can't be in the future.";
  } else if (status === "ASSIGNED" && !assignedTo) {
    formError = "Choose the warden this complaint is assigned to.";
  } else if ((enteringResolved || summaryChanged) && resolutionSummaryError(summary)) {
    formError = resolutionSummaryError(summary);
  } else if (reopening && reopenOverrideReasonError(reopenReason)) {
    formError = reopenOverrideReasonError(reopenReason);
  }

  const save = async () => {
    setSubmitted(true);
    if (formError || !studentId || !raisedIso || !slaIso) return;
    setSaving(true);
    let reopenApplied = reopenedDone;
    try {
      if (!complaint) {
        const res = await saveFn({
          data: {
            mode: "create",
            property_id: property.id,
            student_id: studentId,
            room_id: roomId,
            bed_id: bedId,
            title,
            description,
            category_id: categoryId,
            priority,
            // A chosen warden always makes a new complaint Assigned (the database does the same).
            status: status === "OPEN" && assignedTo ? "ASSIGNED" : status,
            resolution_summary: status === "RESOLVED" ? summary : null,
            assigned_to: assignedTo,
            created_at: raisedIso,
            sla_due_at: slaIso,
          },
        });
        toast.success(`Complaint ${res.complaint_number} created`);
        if (res.warning) toast.info(res.warning);
      } else {
        if (reopening) {
          await reopenComplaintWithOverride(complaint.id, reopenReason);
          reopenApplied = true;
          setReopenedDone(true);
          // Refresh the lists now: the reopen stands even if the field save below fails.
          onSaved();
        }
        const res = await saveFn({
          data: {
            mode: "update",
            complaint_id: complaint.id,
            student_id: complaint.is_anonymous ? undefined : studentId,
            room_id: roomId,
            bed_id: bedId,
            title,
            description,
            category_id: categoryId,
            priority,
            status: status === "REOPENED" ? undefined : status,
            resolution_summary: status === "RESOLVED" ? summary : undefined,
            assigned_to: assignedTo,
            created_at: raisedAt !== initialRaised ? raisedIso : undefined,
            sla_due_at: slaDue !== initialSla ? slaIso : undefined,
          },
        });
        toast.success(`Complaint ${res.complaint_number} saved`);
      }
      onSaved();
      onClose();
    } catch (e) {
      const message = getErrorMessage(e, "We couldn't save the complaint.");
      toast.error(
        reopenApplied
          ? `The complaint was reopened, but your other changes weren't saved: ${message}`
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const showError = submitted && formError;

  return (
    <Dialog open onOpenChange={(o) => (!o && !saving ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] grid-cols-1 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit complaint" : "New complaint"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Changes are recorded in the audit log. Status moves follow the complaint workflow."
              : "Raise a complaint on a resident's behalf. The complaint number is generated automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {complaint ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cmp-number">Complaint number</Label>
              <Input
                id="cmp-number"
                value={complaint.complaint_number}
                readOnly
                className="font-mono"
              />
            </div>
          ) : null}

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Student</Label>
            {complaint?.is_anonymous ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Raised anonymously — the student’s identity stays hidden and can’t be changed.
              </p>
            ) : (
              <ResidentPicker
                propertyId={property.id}
                value={currentStudent}
                onChange={pickStudent}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Room</Label>
            <RoomPicker
              rooms={rooms}
              blockNames={blockNames}
              value={roomId}
              onChange={pickRoom}
              isLoading={roomsQ.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bed</Label>
            <Select
              value={bedId ?? NONE}
              onValueChange={(v) => setBedId(v === NONE ? null : v)}
              disabled={!roomId}
            >
              <SelectTrigger>
                <SelectValue placeholder="No specific bed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {roomId ? "Whole room" : "Choose a room first"}
                </SelectItem>
                {(bedsQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    Bed {b.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cmp-title">Title</Label>
            <Input
              id="cmp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="e.g. Wi-Fi not working"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cmp-desc">Description</Label>
            <Textarea
              id="cmp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="What is wrong, where, and since when?"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Category</Label>
              {!noCategories && !newCategoryOpen ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setNewCategoryOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> New category
                </Button>
              ) : null}
            </div>
            {noCategories || newCategoryOpen ? (
              <>
                {noCategories ? (
                  <p className="text-xs text-muted-foreground">
                    This property has no complaint categories yet. Add one to continue.
                  </p>
                ) : null}
                <NewCategoryForm
                  propertyId={property.id}
                  onCancel={noCategories ? undefined : () => setNewCategoryOpen(false)}
                  onCreated={(c) => {
                    setNewCategoryOpen(false);
                    pickCategory(c.id, c);
                  }}
                />
              </>
            ) : (
              <Select value={categoryId} onValueChange={(v) => pickCategory(v)}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      categoriesQ.isLoading ? "Loading categories…" : "Choose a category"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.sla_minutes > 0 ? ` · SLA ${formatDuration(c.sla_minutes)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {categoriesQ.isError ? (
              <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
                Couldn’t load this property’s categories.
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => categoriesQ.refetch()}
                  disabled={categoriesQ.isFetching}
                >
                  Try again
                </Button>
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => {
                setPriority(v as ComplaintPriority);
                setPriorityTouched(true);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {complaintPriorityEnum.options.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ComplaintStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "REOPENED" && baseStatus !== "REOPENED"
                      ? "Reopened (override)"
                      : (STATUS_META[s]?.label ?? s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status === "RESOLVED" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cmp-summary">Resolution summary</Label>
              <Textarea
                id="cmp-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="Example: Water leakage repaired and plumbing issue fixed."
              />
            </div>
          ) : null}
          {reopenedDone ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The reopen override has been applied. Save again to keep your other changes.
            </p>
          ) : null}
          {reopening ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cmp-reopen">Reason for the reopen override</Label>
              <Textarea
                id="cmp-reopen"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
                placeholder="Why is this complaint being reopened?"
              />
              <p className="text-xs text-muted-foreground">
                An exceptional action outside the student’s 48-hour reopen window. Your name, the
                time and this reason are recorded in the complaint history.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Assigned warden</Label>
            <Select value={assignedTo ?? NONE} onValueChange={pickWarden}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {isEdit ? "Unassigned" : "Auto-assign (the block / property warden, if any)"}
                </SelectItem>
                {wardenOptions.map((w) => (
                  <SelectItem key={w.user_id} value={w.user_id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {wardens && wardens.assignable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No wardens can take complaints at this property yet.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            {/* Same label row height as SLA due (which can carry the reset link), so the inputs line up. */}
            <div className="flex h-5 items-center">
              <Label htmlFor="cmp-raised">Raised at</Label>
            </div>
            <Input
              id="cmp-raised"
              type="datetime-local"
              value={raisedAt}
              onChange={(e) => changeRaised(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex h-5 items-center justify-between gap-2">
              <Label htmlFor="cmp-sla">SLA due</Label>
              {category && category.sla_minutes > 0 ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setSlaDue(addMinutes(raisedAt, category.sla_minutes));
                    setSlaTouched(false);
                  }}
                  title="Raised time plus the category's SLA"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Category SLA ({formatDuration(category.sla_minutes)})
                </button>
              ) : null}
            </div>
            <Input
              id="cmp-sla"
              type="datetime-local"
              value={slaDue}
              onChange={(e) => {
                setSlaDue(e.target.value);
                setSlaTouched(true);
              }}
            />
          </div>
        </div>

        {showError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || (submitted && !!formError)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? "Save changes" : "Create complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
