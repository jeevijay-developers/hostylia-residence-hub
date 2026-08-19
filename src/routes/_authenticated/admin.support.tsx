import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarCheck,
  CircleHelp,
  Flame,
  LifeBuoy,
  Loader2,
  LogIn,
  MessageSquareWarning,
  Minus,
  MoreVertical,
  Plus,
  ReceiptIndianRupee,
  Ticket,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

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
import { cn, getErrorMessage, toneClasses, toneTextClasses, type SemanticTone } from "@/lib/utils";
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

const CATEGORY_META: Record<SupportTicketCategory, { icon: LucideIcon; tone: SemanticTone }> = {
  TECHNICAL_ISSUE: { icon: Wrench, tone: "muted" },
  LOGIN_AUTH: { icon: LogIn, tone: "info" },
  FINANCE_BILLING: { icon: ReceiptIndianRupee, tone: "primary" },
  GATE_PASS: { icon: Building2, tone: "info" },
  ATTENDANCE: { icon: CalendarCheck, tone: "primary" },
  COMPLAINTS: { icon: MessageSquareWarning, tone: "warning" },
  REPORTS: { icon: BarChart3, tone: "info" },
  STUDENT_MANAGEMENT: { icon: Users, tone: "primary" },
  OTHER: { icon: CircleHelp, tone: "muted" },
};

const PRIORITY_META: Record<string, { icon: LucideIcon; tone: SemanticTone; label: string }> = {
  LOW: { icon: ArrowDown, tone: "muted", label: "Low" },
  MEDIUM: { icon: Minus, tone: "info", label: "Medium" },
  HIGH: { icon: ArrowUp, tone: "destructive", label: "High" },
  URGENT: { icon: Flame, tone: "destructive", label: "Urgent" },
};

const STATUS_META: Record<string, { tone: SemanticTone; label: string }> = {
  OPEN: { tone: "warning", label: "Open" },
  IN_PROGRESS: { tone: "info", label: "In Progress" },
  WAITING_FOR_ADMIN: { tone: "muted", label: "Waiting for Admin" },
  RESOLVED: { tone: "info", label: "Resolved" },
  CLOSED: { tone: "muted", label: "Closed" },
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
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-warning/10 text-warning">
            <Ticket className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-xl font-semibold text-foreground sm:text-2xl">
              Tickets
            </p>
            <p className="text-sm text-muted-foreground">Manage and track all support tickets</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          New ticket
        </Button>
      </div>

      {ticketsQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !ticketsQ.data?.length ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No support tickets yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-4 py-3">
                    <Ticket className="h-4 w-4" />
                  </th>
                  <th className="px-3 py-3">Subject</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ticketsQ.data.map((t) => {
                  const category = CATEGORY_META[t.category as SupportTicketCategory];
                  const CategoryIcon = category?.icon ?? CircleHelp;
                  const priority = PRIORITY_META[t.priority] ?? {
                    icon: Minus,
                    tone: "muted" as SemanticTone,
                    label: t.priority,
                  };
                  const PriorityIcon = priority.icon;
                  const status = STATUS_META[t.status] ?? {
                    tone: "muted" as SemanticTone,
                    label: t.status,
                  };
                  return (
                    <tr key={t.id} className="group">
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "block h-2 w-2 rounded-full bg-current",
                            toneTextClasses[category?.tone ?? "muted"],
                          )}
                          aria-hidden
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          to="/admin/support/$id"
                          params={{ id: t.id }}
                          className="flex items-center gap-3"
                        >
                          <span
                            className={cn(
                              "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                              toneClasses[category?.tone ?? "muted"],
                            )}
                          >
                            <CategoryIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground group-hover:underline">
                              {t.subject}
                            </span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              #TK-{t.id.slice(0, 6).toUpperCase()}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            toneClasses[category?.tone ?? "muted"],
                          )}
                        >
                          <CategoryIcon className="h-3.5 w-3.5" />
                          {SUPPORT_TICKET_CATEGORY_LABELS[t.category as SupportTicketCategory] ??
                            t.category}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-semibold",
                            toneTextClasses[priority.tone],
                          )}
                        >
                          <PriorityIcon className="h-3.5 w-3.5" />
                          {priority.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            toneClasses[status.tone],
                          )}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                          {SUPPORT_TICKET_STATUS_LABELS[
                            t.status as keyof typeof SUPPORT_TICKET_STATUS_LABELS
                          ] ?? status.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                        >
                          <Link
                            to="/admin/support/$id"
                            params={{ id: t.id }}
                            aria-label={`Open ${t.subject}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-warning/10 text-warning">
          <LifeBuoy className="h-7 w-7" />
        </span>
        <p className="font-display text-lg font-semibold text-foreground">Need help?</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create a new ticket and our team will get back to you.
        </p>
        <Button variant="outline" onClick={() => setCreateOpen(true)} className="mt-1">
          <Plus className="h-4 w-4" /> Create ticket
        </Button>
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
