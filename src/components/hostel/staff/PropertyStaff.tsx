import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, Plus, UserRoundCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { KpiTile } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
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
import { downloadCsv } from "@/lib/csv-export";
import { localDateInTimezone, usePropertyTimezone } from "@/lib/ops";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import {
  DESIGNATION_LABEL,
  effectiveStaffStatus,
  fetchMonthAttendance,
  formatStaffPhone,
  monthStart,
  removeRosterStaff,
  shiftLabel,
  staffKpis,
  staffOnLeaveToday,
  updateRosterStaff,
  useLoginStaff,
  useStaffBlocks,
  useStaffSummary,
  type RosterStaff,
  type StaffDesignation,
  type StaffKpis,
  type StaffStatus,
} from "@/lib/property-staff";
import { StaffDirectoryCard } from "./StaffDirectoryCard";
import { StaffFormDialog, type StaffFormMode } from "./StaffFormDialog";
import { AssignShiftDialog, LeaveRequestsDialog, MarkAttendanceDialog } from "./StaffOpsDialogs";
import { StaffByRoleCard, StaffQuickActionsCard } from "./StaffSideCards";
import { fmtStaffDate } from "./staff-meta";

const STATUS_WORD: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  INACTIVE: "Inactive",
};

type OpenDialog = "assign" | "attendance" | "leave" | null;

/**
 * A property's Staff tab: the staff roster (job designations — Warden,
 * Accountant, Caretaker, Security, Housekeeping, Mess Manager, Maintenance —
 * not app roles), staff KPIs, role split, shifts, daily attendance, leave and a
 * CSV report. App logins for Wardens / Accountants stay in Staff & permissions;
 * a roster row can link to one.
 */
export function PropertyStaff({ property }: { property: OverviewProperty }) {
  const qc = useQueryClient();
  const statsQ = usePropertyOverviewStats(property.id);
  const tzQ = usePropertyTimezone(property.id);
  const today = localDateInTimezone(tzQ.data);
  const summaryQ = useStaffSummary(property.id, today);
  const loginsQ = useLoginStaff(property.tenant_id, property.id);
  const blocksQ = useStaffBlocks(property.id);

  const summary = summaryQ.data ?? null;
  const logins = useMemo(() => loginsQ.data ?? [], [loginsQ.data]);
  const blocks = useMemo(() => blocksQ.data ?? [], [blocksQ.data]);
  const blockNames = useMemo(() => new Map(blocks.map((b) => [b.id, b.name])), [blocks]);
  const staff = useMemo(() => summary?.staff ?? [], [summary]);
  // Who is on leave today (null until known, so the directory's status filter and
  // pills agree with the KPIs). If the summary failed to load there are none.
  const summaryFailed = summaryQ.isError;
  const leaveToday = useMemo(
    () => (summary ? staffOnLeaveToday(summary) : summaryFailed ? [] : null),
    [summary, summaryFailed],
  );

  // Logins with no roster row yet. Only computed once the roster is known.
  const unlinkedLogins = useMemo(() => {
    if (!summary) return [];
    const linked = new Set(staff.map((s) => s.user_id).filter(Boolean));
    return logins.filter((l) => !linked.has(l.user_id));
  }, [summary, staff, logins]);

  const kpis: StaffKpis = useMemo(
    () => (summary ? staffKpis(summary) : { total: 0, active: 0, onDutyToday: 0, onLeave: 0 }),
    [summary],
  );

  const roleCounts = useMemo(() => {
    const out: Partial<Record<StaffDesignation, number>> = {};
    for (const s of staff) out[s.designation] = (out[s.designation] ?? 0) + 1;
    return out;
  }, [staff]);

  const kpiLoading = summaryQ.isLoading;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-staff", property.id] });
  };

  // ----- dialogs -----------------------------------------------------------
  const [form, setForm] = useState<{ key: number; mode: StaffFormMode } | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [removing, setRemoving] = useState<RosterStaff | null>(null);

  /** Actions that need the loaded roster; explain instead of failing silently. */
  const withRoster = (fn: () => void) => () => {
    if (!summary) {
      if (summaryQ.isError) {
        toast.error("Couldn’t load staff", {
          description: "Use Try again above, then retry this action.",
        });
      } else {
        toast.info("Staff are still loading — try again in a moment.");
      }
      return;
    }
    fn();
  };

  const openForm = (mode: StaffFormMode) => setForm({ key: Date.now(), mode });
  const onAddStaff = withRoster(() => openForm({ kind: "create" }));

  const statusMut = useMutation({
    mutationFn: ({ s, status }: { s: RosterStaff; status: StaffStatus }) =>
      updateRosterStaff(s.id, { status }),
    onSuccess: (_, { s, status }) => {
      toast.success(`${s.full_name} is now ${STATUS_WORD[status].toLowerCase()}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (s: RosterStaff) => removeRosterStaff(s.id),
    onSuccess: (_, s) => {
      toast.success(`${s.full_name} removed from staff`);
      setRemoving(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      if (!summary) throw new Error("Staff are still loading — try again in a moment.");
      const month = await fetchMonthAttendance(property.id, today);
      const period = `${fmtStaffDate(monthStart(today))} – ${fmtStaffDate(today)}`;
      downloadCsv(
        `staff-${property.slug}-${today}.csv`,
        [
          "Name",
          "Role",
          "Phone",
          "Email",
          "Block / work area",
          "Shift",
          "Status",
          "Joined on",
          "App login",
          `Present (${period})`,
          "Absent",
          "On leave",
          "Notes",
        ],
        staff.map((s) => {
          const c = month.get(s.id) ?? { present: 0, absent: 0, leave: 0 };
          return [
            s.full_name,
            DESIGNATION_LABEL[s.designation],
            s.phone ? formatStaffPhone(s.phone) : "",
            s.email ?? "",
            s.block_id ? (blockNames.get(s.block_id) ?? "") : (s.work_area ?? ""),
            shiftLabel(s) ?? "",
            STATUS_WORD[effectiveStaffStatus(s, summary.today.get(s.id))],
            s.joined_on ?? "",
            s.user_id ? "Yes" : "No",
            c.present,
            c.absent,
            c.leave,
            s.notes ?? "",
          ];
        }),
      );
      return staff.length;
    },
    onSuccess: (n) => toast.success(`Staff report downloaded (${n} staff)`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <PropertyHero
        property={property}
        blocks={statsQ.data?.blocksCount}
        beds={statsQ.data?.beds.total}
        residents={statsQ.data?.residents}
        isLoadingCounts={statsQ.isLoading}
      />
      <PropertyTabs slug={property.slug} />

      {summaryQ.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <span className="text-foreground">
            Couldn’t load the staff summary. Counts and quick actions may be incomplete.
          </span>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <KpiTile
          icon={Users}
          label="Total staff"
          value={summaryFailed ? null : kpis.total}
          isLoading={kpiLoading}
          caption={summaryFailed ? "Couldn’t load" : "On this property's roster"}
        />
        <KpiTile
          icon={UserRoundCheck}
          label="Active"
          value={summaryFailed ? null : kpis.active}
          isLoading={kpiLoading}
          caption={summaryFailed ? "Couldn’t load" : "Working, not on leave"}
        />
        <KpiTile
          icon={CalendarCheck}
          label="On duty today"
          value={summaryFailed ? null : kpis.onDutyToday}
          isLoading={kpiLoading}
          caption={summaryFailed ? "Couldn’t load" : "Marked present today"}
        />
        <KpiTile
          icon={CalendarClock}
          label="On leave"
          value={summaryFailed ? null : kpis.onLeave}
          isLoading={kpiLoading}
          caption={summaryFailed ? "Couldn’t load" : "On leave today"}
        />
        <Button
          size="lg"
          className="h-14 rounded-2xl px-6 text-base font-semibold shadow-card-ambient sm:col-span-2 xl:col-span-1 xl:h-auto"
          onClick={onAddStaff}
        >
          <Plus className="h-5 w-5" />
          Add staff
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <StaffDirectoryCard
          propertyId={property.id}
          leaveToday={leaveToday}
          logins={unlinkedLogins}
          isLoadingLogins={loginsQ.isLoading}
          loginsError={loginsQ.isError}
          onRetryLogins={() => loginsQ.refetch()}
          blockNames={blockNames}
          actions={{
            onEdit: (s) => openForm({ kind: "edit", staff: s }),
            onStatus: (s, status) => statusMut.mutate({ s, status }),
            onRemove: (s) => setRemoving(s),
            onAddFromLogin: (l) => withRoster(() => openForm({ kind: "create", fromLogin: l }))(),
          }}
        />
        {/* Quick actions first (the user's call): they're the most used, so they sit at the top. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-1 2xl:grid-rows-[auto_1fr]">
          <StaffQuickActionsCard
            onAddStaff={onAddStaff}
            onAssignShift={withRoster(() => setDialog("assign"))}
            onMarkAttendance={withRoster(() => setDialog("attendance"))}
            onLeaveRequests={withRoster(() => setDialog("leave"))}
            onReports={() => exportMut.mutate()}
            isExporting={exportMut.isPending}
          />
          <StaffByRoleCard counts={roleCounts} isLoading={kpiLoading} isError={summaryFailed} />
        </div>
      </div>

      {form ? (
        <StaffFormDialog
          key={form.key}
          open
          onOpenChange={(o) => !o && setForm(null)}
          mode={form.mode}
          tenantId={property.tenant_id}
          propertyId={property.id}
          blocks={blocks}
          onSaved={refresh}
        />
      ) : null}

      {dialog === "assign" ? (
        <AssignShiftDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          staff={staff}
          blocks={blocks}
          onSaved={refresh}
        />
      ) : null}
      {dialog === "attendance" && summary ? (
        <MarkAttendanceDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          staff={staff}
          existing={summary.today}
          today={today}
          tenantId={property.tenant_id}
          propertyId={property.id}
          onSaved={refresh}
        />
      ) : null}
      {dialog === "leave" ? (
        <LeaveRequestsDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          staff={staff}
          today={today}
          tenantId={property.tenant_id}
          propertyId={property.id}
          onSaved={refresh}
        />
      ) : null}

      <AlertDialog
        open={!!removing}
        onOpenChange={(o) => !o && !removeMut.isPending && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.full_name} from staff?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll no longer appear in this property's staff directory. Past attendance stays on
              record.
              {removing?.user_id
                ? " Their app login is not affected — revoke it in Staff & permissions if they're leaving."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removing) removeMut.mutate(removing);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
