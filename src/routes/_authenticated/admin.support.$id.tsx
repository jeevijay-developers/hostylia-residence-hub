import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Paperclip, Send } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DetailPageSkeleton } from "@/components/dashboard/DetailPageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { getErrorMessage } from "@/lib/utils";
import { markNotificationRead } from "@/lib/notifications";
import { addSupportTicketMessage, closeSupportTicket } from "@/lib/support-ticket.functions";
import {
  SUPPORT_TICKET_CATEGORY_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  type SupportTicketCategory,
} from "@/schemas/support-ticket";

export const Route = createFileRoute("/_authenticated/admin/support/$id")({
  head: () => ({ meta: [{ title: "Support ticket — Hostylia" }] }),
  component: AdminSupportTicketDetailPage,
});

function AdminSupportTicketDetailPage() {
  const { id } = useParams({ from: "/_authenticated/admin/support/$id" });
  const { data: role } = useResolvedRole();
  const userId = role?.userId ?? null;
  const qc = useQueryClient();

  const ticketQ = useQuery({
    queryKey: ["support-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const messagesQ = useQuery({
    queryKey: ["support-ticket-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id,author_id,message,created_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Mark this ticket's "resolved" notification read once the Admin actually
  // opens it — reuses the existing `notifications`/markNotificationRead
  // mechanism (the same one the Topbar bell already reads from), not a
  // second unread-tracking system.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("notifications")
      .select("id")
      .eq("recipient_user_id", userId)
      .is("read_at", null)
      .eq("payload->>ticket_id", id)
      .then(({ data }) => {
        (data ?? []).forEach((n) => void markNotificationRead(n.id));
      });
  }, [id, userId]);

  const attachmentsQ = useQuery({
    queryKey: ["support-ticket-attachments", id, messagesQ.data?.map((m) => m.id)],
    enabled: !!messagesQ.data?.length,
    queryFn: async () => {
      const messageIds = (messagesQ.data ?? []).map((m) => m.id);
      const { data, error } = await supabase
        .from("documents")
        .select("id,owner_id,storage_bucket,storage_path,original_filename")
        .eq("owner_type", "SUPPORT_TICKET_MESSAGE")
        .in("owner_id", messageIds);
      if (error) throw error;
      return data;
    },
  });

  const [reply, setReply] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const addMessageFn = useServerFn(addSupportTicketMessage);
  const closeFn = useServerFn(closeSupportTicket);

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!reply.trim()) throw new Error("Write a message first");
      const msg = await addMessageFn({
        data: { ticket_id: id, message: reply.trim(), is_internal_note: false },
      });
      if (file && ticketQ.data) {
        const path = `${ticketQ.data.tenant_id}/${id}/${msg.id}/${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("support-ticket-attachments")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { error: docErr } = await supabase.from("documents").insert({
          tenant_id: ticketQ.data.tenant_id,
          owner_type: "SUPPORT_TICKET_MESSAGE",
          owner_id: msg.id,
          document_type: "SUPPORT_ATTACHMENT",
          storage_bucket: "support-ticket-attachments",
          storage_path: path,
          original_filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          status: "AVAILABLE",
          verification_status: "NOT_REQUIRED",
          created_by: userId,
        });
        if (docErr) throw new Error(docErr.message);
      }
    },
    onSuccess: () => {
      setReply("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["support-ticket-messages", id] });
      toast.success("Reply sent");
    },
    onError: (e) => setError(getErrorMessage(e, "Could not send reply")),
  });

  const closeTicket = useMutation({
    mutationFn: () => closeFn({ data: { ticket_id: id } }),
    onSuccess: () => {
      toast.success("Ticket closed");
      qc.invalidateQueries({ queryKey: ["support-ticket", id] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not close ticket")),
  });

  async function openAttachment(bucket: string, path: string) {
    const { data, error: sErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (sErr || !data) {
      toast.error(sErr?.message ?? "Could not open attachment");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (ticketQ.isLoading) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/support">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <DetailPageSkeleton />
      </div>
    );
  }
  const ticket = ticketQ.data;
  if (!ticket) return <p className="text-sm text-muted-foreground">Ticket not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/support"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Support
        </Link>
      </div>

      <PageHeader
        title={ticket.subject}
        description={`${SUPPORT_TICKET_CATEGORY_LABELS[ticket.category as SupportTicketCategory] ?? ticket.category} · Priority ${ticket.priority}`}
        actions={
          ticket.status === "RESOLVED" ? (
            <Button size="sm" onClick={() => closeTicket.mutate()} disabled={closeTicket.isPending}>
              {closeTicket.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Close ticket
            </Button>
          ) : null
        }
      />

      <div className="flex items-center gap-2">
        <Badge>
          {SUPPORT_TICKET_STATUS_LABELS[
            ticket.status as keyof typeof SUPPORT_TICKET_STATUS_LABELS
          ] ?? ticket.status}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Opened {new Date(ticket.created_at).toLocaleString()}
        </span>
      </div>

      <Card>
        <CardContent className="p-4 text-sm whitespace-pre-wrap">{ticket.description}</CardContent>
      </Card>

      {(ticket.status === "RESOLVED" || ticket.status === "CLOSED") && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Resolved by</p>
                <p className="font-medium">{ticket.resolved_by ? "Support" : "—"}</p>
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
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(messagesQ.data ?? []).map((m) => {
          const mine = m.author_id === userId;
          const atts = (attachmentsQ.data ?? []).filter((a) => a.owner_id === m.id);
          return (
            <div
              key={m.id}
              className={`rounded-lg border border-border p-3 text-sm ${mine ? "bg-primary/5" : "bg-muted/30"}`}
            >
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {mine ? "You" : "Support"} · {new Date(m.created_at).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{m.message}</p>
              {atts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openAttachment(a.storage_bucket, a.storage_path)}
                  className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> {a.original_filename}
                </button>
              ))}
            </div>
          );
        })}
        {!messagesQ.data?.length && (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        )}
      </div>

      {ticket.status !== "CLOSED" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Textarea
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {file ? file.name : "Attach screenshot"}
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={sendReply.isPending}
                onClick={() => sendReply.mutate()}
              >
                {sendReply.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
