import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Eye, LogIn, Loader2, Send, StickyNote } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";
import {
  addSupportTicketMessage,
  getSupportTicketDetail,
  linkSupportSessionToTicket,
  listSupportTickets,
  updateSupportTicket,
} from "@/lib/support-ticket.functions";
import { startSupportSession } from "@/lib/super-admin.functions";
import {
  SUPPORT_TICKET_CATEGORY_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  type SupportTicketCategory,
  type SupportTicketStatus,
} from "@/schemas/support-ticket";

export const Route = createFileRoute("/_authenticated/super-admin/support-tickets")({
  component: SuperSupportTicketsPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "default",
  IN_PROGRESS: "secondary",
  WAITING_FOR_ADMIN: "outline",
  RESOLVED: "secondary",
  CLOSED: "outline",
};

function SuperSupportTicketsPage() {
  const listFn = useServerFn(listSupportTickets);
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["all-support-tickets"],
    queryFn: () => listFn({}),
  });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = tickets.filter((t) => statusFilter === "ALL" || t.status === statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support Tickets"
        description="Technical/product issues raised by Hostel Admins across all tenants."
      />

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {(Object.keys(SUPPORT_TICKET_STATUS_LABELS) as SupportTicketStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SUPPORT_TICKET_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Tenant</th>
              <th className="px-4 py-2">Raised by</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Assigned</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-2">{t.tenants?.display_name ?? "—"}</td>
                <td className="px-4 py-2">
                  {t.created_by_profile?.full_name ?? t.created_by_profile?.email ?? "—"}
                </td>
                <td className="px-4 py-2">{t.subject}</td>
                <td className="px-4 py-2">
                  {SUPPORT_TICKET_CATEGORY_LABELS[t.category as SupportTicketCategory] ??
                    t.category}
                </td>
                <td className="px-4 py-2">{t.priority}</td>
                <td className="px-4 py-2">
                  <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>
                    {SUPPORT_TICKET_STATUS_LABELS[t.status as SupportTicketStatus] ?? t.status}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  {t.assigned_to_profile?.full_name ?? t.assigned_to_profile?.email ?? "Unassigned"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {new Date(t.updated_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setDetailId(t.id)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {!isLoading && !filtered.length && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                  No support tickets{statusFilter !== "ALL" ? " with this status" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TicketDetailDialog ticketId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function TicketDetailDialog({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getSupportTicketDetail);
  const updateFn = useServerFn(updateSupportTicket);
  const replyFn = useServerFn(addSupportTicketMessage);
  const startSessionFn = useServerFn(startSupportSession);
  const linkSessionFn = useServerFn(linkSupportSessionToTicket);

  const { data, isLoading } = useQuery({
    queryKey: ["support-ticket-detail", ticketId],
    queryFn: () => detailFn({ data: { ticket_id: ticketId! } }),
    enabled: !!ticketId,
  });

  const [reply, setReply] = useState("");
  const [asInternalNote, setAsInternalNote] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] });
    qc.invalidateQueries({ queryKey: ["all-support-tickets"] });
  }

  const sendReply = useMutation({
    mutationFn: () => {
      if (!ticketId || !reply.trim()) throw new Error("Write a message first");
      return replyFn({
        data: { ticket_id: ticketId, message: reply.trim(), is_internal_note: asInternalNote },
      });
    },
    onSuccess: () => {
      setReply("");
      setAsInternalNote(false);
      invalidate();
      toast.success(asInternalNote ? "Internal note added" : "Reply sent");
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not send")),
  });

  const setStatus = useMutation({
    mutationFn: (status: SupportTicketStatus) => {
      if (!ticketId) throw new Error("No ticket");
      return updateFn({
        data: {
          ticket_id: ticketId,
          status,
          resolution_note: status === "RESOLVED" ? resolutionNote.trim() || undefined : undefined,
        },
      });
    },
    onSuccess: (_data, status) => {
      invalidate();
      if (status === "RESOLVED") setResolutionNote("");
      toast.success(status === "RESOLVED" ? "Ticket marked resolved" : "Status updated");
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update status")),
  });

  const setPriority = useMutation({
    mutationFn: (priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT") => {
      if (!ticketId) throw new Error("No ticket");
      return updateFn({ data: { ticket_id: ticketId, priority } });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Priority updated");
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update priority")),
  });

  const startImpersonation = useMutation({
    mutationFn: async () => {
      if (!ticketId || !data) throw new Error("No ticket");
      const reason = window.prompt(
        "Reason for this support session (min 10 chars, will appear in the tenant's audit log):",
      );
      if (!reason || reason.trim().length < 10)
        throw new Error("Reason must be at least 10 characters");
      const session = await startSessionFn({
        data: {
          tenant_id: data.ticket.tenant_id,
          target_user_id: data.ticket.created_by,
          reason: reason.trim(),
          support_reference: `ticket:${ticketId}`,
          access_mode: "READ_ONLY",
          consent_recorded: true as const,
          duration_minutes: 30,
        },
      });
      await linkSessionFn({ data: { ticket_id: ticketId, support_session_id: session.id } });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Support session started and linked to this ticket");
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not start impersonation")),
  });

  if (!ticketId) return null;
  const ticket = data?.ticket;

  return (
    <Dialog open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticket?.subject ?? "Loading…"}</DialogTitle>
          <DialogDescription>
            {ticket
              ? `${ticket.tenants?.display_name ?? "—"} · raised by ${ticket.created_by_profile?.full_name ?? ticket.created_by_profile?.email ?? "—"}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !ticket || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => setStatus.mutate(v as SupportTicketStatus)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* RESOLVED is deliberately not selectable here — it always
                        goes through the dedicated "Mark Resolved" action below,
                        which requires a resolution note. */}
                    {(Object.keys(SUPPORT_TICKET_STATUS_LABELS) as SupportTicketStatus[])
                      .filter((s) => s !== "RESOLVED")
                      .map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUPPORT_TICKET_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) =>
                    setPriority.mutate(v as "LOW" | "MEDIUM" | "HIGH" | "URGENT")
                  }
                >
                  <SelectTrigger className="h-8">
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
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-medium">
                  {SUPPORT_TICKET_CATEGORY_LABELS[ticket.category as SupportTicketCategory] ??
                    ticket.category}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Opened</p>
                <p className="font-medium">{new Date(ticket.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {ticket.description}
            </div>

            <div className="space-y-2">
              {data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md border p-3 text-sm ${m.is_internal_note ? "border-warning/40 bg-warning/5" : "border-border"}`}
                >
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    {m.is_internal_note && <StickyNote className="h-3 w-3" />}
                    {m.author_profile?.full_name ?? m.author_profile?.email ?? "—"} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                    {m.is_internal_note && " · Internal note"}
                  </p>
                  <p className="whitespace-pre-wrap">{m.message}</p>
                </div>
              ))}
              {!data.messages.length && (
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <Textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to the Hostel Admin, or add an internal note…"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={asInternalNote}
                    onChange={(e) => setAsInternalNote(e.target.checked)}
                  />
                  Internal note (not visible to Hostel Admin)
                </label>
                <Button size="sm" disabled={sendReply.isPending} onClick={() => sendReply.mutate()}>
                  {sendReply.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>

            {ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Resolved by</p>
                    <p className="font-medium">
                      {ticket.resolved_by_profile?.full_name ??
                        ticket.resolved_by_profile?.email ??
                        "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Resolved at</p>
                    <p className="font-medium">
                      {ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : "—"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Resolution</p>
                  <p className="whitespace-pre-wrap">{ticket.resolution_note || "Not provided"}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label className="text-xs">Resolution note</Label>
                <Input
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="What fixed this?"
                />
                <Button
                  size="sm"
                  disabled={!resolutionNote.trim() || setStatus.isPending}
                  onClick={() => setStatus.mutate("RESOLVED")}
                >
                  {setStatus.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Mark Resolved
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={startImpersonation.isPending}
              onClick={() => startImpersonation.mutate()}
            >
              {startImpersonation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Start impersonation for this ticket
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
