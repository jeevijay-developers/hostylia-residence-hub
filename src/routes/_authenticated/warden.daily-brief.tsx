import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  FileWarning,
  MessageSquareWarning,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Utensils,
  X,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { StatusBadge } from "@/components/complaints/SlaBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import {
  useAttendance,
  useGatePasses,
  useMessMenusForDate,
  useStudentsInProperty,
  useVisitors,
} from "@/lib/ops";
import { useComplaints } from "@/lib/complaint";
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

interface ActivityItem {
  type: string;
  detail: string;
  at: string;
}

interface PendingKycDoc {
  id: string;
  document_type: string;
  original_filename: string;
  owner_id: string;
  created_at: string;
  student: { id: string; full_name: string; admission_number: string } | null;
}

function useKycQueue() {
  return useQuery({
    queryKey: ["kyc-pending-queue"],
    queryFn: async (): Promise<PendingKycDoc[]> => {
      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, owner_id, created_at")
        .eq("owner_type", "STUDENT")
        .eq("verification_status", "PENDING")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ownerIds = [...new Set((docs ?? []).map((d) => d.owner_id))];
      if (ownerIds.length === 0) return [];
      const { data: students } = await supabase
        .from("students")
        .select("id, full_name, admission_number")
        .in("id", ownerIds);
      const byId = new Map((students ?? []).map((s) => [s.id, s]));
      return (docs ?? []).map((d) => ({ ...d, student: byId.get(d.owner_id) ?? null }));
    },
  });
}

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
  const menusQ = useMessMenusForDate(propertyId, today);
  const kycQ = useKycQueue();

  const approvedTodayQ = useQuery({
    queryKey: ["gate-passes-approved-today", propertyId, today],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_passes")
        .select("id, pass_number, warden_approved_at, status")
        .eq("property_id", propertyId!)
        .eq("status", "APPROVED")
        .gte("warden_approved_at", `${today}T00:00:00`)
        .order("warden_approved_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const recentActivity = useMemo(() => {
    const items: ActivityItem[] = [];

    const attendanceGroups = new Map<string, number>();
    for (const a of attendanceQ.data ?? []) {
      attendanceGroups.set(a.marked_at, (attendanceGroups.get(a.marked_at) ?? 0) + 1);
    }
    for (const [at, count] of attendanceGroups) {
      items.push({
        type: "Attendance Submitted",
        detail: `${count} student${count === 1 ? "" : "s"} marked`,
        at,
      });
    }

    for (const c of complaintsQ.data ?? []) {
      const updatedToday = c.updated_at?.slice(0, 10) === today;
      const resolvedToday = c.status === "RESOLVED" && c.resolved_at?.slice(0, 10) === today;
      if (resolvedToday) {
        items.push({
          type: "Complaint Resolved",
          detail: `${c.complaint_number} — ${c.title}`,
          at: c.resolved_at!,
        });
      } else if (updatedToday) {
        items.push({
          type: "Complaint Updated",
          detail: `${c.complaint_number} — ${c.title}`,
          at: c.updated_at,
        });
      }
    }

    for (const g of approvedTodayQ.data ?? []) {
      if (g.warden_approved_at) {
        items.push({ type: "Gate Pass Approved", detail: g.pass_number, at: g.warden_approved_at });
      }
    }

    for (const m of menusQ.data ?? []) {
      if (m.published_at) {
        items.push({
          type: "Menu Published",
          detail: `${m.meal}${m.title ? ` — ${m.title}` : ""}`,
          at: m.published_at,
        });
      }
    }

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);
  }, [attendanceQ.data, complaintsQ.data, approvedTodayQ.data, menusQ.data, today]);

  return (
    <div className="space-y-6">
      {/* <PageHeader title="Daily brief" description="Your day at a glance." /> */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> KYC Approvals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {kycQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!kycQ.isLoading && (kycQ.data ?? []).length === 0 && (
            <EmptyState title="No KYC documents awaiting review" />
          )}
          {(kycQ.data ?? []).map((doc) => (
            <KycQueueRow key={doc.id} doc={doc} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {recentActivity.map((item, i) => (
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
  );
}

function KycQueueRow({ doc }: { doc: PendingKycDoc }) {
  const qc = useQueryClient();
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["kyc-pending-queue"] });
    qc.invalidateQueries({ queryKey: ["student-docs", doc.owner_id] });
    qc.invalidateQueries({ queryKey: ["student-docs-status", doc.owner_id] });
    qc.invalidateQueries({ queryKey: ["kyc-complete", doc.owner_id] });
  };

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("documents")
        .update({
          verification_status: "VERIFIED",
          verified_by: userId,
          verified_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${doc.document_type} approved`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve"),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason is required");
      const { error } = await supabase
        .from("documents")
        .update({
          verification_status: "REJECTED",
          verified_by: userId,
          verified_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
        })
        .eq("id", doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`${doc.document_type} rejected`);
      setRejectOpen(false);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reject"),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
      <div>
        <p className="text-sm font-medium">
          {doc.student?.full_name ?? "Unknown student"}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {doc.student?.admission_number}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {doc.document_type} • {doc.original_filename}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject {doc.document_type}</DialogTitle>
            </DialogHeader>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this document being rejected?"
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={reject.isPending || !reason.trim()}
                onClick={() => reject.mutate()}
              >
                <FileWarning className="h-4 w-4" /> Confirm reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
          <CheckCircle2 className="h-4 w-4" /> Approve
        </Button>
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

function ActivityIcon({ type }: { type: string }) {
  const Icon =
    type === "Gate Pass Approved"
      ? DoorOpen
      : type === "Menu Published"
        ? Utensils
        : type === "Attendance Submitted"
          ? CalendarCheck
          : type.startsWith("Complaint")
            ? MessageSquareWarning
            : Activity;
  return (
    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
