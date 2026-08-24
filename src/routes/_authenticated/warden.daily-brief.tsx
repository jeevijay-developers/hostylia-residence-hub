import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  ChevronRight,
  DoorOpen,
  MessageSquareWarning,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Utensils,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KycApprovalQueueCard } from "@/components/students/KycApprovalQueue";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useAttendance, useGatePasses, useStudentsInProperty, useVisitors } from "@/lib/ops";
import { useComplaints } from "@/lib/complaint";
import { useRecentActivity } from "@/lib/warden-activity";
import { ActivityIcon } from "@/components/warden/ActivityIcon";
import { decideGatePass } from "@/lib/operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn, getErrorMessage, toneClasses, type SemanticTone } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/warden/daily-brief")({
  component: WardenBriefPage,
});

const PENDING_COMPLAINT_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_STUDENT",
  "REOPENED",
];

const QUICK_ACTIONS: { label: string; to: string; icon: LucideIcon; tone: SemanticTone }[] = [
  { label: "Mark Attendance", to: "/warden/attendance", icon: CalendarCheck, tone: "info" },
  {
    label: "View Complaints",
    to: "/warden/complaints",
    icon: MessageSquareWarning,
    tone: "warning",
  },
  { label: "Approve Gate Pass", to: "/warden/gate", icon: DoorOpen, tone: "success" },
  { label: "Publish Mess Menu", to: "/warden/mess", icon: Utensils, tone: "primary" },
];

function priorityTone(priority: string): SemanticTone {
  if (priority === "URGENT" || priority === "HIGH") return "destructive";
  if (priority === "MEDIUM") return "warning";
  return "muted";
}

const PRIORITY_DOT_CLASSES: Record<SemanticTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  muted: "bg-muted-foreground",
};

function WardenBriefPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const propQ = useMyStaffProperty(userId);
  const propertyId = propQ.data ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();

  const studentsQ = useStudentsInProperty(propertyId);
  const attendanceQ = useAttendance(propertyId, today);
  const complaintsQ = useComplaints({ propertyId });
  // Matches warden.gate.tsx's own "pending" definition (APPROVAL_FILTER_STATUSES.PENDING):
  // a request awaiting parent sign-off is still a pending gate pass a warden can act on —
  // decideGatePass accepts PENDING_WARDEN/PENDING_PARENT/DRAFT for a warden decision — so
  // filtering to PENDING_WARDEN alone hid still-pending, still-actionable requests.
  const gatePassesQ = useGatePasses(propertyId, ["PENDING_WARDEN", "PENDING_PARENT"]);
  const visitorsQ = useVisitors(propertyId);
  const { items: recentActivity } = useRecentActivity(propertyId);

  const decide = useServerFn(decideGatePass);
  const decideMut = useMutation({
    mutationFn: async (v: { pass_id: string; decision: "APPROVED" | "REJECTED" }) =>
      decide({ data: { pass_id: v.pass_id, role: "WARDEN", decision: v.decision } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update gate pass")),
  });

  const attendanceCounts = useMemo(() => {
    const currentMap = new Map<string, string>();
    for (const a of attendanceQ.data ?? []) currentMap.set(a.student_id, a.status);
    const counts = { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, ON_LEAVE: 0 };
    for (const s of studentsQ.data ?? []) {
      counts.total++;
      const status = currentMap.get(s.id) ?? "PRESENT";
      if (status in counts) counts[status as keyof typeof counts]++;
    }
    return counts;
  }, [studentsQ.data, attendanceQ.data]);

  const pendingComplaints = useMemo(() => {
    return (complaintsQ.data ?? [])
      .filter((c) => PENDING_COMPLAINT_STATUSES.includes(c.status))
      .sort((a, b) => new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime());
  }, [complaintsQ.data]);

  const visitorsToday = useMemo(() => {
    return (visitorsQ.data ?? []).filter((v) => {
      const expected = v.expected_at?.slice(0, 10);
      const checkedIn = v.checked_in_at?.slice(0, 10);
      return expected === today || checkedIn === today;
    });
  }, [visitorsQ.data, today]);

  return (
    <div className="space-y-6">
      {/* <PageHeader title="Daily brief" description="Your day at a glance." /> */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
        <KpiCard
          icon={Users}
          label="Total Students"
          value={studentsQ.data?.length ?? 0}
          loading={studentsQ.isLoading}
          tone="muted"
          bareIcon
        />
        <KpiCard
          icon={UserCheck}
          label="Present"
          value={attendanceCounts.PRESENT}
          loading={studentsQ.isLoading}
          tone="success"
          bareIcon
        />
        <KpiCard
          icon={UserX}
          label="Absent"
          value={attendanceCounts.ABSENT}
          loading={attendanceQ.isLoading}
          tone="destructive"
          bareIcon
        />
        <KpiCard
          icon={MessageSquareWarning}
          label="Pending Complaints"
          value={pendingComplaints.length}
          loading={complaintsQ.isLoading}
          tone="warning"
          bareIcon
        />
        <KpiCard
          icon={DoorOpen}
          label="Pending Gate Pass"
          value={gatePassesQ.data?.length ?? 0}
          loading={gatePassesQ.isLoading}
          tone="warning"
          bareIcon
        />
        <KpiCard
          icon={UserPlus}
          label="Visitors Today"
          value={visitorsToday.length}
          loading={visitorsQ.isLoading}
          tone="info"
          bareIcon
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-6 lg:col-span-2">
          <Link
            to="/warden/mess"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Utensils className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">Manage Mess Menu</p>
                <p className="text-xs text-muted-foreground">Publish or update today's mess menu</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>

          <KycApprovalQueueCard />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            {recentActivity.length > 5 && (
              <Button asChild variant="ghost" size="sm" className="-mr-2 text-primary">
                <Link to="/warden/activity">
                  See all <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {recentActivity.slice(0, 5).map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <ActivityIcon type={item.type} />
                  <div>
                    <div className="font-medium">{item.type}</div>
                    <div className="text-xs text-muted-foreground">{item.detail}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.at).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {recentActivity.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet today.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone ? `text-lg font-semibold ${tone}` : "text-lg font-semibold"}>{value}</p>
    </div>
  );
}

