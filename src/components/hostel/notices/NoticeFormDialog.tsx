import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Info, Lock, Send, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AUDIENCE_HINT,
  AUDIENCE_LABEL,
  CATEGORY_META,
  CHANNEL_META,
  audienceText,
} from "@/components/hostel/notices/notice-meta";
import {
  CustomAudiencePicker,
  type AudienceBlockOption,
  type AudienceStudentOption,
} from "@/components/notifications/CustomAudiencePicker";
import { SchedulePicker } from "@/components/notifications/SchedulePicker";
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
import { formatIstDateTime, isoToIstInput, istInputToIso } from "@/lib/ist";
import {
  NOTICE_CATEGORIES,
  NOTICE_CHANNELS,
  isNoticeCategory,
  withInApp,
  type NoticeCategory,
  type NoticeChannelKey,
} from "@/lib/notice-defaults";
import { previewNoticeAudience } from "@/lib/notice-audience.functions";
import { editNotice, publishNotice, type EditNoticeInput } from "@/lib/notice.functions";
import { useNowTick } from "@/lib/notice-time";
import {
  NOTICE_AUDIENCES,
  canRestoreNotice,
  channelAvailability,
  isNoticeAudience,
  noticePhase,
  useNoticeChannelAvailability,
  type NoticeAudience,
  type PropertyNotice,
} from "@/lib/property-notices";
import { cn } from "@/lib/utils";

type Priority = "NORMAL" | "IMPORTANT" | "URGENT";
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "IMPORTANT", label: "Important" },
  { value: "URGENT", label: "Urgent" },
];

const isPriority = (v: string): v is Priority =>
  v === "NORMAL" || v === "IMPORTANT" || v === "URGENT";
const isChannel = (v: string): v is NoticeChannelKey =>
  (NOTICE_CHANNELS as readonly string[]).includes(v);

/**
 * Create / Edit notice. Every field the Notices tab shows is set here: title, body, category, priority,
 * audience (incl. selected residents / blocks), publish now or at a time, optional expiry and channels.
 * For a notice that was already sent (or archived) the fields that can no longer change are shown
 * read-only with the reason, mirroring what editNotice enforces on the server.
 */
export function NoticeFormDialog({
  open,
  onOpenChange,
  propertyId,
  tenantId,
  notice,
  defaultChannels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  tenantId: string;
  /** Edit this notice; omitted = create. */
  notice?: PropertyNotice | null;
  /** The property's default channels (Broadcast channels card). */
  defaultChannels: NoticeChannelKey[] | undefined;
  onSaved: () => void;
}) {
  const isEdit = !!notice;
  const nowTick = useNowTick(30_000);
  const phase = notice ? noticePhase(notice, nowTick) : "SCHEDULED";
  const canEditDelivery = !notice || phase === "SCHEDULED";
  const canEditExpiry = !notice || phase !== "ARCHIVED";

  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [category, setCategory] = useState<NoticeCategory>(notice?.category ?? "GENERAL");
  const [priority, setPriority] = useState<Priority>(
    notice && isPriority(notice.priority) ? notice.priority : "NORMAL",
  );
  const [audience, setAudience] = useState<NoticeAudience>(
    notice && isNoticeAudience(notice.audience_type) ? notice.audience_type : "ALL",
  );
  // Edit of a CUSTOM notice: keep its stored list unless the admin chooses again.
  const [chooseRecipients, setChooseRecipients] = useState(notice?.audience_type !== "CUSTOM");
  const [customStudents, setCustomStudents] = useState<AudienceStudentOption[]>([]);
  const [customBlocks, setCustomBlocks] = useState<AudienceBlockOption[]>([]);
  // null = untouched: follow the property's defaults (create) or the notice's own channels (edit).
  // In-app is always on: the scheduled publisher delivers every notice in-app.
  const [pickedChannels, setPickedChannels] = useState<NoticeChannelKey[] | null>(
    notice ? withInApp(notice.channels) : null,
  );
  const initialPublishAt =
    notice && phase === "SCHEDULED" && notice.publish_at ? isoToIstInput(notice.publish_at) : "";
  const initialExpiresAt = notice?.expires_at ? isoToIstInput(notice.expires_at) : "";
  const [when, setWhen] = useState<"NOW" | "SCHEDULE">(isEdit ? "SCHEDULE" : "NOW");
  const [publishAt, setPublishAt] = useState(initialPublishAt);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);

  const availabilityQ = useNoticeChannelAvailability(tenantId);
  const channels = withInApp(pickedChannels ?? defaultChannels ?? []);
  // Edit: the notice's own channels stay selected even when their provider can't be verified right now
  // (they can still be removed), and are only sent to the server when the admin changed them, so fixing a
  // typo never drops a stored WhatsApp / Email / SMS channel.
  const storedChannels = notice ? withInApp(notice.channels) : [];
  const isPicked = (c: NoticeChannelKey) =>
    channels.includes(c) &&
    (channelAvailability(availabilityQ, c).enabled || storedChannels.includes(c));
  // Create: unavailable channels are never submitted; In-app is always available, so never empty.
  const activeChannels = channels.filter(isPicked);
  const channelsChanged =
    activeChannels.length !== storedChannels.length ||
    activeChannels.some((c) => !storedChannels.includes(c));

  // Recipient count for a custom selection, resolved by the server exactly as publishing will.
  const previewFn = useServerFn(previewNoticeAudience);
  const studentIds = customStudents.map((s) => s.id);
  const blockIds = customBlocks.map((b) => b.id);
  const needsSelection = canEditDelivery && audience === "CUSTOM" && chooseRecipients;
  const previewQ = useQuery({
    queryKey: [
      "notice-audience-preview",
      tenantId,
      propertyId,
      [...studentIds].sort().join(","),
      [...blockIds].sort().join(","),
    ],
    enabled: needsSelection && (studentIds.length > 0 || blockIds.length > 0),
    staleTime: 15_000,
    retry: false,
    queryFn: () =>
      previewFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          student_ids: studentIds,
          block_ids: blockIds,
        },
      }),
  });

  // ---- time validation (IST wall clock in, UTC instants out) ----
  const publishChanged = when === "NOW" || publishAt !== initialPublishAt;
  const expiryChanged = expiresAt !== initialExpiresAt;
  const publishIso = when === "SCHEDULE" && publishAt ? istInputToIso(publishAt) : null;
  const expiresIso = expiresAt ? istInputToIso(expiresAt) : null;
  const goesOutMs = !canEditDelivery
    ? Date.parse(notice?.published_at ?? notice?.publish_at ?? "")
    : when === "NOW"
      ? nowTick
      : publishIso
        ? Date.parse(publishIso)
        : Number.NaN;
  // Nothing picked yet is not a mistake: a neutral hint, while the submit button waits for a time.
  const needsPublishTime = canEditDelivery && when === "SCHEDULE" && !publishAt;
  let timeError: string | null = null;
  if (canEditDelivery && when === "SCHEDULE" && publishAt) {
    if (!publishIso) timeError = "Enter a valid schedule date and time (IST).";
    else if (publishChanged && Date.parse(publishIso) <= nowTick) {
      timeError = "The schedule time must be in the future (IST).";
    }
  }
  if (!timeError && canEditExpiry && expiresAt && (expiryChanged || publishChanged)) {
    if (!expiresIso) timeError = "Enter a valid expiry date and time (IST).";
    else if (expiryChanged && Date.parse(expiresIso) <= nowTick) {
      timeError = "The expiry time must be in the future (IST).";
    } else if (!Number.isNaN(goesOutMs) && Date.parse(expiresIso) <= goesOutMs) {
      timeError = "The expiry time must be after the notice goes out (IST).";
    }
  }

  const selectionReady = !needsSelection || (previewQ.isSuccess && (previewQ.data?.count ?? 0) > 0);
  const canSubmit =
    // Until provider status is known, external channels look unavailable: never save on that guess.
    (!canEditDelivery || !availabilityQ.isPending) &&
    title.trim().length >= 3 &&
    body.trim().length >= 3 &&
    selectionReady &&
    !needsPublishTime &&
    !timeError;

  const publishFn = useServerFn(publishNotice);
  const editFn = useServerFn(editNotice);
  const save = useMutation({
    mutationFn: async () => {
      if (!notice) {
        const r = await publishFn({
          data: {
            tenant_id: tenantId,
            property_id: propertyId,
            title,
            body,
            priority,
            category,
            audience_type: audience,
            channels: activeChannels,
            publish_now: when === "NOW",
            publish_at: when === "SCHEDULE" ? publishIso : null,
            expires_at: expiresIso,
            ...(audience === "CUSTOM"
              ? { custom_student_ids: studentIds, custom_block_ids: blockIds }
              : {}),
          },
        });
        return { kind: "create" as const, r };
      }
      const payload: EditNoticeInput = {
        notice_id: notice.id,
        title,
        body,
        priority,
        category,
      };
      if (canEditDelivery) {
        payload.audience_type = audience;
        if (needsSelection)
          payload.custom_recipients = { student_ids: studentIds, block_ids: blockIds };
        if (channelsChanged) payload.channels = activeChannels;
        if (when === "NOW") payload.publish_now = true;
        else if (publishChanged) payload.publish_at = publishIso;
      }
      if (canEditExpiry && expiryChanged) payload.expires_at = expiresIso;
      const r = await editFn({ data: payload });
      return { kind: "edit" as const, r };
    },
    onSuccess: (res) => {
      if (res.kind === "create") {
        const r = res.r;
        const label = (c: string) => (isChannel(c) ? CHANNEL_META[c].label : c);
        const skipped = r.skipped.length
          ? `Skipped (no contact on file): ${r.skipped.map((s) => `${label(s.channel)} ${s.count}`).join(", ")}`
          : undefined;
        if (r.failures.length > 0) {
          toast.warning(
            `Notice created, but ${r.failed} notification(s) could not be sent${r.dispatched ? ` (${r.dispatched} queued)` : ""}`,
            {
              description: [
                r.failures.map((f) => `${label(f.channel)}: ${f.reason} (${f.count})`).join(" · "),
                skipped,
              ]
                .filter(Boolean)
                .join(" — "),
            },
          );
        } else if (when === "SCHEDULE") {
          toast.success(`Notice scheduled for ${formatIstDateTime(publishIso)}`);
        } else {
          toast.success(
            `Notice published${r.dispatched ? ` — ${r.dispatched} notification(s) dispatched` : ""}`,
            skipped ? { description: skipped } : undefined,
          );
        }
      } else {
        toast.success(
          res.r.queued_for_next_run
            ? "Notice updated — it goes out on the next scheduler run (within 5 minutes)"
            : "Notice updated",
        );
      }
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sentNote =
    notice && phase === "ACTIVE"
      ? `Sent ${formatIstDateTime(notice.published_at ?? notice.publish_at)}. Audience, channels and publish time can't change after a notice goes out.`
      : notice && phase === "ARCHIVED"
        ? canRestoreNotice(notice, phase)
          ? "This notice is archived. Use Restore from the row menu (⋮) to send or show it again."
          : "This notice expired before it was sent and can't be restored. Create a new notice instead."
        : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit notice" : "Create notice"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Corrections are saved to the notice. Notifications that were already sent are not recalled or re-sent."
              : "Publish now or schedule it. Times are Indian Standard Time (IST)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="nf-title">Title</Label>
            <Input
              id="nf-title"
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Water supply maintenance"
            />
          </div>
          <div>
            <Label htmlFor="nf-body">Message</Label>
            <Textarea
              id="nf-body"
              className="mt-1.5 resize-none"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              placeholder="Write the notice…"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => isNoticeCategory(v) && setCategory(v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_CATEGORIES.map((c) => {
                    const Icon = CATEGORY_META[c].icon;
                    return (
                      <SelectItem key={c} value={c}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {CATEGORY_META[c].label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => isPriority(v) && setPriority(v)}>
                <SelectTrigger className="mt-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Flag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {sentNote ? (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sentNote}
            </p>
          ) : null}

          {/* Audience */}
          <div>
            <Label>Audience</Label>
            {canEditDelivery ? (
              <>
                <Select
                  value={audience}
                  onValueChange={(v) => isNoticeAudience(v) && setAudience(v)}
                >
                  <SelectTrigger className="mt-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Users
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_AUDIENCES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUDIENCE_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldNote>{AUDIENCE_HINT[audience]}</FieldNote>
                {audience === "CUSTOM" && notice?.audience_type === "CUSTOM" ? (
                  <div
                    className="mt-2 flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label="Recipients"
                  >
                    <SegmentButton
                      on={!chooseRecipients}
                      onClick={() => setChooseRecipients(false)}
                    >
                      Keep current list
                      {notice.recipientCount !== null
                        ? ` (${notice.recipientCount.toLocaleString("en-IN")})`
                        : ""}
                    </SegmentButton>
                    <SegmentButton on={chooseRecipients} onClick={() => setChooseRecipients(true)}>
                      Choose again
                    </SegmentButton>
                  </div>
                ) : null}
                {needsSelection ? (
                  <div className="mt-3">
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
                  </div>
                ) : null}
              </>
            ) : notice ? (
              <ReadOnlyValue>{audienceText(notice)}</ReadOnlyValue>
            ) : null}
          </div>

          {/* Channels */}
          <div>
            <Label>Channels</Label>
            {canEditDelivery ? (
              <>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {NOTICE_CHANNELS.map((c) => {
                    const alwaysOn = c === "IN_APP";
                    const { enabled, reason } = channelAvailability(availabilityQ, c);
                    const selected = alwaysOn || isPicked(c);
                    const Icon = CHANNEL_META[c].icon;
                    return (
                      <button
                        key={c}
                        type="button"
                        // An unavailable channel can't be added, but a stored one can be removed.
                        disabled={alwaysOn || (!enabled && !selected)}
                        aria-pressed={selected}
                        title={alwaysOn ? "Always on" : (reason ?? undefined)}
                        onClick={() =>
                          setPickedChannels(
                            selected
                              ? activeChannels.filter((x) => x !== c)
                              : withInApp([...activeChannels, c]),
                          )
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                          !alwaysOn && "disabled:opacity-50",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {alwaysOn ? (
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        )}
                        {CHANNEL_META[c].label}
                        {alwaysOn ? <span className="sr-only"> (always on)</span> : null}
                      </button>
                    );
                  })}
                </div>
                <FieldNote>In-app is always on; add WhatsApp, Email or SMS as needed.</FieldNote>
                <ChannelReasons availabilityQ={availabilityQ} />
              </>
            ) : notice ? (
              <ReadOnlyValue>
                {notice.channels
                  .map((c) => (isChannel(c) ? CHANNEL_META[c].label : c))
                  .join(", ") || "—"}
              </ReadOnlyValue>
            ) : null}
          </div>

          {/* When */}
          <div>
            <Label>When</Label>
            {canEditDelivery ? (
              <>
                <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="When">
                  <SegmentButton on={when === "NOW"} onClick={() => setWhen("NOW")}>
                    {isEdit ? "Send now" : "Publish now"}
                  </SegmentButton>
                  <SegmentButton on={when === "SCHEDULE"} onClick={() => setWhen("SCHEDULE")}>
                    Schedule
                  </SegmentButton>
                </div>
                {when === "SCHEDULE" ? (
                  <>
                    <SchedulePicker
                      id="nf-publish-at"
                      value={publishAt}
                      onChange={setPublishAt}
                      placeholder="Select date & time (IST)"
                      pickerLabel="schedule date and time"
                    />
                    {needsPublishTime ? (
                      <FieldNote>Pick the date and time to send this notice (IST).</FieldNote>
                    ) : null}
                  </>
                ) : isEdit ? (
                  <FieldNote>
                    Goes out on the scheduler&apos;s next run, within 5 minutes.
                  </FieldNote>
                ) : null}
              </>
            ) : notice ? (
              <ReadOnlyValue>
                {notice.published_at
                  ? `Published ${formatIstDateTime(notice.published_at)}`
                  : notice.publish_at
                    ? `Was scheduled for ${formatIstDateTime(notice.publish_at)}`
                    : "Not sent"}
              </ReadOnlyValue>
            ) : null}
          </div>

          {/* Expiry */}
          <div>
            <Label htmlFor="nf-expires-at">Expires (optional)</Label>
            {canEditExpiry ? (
              <>
                <SchedulePicker
                  id="nf-expires-at"
                  value={expiresAt}
                  onChange={setExpiresAt}
                  placeholder="No expiry"
                  pickerLabel="expiry date and time"
                  notBefore={canEditDelivery && when === "SCHEDULE" ? publishAt : undefined}
                  invalid={!!timeError && !!expiresAt}
                />
                <FieldNote>After this time the notice is archived and leaves every feed.</FieldNote>
              </>
            ) : notice ? (
              <ReadOnlyValue>
                {notice.expires_at ? formatIstDateTime(notice.expires_at) : "No expiry"}
              </ReadOnlyValue>
            ) : null}
          </div>

          {timeError ? (
            <p role="alert" className="text-xs text-destructive">
              {timeError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
            <Send className="h-4 w-4" />
            {save.isPending
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : when === "SCHEDULE"
                  ? "Schedule notice"
                  : "Publish now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldNote({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-muted-foreground">{children}</p>;
}

function ReadOnlyValue({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
    </p>
  );
}

function SegmentButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Unavailable channels, each with the reason the server gave. */
function ChannelReasons({
  availabilityQ,
}: {
  availabilityQ: ReturnType<typeof useNoticeChannelAvailability>;
}) {
  const blocked = NOTICE_CHANNELS.map((c) => ({
    c,
    ...channelAvailability(availabilityQ, c),
  })).filter((x) => !x.enabled);
  if (blocked.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {blocked.map(({ c, reason }) => (
        <li key={c} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {CHANNEL_META[c].label}: {reason ?? "Unavailable"}
          </span>
        </li>
      ))}
    </ul>
  );
}
