import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  LayoutGrid,
  Layers,
  Package,
  RotateCcw,
  UserPlus,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { ComplaintTimeline } from "@/components/complaints/ComplaintTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { useComplaints, useComplaintCategories, type ComplaintWithRelations } from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { supabase } from "@/integrations/supabase/client";
import { listStaff } from "@/lib/admin-staff.functions";
import { resolutionSchema } from "@/schemas/complaint";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/complaints")({
  component: AdminComplaintsPage,
});

type StaffListItem = Awaited<ReturnType<typeof listStaff>>[number];
type WardenRow = StaffListItem & { role: "WARDEN" };

const STATUSES = [
  "ALL",
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_STUDENT",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

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
  const propId = usePropertyStore((s) => s.activePropertyId);
  const [status, setStatus] = useState("ALL");
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
    if (status !== "ALL") l = l.filter((c) => c.status === status);
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
              <SelectValue placeholder="Status" />
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
              <SelectValue placeholder="Category" />
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
              <SelectValue placeholder="Block" />
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
          <AdminComplaintRow key={c.id} complaint={c} />
        ))}
        {propId && !all.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">No complaints match these filters.</p>
        )}
      </div>
    </div>
  );
}

function AdminComplaintRow({ complaint }: { complaint: ComplaintWithRelations }) {
  const qc = useQueryClient();
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const listStaffFn = useServerFn(listStaff);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

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
          (!s.block_id || s.block_id === complaint.block_id),
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
      const parsed = resolutionSchema.parse({ resolution_summary: summary });
      const { error } = await supabase
        .from("complaints")
        .update({
          status: "RESOLVED",
          resolution_summary: parsed.resolution_summary,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Marked resolved");
      setResolveOpen(false);
      setSummary("");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Resolve failed"),
  });

  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("complaints")
        .update({ status: "REOPENED" })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Complaint reopened");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reopen failed"),
  });

  const canAssign = !["RESOLVED", "CLOSED", "CANCELLED"].includes(complaint.status);
  const canResolve = [
    "OPEN",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_FOR_STUDENT",
    "REOPENED",
  ].includes(complaint.status);
  const canReopen = ["RESOLVED", "CLOSED", "CANCELLED"].includes(complaint.status);

  return (
    <div className="space-y-3">
      {complaint.sla_breached_at && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> SLA breached
        </div>
      )}
      <ComplaintCard
        complaint={complaint}
        actions={
          <>
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
                      {staffQ.isFetched && wardens.length === 0 && (
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
            {canResolve && (
              <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Resolve
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Resolve complaint</DialogTitle>
                  </DialogHeader>
                  <Textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={4}
                    placeholder="What was done to resolve this?"
                  />
                  <DialogFooter>
                    <Button onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                      <CheckCircle2 className="h-4 w-4" /> Mark resolved
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {canReopen && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl font-semibold"
                onClick={() => reopen.mutate()}
                disabled={reopen.isPending}
              >
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            )}
          </>
        }
      />
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className="rounded-xl border border-border/80 bg-card shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground"
            >
              <Clock className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
              <span className="flex-1 text-left">Timeline details</span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", detailsOpen && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border px-4 py-3">
            <ComplaintTimeline complaint={complaint} />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
