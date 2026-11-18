import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  LayoutGrid,
  Layers,
  Package,
  PlayCircle,
  RotateCcw,
  UserPlus,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useComplaints,
  useComplaintCategories,
  OPEN_COMPLAINT_STATUSES,
  reopenComplaintWithOverride,
  useCanOverrideReopen,
  type ComplaintWithRelations,
} from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { supabase } from "@/integrations/supabase/client";
import { listStaff } from "@/lib/admin-staff.functions";
import {
  reopenOverrideReasonError,
  reopenOverrideSchema,
  resolutionSchema,
  resolutionSummaryError,
} from "@/schemas/complaint";
// Same details view the Warden dashboard uses (description, student, category/priority, resolution,
// timeline, comments) — reused, not duplicated.
import { ComplaintDetailsDialog } from "./warden.complaints";

const complaintsSearchSchema = z.object({
  // Deep-link target for the "View complaint →" toast action fired when a
  // COMPLAINT_RESOLVED notification lands (see src/lib/notifications.ts) —
  // scrolls to and expands that complaint's timeline/detail section below.
  complaintId: z.string().uuid().optional(),
  // Preselects the status filter (e.g. the Dashboard's "Open complaints"
  // card deep-linking here) — defaults to "ALL" (today's unchanged
  // behavior) when omitted.
  status: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/admin/complaints")({
  validateSearch: complaintsSearchSchema,
  component: AdminComplaintsPage,
});

type StaffListItem = Awaited<ReturnType<typeof listStaff>>[number];
type WardenRow = StaffListItem & { role: "WARDEN" };

// WAITING_FOR_STUDENT / CANCELLED have no workflow that enters them, so they are not offered as
// filters (existing rows keep the status and still show under ALL).
const STATUSES = ["ALL", "OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];

function useBlocks(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["blocks-lookup", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks")
        .select("id, name")
        .eq("property_id", propertyId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function AdminComplaintsPage() {
  const { complaintId, status: initialStatus } = Route.useSearch();
  const propId = usePropertyStore((s) => s.activePropertyId);
  const [status, setStatus] = useState(initialStatus ?? "ALL");
  const [category, setCategory] = useState("ALL");
  const [block, setBlock] = useState("ALL");
  const all = useComplaints({ propertyId: propId });
  const cats = useComplaintCategories(propId);
  const blocksQ = useBlocks(propId);

  const blockNameMap = useMemo(() => {
    const m = new Map<string, string>();
    (blocksQ.data ?? []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [blocksQ.data]);

  const list = useMemo(() => {
    let l = all.data ?? [];
    if (status === "OPEN") {
      // Same "open" definition as the Admin Dashboard's "Open complaints"
      // KPI and fn_scan_complaint_sla_breaches — everything short of
      // RESOLVED/CLOSED/CANCELLED — so the count you click through from
      // matches what actually lists here. Every other status option below
      // still matches its own literal status exactly.
      l = l.filter((c) => (OPEN_COMPLAINT_STATUSES as readonly string[]).includes(c.status));
    } else if (status !== "ALL") {
      l = l.filter((c) => c.status === status);
    }
    if (category !== "ALL") l = l.filter((c) => c.category_id === category);
    if (block !== "ALL") l = l.filter((c) => (c.block_id ?? "none") === block);
    return l;
  }, [all.data, status, category, block]);

  const blockIds = useMemo(() => {
    const set = new Set<string>();
    (all.data ?? []).forEach((c) => set.add(c.block_id ?? "none"));
    return Array.from(set);
  }, [all.data]);

  return (
    <div className="max-w-6xl space-y-5 sm:space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 rounded-xl border-border bg-card px-2.5 text-xs font-medium text-foreground sm:h-11 sm:px-3 sm:text-sm">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400 sm:h-4 sm:w-4" />
              <SelectValue placeholder="Status" className="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border bg-card text-foreground">
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 rounded-xl border-border bg-card px-2.5 text-xs font-medium text-foreground sm:h-11 sm:px-3 sm:text-sm">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 sm:h-4 sm:w-4" />
              <SelectValue placeholder="Category" className="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border bg-card text-foreground">
            <SelectItem value="ALL">All categories</SelectItem>
            {(cats.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={block} onValueChange={setBlock}>
          <SelectTrigger className="h-9 rounded-xl border-border bg-card px-2.5 text-xs font-medium text-foreground sm:h-11 sm:px-3 sm:text-sm">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <Package className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400 sm:h-4 sm:w-4" />
              <SelectValue placeholder="Block" className="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border bg-card text-foreground">
            <SelectItem value="ALL">All blocks</SelectItem>
            {blockIds.map((b) => (
              <SelectItem key={b} value={b}>
                {b === "none" ? "No block" : (blockNameMap.get(b) ?? "Unnamed block")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!propId && (
        <p className="text-sm text-muted-foreground">Select a property to view complaints.</p>
      )}
      <div className="space-y-4">
        {list.map((c) => (
          <AdminComplaintRow key={c.id} complaint={c} highlightId={complaintId} />
        ))}
        {propId && !all.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">No complaints match these filters.</p>
        )}
      </div>
    </div>
  );
}

function AdminComplaintRow({
  complaint,
  highlightId,
}: {
  complaint: ComplaintWithRelations;
  highlightId?: string;
}) {
  const qc = useQueryClient();
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const userId = role?.userId ?? null;
  const listStaffFn = useServerFn(listStaff);
  const isHighlighted = complaint.id === highlightId;
  const rowRef = useRef<HTMLDivElement>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryTouched, setSummaryTouched] = useState(false);
  // Validated on every change; shown once the user has interacted so an untouched modal isn't red.
  const summaryError = resolutionSummaryError(summary);
  const showSummaryError = summaryTouched && summaryError !== null;
  const [detailsOpen, setDetailsOpen] = useState(isHighlighted);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideConfirmOpen, setOverrideConfirmOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideTouched, setOverrideTouched] = useState(false);
  const overrideError = reopenOverrideReasonError(overrideReason);
  const showOverrideError = overrideTouched && overrideError !== null;
  const canOverrideQ = useCanOverrideReopen(complaint);

  useEffect(() => {
    if (isHighlighted) {
      setDetailsOpen(true);
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  const staffQ = useQuery({
    queryKey: ["staff-wardens", tenantId],
    queryFn: () => listStaffFn({ data: { tenant_id: tenantId! } }),
    enabled: assignOpen && !!tenantId,
  });
  const wardens = useMemo(
    () =>
      (staffQ.data ?? []).filter(
        (s): s is WardenRow =>
          s.role === "WARDEN" &&
          s.is_active &&
          (!s.property_id || s.property_id === complaint.property_id) &&
          (!s.block_id || s.block_id === complaint.block_id) &&
          // Absent key = Warden's own default (true) — matches can_manage_complaints()'s
          // RLS gate (20260814090000), so a Warden whose complaints access was
          // explicitly revoked never shows up as assignable.
          (s.permissions as Record<string, boolean> | null)?.complaints !== false,
      ),
    [staffQ.data, complaint.property_id, complaint.block_id],
  );

  const assign = useMutation({
    mutationFn: async () => {
      if (!assignee) throw new Error("Choose a warden");
      const { error } = await supabase
        .from("complaints")
        .update({
          assigned_to: assignee,
          assigned_at: new Date().toISOString(),
          status: complaint.status === "OPEN" ? "ASSIGNED" : complaint.status,
        })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Complaint assigned");
      setAssignOpen(false);
      setAssignee("");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed"),
  });

  const resolve = useMutation({
    mutationFn: async () => {
      // Friendly message instead of a raw ZodError (whose message is a JSON dump).
      const parsed = resolutionSchema.safeParse({ resolution_summary: summary });
      if (!parsed.success) throw new Error(resolutionSummaryError(summary) ?? "Invalid summary");
      const { error } = await supabase
        .from("complaints")
        .update({
          status: "RESOLVED",
          resolution_summary: parsed.data.resolution_summary,
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Marked resolved");
      setResolveOpen(false);
      setSummary("");
      setSummaryTouched(false);
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Resolve failed"),
  });

  const startWorking = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("complaints")
        .update({ status: "IN_PROGRESS" })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Work started");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start work"),
  });

  // Exceptional reopen. The permission, the mandatory reason and the eligibility (RESOLVED/CLOSED,
  // never CANCELLED) are enforced by fn_admin_reopen_complaint; this only mirrors them for UX.
  const reopenOverride = useMutation({
    mutationFn: async () => {
      const parsed = reopenOverrideSchema.safeParse({ reason: overrideReason });
      if (!parsed.success)
        throw new Error(reopenOverrideReasonError(overrideReason) ?? "Invalid reason");
      await reopenComplaintWithOverride(complaint.id, parsed.data.reason);
    },
    onSuccess: () => {
      toast.success("Complaint reopened (override recorded)");
      setOverrideConfirmOpen(false);
      setOverrideOpen(false);
      setOverrideReason("");
      setOverrideTouched(false);
      qc.invalidateQueries({ queryKey: ["complaints"] });
      qc.invalidateQueries({ queryKey: ["complaint-comments", complaint.id] });
    },
    onError: (e) => {
      setOverrideConfirmOpen(false);
      toast.error(e instanceof Error ? e.message : "Reopen override failed");
    },
  });

  const canAssign = !["RESOLVED", "CLOSED", "CANCELLED"].includes(complaint.status);
  const canResolve = [
    "OPEN",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_FOR_STUDENT",
    "REOPENED",
  ].includes(complaint.status);
  const canStartWorking = complaint.status === "ASSIGNED";
  // There is no regular Admin "Reopen": the student reopens RESOLVED complaints inside 48h. An Admin
  // with the dedicated override permission may reopen a RESOLVED/CLOSED complaint (never CANCELLED).
  const showReopenOverride =
    (complaint.status === "RESOLVED" || complaint.status === "CLOSED") &&
    canOverrideQ.data === true;
  // Once resolved/closed/cancelled, a stale sla_breached_at (set before
  // resolution and never cleared) shouldn't keep showing this as a live red
  // alert — mirrors slaMeta()'s own "done" gating for the SlaBadge/accent.
  const showSlaBreachAlert =
    !!complaint.sla_breached_at && !["RESOLVED", "CLOSED", "CANCELLED"].includes(complaint.status);

  return (
    <div ref={rowRef} className="space-y-3">
      {showSlaBreachAlert && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> SLA breached
        </div>
      )}
      <ComplaintCard
        complaint={complaint}
        identityVisibility="full"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl font-semibold"
              onClick={() => setDetailsOpen(true)}
            >
              <Eye className="h-4 w-4" /> View Details
            </Button>
            {canAssign && (
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="rounded-xl font-semibold">
                    <UserPlus className="h-4 w-4" /> Assign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign complaint</DialogTitle>
                  </DialogHeader>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a warden" />
                    </SelectTrigger>
                    <SelectContent>
                      {wardens.map((w) => (
                        <SelectItem key={w.user_id} value={w.user_id}>
                          {w.profile?.full_name ??
                            w.profile?.email ??
                            w.profile?.phone ??
                            "Unnamed"}
                        </SelectItem>
                      ))}
                      {staffQ.isError && (
                        <div className="px-2 py-1.5 text-sm text-destructive">
                          Could not load wardens — try again
                        </div>
                      )}
                      {staffQ.isSuccess && wardens.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No wardens in scope
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <DialogFooter>
                    <Button
                      onClick={() => assign.mutate()}
                      disabled={assign.isPending || !assignee}
                    >
                      <UserPlus className="h-4 w-4" /> Assign
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {canStartWorking && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl font-semibold"
                onClick={() => startWorking.mutate()}
                disabled={startWorking.isPending}
              >
                <PlayCircle className="h-4 w-4" /> Start Working
              </Button>
            )}
            {canResolve && (
              <Dialog
                open={resolveOpen}
                onOpenChange={(open) => {
                  setResolveOpen(open);
                  if (!open) setSummaryTouched(false);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Resolve
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Resolve complaint</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-1.5">
                    <Textarea
                      value={summary}
                      onChange={(e) => {
                        setSummary(e.target.value);
                        setSummaryTouched(true);
                      }}
                      onBlur={() => setSummaryTouched(true)}
                      rows={4}
                      placeholder="Example: Water leakage repaired and plumbing issue fixed."
                      aria-label="Resolution summary"
                      aria-invalid={showSummaryError}
                      aria-describedby={showSummaryError ? "resolve-summary-error" : undefined}
                    />
                    {showSummaryError && (
                      <p
                        id="resolve-summary-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {summaryError}
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        setSummaryTouched(true);
                        if (summaryError === null) resolve.mutate();
                      }}
                      disabled={resolve.isPending || summaryError !== null}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark resolved
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {showReopenOverride && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl font-semibold"
                  onClick={() => setOverrideOpen(true)}
                >
                  <RotateCcw className="h-4 w-4" /> Reopen Override
                </Button>
                <Dialog
                  open={overrideOpen}
                  onOpenChange={(open) => {
                    setOverrideOpen(open);
                    if (!open) setOverrideTouched(false);
                  }}
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reopen override</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      This is an exceptional action outside the student&apos;s 48-hour reopen
                      window. Your name, the time and your reason are recorded in the complaint
                      history.
                    </p>
                    <div className="space-y-1.5">
                      <Textarea
                        value={overrideReason}
                        onChange={(e) => {
                          setOverrideReason(e.target.value);
                          setOverrideTouched(true);
                        }}
                        onBlur={() => setOverrideTouched(true)}
                        rows={4}
                        placeholder="Why is this complaint being reopened?"
                        aria-label="Reason for reopen override (required)"
                        aria-invalid={showOverrideError}
                        aria-describedby={showOverrideError ? "override-reason-error" : undefined}
                      />
                      {showOverrideError && (
                        <p
                          id="override-reason-error"
                          role="alert"
                          className="text-xs text-destructive"
                        >
                          {overrideError}
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          setOverrideTouched(true);
                          if (overrideError === null) {
                            setOverrideOpen(false);
                            setOverrideConfirmOpen(true);
                          }
                        }}
                        disabled={overrideError !== null}
                      >
                        Continue
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <AlertDialog
                  open={overrideConfirmOpen}
                  onOpenChange={(open) => {
                    if (reopenOverride.isPending) return;
                    setOverrideConfirmOpen(open);
                  }}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reopen this complaint?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {complaint.complaint_number} will return to Reopened status. The override
                        and your reason will be recorded in its history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        disabled={reopenOverride.isPending}
                        onClick={() => setOverrideOpen(true)}
                      >
                        Back
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={reopenOverride.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          reopenOverride.mutate();
                        }}
                      >
                        Confirm reopen override
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </>
        }
      />
      {detailsOpen && (
        <ComplaintDetailsDialog
          complaint={complaint}
          userId={userId}
          showStatusControls={false}
          onOpenChange={setDetailsOpen}
        />
      )}
    </div>
  );
}
