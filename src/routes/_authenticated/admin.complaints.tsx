import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RotateCcw, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { ComplaintTimeline } from "@/components/complaints/ComplaintTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { useComplaintsPaged, useComplaintCategories, type ComplaintRow } from "@/lib/complaint";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { supabase } from "@/integrations/supabase/client";
import { listStaff } from "@/lib/admin-staff.functions";
import { resolutionSchema } from "@/schemas/complaint";

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

const COMPLAINTS_PAGE_SIZE = 20;

function AdminComplaintsPage() {
  const propId = usePropertyStore((s) => s.activePropertyId);
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [block, setBlock] = useState("ALL");
  const [page, setPage] = useState(0);
  const all = useComplaintsPaged({
    propertyId: propId,
    status: status === "ALL" ? null : status,
    categoryId: category === "ALL" ? null : category,
    blockId: block === "ALL" ? null : block,
    page,
    pageSize: COMPLAINTS_PAGE_SIZE,
  });
  const cats = useComplaintCategories(propId);
  const blocksQ = useBlocks(propId);

  const list = all.data?.rows ?? [];
  const total = all.data?.total ?? 0;

  // Populated from the property's actual blocks (small, bounded lookup) —
  // not derived from the current page of complaints, which would make the
  // filter's own options depend on what happened to be on the visible page.
  const blockOptions = useMemo(
    () => [{ id: "none", name: "No block" }, ...(blocksQ.data ?? [])],
    [blocksQ.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Complaints" description="Property-wide view with SLA visibility." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {(cats.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={block}
          onValueChange={(v) => {
            setBlock(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Block" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All blocks</SelectItem>
            {blockOptions.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!propId && (
        <p className="text-sm text-muted-foreground">Select a property to view complaints.</p>
      )}
      {all.isError ? (
        <p className="text-sm text-destructive">
          {all.error instanceof Error ? all.error.message : "Could not load complaints."}
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <AdminComplaintRow key={c.id} complaint={c} />
          ))}
          {propId && !all.isLoading && list.length === 0 && (
            <p className="text-sm text-muted-foreground">No complaints match these filters.</p>
          )}
        </div>
      )}
      {!all.isLoading && !all.isError && total > 0 && (
        <PaginationBar
          page={page}
          pageSize={COMPLAINTS_PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function AdminComplaintRow({ complaint }: { complaint: ComplaintRow }) {
  const qc = useQueryClient();
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const listStaffFn = useServerFn(listStaff);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [summary, setSummary] = useState("");

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
        <div className="flex items-center gap-1 text-xs font-semibold text-destructive">
          <AlertTriangle size={14} /> SLA breached
        </div>
      )}
      <ComplaintCard
        complaint={complaint}
        actions={
          <>
            {canAssign && (
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
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
                  <Button size="sm">
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
                onClick={() => reopen.mutate()}
                disabled={reopen.isPending}
              >
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            )}
          </>
        }
      />
      <div className="rounded-md border border-border bg-card p-3">
        <ComplaintTimeline complaint={complaint} />
      </div>
    </div>
  );
}
