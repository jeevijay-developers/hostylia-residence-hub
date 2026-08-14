import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LifeBuoy, Plus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { getErrorMessage } from "@/lib/utils";
import { createSupportTicket } from "@/lib/support-ticket.functions";
import {
  SUPPORT_TICKET_CATEGORY_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  supportTicketCategorySchema,
  type SupportTicketCategory,
} from "@/schemas/support-ticket";

export const Route = createFileRoute("/_authenticated/admin/support")({
  head: () => ({ meta: [{ title: "Hostylia Support — Hostylia" }] }),
  component: AdminSupportPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "default",
  IN_PROGRESS: "secondary",
  WAITING_FOR_ADMIN: "outline",
  RESOLVED: "secondary",
  CLOSED: "outline",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

function AdminSupportPage() {
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const [createOpen, setCreateOpen] = useState(false);

  const ticketsQ = useQuery({
    queryKey: ["my-support-tickets", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id,subject,category,priority,status,created_at,updated_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hostylia Support"
        description="Raise technical or product issues with the Hostylia team — separate from student complaints."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New ticket
          </Button>
        }
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {ticketsQ.isLoading ? (
              <tr>
                <td colSpan={5} className="p-4">
                  <Skeleton className="h-24 w-full" />
                </td>
              </tr>
            ) : (
              (ticketsQ.data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link
                      to="/admin/support/$id"
                      params={{ id: t.id }}
                      className="font-medium text-foreground hover:underline"
                    >
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {SUPPORT_TICKET_CATEGORY_LABELS[t.category as SupportTicketCategory] ??
                      t.category}
                  </td>
                  <td className="px-4 py-2">{PRIORITY_LABEL[t.priority] ?? t.priority}</td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>
                      {SUPPORT_TICKET_STATUS_LABELS[
                        t.status as keyof typeof SUPPORT_TICKET_STATUS_LABELS
                      ] ?? t.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(t.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
            {!ticketsQ.isLoading && !ticketsQ.data?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No support tickets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tenantId && (
        <CreateTicketDialog
          tenantId={tenantId}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function CreateTicketDialog({
  tenantId,
  open,
  onClose,
}: {
  tenantId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createSupportTicket);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory | "">("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSubject("");
    setCategory("");
    setPriority("MEDIUM");
    setDescription("");
    setError(null);
  }

  const create = useMutation({
    mutationFn: () => {
      const parsedCategory = supportTicketCategorySchema.safeParse(category);
      if (!parsedCategory.success) throw new Error("Please choose a category");
      return createFn({
        data: {
          tenant_id: tenantId,
          subject,
          category: parsedCategory.data,
          priority,
          description,
        },
      });
    },
    onSuccess: () => {
      toast.success("Support ticket created");
      qc.invalidateQueries({ queryKey: ["my-support-tickets", tenantId] });
      reset();
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e, "Could not create ticket")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Hostylia Support ticket</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as SupportTicketCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SUPPORT_TICKET_CATEGORY_LABELS) as SupportTicketCategory[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {SUPPORT_TICKET_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea
              id="ticket-description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening, what did you expect, steps to reproduce…"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LifeBuoy className="h-4 w-4" />
            )}
            Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
