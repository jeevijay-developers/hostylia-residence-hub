import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  DoorOpen,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiSummaryCard } from "@/components/dashboard/KpiCard";
import { CameraQrScanner } from "@/components/gate/CameraQrScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import {
  useGatePasses,
  useGateEventsFeed,
  useVisitors,
  useStudentsInProperty,
  type GatePassRow,
  type VisitorRow,
  type GateEventRow,
} from "@/lib/ops";
import {
  decideGatePass,
  scanGatePass,
  checkVisitor,
  createVisitor,
} from "@/lib/operations.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn, getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/warden/gate")({
  component: WardenGatePage,
});

type RoomAllocation = { status: string; rooms?: { room_number: string } | null };
type PassWithStudent = GatePassRow & {
  students?: { full_name?: string; allocations?: RoomAllocation[] } | null;
};
type VisitorWithRelations = VisitorRow & {
  students?: {
    full_name?: string;
    allocations?: RoomAllocation[];
  } | null;
};

function roomOf(allocations: RoomAllocation[] | undefined): string | undefined {
  return allocations?.find((a) => a.status === "ACTIVE")?.rooms?.room_number;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const AVATAR_TONES = [
  "bg-info/15 text-info",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-primary/15 text-primary",
];

function avatarTone(index: number) {
  return AVATAR_TONES[index % AVATAR_TONES.length];
}

/** Maps gate-pass/visitor status strings to the existing semantic tone classes (same palette as StepBadge below) so badges are distinguishable at a glance. */
function statusBadgeClass(status: string): string {
  if (status.includes("REJECT") || status === "CANCELLED")
    return "border-transparent bg-destructive/15 text-destructive";
  if (status.includes("PENDING") || status === "REQUESTED")
    return "border-transparent bg-warning/15 text-warning";
  if (
    status.includes("APPROVED") ||
    status.includes("ACTIVE") ||
    status.includes("CHECKED_IN") ||
    status === "COMPLETED"
  ) {
    return "border-transparent bg-success/15 text-success";
  }
  return "border-transparent bg-muted text-muted-foreground";
}

type FeedEvent = GateEventRow & {
  students?: { full_name?: string; allocations?: RoomAllocation[] } | null;
  visitors?: {
    name?: string;
    phone?: string;
    students?: { full_name?: string; allocations?: RoomAllocation[] } | null;
  } | null;
};

const APPROVAL_FILTER_STATUSES: Record<string, string[]> = {
  PENDING: ["PENDING_WARDEN", "PENDING_PARENT"],
  APPROVED: ["APPROVED", "ACTIVE", "COMPLETED"],
  REJECTED: ["REJECTED"],
  EXPIRED: ["EXPIRED"],
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function WardenGatePage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const pending = useGatePasses(propertyId, ["PENDING_WARDEN", "PENDING_PARENT"]);
  const active = useGatePasses(propertyId, ["APPROVED", "ACTIVE"]);
  const events = useGateEventsFeed(propertyId);
  const visitors = useVisitors(propertyId);
  const qc = useQueryClient();
  const decide = useServerFn(decideGatePass);
  const scan = useServerFn(scanGatePass);
  const chkVis = useServerFn(checkVisitor);
  const createVis = useServerFn(createVisitor);
  const today = todayStr();

  const [tab, setTab] = useState("approvals");
  const [approvalFilter, setApprovalFilter] = useState<
    "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"
  >("PENDING");
  const filteredApprovals = useGatePasses(propertyId, APPROVAL_FILTER_STATUSES[approvalFilter]);
  const [approvalSearch, setApprovalSearch] = useState("");
  const [visitorSearch, setVisitorSearch] = useState("");
  const [feedSearch, setFeedSearch] = useState("");
  const [feedFilter, setFeedFilter] = useState<"all" | "entry" | "exit" | "alerts">("all");
  const [registerOpen, setRegisterOpen] = useState(false);

  const decideMut = useMutation({
    mutationFn: async (v: { pass_id: string; decision: "APPROVED" | "REJECTED" }) =>
      decide({ data: { pass_id: v.pass_id, role: "WARDEN", decision: v.decision } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Failed")),
  });

  const [passIdInput, setPassIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [scanDirection, setScanDirection] = useState<"IN" | "OUT">("OUT");
  const scanMut = useMutation({
    mutationFn: async (v: { pass_id: string; token: string; direction: "IN" | "OUT" }) =>
      scan({ data: v }),
    onSuccess: () => {
      toast.success("Scanned");
      setTokenInput("");
      qc.invalidateQueries({ queryKey: ["gate-events"] });
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Failed")),
  });

  const visMut = useMutation({
    mutationFn: async (v: { visitor_id: string; direction: "IN" | "OUT" }) => chkVis({ data: v }),
    onSuccess: () => {
      toast.success("Recorded");
      qc.invalidateQueries({ queryKey: ["visitors"] });
      qc.invalidateQueries({ queryKey: ["gate-events"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Failed")),
  });

  const visitorsToday = useMemo(
    () =>
      ((visitors.data as VisitorWithRelations[]) ?? []).filter(
        (v) => v.expected_at?.slice(0, 10) === today,
      ),
    [visitors.data, today],
  );
  // KPI card: a visitor counts as "today" whether they were scheduled for
  // today, walked in unscheduled and were registered today (expected_at is
  // optional — see RegisterVisitorDialog — so a same-day walk-in has no
  // expected_at at all and was previously invisible here), or checked in
  // today. Rejected/cancelled entries aren't a "valid" visitor. Kept
  // separate from `visitorsToday` above, which drives the "Expected Today"
  // tab and must stay strictly expected-at-based.
  const validVisitorsToday = useMemo(
    () =>
      ((visitors.data as VisitorWithRelations[]) ?? []).filter((v) => {
        if (v.status === "REJECTED" || v.status === "CANCELLED") return false;
        return (
          v.expected_at?.slice(0, 10) === today ||
          v.checked_in_at?.slice(0, 10) === today ||
          v.created_at?.slice(0, 10) === today
        );
      }),
    [visitors.data, today],
  );
  const visitorsInside = useMemo(
    () =>
      ((visitors.data as VisitorWithRelations[]) ?? []).filter((v) => v.status === "CHECKED_IN"),
    [visitors.data],
  );
  const entriesToday = useMemo(
    () =>
      (events.data ?? []).filter((e) => e.direction === "IN" && e.event_at.slice(0, 10) === today)
        .length,
    [events.data, today],
  );
  const exitsToday = useMemo(
    () =>
      (events.data ?? []).filter((e) => e.direction === "OUT" && e.event_at.slice(0, 10) === today)
        .length,
    [events.data, today],
  );

  const [detailsPass, setDetailsPass] = useState<PassWithStudent | null>(null);
  const [detailsVisitor, setDetailsVisitor] = useState<VisitorWithRelations | null>(null);
  const [visitorView, setVisitorView] = useState<"all" | "expected" | "inside" | "checked_out">(
    "all",
  );
  const visitorsCheckedOut = useMemo(
    () =>
      ((visitors.data as VisitorWithRelations[]) ?? []).filter((v) => v.status === "CHECKED_OUT"),
    [visitors.data],
  );
  const visitorViewList: VisitorWithRelations[] = useMemo(
    () =>
      visitorView === "expected"
        ? visitorsToday
        : visitorView === "inside"
          ? visitorsInside
          : visitorView === "checked_out"
            ? visitorsCheckedOut
            : ((visitors.data as VisitorWithRelations[]) ?? []),
    [visitorView, visitorsToday, visitorsInside, visitorsCheckedOut, visitors.data],
  );
  const visibleVisitors = useMemo(() => {
    const q = visitorSearch.trim().toLowerCase();
    if (!q) return visitorViewList;
    return visitorViewList.filter((v) => {
      const room = roomOf(v.students?.allocations)?.toLowerCase() ?? "";
      return (
        v.name.toLowerCase().includes(q) ||
        (v.students?.full_name ?? "").toLowerCase().includes(q) ||
        room.includes(q) ||
        v.phone.toLowerCase().includes(q)
      );
    });
  }, [visitorViewList, visitorSearch]);

  const approvalsList = useMemo(() => {
    const q = approvalSearch.trim().toLowerCase();
    const list = (filteredApprovals.data as PassWithStudent[]) ?? [];
    if (!q) return list;
    return list.filter((p) => {
      const room = roomOf(p.students?.allocations)?.toLowerCase() ?? "";
      return (p.students?.full_name ?? "").toLowerCase().includes(q) || room.includes(q);
    });
  }, [filteredApprovals.data, approvalSearch]);

  const feedList = useMemo(() => {
    let list = (events.data as FeedEvent[]) ?? [];
    if (feedFilter === "entry") list = list.filter((e) => e.direction === "IN");
    else if (feedFilter === "exit") list = list.filter((e) => e.direction === "OUT");
    else if (feedFilter === "alerts") list = list.filter((e) => e.is_late);
    const q = feedSearch.trim().toLowerCase();
    if (q)
      list = list.filter((e) =>
        (e.students?.full_name ?? e.visitors?.name ?? "").toLowerCase().includes(q),
      );
    return list;
  }, [events.data, feedFilter, feedSearch]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiSummaryCard
          icon={DoorOpen}
          label="Pending Approvals"
          value={pending.data?.length ?? 0}
          caption="Requires your action"
          loading={pending.isLoading}
          tone="warning"
          onNavigate={() => {
            setApprovalFilter("PENDING");
            setTab("approvals");
          }}
        />
        <KpiSummaryCard
          icon={UserPlus}
          label="Visitors Today"
          value={validVisitorsToday.length}
          caption="New visitors"
          loading={visitors.isLoading}
          tone="info"
          onNavigate={() => setTab("visitors")}
        />
        <KpiSummaryCard
          icon={Users}
          label="Currently Inside"
          value={visitorsInside.length}
          caption="On campus now"
          loading={visitors.isLoading}
          tone="success"
          onNavigate={() => {
            setVisitorView("inside");
            setTab("visitors");
          }}
        />
        <KpiSummaryCard
          icon={LogIn}
          label="Today's Entries"
          value={entriesToday}
          caption="Total entries"
          loading={events.isLoading}
          tone="primary"
          onNavigate={() => {
            setFeedFilter("entry");
            setTab("feed");
          }}
        />
        <div className="col-span-2">
          <KpiSummaryCard
            icon={LogOut}
            label="Today's Exits"
            value={exitsToday}
            caption="Total exits"
            loading={events.isLoading}
            tone="muted"
            onNavigate={() => {
              setFeedFilter("exit");
              setTab("feed");
            }}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto border-b border-border">
          <TabsList className="h-auto justify-start rounded-none border-none bg-transparent p-0">
            <TabsTrigger
              value="approvals"
              className="rounded-none border-b-2 border-transparent px-3 py-2.5 font-medium data-[state=active]:border-warning data-[state=active]:bg-transparent data-[state=active]:text-warning data-[state=active]:shadow-none"
            >
              Approvals ({pending.data?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="scan"
              className="rounded-none border-b-2 border-transparent px-3 py-2.5 font-medium data-[state=active]:border-warning data-[state=active]:bg-transparent data-[state=active]:text-warning data-[state=active]:shadow-none"
            >
              Scan
            </TabsTrigger>
            <TabsTrigger
              value="visitors"
              className="rounded-none border-b-2 border-transparent px-3 py-2.5 font-medium data-[state=active]:border-warning data-[state=active]:bg-transparent data-[state=active]:text-warning data-[state=active]:shadow-none"
            >
              Visitors
            </TabsTrigger>
            <TabsTrigger
              value="feed"
              className="rounded-none border-b-2 border-transparent px-3 py-2.5 font-medium data-[state=active]:border-warning data-[state=active]:bg-transparent data-[state=active]:text-warning data-[state=active]:shadow-none"
            >
              Live Feed
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="approvals" className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by student or room"
                className="pl-8"
                value={approvalSearch}
                onChange={(e) => setApprovalSearch(e.target.value)}
              />
            </div>
            <Select
              value={approvalFilter}
              onValueChange={(v) => setApprovalFilter(v as typeof approvalFilter)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filteredApprovals.isLoading && <GateSkeletonList />}
          {!filteredApprovals.isLoading && filteredApprovals.error && (
            <QueryErrorAlert
              error={filteredApprovals.error}
              onRetry={() => filteredApprovals.refetch()}
            />
          )}
          {!filteredApprovals.isLoading &&
            !filteredApprovals.error &&
            approvalsList.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-warning/15 text-sm font-semibold text-warning">
                      {initialsOf(p.students?.full_name ?? p.pass_number)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{p.pass_number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.students?.full_name} · {p.reason}
                        </p>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                          Out: {new Date(p.out_at).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <LogIn className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                          In: {new Date(p.expected_in_at).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline" className={statusBadgeClass(p.status)}>
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-row gap-2 sm:w-32 sm:flex-col">
                    <Button
                      className="flex-1 sm:flex-none"
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailsPass(p)}
                    >
                      Details
                    </Button>
                    {approvalFilter === "PENDING" && (
                      <>
                        <Button
                          className="flex-1 sm:flex-none"
                          size="sm"
                          variant="outline"
                          onClick={() => decideMut.mutate({ pass_id: p.id, decision: "REJECTED" })}
                        >
                          <X className="h-4 w-4" /> Reject
                        </Button>
                        <Button
                          className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90 sm:flex-none"
                          size="sm"
                          onClick={() => decideMut.mutate({ pass_id: p.id, decision: "APPROVED" })}
                        >
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          {!filteredApprovals.isLoading &&
            !filteredApprovals.error &&
            approvalsList.length === 0 && (
              <EmptyState
                title={
                  approvalSearch.trim()
                    ? "No approvals match your search"
                    : approvalFilter === "PENDING"
                      ? "No pending approvals"
                      : `No ${approvalFilter.toLowerCase()} passes`
                }
              />
            )}
        </TabsContent>

        <TabsContent value="scan" className="space-y-3">
          <Card>
            <CardHeader className="flex-row items-center gap-2.5 space-y-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-base">QR Scan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CameraQrScanner
                direction={scanDirection}
                onDirectionChange={setScanDirection}
                onDetected={async ({ pass_id, token }) => {
                  await scanMut.mutateAsync({ pass_id, token, direction: scanDirection });
                }}
              />
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Or paste the Pass ID and QR token shown on the student's app.
                </p>
                <Input
                  placeholder="Pass ID (UUID)"
                  className="bg-background"
                  value={passIdInput}
                  onChange={(e) => setPassIdInput(e.target.value)}
                />
                <Input
                  placeholder="QR token"
                  className="bg-background"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() =>
                      scanMut.mutate({ pass_id: passIdInput, token: tokenInput, direction: "OUT" })
                    }
                    disabled={!passIdInput || !tokenInput}
                  >
                    <LogOut className="h-4 w-4" /> Check OUT
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() =>
                      scanMut.mutate({ pass_id: passIdInput, token: tokenInput, direction: "IN" })
                    }
                    disabled={!passIdInput || !tokenInput}
                  >
                    <LogIn className="h-4 w-4" /> Check IN
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Currently Out
              {!active.isLoading && (
                <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
                  {((active.data as PassWithStudent[]) ?? []).filter((p) => p.status === "ACTIVE").length}
                </Badge>
              )}
            </div>
            {active.isLoading && <GateSkeletonList compact />}
            {!active.isLoading &&
              ((active.data as PassWithStudent[]) ?? [])
                .filter((p) => p.status === "ACTIVE")
                .map((p, i) => (
                  <Card key={p.id} className="mb-2">
                    <CardContent className="flex items-center gap-3 p-3">
                      <span
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
                          avatarTone(i),
                        )}
                      >
                        {initialsOf(p.students?.full_name ?? p.pass_number)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {p.pass_number} · {p.students?.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Out since{" "}
                          {p.actual_out_at ? new Date(p.actual_out_at).toLocaleTimeString() : "—"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="shrink-0 border-transparent bg-muted text-muted-foreground"
                      >
                        OUT
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
            {!active.isLoading &&
              ((active.data as PassWithStudent[]) ?? []).filter((p) => p.status === "ACTIVE")
                .length === 0 && (
                <p className="text-sm text-muted-foreground">No one is currently out.</p>
              )}
          </div>
        </TabsContent>

        <TabsContent value="visitors" className="space-y-2">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Button
              size="sm"
              className="shrink-0"
              variant={visitorView === "all" ? "default" : "outline"}
              onClick={() => setVisitorView("all")}
            >
              All
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              variant={visitorView === "expected" ? "default" : "outline"}
              onClick={() => setVisitorView("expected")}
            >
              Expected Today
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              variant={visitorView === "inside" ? "default" : "outline"}
              onClick={() => setVisitorView("inside")}
            >
              Inside
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              variant={visitorView === "checked_out" ? "default" : "outline"}
              onClick={() => setVisitorView("checked_out")}
            >
              Checked Out
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by visitor, host, room, or phone"
                className="pl-8 text-sm placeholder:text-sm"
                value={visitorSearch}
                onChange={(e) => setVisitorSearch(e.target.value)}
              />
            </div>
            <Button size="sm" className="shrink-0" onClick={() => setRegisterOpen(true)}>
              <UserPlus className="h-4 w-4" /> Register
            </Button>
          </div>
          {visitors.isLoading && <GateSkeletonList />}
          {!visitors.isLoading && visitors.error && (
            <QueryErrorAlert error={visitors.error} onRetry={() => visitors.refetch()} />
          )}
          {!visitors.isLoading &&
            !visitors.error &&
            visibleVisitors.map((v, i) => (
              <VisitorCard
                key={v.id}
                visitor={v}
                avatarIndex={i}
                onOpenDetails={() => setDetailsVisitor(v)}
              />
            ))}
          {!visitors.isLoading && !visitors.error && visibleVisitors.length === 0 && (
            <EmptyState
              title={
                visitorSearch.trim()
                  ? "No visitors match your search"
                  : visitorView === "expected"
                    ? "No visitors expected today"
                    : visitorView === "inside"
                      ? "No visitors currently inside"
                      : visitorView === "checked_out"
                        ? "No visitors checked out yet"
                        : "No visitors"
              }
            />
          )}
          {!visitors.isLoading &&
            !visitors.error &&
            visibleVisitors.length > 0 &&
            (visitorView !== "all" || visitorSearch.trim()) && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/40"
                onClick={() => {
                  setVisitorView("all");
                  setVisitorSearch("");
                }}
              >
                View all visitors <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
        </TabsContent>

        <TabsContent value="feed" className="space-y-2">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Button
              size="sm"
              className="shrink-0"
              variant={feedFilter === "all" ? "default" : "outline"}
              onClick={() => setFeedFilter("all")}
            >
              All
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              variant={feedFilter === "entry" ? "default" : "outline"}
              onClick={() => setFeedFilter("entry")}
            >
              Entry
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              variant={feedFilter === "exit" ? "default" : "outline"}
              onClick={() => setFeedFilter("exit")}
            >
              Exit
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              variant={feedFilter === "alerts" ? "default" : "outline"}
              onClick={() => setFeedFilter("alerts")}
            >
              Alerts
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name"
              className="pl-8 text-sm placeholder:text-sm"
              value={feedSearch}
              onChange={(e) => setFeedSearch(e.target.value)}
            />
          </div>
          {events.isLoading && <GateSkeletonList compact />}
          {!events.isLoading && events.error && (
            <QueryErrorAlert error={events.error} onRetry={() => events.refetch()} />
          )}
          {!events.isLoading && !events.error && feedList.length === 0 && (
            <EmptyState
              title={
                feedSearch.trim() || feedFilter !== "all"
                  ? "No activity matches your filters"
                  : "No live activity yet"
              }
            />
          )}
          {!events.isLoading &&
            !events.error &&
            feedList.map((ev, i) => <FeedEventCard key={ev.id} event={ev} avatarIndex={i} />)}
          {!events.isLoading &&
            !events.error &&
            feedList.length > 0 &&
            (feedFilter !== "all" || feedSearch.trim()) && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/40"
                onClick={() => {
                  setFeedFilter("all");
                  setFeedSearch("");
                }}
              >
                View all activity <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
        </TabsContent>
      </Tabs>

      {detailsPass && (
        <ApprovalDetailsDialog
          pass={detailsPass}
          onOpenChange={(open) => {
            if (!open) setDetailsPass(null);
          }}
        />
      )}

      {detailsVisitor && (
        <VisitorDetailsDialog
          visitor={detailsVisitor}
          visMut={visMut}
          onOpenChange={(open) => {
            if (!open) setDetailsVisitor(null);
          }}
        />
      )}

      {registerOpen && (
        <RegisterVisitorDialog
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          propertyId={propertyId}
          createVis={createVis}
        />
      )}
    </div>
  );
}

function VisitorCard({
  visitor,
  avatarIndex,
  onOpenDetails,
}: {
  visitor: VisitorWithRelations;
  avatarIndex: number;
  onOpenDetails: () => void;
}) {
  const activeAlloc = visitor.students?.allocations?.find((a) => a.status === "ACTIVE");
  const room = activeAlloc?.rooms?.room_number;
  return (
    <button type="button" onClick={onOpenDetails} className="block w-full text-left">
      <Card className="transition-colors hover:bg-accent/40">
        <CardContent className="flex items-start gap-3 p-3">
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
              avatarTone(avatarIndex),
            )}
          >
            {initialsOf(visitor.name)}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="truncate font-medium">
              {visitor.name}{" "}
              <span className="text-xs font-normal text-muted-foreground">({visitor.phone})</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              Host: {visitor.students?.full_name ?? "—"}
              {room ? ` · Room ${room}` : ""}
            </div>
            {visitor.expected_at && (
              <div className="text-xs text-muted-foreground">
                Expected: {new Date(visitor.expected_at).toLocaleString()}
              </div>
            )}
            <Badge variant="outline" className={cn("mt-1", statusBadgeClass(visitor.status))}>
              {visitor.status}
            </Badge>
          </div>
          <ChevronRight
            className="mt-2 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </CardContent>
      </Card>
    </button>
  );
}

function VisitorDetailsDialog({
  visitor,
  visMut,
  onOpenChange,
}: {
  visitor: VisitorWithRelations;
  visMut: ReturnType<
    typeof useMutation<unknown, unknown, { visitor_id: string; direction: "IN" | "OUT" }>
  >;
  onOpenChange: (open: boolean) => void;
}) {
  const activeAlloc = visitor.students?.allocations?.find((a) => a.status === "ACTIVE");
  const room = activeAlloc?.rooms?.room_number;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{visitor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">Phone:</span> {visitor.phone}
            </p>
            <p>
              <span className="text-muted-foreground">Host:</span>{" "}
              {visitor.students?.full_name ?? "—"}
              {room ? ` · Room ${room}` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Purpose:</span> {visitor.purpose}
            </p>
            {visitor.expected_at && (
              <p>
                <span className="text-muted-foreground">Expected:</span>{" "}
                {new Date(visitor.expected_at).toLocaleString()}
              </p>
            )}
            {visitor.checked_in_at && (
              <p>
                <span className="text-muted-foreground">Checked in:</span>{" "}
                {new Date(visitor.checked_in_at).toLocaleString()}
              </p>
            )}
            {visitor.checked_out_at && (
              <p>
                <span className="text-muted-foreground">Checked out:</span>{" "}
                {new Date(visitor.checked_out_at).toLocaleString()}
              </p>
            )}
          </div>
          <Badge variant="outline" className={statusBadgeClass(visitor.status)}>
            {visitor.status}
          </Badge>
          {visitor.status !== "CHECKED_IN" && visitor.status !== "CHECKED_OUT" && (
            <Button
              className="w-full"
              onClick={() => {
                visMut.mutate({ visitor_id: visitor.id, direction: "IN" });
                onOpenChange(false);
              }}
            >
              <LogIn className="h-4 w-4" /> Check IN
            </Button>
          )}
          {visitor.status === "CHECKED_IN" && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                visMut.mutate({ visitor_id: visitor.id, direction: "OUT" });
                onOpenChange(false);
              }}
            >
              <LogOut className="h-4 w-4" /> Check OUT
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeedEventCard({ event, avatarIndex }: { event: FeedEvent; avatarIndex: number }) {
  const isVisitorEvent = !!event.visitors;
  const name = event.students?.full_name ?? event.visitors?.name ?? "—";
  const room =
    roomOf(event.students?.allocations) ?? roomOf(event.visitors?.students?.allocations);
  const hostName = isVisitorEvent ? event.visitors?.students?.full_name : undefined;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
            avatarTone(avatarIndex),
          )}
        >
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={
                event.direction === "IN"
                  ? "border-transparent bg-success/15 text-success"
                  : "border-transparent bg-muted text-muted-foreground"
              }
            >
              {event.direction}
            </Badge>
            <span className="truncate font-medium">
              {name}
              {isVisitorEvent && event.visitors?.phone ? ` (${event.visitors.phone})` : ""}
            </span>
            {event.is_late && (
              <Badge variant="outline" className="border-transparent bg-destructive/15 text-destructive">
                LATE
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {isVisitorEvent && hostName ? `Host: ${hostName}` : null}
            {room ? `${isVisitorEvent && hostName ? " · " : ""}Room ${room}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(event.event_at).toLocaleString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type ApprovalStep = "APPROVED" | "REJECTED" | "PENDING";

function ApprovalDetailsDialog({
  pass,
  onOpenChange,
}: {
  pass: PassWithStudent;
  onOpenChange: (open: boolean) => void;
}) {
  const historyQ = useQuery({
    queryKey: ["gate-pass-approvals", pass.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_pass_approvals")
        .select("id, approver_type, approver_user_id, decision, reason, created_at")
        .eq("gate_pass_id", pass.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const approverIds = Array.from(new Set((data ?? []).map((h) => h.approver_user_id)));
      const names = new Map<string, string>();
      if (approverIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", approverIds);
        for (const pr of profiles ?? []) names.set(pr.id, pr.full_name);
      }
      return (data ?? []).map((h) => ({
        ...h,
        approverName: names.get(h.approver_user_id) ?? null,
      }));
    },
  });

  const parentStep: ApprovalStep | null = pass.requires_parent_approval
    ? pass.parent_approved_at
      ? "APPROVED"
      : pass.status === "REJECTED" && !pass.warden_approved_at
        ? "REJECTED"
        : "PENDING"
    : null;
  const wardenStep: ApprovalStep = pass.warden_approved_at
    ? "APPROVED"
    : pass.status === "REJECTED"
      ? "REJECTED"
      : "PENDING";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{pass.pass_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">Reason:</span> {pass.reason}
            </p>
            {pass.destination && (
              <p>
                <span className="text-muted-foreground">Destination:</span> {pass.destination}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Out:</span>{" "}
              {new Date(pass.out_at).toLocaleString()}
            </p>
            <p>
              <span className="text-muted-foreground">Expected in:</span>{" "}
              {new Date(pass.expected_in_at).toLocaleString()}
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Approval chain</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {parentStep && (
                <>
                  <StepBadge label="Parent Approval" state={parentStep} />
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <StepBadge label="Warden Approval" state={wardenStep} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">History</p>
            {historyQ.isLoading && <Skeleton className="h-16 w-full" />}
            {!historyQ.isLoading && historyQ.error && (
              <QueryErrorAlert error={historyQ.error} onRetry={() => historyQ.refetch()} />
            )}
            {!historyQ.isLoading && !historyQ.error && (historyQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No approval activity yet.</p>
            )}
            {!historyQ.isLoading &&
              !historyQ.error &&
              (historyQ.data ?? []).map((h) => (
                <div key={h.id} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {h.approverName ?? h.approver_type}
                    </span>
                    <span
                      className={h.decision === "APPROVED" ? "text-success" : "text-destructive"}
                    >
                      {h.decision === "APPROVED" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                  {h.reason && <p className="mt-1 text-muted-foreground">Reason: {h.reason}</p>}
                  <p className="mt-1 text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepBadge({ label, state }: { label: string; state: ApprovalStep }) {
  const tone =
    state === "APPROVED"
      ? "bg-success/15 text-success border-success/30"
      : state === "REJECTED"
        ? "bg-destructive/15 text-destructive border-destructive/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5", tone)}>
      {label}: {state === "APPROVED" ? "Approved" : state === "REJECTED" ? "Rejected" : "Pending"}
    </span>
  );
}

function GateSkeletonList({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: compact ? 2 : 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}

function QueryErrorAlert({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{getErrorMessage(error, "Something went wrong loading this data.")}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function RegisterVisitorDialog({
  open,
  onOpenChange,
  propertyId,
  createVis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string | null;
  createVis: ReturnType<typeof useServerFn<typeof createVisitor>>;
}) {
  const qc = useQueryClient();
  const students = useStudentsInProperty(propertyId);
  const [hostId, setHostId] = useState("");
  const [hostPickerOpen, setHostPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [expectedTime, setExpectedTime] = useState("");

  function reset() {
    setHostId("");
    setName("");
    setPhone("");
    setPurpose("");
    setExpectedDate("");
    setExpectedTime("");
  }

  const registerMut = useMutation({
    mutationFn: async () => {
      const expected_at = expectedDate
        ? new Date(`${expectedDate}T${expectedTime || "00:00"}`).toISOString()
        : undefined;
      return createVis({
        data: { host_student_id: hostId, name, phone, purpose, expected_at },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitors"] });
      toast.success("Visitor registered.");
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not register visitor.")),
  });

  const canSubmit =
    !!hostId && name.trim().length >= 2 && phone.trim().length >= 6 && purpose.trim().length >= 2;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register Visitor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Host Student</Label>
            <Popover open={hostPickerOpen} onOpenChange={setHostPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={hostPickerOpen}
                  className="w-full justify-between font-normal"
                >
                  {hostId
                    ? ((students.data ?? []).find((s) => s.id === hostId)?.full_name ??
                      "Select student")
                    : "Select student"}
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                <Command>
                  <CommandInput placeholder="Search by name…" />
                  <CommandList>
                    <CommandEmpty>No student found.</CommandEmpty>
                    <CommandGroup>
                      {(students.data ?? []).map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.full_name}
                          onSelect={() => {
                            setHostId(s.id);
                            setHostPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn("h-4 w-4", hostId === s.id ? "opacity-100" : "opacity-0")}
                          />
                          {s.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Visitor Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit phone"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Meeting, delivery"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1.5">
              <Label>Expected Date (optional)</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Expected Time (optional)</Label>
              <Input
                type="time"
                value={expectedTime}
                onChange={(e) => setExpectedTime(e.target.value)}
                disabled={!expectedDate}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row justify-end gap-2 space-x-0">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            disabled={!canSubmit || registerMut.isPending}
            onClick={() => registerMut.mutate()}
          >
            {registerMut.isPending ? "Registering…" : "Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
