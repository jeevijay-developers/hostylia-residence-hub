import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Loader2, Save, Search } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useAttendance, useStudentsInProperty } from "@/lib/ops";
import { bulkMarkAttendance } from "@/lib/operations.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { cn, getErrorMessage } from "@/lib/utils";

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
      <PageHeader
        title="Attendance"
        description="Bulk-mark: default all Present, flag exceptions."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
        <Button size="sm" variant="outline" onClick={() => setAllExcept("PRESENT")}>
          <CheckCheck className="h-4 w-4" /> Mark all Present
        </Button>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
          <SummaryStat label="Total" value={summary.total} />
          <SummaryStat label="Present" value={summary.PRESENT} tone="text-success" />
          <SummaryStat label="Absent" value={summary.ABSENT} tone="text-destructive" />
          <SummaryStat label="Late" value={summary.LATE} tone="text-warning" />
          <SummaryStat label="Leave" value={summary.ON_LEAVE} tone="text-warning" />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by student name, student ID, or room number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
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
            <SelectTrigger>
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
      </div>

      <div className="rounded-md border divide-y">
        {filteredRoster.map((s) => {
          const st = effective(s.id);
          const saved = currentMap[s.id];
          const needsRemark = st !== "PRESENT";
          const remarkValue = remarks[s.id] ?? (overrides[s.id] ? "" : (saved?.notes ?? ""));
          const avatarUrl = s.photo_path
            ? supabase.storage.from("avatars").getPublicUrl(s.photo_path).data.publicUrl
            : undefined;
          return (
            <div
              key={s.id}
              className={cn(
                "space-y-2 p-3",
                needsRemark && !remarkValue.trim() && "border-l-2 border-destructive",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={avatarUrl} alt={s.full_name} />
                    <AvatarFallback className="text-xs">
                      {s.full_name.trim()[0]?.toUpperCase() ?? "S"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.admission_number}
                      {s.roomNumber ? ` · Room ${s.roomNumber}` : ""}
                      {s.blockName ? ` · ${s.blockName}` : ""}
                    </div>
                    {saved && (
                      <div className="mt-0.5">
                        <Badge variant="secondary">
                          Saved: {STATUS_LABEL[saved.status] ?? saved.status}
                          {saved.notes ? ` — ${saved.notes}` : ""}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                <Select
                  value={st}
                  onValueChange={(v) => setOverrides({ ...overrides, [s.id]: v as Status })}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {STATUS_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {needsRemark && (
                <Input
                  placeholder="Remark required — e.g. Sick, Medical Leave, Late Entry, Went Home"
                  value={remarkValue}
                  onChange={(e) => setRemarks({ ...remarks, [s.id]: e.target.value })}
                  className="h-8 text-sm"
                />
              )}
            </div>
          );
        })}
        {studentsQ.data?.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No active students in this property.
          </div>
        )}
        {(studentsQ.data?.length ?? 0) > 0 && filteredRoster.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No students match your filters.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", tone)}>{value}</p>
    </div>
  );
}
