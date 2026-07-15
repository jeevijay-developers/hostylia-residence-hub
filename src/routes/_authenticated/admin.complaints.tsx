import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useComplaints, useComplaintCategories } from "@/lib/complaint";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/complaints")({
  component: AdminComplaintsPage,
});

const STATUSES = ["ALL","OPEN","ASSIGNED","IN_PROGRESS","WAITING_FOR_STUDENT","RESOLVED","CLOSED","REOPENED","CANCELLED"];

function AdminComplaintsPage() {
  const propId = usePropertyStore((s) => s.propertyId);
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [block, setBlock] = useState("ALL");
  const all = useComplaints({ propertyId: propId });
  const cats = useComplaintCategories(propId);

  const list = useMemo(() => {
    let l = all.data ?? [];
    if (status !== "ALL") l = l.filter((c) => c.status === status);
    if (category !== "ALL") l = l.filter((c) => c.category_id === category);
    if (block !== "ALL") l = l.filter((c) => (c.block_id ?? "none") === block);
    return l;
  }, [all.data, status, category, block]);

  const blocks = useMemo(() => {
    const set = new Set<string>();
    (all.data ?? []).forEach((c) => set.add(c.block_id ?? "none"));
    return Array.from(set);
  }, [all.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints"
        description="Property-wide view with SLA visibility."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {(cats.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={block} onValueChange={setBlock}>
          <SelectTrigger><SelectValue placeholder="Block" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All blocks</SelectItem>
            {blocks.map((b) => (
              <SelectItem key={b} value={b}>{b === "none" ? "No block" : b.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!propId && (
        <p className="text-sm text-muted-foreground">Select a property to view complaints.</p>
      )}
      <div className="space-y-3">
        {list.map((c) => (
          <div key={c.id} className="space-y-2">
            {c.sla_breached_at && (
              <div className="flex items-center gap-1 text-xs font-semibold text-destructive">
                <AlertTriangle size={14} /> SLA breached
              </div>
            )}
            <ComplaintCard complaint={c} />
          </div>
        ))}
        {propId && !all.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">No complaints match these filters.</p>
        )}
      </div>
    </div>
  );
}
