import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CheckCheck,
  Loader2,
  Save,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
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
import { Badge } from "@/components/ui/badge";
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
import { usePropertyStore } from "@/stores/property-store";
import { useAttendance, useStudentsInProperty } from "@/lib/ops";
import { bulkMarkAttendance } from "@/lib/operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn, getErrorMessage } from "@/lib/utils";
import { AttendanceReportPanel } from "@/components/reports/panels";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  component: AdminAttendancePage,
});

type Status = "PRESENT" | "ABSENT" | "ON_LEAVE";
const STATUS_LABEL: Record<Status, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
};
const STATUSES = Object.keys(STATUS_LABEL) as Status[];

function AdminAttendancePage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const studentsQ = useStudentsInProperty(propertyId);
  const attendanceQ = useAttendance(propertyId, date);
  const qc = useQueryClient();
  const mark = useServerFn(bulkMarkAttendance);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roomFilter, setRoomFilter] = useState("ALL");

  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const currentMap = useMemo(() => {
    const m: Record<string, { id: string; status: Status; notes: string | null }> = {};
    for (const a of attendanceQ.data ?? [])
      m[a.student_id] = { id: a.id, status: a.status as Status, notes: a.notes };
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
    const counts: Record<Status, number> = { PRESENT: 0, ABSENT: 0, ON_LEAVE: 0 };
    for (const s of roster) counts[effective(s.id)]++;
    return { total: roster.length, ...counts };
  }, [roster, effective]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!propertyId) return;
      if (date !== new Date().toISOString().slice(0, 10)) {
        throw new Error("Attendance can only be marked for today.");
      }
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

  const deleteMut = useMutation({
    mutationFn: async (attendanceId: string) => {
      const { error } = await supabase.from("attendance").delete().eq("id", attendanceId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Attendance record deleted");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Failed to delete attendance record")),
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

  if (!propertyId) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Select a property from the switcher first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl pb-10 overflow-x-hidden">
      {/* Monthly Attendance Summary Panel */}
      <AttendanceReportPanel propertyId={propertyId} />

      {/* Controls Bar for Daily Attendance */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-3 pt-4 border-t border-border/60 w-full">
        <div className="relative w-full sm:w-auto sm:shrink-0">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-background/90 border-border text-foreground rounded-xl h-9 px-3 pl-9 text-xs w-full sm:h-11 sm:px-3.5 sm:pl-10 sm:text-sm sm:font-medium sm:w-48"
          />
          <CalendarIcon className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground pointer-events-none" />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-none">
          <Button
            variant="outline"
            onClick={() => setAllExcept("PRESENT")}
            className="flex-1 sm:flex-none shrink-0 justify-center border-border bg-background/80 hover:bg-accent text-foreground rounded-xl h-9 px-3 text-xs sm:h-11 sm:px-4 sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 cursor-pointer"
          >
            <CheckCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mark all Present</span>
          </Button>

          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex-1 sm:flex-none shrink-0 justify-center bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-gradient-to-r dark:from-amber-500 dark:via-amber-500 dark:to-amber-600 dark:hover:from-amber-400 dark:hover:to-amber-500 dark:text-slate-950 font-bold h-9 px-4 text-xs sm:h-11 sm:px-6 sm:text-sm rounded-xl shadow-lg shadow-primary/20 dark:shadow-amber-500/20 border border-primary/30 dark:border-amber-300/40 transition-all duration-200 hover:shadow-primary/30 dark:hover:shadow-amber-500/30 active:scale-[0.99] flex items-center gap-1.5 sm:gap-2 cursor-pointer"
          >
            {saveMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-primary-foreground dark:text-slate-950" />
            ) : (
              <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground dark:text-slate-950 stroke-[2.5]" />
            )}
            <span>{saveMut.isPending ? "Saving…" : "Save"}</span>
          </Button>
        </div>
      </div>

      {/* Daily Metrics Summary Row */}
      <div className="rounded-xl sm:rounded-2xl border border-border/80 bg-card p-3 sm:p-4 shadow-xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
          <div className="flex items-center gap-2.5 sm:gap-3.5 p-1.5 sm:p-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-sm shadow-purple-500/10">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Total</p>
              <p className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{summary.total}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 p-1.5 sm:p-2 sm:pt-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-sm shadow-emerald-500/10">
              <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Present</p>
              <p className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.PRESENT}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 p-1.5 sm:p-2 pt-3 sm:pt-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0 shadow-sm shadow-amber-500/10">
              <UserX className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Absent</p>
              <p className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-400">{summary.ABSENT}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 p-1.5 sm:p-2 pt-3 sm:pt-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 shadow-sm shadow-rose-500/10">
              <UserMinus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">On leave</p>
              <p className="text-lg sm:text-2xl font-bold text-rose-600 dark:text-rose-400">{summary.ON_LEAVE}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2 sm:space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 sm:left-3.5 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by student name, student ID, or room"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-background/90 border-border text-foreground rounded-xl h-9 pl-9 text-xs sm:h-11 sm:pl-10 sm:text-sm font-medium"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-background/90 border-border text-foreground rounded-xl h-9 text-xs sm:h-10 sm:text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground">
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roomFilter} onValueChange={setRoomFilter}>
            <SelectTrigger className="bg-background/90 border-border text-foreground rounded-xl h-9 text-xs sm:h-10 sm:text-sm">
              <SelectValue placeholder="Room" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground">
              <SelectItem value="ALL">All rooms</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r} value={r}>
                  Room {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Student Roster List */}
      {studentsQ.isLoading || attendanceQ.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading student roster…
        </div>
      ) : (
        <div className="rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden divide-y divide-border/60">
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
                  "space-y-3 p-4 transition-colors hover:bg-accent/20",
                  needsRemark && !remarkValue.trim() && "border-l-4 border-rose-500/80 bg-rose-500/5",
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 shrink-0 border border-border">
                      <AvatarImage src={avatarUrl} alt={s.full_name} />
                      <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                        {s.full_name.trim()[0]?.toUpperCase() ?? "S"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground text-sm truncate">{s.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.admission_number}
                        {s.roomNumber ? ` · Room ${s.roomNumber}` : ""}
                        {s.blockName ? ` · ${s.blockName}` : ""}
                      </div>
                      {saved && (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                            Saved: {STATUS_LABEL[saved.status] ?? saved.status}
                            {saved.notes ? ` — ${saved.notes}` : ""}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Select
                      value={st}
                      onValueChange={(v) => setOverrides({ ...overrides, [s.id]: v as Status })}
                    >
                      <SelectTrigger className="w-36 bg-background border-border text-foreground rounded-xl h-10 text-sm font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        {STATUSES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {STATUS_LABEL[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {saved && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all shrink-0"
                        onClick={() => setPendingDelete({ id: saved.id, name: s.full_name })}
                        aria-label={`Delete attendance record for ${s.full_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {needsRemark && (
                  <Input
                    placeholder="Remark required — e.g. Sick, Medical Leave, Went Home"
                    value={remarkValue}
                    onChange={(e) => setRemarks({ ...remarks, [s.id]: e.target.value })}
                    className="bg-background/90 border-border text-foreground rounded-xl h-9 text-xs"
                  />
                )}
              </div>
            );
          })}
          {studentsQ.data?.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No active students in this property.
            </div>
          )}
          {(studentsQ.data?.length ?? 0) > 0 && filteredRoster.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No students match your filters.
            </div>
          )}
        </div>
      )}

      {/* Delete Record Dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete attendance record?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This clears {pendingDelete?.name}'s attendance for {date} back to unmarked. This can't
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMut.mutate(pendingDelete.id)}
              disabled={deleteMut.isPending}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

