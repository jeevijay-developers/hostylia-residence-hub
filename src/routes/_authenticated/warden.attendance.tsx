import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Clock,
  Loader2,
  Save,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useAttendance, useStudentsInProperty } from "@/lib/ops";
import { bulkMarkAttendance } from "@/lib/operations.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { cn, getErrorMessage, toneClasses, toneTextClasses, type SemanticTone } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/warden/attendance")({
  component: WardenAttendancePage,
});

type Status = "PRESENT" | "ABSENT" | "LATE" | "ON_LEAVE";
const STATUS_LABEL: Record<Status, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  ON_LEAVE: "Leave",
};
const STATUS_TONE: Record<Status, SemanticTone> = {
  PRESENT: "success",
  ABSENT: "destructive",
  LATE: "warning",
  ON_LEAVE: "info",
};
const STATUS_ICON: Record<Status, typeof UserCheck> = {
  PRESENT: UserCheck,
  ABSENT: UserX,
  LATE: Clock,
  ON_LEAVE: CalendarDays,
};
const STATUSES = Object.keys(STATUS_LABEL) as Status[];

function WardenAttendancePage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const studentsQ = useStudentsInProperty(propertyId);
  const attendanceQ = useAttendance(propertyId, date);
  const qc = useQueryClient();
  const mark = useServerFn(bulkMarkAttendance);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roomFilter, setRoomFilter] = useState("ALL");

  // Local overrides (student_id -> Status / remark text)
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const toggleExpanded = (id: string) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const currentMap = useMemo(() => {
    const m: Record<string, { status: Status; notes: string | null }> = {};
    for (const a of attendanceQ.data ?? [])
      m[a.student_id] = { status: a.status as Status, notes: a.notes };
    return m;
  }, [attendanceQ.data]);
  const effective = useCallback(
    (id: string): Status => overrides[id] ?? currentMap[id]?.status ?? "PRESENT",
    [overrides, currentMap],
  );

  const roster = useMemo(() => {
    return (studentsQ.data ?? []).map((s) => {
      const activeAllocation = (s.allocations ?? []).find((a) => a.status === "ACTIVE") ?? null;
      return {
        ...s,
        roomNumber: activeAllocation?.rooms?.room_number ?? null,
        blockName: activeAllocation?.blocks?.name ?? null,
      };
    });
  }, [studentsQ.data]);

  const rooms = useMemo(
    () =>
      Array.from(new Set(roster.map((s) => s.roomNumber).filter((r): r is string => !!r))).sort(),
    [roster],
  );

  const filteredRoster = useMemo(() => {
    let list = roster;
    if (statusFilter !== "ALL") list = list.filter((s) => effective(s.id) === statusFilter);
    if (roomFilter !== "ALL") list = list.filter((s) => s.roomNumber === roomFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          s.admission_number.toLowerCase().includes(q) ||
          (s.roomNumber ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [roster, statusFilter, roomFilter, search, effective]);

  const summary = useMemo(() => {
    const counts: Record<Status, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, ON_LEAVE: 0 };
    for (const s of roster) counts[effective(s.id)]++;
    return { total: roster.length, ...counts };
  }, [roster, effective]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!propertyId) return;
      const missingRemark = roster.find(
        (s) =>
          effective(s.id) !== "PRESENT" && !(remarks[s.id] ?? currentMap[s.id]?.notes ?? "").trim(),
      );
      if (missingRemark) {
        throw new Error(`Add a remark for ${missingRemark.full_name} before saving`);
      }
      const entries = roster.map((s) => {
        const status = effective(s.id);
        return {
          student_id: s.id,
          status,
          notes:
            status === "PRESENT"
              ? undefined
              : (remarks[s.id] ?? currentMap[s.id]?.notes ?? "").trim(),
        };
      });
      await mark({
        data: { property_id: propertyId, attendance_date: date, session: "DAILY", entries },
      });
    },
    onSuccess: () => {
      toast.success("Attendance saved");
      setOverrides({});
      setRemarks({});
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Failed to save attendance")),
  });

  const setAllExcept = (target: Status) => {
    const next: Record<string, Status> = {};
    const clearedRemarks = { ...remarks };
    for (const s of roster) {
      if (effective(s.id) !== target) next[s.id] = target;
      if (target === "PRESENT") delete clearedRemarks[s.id];
    }
    setOverrides({ ...overrides, ...next });
    setRemarks(clearedRemarks);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by student name, student ID, or room number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-3 overflow-x-auto">
        <div className="relative shrink-0">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44 rounded-full border-border bg-card pl-9 pr-9 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 shrink-0 rounded-full border-border bg-card">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger className="w-36 shrink-0 rounded-full border-border bg-card">
            <SelectValue placeholder="Room" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All rooms</SelectItem>
            {rooms.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 rounded-full"
          variant="outline"
          onClick={() => setAllExcept("PRESENT")}
        >
          <CheckCheck className="h-4 w-4" /> Mark all Present
        </Button>
        <Button
          className="flex-[1.5] rounded-full"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          {saveMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveMut.isPending ? "Saving…" : "Save Attendance"}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <AttendanceStat icon={UserCheck} label="Present" value={summary.PRESENT} tone="success" />
        <AttendanceStat icon={UserX} label="Absent" value={summary.ABSENT} tone="destructive" />
        <AttendanceStat icon={Clock} label="Late" value={summary.LATE} tone="warning" />
      </div>

      <div className="space-y-3">
        {filteredRoster.map((s) => {
          const st = effective(s.id);
          const saved = currentMap[s.id];
          const needsRemark = st !== "PRESENT";
          const remarkValue = remarks[s.id] ?? (overrides[s.id] ? "" : (saved?.notes ?? ""));
          const avatarUrl = s.photo_path
            ? supabase.storage.from("avatars").getPublicUrl(s.photo_path).data.publicUrl
            : undefined;
          const missingRemark = needsRemark && !remarkValue.trim();
          const isOpen = expandedIds[s.id] ?? missingRemark;
          const tone = STATUS_TONE[st];

          return (
            <Collapsible
              key={s.id}
              open={isOpen}
              onOpenChange={() => toggleExpanded(s.id)}
              className={cn(
                "rounded-2xl border border-border bg-card p-3",
                missingRemark && "border-destructive/40",
              )}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-3 text-left">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={avatarUrl} alt={s.full_name} />
                  <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                    {s.full_name.trim()[0]?.toUpperCase() ?? "S"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.full_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.admission_number}
                    {s.roomNumber ? ` · Room ${s.roomNumber}` : ""}
                    {s.blockName ? ` · ${s.blockName}` : ""}
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>

              <div className="mt-3">
                <span
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                    toneClasses[tone],
                  )}
                >
                  {(() => {
                    const StatusIcon = STATUS_ICON[st];
                    return <StatusIcon className="h-3.5 w-3.5 shrink-0" />;
                  })()}
                  <span className="truncate">
                    {STATUS_LABEL[st]}
                    {remarkValue.trim() ? ` — ${remarkValue.trim()}` : ""}
                  </span>
                </span>
              </div>

              <CollapsibleContent className="mt-3 space-y-3">
                <RadioGroup
                  value={st}
                  onValueChange={(v) => setOverrides({ ...overrides, [s.id]: v as Status })}
                  className="gap-2"
                >
                  {STATUSES.filter((v) => v !== "ON_LEAVE").map((v) => {
                    const StatusIcon = STATUS_ICON[v];
                    const optionTone = STATUS_TONE[v];
                    const selected = st === v;
                    return (
                      <label
                        key={v}
                        htmlFor={`${s.id}-${v}`}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors",
                          selected && toneClasses[optionTone],
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <RadioGroupItem
                            id={`${s.id}-${v}`}
                            value={v}
                            className={selected ? toneTextClasses[optionTone] : undefined}
                          />
                          <span className="text-sm font-medium">{STATUS_LABEL[v]}</span>
                        </span>
                        <StatusIcon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            selected ? toneTextClasses[optionTone] : "text-muted-foreground",
                          )}
                        />
                      </label>
                    );
                  })}
                </RadioGroup>
                {needsRemark && (
                  <Input
                    placeholder="Remark required — e.g. Sick, Medical Leave, Late Entry, Went Home"
                    value={remarkValue}
                    onChange={(e) => setRemarks({ ...remarks, [s.id]: e.target.value })}
                    className="h-9 text-sm"
                  />
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        {studentsQ.data?.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No active students in this property.
          </div>
        )}
        {(studentsQ.data?.length ?? 0) > 0 && filteredRoster.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No students match your filters.
          </div>
        )}
      </div>
    </div>
  );
}

function AttendanceStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof UserCheck;
  label: string;
  value: number;
  tone: SemanticTone;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-4", toneClasses[tone])}>
      <svg
        aria-hidden="true"
        viewBox="0 0 120 40"
        preserveAspectRatio="none"
        className={cn("absolute inset-x-0 bottom-0 h-10 w-full opacity-30", toneTextClasses[tone])}
      >
        <path
          d="M0 28 C 15 16, 30 36, 45 24 S 75 12, 90 26 S 110 32, 120 20 L 120 40 L 0 40 Z"
          fill="currentColor"
        />
      </svg>
      <div className="relative flex items-center justify-between gap-2">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card",
            toneTextClasses[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="relative mt-3 text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("relative font-display text-3xl font-bold", toneTextClasses[tone])}>
        {value}
      </p>
    </div>
  );
}
