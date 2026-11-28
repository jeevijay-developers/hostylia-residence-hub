import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Clock, Send } from "lucide-react";
import { toast } from "sonner";

import { CHANNEL_META } from "@/components/hostel/notices/notice-meta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatIstDateTime } from "@/lib/ist";
import {
  NOTICE_CHANNELS,
  setNoticeDefaultChannels,
  type NoticeChannelKey,
} from "@/lib/notice-defaults";
import {
  channelAvailability,
  type PropertyNotice,
  type useNoticeChannelAvailability,
} from "@/lib/property-notices";

/** Notices waiting to go out, soonest first; each opens its Edit dialog. */
export function UpcomingNoticesCard({
  notices,
  total,
  isLoading,
  isError,
  onRetry,
  onOpen,
}: {
  notices: PropertyNotice[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (n: PropertyNotice) => void;
}) {
  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
          Upcoming notices
          {total > 0 ? (
            <span className="ml-auto rounded-full bg-info/10 px-2 py-0.5 text-xs font-semibold text-info tabular-nums">
              {total}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-2">
            <p className="text-sm text-muted-foreground">Couldn’t load upcoming notices.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing scheduled. Schedule a notice from Create notice to see it here.
          </p>
        ) : (
          <ol className="relative space-y-1">
            {notices.map((n, i) => (
              <li key={n.id} className="relative flex gap-3">
                <span className="relative flex w-3 shrink-0 justify-center" aria-hidden="true">
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-primary" />
                  {i < notices.length - 1 ? (
                    <span className="absolute top-5 bottom-[-0.75rem] w-px bg-primary/40" />
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(n)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Edit ${n.title}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {n.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {n.publish_at ? formatIstDateTime(n.publish_at) : "Not scheduled"}
                    </span>
                  </span>
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
        {total > notices.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            +{total - notices.length} more — filter the list by Scheduled to see all.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The property's default channels for new notices (properties.settings.notice_default_channels). In-app is
 * always on; a channel whose provider is not configured is disabled with the reason.
 */
export function BroadcastChannelsCard({
  propertyId,
  defaults,
  isLoading,
  isError,
  onRetry,
  availabilityQ,
}: {
  propertyId: string;
  defaults: NoticeChannelKey[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  availabilityQ: ReturnType<typeof useNoticeChannelAvailability>;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(setNoticeDefaultChannels);
  const save = useMutation({
    mutationFn: (channels: NoticeChannelKey[]) =>
      saveFn({ data: { property_id: propertyId, channels } }),
    onSuccess: (r) => {
      qc.setQueryData(["property-notice-defaults", propertyId], r.channels);
      qc.invalidateQueries({ queryKey: ["property-notice-defaults", propertyId] });
      toast.success("Default channels saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Send className="h-5 w-5 text-primary" aria-hidden="true" />
          Broadcast channels
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pre-selected for every new notice. You can still change them per notice.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : isError || !defaults ? (
          // Never show (or save from) a guess: a toggle saves the whole list, so it needs the stored one.
          <div className="py-2">
            <p className="text-sm text-muted-foreground">Couldn’t load the default channels.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {NOTICE_CHANNELS.map((c) => {
              const Icon = CHANNEL_META[c].icon;
              const { enabled, reason } = channelAvailability(availabilityQ, c);
              const alwaysOn = c === "IN_APP";
              const checked = alwaysOn || (enabled && defaults.includes(c));
              const id = `notice-default-${c}`;
              return (
                <li key={c} className="flex items-center gap-3 py-2.5">
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="block text-sm font-medium text-foreground">
                      {c === "IN_APP" ? "In-app notification" : CHANNEL_META[c].label}
                    </label>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={reason ?? undefined}
                    >
                      {alwaysOn ? "Always on" : enabled ? "Available" : reason}
                    </p>
                  </div>
                  <Switch
                    id={id}
                    checked={checked}
                    disabled={alwaysOn || !enabled || save.isPending}
                    onCheckedChange={(on) =>
                      save.mutate(
                        NOTICE_CHANNELS.filter((x) => (x === c ? on : defaults.includes(x))),
                      )
                    }
                    aria-label={`${CHANNEL_META[c].label} by default`}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {!isLoading && defaults && availabilityQ.isError ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => availabilityQ.refetch()}
          >
            Check providers again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
