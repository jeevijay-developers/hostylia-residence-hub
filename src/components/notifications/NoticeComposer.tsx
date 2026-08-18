import { useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { publishNotice, cancelNotice, editNotice } from "@/lib/notice.functions";
import { useTenantNotices, type NoticeRow } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CHANNELS = [
  { key: "IN_APP", label: "In-app" },
  { key: "SMS", label: "SMS" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "EMAIL", label: "Email" },
] as const;

const AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "WARDENS", "ACCOUNTANTS"] as const;

interface Props {
  propertyId: string;
}

export function NoticeComposer({ propertyId }: Props) {
  const qc = useQueryClient();
  const publishFn = useServerFn(publishNotice);
  const cancelFn = useServerFn(cancelNotice);

  // Provider config surface — currently the platform has no Twilio secrets; hard-code false.
  // A future settings page can expose /rest/v1/rpc('provider_status') to flip this live.
  const providerConfigured = { SMS: false, WHATSAPP: false, EMAIL: false, IN_APP: true };

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "IMPORTANT" | "URGENT">("NORMAL");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("ALL");
  const [channels, setChannels] = useState<string[]>(["IN_APP"]);
  const [publishAt, setPublishAt] = useState("");

  const tenantId = usePropertyTenantId(propertyId);
  const { data: notices = [] } = useTenantNotices(tenantId, propertyId, true);
  const sortedNotices = useMemo(
    () =>
      [...notices].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [notices],
  );

  const [viewingNotice, setViewingNotice] = useState<NoticeRow | null>(null);
  const [editingNotice, setEditingNotice] = useState<NoticeRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPriority, setEditPriority] = useState<"NORMAL" | "IMPORTANT" | "URGENT">("NORMAL");

  const editFn = useServerFn(editNotice);
  const edit = useMutation({
    mutationFn: async () => {
      if (!editingNotice) throw new Error("No notice selected");
      return editFn({
        data: {
          notice_id: editingNotice.id,
          title: editTitle,
          body: editBody,
          priority: editPriority,
        },
      });
    },
    onSuccess: () => {
      toast.success("Notice updated");
      qc.invalidateQueries({ queryKey: ["notices"] });
      setEditingNotice(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(n: NoticeRow) {
    setEditingNotice(n);
    setEditTitle(n.title);
    setEditBody(n.body);
    setEditPriority(n.priority as "NORMAL" | "IMPORTANT" | "URGENT");
  }

  const publish = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant unresolved");
      return publishFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          title,
          body,
          priority,
          audience_type: audience,
          channels: channels as ("IN_APP" | "SMS" | "WHATSAPP" | "EMAIL")[],
          publish_at: publishAt || null,
          publish_now: !publishAt,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(
        `Notice created${r.dispatched ? ` — ${r.dispatched} notification(s) dispatched` : ""}`,
      );
      setTitle("");
      setBody("");
      setPublishAt("");
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 3 && channels.length > 0;

  return (
    <div className="grid gap-6">
      <Card className="p-4">
        <h2 className="mb-4 font-semibold">Compose notice</h2>
        <div className="space-y-3">
          <div>
            <Label htmlFor="notice-title">Title</Label>
            <Input
              id="notice-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="notice-body">Body</Label>
            <Textarea
              id="notice-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="IMPORTANT">Important</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Channels</Label>
            <TooltipProvider>
              <div className="mt-1 flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const enabled = providerConfigured[c.key as keyof typeof providerConfigured];
                  const selected = channels.includes(c.key);
                  const button = (
                    <Button
                      key={c.key}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      disabled={!enabled && c.key !== "IN_APP"}
                      onClick={() =>
                        setChannels((prev) =>
                          prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key],
                        )
                      }
                    >
                      {c.label}
                    </Button>
                  );
                  return !enabled ? (
                    <Tooltip key={c.key}>
                      <TooltipTrigger asChild>
                        <span>{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Provider not configured. Add Twilio/Resend secrets to enable.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
          <div>
            <Label htmlFor="notice-schedule">Schedule (optional)</Label>
            <Input
              id="notice-schedule"
              type="datetime-local"
              value={publishAt}
              onChange={(e) =>
                setPublishAt(e.target.value ? new Date(e.target.value).toISOString() : "")
              }
            />
          </div>
          <Button
            onClick={() => publish.mutate()}
            disabled={!canSubmit || publish.isPending}
            className="w-full"
          >
            {publishAt ? "Schedule notice" : "Publish now"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-4 font-semibold">Recent notices</h2>
        {sortedNotices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices yet.</p>
        ) : (
          <ul className="space-y-3">
            {sortedNotices.slice(0, 10).map((n: NoticeRow) => (
              <li key={n.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.audience_type} · {n.channels.join(", ")}
                    </p>
                    {n.status === "SCHEDULED" && n.publish_at && (
                      <p className="text-xs text-muted-foreground">
                        Scheduled for {new Date(n.publish_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge variant={n.status === "PUBLISHED" ? "default" : "secondary"}>
                    {n.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setViewingNotice(n)}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(n)}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {(n.status === "DRAFT" || n.status === "SCHEDULED") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await cancelFn({ data: { notice_id: n.id } });
                        qc.invalidateQueries({ queryKey: ["notices"] });
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={!!viewingNotice} onOpenChange={(v) => !v && setViewingNotice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingNotice?.title}</DialogTitle>
          </DialogHeader>
          {viewingNotice && (
            <div className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{viewingNotice.body}</p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant={viewingNotice.status === "PUBLISHED" ? "default" : "secondary"}>
                  {viewingNotice.status}
                </Badge>
                <span>{viewingNotice.priority}</span>
                <span>{viewingNotice.audience_type}</span>
                <span>{viewingNotice.channels.join(", ")}</span>
              </div>
              {viewingNotice.published_at && (
                <p className="text-xs text-muted-foreground">
                  Published {new Date(viewingNotice.published_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingNotice(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingNotice} onOpenChange={(v) => !v && setEditingNotice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit notice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-notice-title">Title</Label>
              <Input
                id="edit-notice-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="edit-notice-body">Body</Label>
              <Textarea
                id="edit-notice-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={5}
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={editPriority}
                onValueChange={(v) => setEditPriority(v as typeof editPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="IMPORTANT">Important</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingNotice?.status === "PUBLISHED" && (
              <p className="text-xs text-muted-foreground">
                This notice was already sent — editing only corrects the stored record, it will not
                resend SMS/WhatsApp/email/in-app notifications already dispatched.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingNotice(null)}>
              Cancel
            </Button>
            <Button
              disabled={editTitle.trim().length < 3 || editBody.trim().length < 3 || edit.isPending}
              onClick={() => edit.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function usePropertyTenantId(propertyId: string | null | undefined): string | null {
  const q = useQuery({
    queryKey: ["property-tenant", propertyId],
    enabled: !!propertyId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("tenant_id")
        .eq("id", propertyId!)
        .maybeSingle();
      return data?.tenant_id ?? null;
    },
  });
  return useMemo(() => q.data ?? null, [q.data]);
}
