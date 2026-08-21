import { useMemo, useState } from "react";
import {
  CalendarDays,
  Eye,
  Files,
  Flag,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  Pencil,
  Send,
  Smartphone,
  SquarePen,
  Users,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, toneClasses } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/EmptyState";

const CHANNELS = [
  { key: "IN_APP", label: "In-app", icon: Smartphone },
  { key: "SMS", label: "SMS", icon: MessageSquare },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { key: "EMAIL", label: "Email", icon: Mail },
] as const;

const AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "WARDENS", "ACCOUNTANTS"] as const;

const STATUS_TONE: Record<string, keyof typeof toneClasses> = {
  PUBLISHED: "warning",
  SCHEDULED: "info",
  DRAFT: "muted",
  CANCELLED: "info",
  EXPIRED: "muted",
};

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
  const [showAll, setShowAll] = useState(false);

  const tenantId = usePropertyTenantId(propertyId);
  const { data: notices = [] } = useTenantNotices(tenantId, propertyId, true);
  const sortedNotices = useMemo(
    () =>
      [...notices].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [notices],
  );
  const visibleNotices = showAll ? sortedNotices : sortedNotices.slice(0, 5);

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
    <div className="grid w-full max-w-full gap-6 overflow-x-hidden">
      <Card className="rounded-2xl p-4 shadow-card-ambient sm:p-6">
        <div className="mb-4 flex min-w-0 items-center gap-2">
          <SquarePen className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="truncate font-display font-semibold text-foreground">Compose notice</h2>
        </div>
        <div className="space-y-4">
          <div>
            <Label htmlFor="notice-title">Title</Label>
            <Input
              id="notice-title"
              className="mt-1.5"
              placeholder="Enter title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="notice-body">Body</Label>
            <Textarea
              id="notice-body"
              className="mt-1.5"
              placeholder="Write your notice here…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="mt-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Flag className="h-4 w-4 shrink-0 text-warning" />
                    <SelectValue />
                  </div>
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
                <SelectTrigger className="mt-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </div>
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
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const enabled = providerConfigured[c.key as keyof typeof providerConfigured];
                  const selected = channels.includes(c.key);
                  const Icon = c.icon;
                  const button = (
                    <button
                      key={c.key}
                      type="button"
                      disabled={!enabled && c.key !== "IN_APP"}
                      onClick={() =>
                        setChannels((prev) =>
                          prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key],
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1 sm:gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                        selected
                          ? "border-warning bg-warning/10 text-warning"
                          : "border-border bg-transparent text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {c.label}
                    </button>
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
              className="mt-1.5"
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
            className="w-full shadow-tone-glow"
            size="lg"
          >
            <Send className="h-4 w-4" />
            {publishAt ? "Schedule notice" : "Publish now"}
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl p-4 shadow-card-ambient sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Files className="h-4 w-4 shrink-0 text-primary" />
            <h2 className="truncate font-display font-semibold text-foreground">Recent notices</h2>
          </div>
          {sortedNotices.length > 5 && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show less" : "View all"}
            </Button>
          )}
        </div>
        {sortedNotices.length === 0 ? (
          <EmptyState title="No notices yet" description="Published notices will appear here." />
        ) : (
          <ul className="space-y-3">
            {visibleNotices.map((n: NoticeRow) => (
              <li
                key={n.id}
                className="w-full max-w-full overflow-hidden rounded-2xl border border-border p-3 transition hover:border-primary/30 sm:p-4"
              >
                <div className="flex w-full min-w-0 items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                      {n.title}
                    </p>
                    <p className="mt-0.5 break-words text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                      {n.audience_type} · {n.channels.join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:text-xs">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {new Date(n.created_at).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {n.status === "SCHEDULED" && n.publish_at && (
                        <span className="break-words">
                          Scheduled for {new Date(n.publish_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full border-transparent px-1.5 py-0.5 text-[9px] sm:px-2.5 sm:py-1 sm:text-[11px]",
                        toneClasses[STATUS_TONE[n.status] ?? "muted"],
                      )}
                    >
                      {n.status}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground sm:h-8 sm:w-8"
                        >
                          <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="sr-only">Notice actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewingNotice(n)}>
                          <Eye className="h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(n)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        {(n.status === "DRAFT" || n.status === "SCHEDULED") && (
                          <DropdownMenuItem
                            onClick={async () => {
                              await cancelFn({ data: { notice_id: n.id } });
                              qc.invalidateQueries({ queryKey: ["notices"] });
                            }}
                          >
                            Cancel
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={!!viewingNotice} onOpenChange={(v) => !v && setViewingNotice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">{viewingNotice?.title}</DialogTitle>
          </DialogHeader>
          {viewingNotice && (
            <div className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap break-words">{viewingNotice.body}</p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full border-transparent",
                    toneClasses[STATUS_TONE[viewingNotice.status] ?? "muted"],
                  )}
                >
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
