import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  ClipboardCheck,
  Download,
  FileChartColumn,
  Loader2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { LeaveReviewPanel } from "@/components/attendance/LeaveReviewPanel";
import { AttendanceReportPanel } from "@/components/reports/panels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv-export";
import { usePropertyLeaveRequests } from "@/lib/leave";
import {
  TODAY_STATUS_META,
  formatClock,
  usePropertyPendingLeaveCount,
  useTodayAttendanceExport,
} from "@/lib/property-attendance";
import { getErrorMessage } from "@/lib/utils";

/** Largest page the roster server fn accepts. */
const EXPORT_PAGE = 5000;

const tileClass =
  "relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:text-sm";

function TileBody({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <span className="leading-tight">{children}</span>
    </>
  );
}

/** Pending leave requests for this property, reviewed with the shared LeaveReviewPanel. */
function LeaveRequestsBody({ propertyId }: { propertyId: string }) {
  const pendingQ = usePropertyLeaveRequests(propertyId, "PENDING");
  if (pendingQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (pendingQ.isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">Couldn’t load leave requests.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => pendingQ.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if ((pendingQ.data ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <CalendarCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">No leave requests to review</p>
        <p className="mt-1 text-sm text-muted-foreground">
          New requests from residents will appear here.
        </p>
      </div>
    );
  }
  return <LeaveReviewPanel propertyId={propertyId} />;
}

/**
 * Shortcuts into existing attendance flows: the marking screen, a CSV of
 * today's statuses, leave review (shared LeaveReviewPanel) and the monthly
 * attendance report (shared AttendanceReportPanel).
 */
export function AttendanceQuickActions({
  propertyId,
  propertySlug,
}: {
  propertyId: string;
  propertySlug: string;
}) {
  const qc = useQueryClient();
  const [leavesOpen, setLeavesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pending = usePropertyPendingLeaveCount(propertyId).data ?? 0;
  const fetchRoster = useTodayAttendanceExport();

  const exportToday = async () => {
    setExporting(true);
    try {
      const fetchPage = (page: number) =>
        fetchRoster({
          data: {
            property_id: propertyId,
            block_id: null,
            floor_id: null,
            status: null,
            q: "",
            page,
            page_size: EXPORT_PAGE,
          },
        });
      const res = await fetchPage(0);
      const rows = [...res.rows];
      // The server caps a page at EXPORT_PAGE rows; read on until every resident is in.
      for (let page = 1; rows.length < res.total; page += 1) {
        const next = await fetchPage(page);
        if (next.rows.length === 0) break;
        rows.push(...next.rows);
      }
      if (rows.length === 0) {
        toast.info("There are no active residents to export.");
        return;
      }
      const time = (iso: string | null) => (iso ? formatClock(iso, res.timeZone) : "");
      downloadCsv(
        `attendance-${propertySlug}-${res.date}.csv`,
        [
          "Resident",
          "Admission no.",
          "Block",
          "Floor",
          "Room",
          "Bed",
          "Status",
          "Check in",
          "Check out",
          "Back in",
          "Remark",
        ],
        rows.map((r) => [
          r.full_name,
          r.admission_number,
          r.block ?? "",
          r.floor ?? "",
          r.room ?? "",
          r.bed ?? "",
          TODAY_STATUS_META[r.status].label,
          time(r.checkInAt),
          time(r.checkOutAt),
          time(r.backAt),
          r.remark ?? "",
        ]),
      );
      if (rows.length < res.total) {
        toast.warning(
          `Exported ${rows.length.toLocaleString("en-IN")} of ${res.total.toLocaleString("en-IN")} residents — the list changed while exporting. Export again for the full list.`,
        );
      } else {
        toast.success(`Exported ${rows.length.toLocaleString("en-IN")} residents.`);
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't export today's attendance. Please try again."));
    } finally {
      setExporting(false);
    }
  };

  const onLeavesOpenChange = (open: boolean) => {
    setLeavesOpen(open);
    // An approved leave changes today's statuses.
    if (!open) qc.invalidateQueries({ queryKey: ["property-attendance", propertyId] });
  };

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          Quick actions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center">
        <div className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4 2xl:grid-cols-2">
          <Link
            to="/admin/attendance"
            className={tileClass}
            title="Open the daily attendance roster"
          >
            <TileBody icon={ClipboardCheck}>Mark attendance</TileBody>
          </Link>
          <button
            type="button"
            className={tileClass}
            disabled={exporting}
            aria-busy={exporting}
            onClick={exportToday}
            title="Download today’s attendance of every active resident as CSV"
          >
            {exporting ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                <span className="leading-tight">Exporting…</span>
              </>
            ) : (
              <TileBody icon={Download}>Export today</TileBody>
            )}
          </button>
          <button
            type="button"
            className={tileClass}
            onClick={() => setLeavesOpen(true)}
            title="Review pending leave requests"
          >
            <TileBody icon={CalendarCheck}>Manage leaves</TileBody>
            {pending > 0 ? (
              <span className="absolute right-2 top-2 rounded-full bg-info/10 px-1.5 text-[11px] font-semibold text-info tabular-nums">
                {pending.toLocaleString("en-IN")}
                <span className="sr-only"> pending</span>
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={tileClass}
            onClick={() => setReportOpen(true)}
            title="Monthly attendance summary per resident"
          >
            <TileBody icon={FileChartColumn}>Attendance report</TileBody>
          </button>
        </div>
      </CardContent>

      <Dialog open={leavesOpen} onOpenChange={onLeavesOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leave requests</DialogTitle>
            <DialogDescription>
              Approving a request marks the resident On leave for every day it covers.
            </DialogDescription>
          </DialogHeader>
          <LeaveRequestsBody propertyId={propertyId} />
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Attendance report</DialogTitle>
            <DialogDescription>
              Monthly attendance summary for each resident of this property.
            </DialogDescription>
          </DialogHeader>
          <AttendanceReportPanel propertyId={propertyId} totalStudentsTile />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
