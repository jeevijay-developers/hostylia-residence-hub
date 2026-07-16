import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useAttendance, useStudentsInProperty } from "@/lib/ops";
import { bulkMarkAttendance } from "@/lib/operations.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/warden/attendance")({
  component: WardenAttendancePage,
});

type Status = "PRESENT" | "ABSENT" | "ON_LEAVE" | "OUT_PASS";

function WardenAttendancePage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const studentsQ = useStudentsInProperty(propertyId);
  const attendanceQ = useAttendance(propertyId, date);
  const qc = useQueryClient();
  const mark = useServerFn(bulkMarkAttendance);

  // Local overrides (student_id -> Status)
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const currentMap = useMemo(() => {
    const m: Record<string, Status> = {};
    for (const a of attendanceQ.data ?? []) m[a.student_id] = a.status as Status;
    return m;
  }, [attendanceQ.data]);
  const effective = (id: string): Status => overrides[id] ?? currentMap[id] ?? "PRESENT";

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!propertyId) return;
      const entries = (studentsQ.data ?? []).map((s) => ({
        student_id: s.id,
        status: effective(s.id),
      }));
      await mark({ data: { property_id: propertyId, attendance_date: date, session: "DAILY", entries } });
    },
    onSuccess: () => {
      toast.success("Attendance saved");
      setOverrides({});
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setAllExcept = (target: Status) => {
    const next: Record<string, Status> = {};
    for (const s of studentsQ.data ?? []) if (effective(s.id) !== target) next[s.id] = target;
    setOverrides({ ...overrides, ...next });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Attendance" description="Bulk-mark: default all Present, flag exceptions." />
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Button size="sm" variant="outline" onClick={() => setAllExcept("PRESENT")}>Mark all Present</Button>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="rounded-md border divide-y">
        {(studentsQ.data ?? []).map((s) => {
          const st = effective(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{s.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {currentMap[s.id] ? <Badge variant="secondary">Saved: {currentMap[s.id]}</Badge> : "Not marked"}
                </div>
              </div>
              <Select value={st} onValueChange={(v) => setOverrides({ ...overrides, [s.id]: v as Status })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  <SelectItem value="OUT_PASS">Out (Pass)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
        {studentsQ.data?.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No active students in this property.</div>
        )}
      </div>
    </div>
  );
}
