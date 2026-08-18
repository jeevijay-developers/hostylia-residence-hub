import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Search } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { ComplaintTimeline } from "@/components/complaints/ComplaintTimeline";
import { ComplaintCommentThread } from "@/components/complaints/ComplaintCommentThread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/dashboard/ListSkeleton";
import {
  useComplaints,
  useComplaintCategories,
  type ComplaintWithRelations,
} from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import {
  complaintPriorityEnum,
  complaintStatusEnum,
  resolutionSchema,
  wardenStatusOptions,
} from "@/schemas/complaint";

export const Route = createFileRoute("/_authenticated/warden/complaints")({
  component: WardenComplaintsPage,
});

const STATUS_FILTER_OPTIONS = ["ALL", ...complaintStatusEnum.options];
const PRIORITY_FILTER_OPTIONS = ["ALL", ...complaintPriorityEnum.options];

function WardenComplaintsPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const propQ = useMyStaffProperty(userId);
  const propertyId = propQ.data ?? null;
  const categoriesQ = useComplaintCategories(propertyId);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [activeComplaint, setActiveComplaint] = useState<ComplaintWithRelations | null>(null);

  // Warden sees all in-scope complaints via RLS; we sort by SLA urgency.
  const all = useComplaints({});
  const scoped = useMemo(
    () => (all.data ?? []).filter((c) => !c.assigned_to || c.assigned_to === userId),
    [all.data, userId],
  );

  const list = useMemo(() => {
    let l = scoped;
    if (status !== "ALL") l = l.filter((c) => c.status === status);
    if (priority !== "ALL") l = l.filter((c) => c.priority === priority);
    if (category !== "ALL") l = l.filter((c) => c.category_id === category);
    const q = search.trim().toLowerCase();
    if (q) {
      l = l.filter(
        (c) =>
          c.complaint_number.toLowerCase().includes(q) ||
          (c.students?.full_name ?? "").toLowerCase().includes(q) ||
          (c.rooms?.room_number ?? "").toLowerCase().includes(q),
      );
    }
    return [...l].sort(
      (a, b) => new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime(),
    );
  }, [scoped, status, priority, category, search]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by complaint ID, student name, or room number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_FILTER_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === "ALL" ? "All priorities" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {(categoriesQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {all.isLoading && <ListSkeleton rows={5} />}
        {!all.isLoading &&
          list.map((c) => (
            <ComplaintCard
              key={c.id}
              complaint={c}
              actions={
                <Button size="sm" variant="outline" onClick={() => setActiveComplaint(c)}>
                  <Eye className="h-4 w-4" /> View Details
                </Button>
              }
            />
          ))}
        {!all.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing matches your filters.</p>
        )}
      </div>

      {activeComplaint && (
        <ComplaintDetailsDialog
          complaint={activeComplaint}
          userId={userId}
          onOpenChange={(open) => {
            if (!open) setActiveComplaint(null);
          }}
        />
      )}
    </div>
  );
}

function ComplaintDetailsDialog({
  complaint,
  userId,
  onOpenChange,
}: {
  complaint: ComplaintWithRelations;
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>(complaint.status);
  const [resolutionSummary, setResolutionSummary] = useState(complaint.resolution_summary ?? "");

  const resolvedByQ = useQuery({
    queryKey: ["complaint-resolved-by", complaint.resolved_by],
    enabled: !!complaint.resolved_by,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", complaint.resolved_by!)
        .maybeSingle();
      return data?.full_name ?? null;
    },
  });

  const statusOptions = Array.from(new Set([complaint.status, ...wardenStatusOptions]));

  const updateStatus = useMutation({
    mutationFn: async () => {
      if (status === "RESOLVED") {
        const parsed = resolutionSchema.safeParse({ resolution_summary: resolutionSummary });
        if (!parsed.success)
          throw new Error(parsed.error.issues[0]?.message ?? "Resolution notes are required");
        const { error } = await supabase
          .from("complaints")
          .update({
            status: "RESOLVED",
            resolution_summary: parsed.data.resolution_summary,
            resolved_by: userId,
          })
          .eq("id", complaint.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("complaints")
          .update({ status })
          .eq("id", complaint.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update status")),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {complaint.complaint_number} — {complaint.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{complaint.description}</p>
            <p className="text-xs text-muted-foreground">
              {complaint.complaint_categories?.name ?? "Uncategorised"} · {complaint.priority}
            </p>
          </div>

          {complaint.students && (
            <div className="rounded-md border border-border bg-card p-3 text-xs">
              <p className="font-medium text-foreground">{complaint.students.full_name}</p>
              <p className="text-muted-foreground">
                {complaint.students.admission_number}
                {complaint.rooms?.room_number ? ` · Room ${complaint.rooms.room_number}` : ""}
                {complaint.blocks?.name ? ` · ${complaint.blocks.name}` : ""}
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-border p-3">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {status === "RESOLVED" && (
              <Textarea
                placeholder="Resolution notes (required)"
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                rows={3}
              />
            )}
            <Button
              size="sm"
              disabled={
                updateStatus.isPending || (status === complaint.status && status !== "RESOLVED")
              }
              onClick={() => updateStatus.mutate()}
            >
              Save status
            </Button>
          </div>

          {complaint.resolved_at && (
            <div className="rounded-md border border-success/30 bg-success/5 p-3 text-xs">
              <p className="font-semibold text-success">Resolved</p>
              <p className="text-muted-foreground">
                By {resolvedByQ.data ?? "—"} on {new Date(complaint.resolved_at).toLocaleString()}
              </p>
            </div>
          )}

          <div className="rounded-md border border-border bg-card p-3">
            <ComplaintTimeline complaint={complaint} />
          </div>

          <ComplaintCommentThread complaint={complaint} userId={userId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
