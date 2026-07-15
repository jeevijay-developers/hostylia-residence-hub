import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { ComplaintTimeline } from "@/components/complaints/ComplaintTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useComplaints, type ComplaintRow } from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { supabase } from "@/integrations/supabase/client";
import { resolutionSchema } from "@/schemas/complaint";

export const Route = createFileRoute("/_authenticated/warden/complaints")({
  component: WardenComplaintsPage,
});

function WardenComplaintsPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  // Warden sees all in-scope complaints via RLS; we sort by SLA urgency.
  const all = useComplaints({});
  const list = (all.data ?? []).filter((c) =>
    !c.assigned_to || c.assigned_to === userId,
  );
  list.sort((a, b) => new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime());

  return (
    <div className="space-y-6">
      <PageHeader title="Complaints" description="Assigned to me + unassigned in my scope, sorted by SLA." />
      <div className="space-y-3">
        {all.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.map((c) => (
          <WardenComplaintRow key={c.id} complaint={c} />
        ))}
        {!all.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing in your queue.</p>
        )}
      </div>
    </div>
  );
}

function WardenComplaintRow({ complaint }: { complaint: ComplaintRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");

  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("complaints")
        .update({ status: "IN_PROGRESS" })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaints"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resolve = useMutation({
    mutationFn: async () => {
      const parsed = resolutionSchema.parse({ resolution_summary: summary });
      const { error } = await supabase
        .from("complaints")
        .update({ status: "RESOLVED", resolution_summary: parsed.resolution_summary })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Marked resolved");
      setOpen(false); setSummary("");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-3">
      <ComplaintCard
        complaint={complaint}
        actions={
          <>
            {complaint.status === "ASSIGNED" && (
              <Button size="sm" variant="outline" onClick={() => start.mutate()}>
                Start work
              </Button>
            )}
            {["ASSIGNED","IN_PROGRESS","WAITING_FOR_STUDENT","REOPENED","OPEN"].includes(complaint.status) && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">Resolve</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Resolve complaint</DialogTitle></DialogHeader>
                  <Textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={4}
                    placeholder="What was done to resolve this?"
                  />
                  <DialogFooter>
                    <Button onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                      Mark resolved
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
