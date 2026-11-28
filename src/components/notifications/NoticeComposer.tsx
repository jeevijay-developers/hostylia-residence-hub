import { useEffect, useMemo, useState } from "react";
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
import {
  CustomAudiencePicker,
  type AudienceBlockOption,
  type AudienceStudentOption,
} from "@/components/notifications/CustomAudiencePicker";
import { previewNoticeAudience } from "@/lib/notice-audience.functions";
import { formatIstDate, formatIstDateTime, istInputToIso } from "@/lib/ist";
import { effectiveNoticeStatus, useNowTick } from "@/lib/notice-time";
import { SchedulePicker } from "@/components/notifications/SchedulePicker";
import {
  NOTICE_CATEGORIES,
  isNoticeCategory,
  withInApp,
  type NoticeCategory,
  type NoticeChannelKey,
} from "@/lib/notice-defaults";
import {
  channelAvailability,
  useNoticeChannelAvailability,
  usePropertyNoticeDefaults,
} from "@/lib/property-notices";
import { CATEGORY_META } from "@/components/hostel/notices/notice-meta";
/** notices.category is text (checked against NOTICE_CATEGORIES in the database): narrow it. */
const categoryOf = (n: { category?: string | null }): NoticeCategory =>
  isNoticeCategory(n.category) ? n.category : "GENERAL";

const CHANNELS = [
  { key: "IN_APP", label: "In-app", icon: Smartphone },
  { key: "SMS", label: "SMS", icon: MessageSquare },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { key: "EMAIL", label: "Email", icon: Mail },
] as const;

const AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "WARDENS", "ACCOUNTANTS", "CUSTOM"] as const;
const AUDIENCE_LABEL: Partial<Record<(typeof AUDIENCES)[number], string>> = {
  CUSTOM: "Custom audience",
};

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

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "IMPORTANT" | "URGENT">("NORMAL");
  const [category, setCategory] = useState<NoticeCategory>("GENERAL");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("ALL");
  // In-app is always on: the scheduled publisher delivers every notice in-app.
  const [channels, setChannels] = useState<NoticeChannelKey[]>(["IN_APP"]);
  // New notices start from the property's default channels (Notices tab > Broadcast channels) until the
  // user picks channels themselves.
  const defaultsQ = usePropertyNoticeDefaults(propertyId);
  const [channelsTouched, setChannelsTouched] = useState(false);
  useEffect(() => {
    setChannelsTouched(false);
  }, [propertyId]);
  useEffect(() => {
    if (!channelsTouched && defaultsQ.data) setChannels(withInApp(defaultsQ.data));
  }, [defaultsQ.data, channelsTouched]);
  // What the admin types is Indian Standard Time ("YYYY-MM-DDTHH:mm"), whatever the device's timezone;
  // it is converted to the exact UTC instant only when sent.
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const publishAtIso = publishAt ? istInputToIso(publishAt) : null;
  const expiresAtIso = expiresAt ? istInputToIso(expiresAt) : null;
  const nowTick = useNowTick(30_000);
  let timeError: string | null = null;
  if (publishAt && !publishAtIso) timeError = "Enter a valid schedule date and time (IST).";
  else if (publishAtIso && Date.parse(publishAtIso) <= nowTick) {
    timeError = "The schedule time must be in the future (IST).";
  } else if (expiresAt && !expiresAtIso) {
    timeError = "Enter a valid expiry date and time (IST).";
  } else if (expiresAtIso && Date.parse(expiresAtIso) <= nowTick) {
    timeError = "The expiry time must be in the future (IST).";
  } else if (expiresAtIso && publishAtIso && Date.parse(expiresAtIso) <= Date.parse(publishAtIso)) {
    timeError = "The expiry time must be after the schedule time (IST).";
  }
  const [listView, setListView] = useState<"active" | "history">("active");
  const [showAll, setShowAll] = useState(false);
  const [customStudents, setCustomStudents] = useState<AudienceStudentOption[]>([]);
  const [customBlocks, setCustomBlocks] = useState<AudienceBlockOption[]>([]);

  const tenantId = usePropertyTenantId(propertyId);

  // Which channels the platform can really deliver, asked of the server (which asks the sender). The
  // browser only gets booleans + a reason; nothing here is hardcoded.
  const availabilityQ = useNoticeChannelAvailability(tenantId);
  // A custom selection belongs to one property.
  useEffect(() => {
    setCustomStudents([]);
    setCustomBlocks([]);
  }, [propertyId]);

  // The real recipient count, resolved by the server exactly as publishing will (blocks expanded,
  // duplicates removed, eligibility and property scope checked).
  const previewFn = useServerFn(previewNoticeAudience);
  const customStudentIds = customStudents.map((s) => s.id);
  const customBlockIds = customBlocks.map((b) => b.id);
  const previewQ = useQuery({
    queryKey: [
      "notice-audience-preview",
      tenantId,
      propertyId,
      [...customStudentIds].sort().join(","),
      [...customBlockIds].sort().join(","),
    ],
    enabled:
      audience === "CUSTOM" &&
      !!tenantId &&
      (customStudentIds.length > 0 || customBlockIds.length > 0),
    staleTime: 15_000,
    retry: false,
    queryFn: () =>
      previewFn({
        data: {
          tenant_id: tenantId ?? "",
          property_id: propertyId,
          student_ids: customStudentIds,
          block_ids: customBlockIds,
        },
      }),
  });

  // In-app never depends on a provider; every other channel is enabled only when the server says so.
  const channelState = (key: NoticeChannelKey) => channelAvailability(availabilityQ, key);
  // A selected channel that is (or becomes) unavailable is never submitted. In-app is always available,
  // so this is never empty.
  const activeChannels = channels.filter((c) => channelState(c).enabled);
  const { data: notices = [] } = useTenantNotices(tenantId, propertyId, true);
  const sortedNotices = useMemo(
    () =>
      [...notices].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [notices],
  );
  // Active = drafts, scheduled and live notices. History = expired and cancelled ones, kept for reference.
  const listedNotices = useMemo(
    () =>
      sortedNotices.filter((n) => {
        const status = effectiveNoticeStatus(n, nowTick);
        const inHistory = status === "EXPIRED" || status === "CANCELLED";
        return listView === "history" ? inHistory : !inHistory;
      }),
    [sortedNotices, listView, nowTick],
  );
  const visibleNotices = showAll ? listedNotices : listedNotices.slice(0, 5);

  const [viewingNotice, setViewingNotice] = useState<NoticeRow | null>(null);
  const [editingNotice, setEditingNotice] = useState<NoticeRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPriority, setEditPriority] = useState<"NORMAL" | "IMPORTANT" | "URGENT">("NORMAL");
  const [editCategory, setEditCategory] = useState<NoticeCategory>("GENERAL");

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
          category: editCategory,
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

  const cancel = useMutation({
    mutationFn: (noticeId: string) => cancelFn({ data: { notice_id: noticeId } }),
    onSuccess: () => {
      toast.success("Notice cancelled — it won't be sent");
      qc.invalidateQueries({ queryKey: ["notices"] });
      qc.invalidateQueries({ queryKey: ["property-notices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(n: NoticeRow) {
    setEditingNotice(n);
    setEditTitle(n.title);
    setEditBody(n.body);
    setEditPriority(n.priority as "NORMAL" | "IMPORTANT" | "URGENT");
    setEditCategory(categoryOf(n));
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
          category,
          audience_type: audience,
          channels: activeChannels,
          publish_at: publishAtIso,
          publish_now: !publishAtIso,
          expires_at: expiresAtIso,
          ...(audience === "CUSTOM"
            ? { custom_student_ids: customStudentIds, custom_block_ids: customBlockIds }
            : {}),
        },
      });
    },
    onSuccess: (r) => {
      const label = (ch: string) => CHANNELS.find((c) => c.key === ch)?.label ?? ch;
      const skippedNote = r.skipped.length
        ? `Skipped (no contact on file): ${r.skipped.map((s) => `${label(s.channel)} ${s.count}`).join(", ")}`
        : undefined;
      if (r.failures.length > 0) {
        // The notice exists, but some notifications could not be queued: say which and why.
        toast.warning(
          `Notice created, but ${r.failed} notification(s) could not be sent${r.dispatched ? ` (${r.dispatched} queued)` : ""}`,
          {
            description: [
              r.failures.map((f) => `${label(f.channel)}: ${f.reason} (${f.count})`).join(" · "),
              skippedNote,
            ]
              .filter(Boolean)
              .join(" — "),
          },
        );
      } else {
        toast.success(
          `Notice created${r.dispatched ? ` — ${r.dispatched} notification(s) dispatched` : ""}`,
          skippedNote ? { description: skippedNote } : undefined,
        );
      }
      setTitle("");
      setBody("");
      setCategory("GENERAL");
      setPublishAt("");
      setExpiresAt("");
      setCustomStudents([]);
      setCustomBlocks([]);
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      // The refusal may mean provider status changed since the page loaded.
      qc.invalidateQueries({ queryKey: ["notice-channel-availability"] });
    },
  });

  const customReady =
    audience !== "CUSTOM" || (previewQ.isSuccess && (previewQ.data?.count ?? 0) > 0);
  const canSubmit =
    title.trim().length >= 3 && body.trim().length >= 3 && customReady && !timeError;

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
              className="mt-1.5 resize-none"
              placeholder="Write your notice here…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => isNoticeCategory(v) && setCategory(v)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                      {AUDIENCE_LABEL[a] ?? a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {audience === "CUSTOM" && (
            <CustomAudiencePicker
              tenantId={tenantId}
              propertyId={propertyId}
              students={customStudents}
              blocks={customBlocks}
              onStudentsChange={setCustomStudents}
              onBlocksChange={setCustomBlocks}
              preview={{
                isLoading: previewQ.isFetching,
                error: previewQ.isError ? previewQ.error.message : null,
                count: previewQ.data?.count ?? null,
                duplicates: previewQ.data?.duplicates ?? 0,
              }}
            />
          )}
          <div>
            <Label>Channels</Label>
            <TooltipProvider>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const alwaysOn = c.key === "IN_APP";
                  const { enabled, reason } = channelState(c.key);
                  const selected = alwaysOn || (enabled && channels.includes(c.key));
                  const Icon = c.icon;
                  const button = (
                    <button
                      key={c.key}
                      type="button"
                      disabled={alwaysOn || !enabled}
                      aria-pressed={selected}
                      title={alwaysOn ? "Always on" : undefined}
                      onClick={() => {
                        setChannelsTouched(true);
                        setChannels((prev) =>
                          withInApp(
                            prev.includes(c.key)
                              ? prev.filter((x) => x !== c.key)
                              : [...prev, c.key],
                          ),
                        );
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 sm:gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium transition disabled:cursor-not-allowed",
                        !alwaysOn && "disabled:opacity-50",
                        selected
                          ? "border-warning bg-warning/10 text-warning"
                          : "border-border bg-transparent text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {c.label}
                      {alwaysOn ? <span className="sr-only"> (always on)</span> : null}
                    </button>
                  );
                  return !enabled ? (
                    <Tooltip key={c.key}>
                      <TooltipTrigger asChild>
                        <span>{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>{reason ?? "Provider not configured"}</TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  );
                })}
              </div>
            </TooltipProvider>
            <p className="mt-1 text-xs text-muted-foreground">In-app is always on.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="notice-schedule">Schedule (optional, IST)</Label>
              <SchedulePicker
                id="notice-schedule"
                value={publishAt}
                onChange={setPublishAt}
                placeholder="Select schedule date & time (IST)"
                pickerLabel="schedule date and time"
              />
            </div>
            <div>
              <Label htmlFor="notice-expiry">Expires (optional, IST)</Label>
              <SchedulePicker
                id="notice-expiry"
                value={expiresAt}
                onChange={setExpiresAt}
                placeholder="Select expiry date & time (IST)"
                pickerLabel="expiry date and time"
                notBefore={publishAt}
                invalid={!!timeError}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Times are in Indian Standard Time (IST), whatever your device&apos;s timezone.
            </p>
            {timeError && (
              <p role="alert" className="text-xs text-destructive sm:col-span-2">
                {timeError}
              </p>
            )}
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
          <div className="flex shrink-0 items-center gap-1.5">
            {(["active", "history"] as const).map((v) => (
              <Button
                key={v}
                variant={listView === v ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={listView === v}
                onClick={() => {
                  setListView(v);
                  setShowAll(false);
                }}
              >
                {v === "active" ? "Active" : "History"}
              </Button>
            ))}
            {listedNotices.length > 5 && (
              <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : "View all"}
              </Button>
            )}
          </div>
        </div>
        {listedNotices.length === 0 ? (
          listView === "history" ? (
            <EmptyState
              title="No expired or cancelled notices"
              description="Expired and cancelled notices are kept here."
            />
          ) : (
            <EmptyState title="No notices yet" description="Published notices will appear here." />
          )
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
                      {CATEGORY_META[categoryOf(n)].label} · {n.audience_type} ·{" "}
                      {n.channels.join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:text-xs">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {formatIstDate(n.created_at)}
                      </span>
                      {n.status === "SCHEDULED" && n.publish_at && (
                        <span className="break-words">
                          Scheduled for {formatIstDateTime(n.publish_at)}
                        </span>
                      )}
                      {n.expires_at && (
                        <span className="break-words">
                          {effectiveNoticeStatus(n, nowTick) === "EXPIRED" ? "Expired" : "Expires"}{" "}
                          {formatIstDateTime(n.expires_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full border-transparent px-1.5 py-0.5 text-[9px] sm:px-2.5 sm:py-1 sm:text-[11px]",
                        toneClasses[STATUS_TONE[effectiveNoticeStatus(n, nowTick)] ?? "muted"],
                      )}
                    >
                      {effectiveNoticeStatus(n, nowTick)}
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
                            disabled={cancel.isPending}
                            onClick={() => cancel.mutate(n.id)}
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
                    toneClasses[
                      STATUS_TONE[effectiveNoticeStatus(viewingNotice, nowTick)] ?? "muted"
                    ],
                  )}
                >
                  {effectiveNoticeStatus(viewingNotice, nowTick)}
                </Badge>
                <span>{viewingNotice.priority}</span>
                <span>{viewingNotice.audience_type}</span>
                <span>{viewingNotice.channels.join(", ")}</span>
              </div>
              {viewingNotice.published_at && (
                <p className="text-xs text-muted-foreground">
                  Published {formatIstDateTime(viewingNotice.published_at)}
                </p>
              )}
              {viewingNotice.expires_at && (
                <p className="text-xs text-muted-foreground">
                  {effectiveNoticeStatus(viewingNotice, nowTick) === "EXPIRED"
                    ? "Expired"
                    : "Expires"}{" "}
                  {formatIstDateTime(viewingNotice.expires_at)}
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
                className="resize-none"
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
            <div>
              <Label>Category</Label>
              <Select
                value={editCategory}
                onValueChange={(v) => isNoticeCategory(v) && setEditCategory(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </SelectItem>
                  ))}
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
        .eq("id", propertyId ?? "")
        .maybeSingle();
      return data?.tenant_id ?? null;
    },
  });
  return useMemo(() => q.data ?? null, [q.data]);
}
