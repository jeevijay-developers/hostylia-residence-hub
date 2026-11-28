import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, CalendarClock, Megaphone, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { NoticeFormDialog } from "@/components/hostel/notices/NoticeFormDialog";
import {
  BroadcastChannelsCard,
  UpcomingNoticesCard,
} from "@/components/hostel/notices/NoticeSideCards";
import {
  DEFAULT_NOTICE_LIST_FILTERS,
  type NoticeListFilters,
} from "@/components/hostel/notices/notice-meta";
import {
  NoticesTableCard,
  NoticesToolbar,
  type NoticeActions,
} from "@/components/hostel/notices/NoticesTableCard";
import { KpiTile } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import { SchedulePicker } from "@/components/notifications/SchedulePicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatIstDateTime, isoToIstInput, istInputToIso } from "@/lib/ist";
import { archiveNotice, deleteNotice, restoreNotice } from "@/lib/notice.functions";
import { useNowTick } from "@/lib/notice-time";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import {
  noticePhase,
  useNoticeChannelAvailability,
  useNoticeCounts,
  usePropertyNoticeDefaults,
  useUpcomingNotices,
  type PropertyNotice,
} from "@/lib/property-notices";

/**
 * A property's Notices tab: notice KPIs, the notices list (search, status chips, category / audience
 * filters, list or grid, 8 per page), upcoming scheduled notices and the property's default broadcast
 * channels. Create / Edit / Archive / Restore / Delete all go through the notice server functions.
 */
export function PropertyNotices({ property }: { property: OverviewProperty }) {
  const qc = useQueryClient();
  const statsQ = usePropertyOverviewStats(property.id);
  const countsQ = useNoticeCounts(property.id);
  const upcomingQ = useUpcomingNotices(property.id);
  const defaultsQ = usePropertyNoticeDefaults(property.id);
  const availabilityQ = useNoticeChannelAvailability(property.tenant_id);
  const counts = countsQ.data;

  // Dialog state. `formKey` remounts the form so every open starts from the notice (or a blank form).
  const [form, setForm] = useState<{ key: number; notice: PropertyNotice | null } | null>(null);
  const [restoring, setRestoring] = useState<PropertyNotice | null>(null);
  const [deleting, setDeleting] = useState<PropertyNotice | null>(null);
  // The toolbar spans the list and the side cards (one row, as in the design), so the tab owns its state.
  const [listFilters, setListFilters] = useState<NoticeListFilters>(DEFAULT_NOTICE_LIST_FILTERS);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-notices", property.id] });
    qc.invalidateQueries({ queryKey: ["notices"] });
  };

  const archiveFn = useServerFn(archiveNotice);
  const archive = useMutation({
    mutationFn: (n: PropertyNotice) => archiveFn({ data: { notice_id: n.id } }),
    onSuccess: (r) => {
      toast.success(
        r.archived_as === "CANCELLED"
          ? "Notice cancelled and archived — it won't be sent"
          : "Notice archived — it no longer shows in feeds",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deleteNotice);
  const remove = useMutation({
    mutationFn: (n: PropertyNotice) => deleteFn({ data: { notice_id: n.id } }),
    onSuccess: () => {
      toast.success("Notice deleted");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actions: NoticeActions = {
    onEdit: (n) => setForm({ key: Date.now(), notice: n }),
    onArchive: (n) => archive.mutate(n),
    onRestore: (n) => setRestoring(n),
    onDelete: (n) => setDeleting(n),
  };

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <PropertyHero
        property={property}
        blocks={statsQ.data?.blocksCount}
        beds={statsQ.data?.beds.total}
        residents={statsQ.data?.residents}
        isLoadingCounts={statsQ.isLoading}
      />
      <PropertyTabs slug={property.slug} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <KpiTile
          icon={Send}
          label="Total notices"
          value={counts?.total ?? 0}
          isLoading={countsQ.isLoading}
          caption="Every notice, not deleted"
        />
        <KpiTile
          icon={Megaphone}
          label="Active"
          value={counts?.active ?? 0}
          isLoading={countsQ.isLoading}
          caption="Published and not expired"
        />
        <KpiTile
          icon={CalendarClock}
          label="Scheduled"
          value={counts?.scheduled ?? 0}
          isLoading={countsQ.isLoading}
          caption="Waiting to go out"
        />
        <KpiTile
          icon={Archive}
          label="Archived"
          value={counts?.archived ?? 0}
          isLoading={countsQ.isLoading}
          caption="Expired or cancelled"
        />
        <Button
          size="lg"
          className="h-auto min-h-14 rounded-2xl px-6 text-base sm:col-span-2 xl:col-span-1 xl:self-center"
          onClick={() => setForm({ key: Date.now(), notice: null })}
        >
          <Plus className="h-5 w-5" />
          Create notice
        </Button>
      </div>
      {countsQ.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t load the notice counts.{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => countsQ.refetch()}
          >
            Try again
          </button>
        </p>
      ) : null}

      <NoticesToolbar
        value={listFilters}
        onChange={(patch) => setListFilters((f) => ({ ...f, ...patch }))}
        counts={counts}
      />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <NoticesTableCard propertyId={property.id} filters={listFilters} actions={actions} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:flex 2xl:flex-col">
          <UpcomingNoticesCard
            notices={upcomingQ.data?.rows ?? []}
            total={upcomingQ.data?.total ?? 0}
            isLoading={upcomingQ.isLoading}
            isError={upcomingQ.isError}
            onRetry={() => upcomingQ.refetch()}
            onOpen={actions.onEdit}
          />
          <BroadcastChannelsCard
            propertyId={property.id}
            defaults={defaultsQ.data}
            isLoading={defaultsQ.isLoading}
            isError={defaultsQ.isError}
            onRetry={() => defaultsQ.refetch()}
            availabilityQ={availabilityQ}
          />
        </div>
      </div>

      {form ? (
        <NoticeFormDialog
          key={form.key}
          open
          onOpenChange={(v) => !v && setForm(null)}
          propertyId={property.id}
          tenantId={property.tenant_id}
          notice={form.notice}
          defaultChannels={defaultsQ.data}
          onSaved={refresh}
        />
      ) : null}

      {restoring ? (
        <RestoreNoticeDialog
          key={restoring.id}
          notice={restoring}
          onClose={() => setRestoring(null)}
          onDone={refresh}
        />
      ) : null}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && !remove.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this notice?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” will be removed from this list and from every resident and parent
              feed.
              {deleting && noticePhase(deleting) === "SCHEDULED"
                ? " It is scheduled, so it will also never be sent."
                : " Notifications that were already delivered are not recalled."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete notice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Restore an archived notice: a published one comes back with a new expiry (or none); one that never went
 * out goes back on the schedule for a future time.
 */
function RestoreNoticeDialog({
  notice,
  onClose,
  onDone,
}: {
  notice: PropertyNotice;
  onClose: () => void;
  onDone: () => void;
}) {
  const now = useNowTick(30_000);
  const wasPublished =
    notice.status === "PUBLISHED" || (notice.status === "EXPIRED" && !!notice.published_at);
  const futurePublish =
    notice.publish_at && Date.parse(notice.publish_at) > now
      ? isoToIstInput(notice.publish_at)
      : "";
  const [publishAt, setPublishAt] = useState(futurePublish);
  const [expiresAt, setExpiresAt] = useState("");
  const publishIso = publishAt ? istInputToIso(publishAt) : null;
  const expiresIso = expiresAt ? istInputToIso(expiresAt) : null;

  // Nothing picked yet is not a mistake: a neutral hint, while Restore waits for a time.
  const needsPublishTime = !wasPublished && !publishAt;
  let error: string | null = null;
  if (!wasPublished && publishAt) {
    if (!publishIso) error = "Enter a valid schedule date and time (IST).";
    else if (Date.parse(publishIso) <= now)
      error = "The schedule time must be in the future (IST).";
  }
  if (!error && expiresAt) {
    if (!expiresIso) error = "Enter a valid expiry date and time (IST).";
    else if (Date.parse(expiresIso) <= now) error = "The expiry time must be in the future (IST).";
    else if (publishIso && Date.parse(expiresIso) <= Date.parse(publishIso)) {
      error = "The expiry time must be after the schedule time (IST).";
    }
  }

  const restoreFn = useServerFn(restoreNotice);
  const restore = useMutation({
    mutationFn: () =>
      restoreFn({
        data: {
          notice_id: notice.id,
          expires_at: expiresIso,
          ...(wasPublished ? {} : { publish_at: publishIso }),
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.restored_to === "PUBLISHED"
          ? "Notice restored — it shows in feeds again"
          : `Notice restored — scheduled for ${formatIstDateTime(publishIso)}`,
      );
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && !restore.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore notice</DialogTitle>
          <DialogDescription>
            {wasPublished
              ? "It becomes active again and shows in feeds. Nothing is sent again."
              : "It was never sent. Pick when it should go out."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="truncate text-sm font-medium text-foreground">{notice.title}</p>
          {!wasPublished ? (
            <div>
              <Label htmlFor="restore-publish-at">Send at (IST)</Label>
              <SchedulePicker
                id="restore-publish-at"
                value={publishAt}
                onChange={setPublishAt}
                placeholder="Select date & time (IST)"
                pickerLabel="schedule date and time"
              />
              {needsPublishTime ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Pick when to send this notice (IST).
                </p>
              ) : null}
            </div>
          ) : null}
          <div>
            <Label htmlFor="restore-expires-at">New expiry (optional, IST)</Label>
            <SchedulePicker
              id="restore-expires-at"
              value={expiresAt}
              onChange={setExpiresAt}
              placeholder="No expiry"
              pickerLabel="expiry date and time"
              notBefore={publishAt || undefined}
              invalid={!!error && !!expiresAt}
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={restore.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => restore.mutate()}
            disabled={needsPublishTime || !!error || restore.isPending}
          >
            {restore.isPending ? "Restoring…" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
