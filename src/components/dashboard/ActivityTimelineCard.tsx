import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  key: string;
  /** ISO timestamp. */
  at: string;
  icon: LucideIcon;
  text: ReactNode;
}

/** One timeline entry: icon on the rail, text, relative time. */
function TimelineRow({
  item,
  showConnector,
  hidden,
}: {
  item: TimelineItem;
  showConnector: boolean;
  hidden?: boolean;
}) {
  const Icon = item.icon;
  return (
    <li
      className={cn("relative flex items-center gap-3 py-1.5", hidden && "invisible")}
      aria-hidden={hidden || undefined}
    >
      {showConnector ? (
        <span
          className="absolute left-[17px] top-9 h-[calc(100%-20px)] w-px bg-border"
          aria-hidden="true"
        />
      ) : null}
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{item.text}</span>
      <time
        dateTime={item.at}
        className="shrink-0 text-xs text-muted-foreground"
        title={new Date(item.at).toLocaleString("en-IN")}
      >
        {formatDistanceToNowStrict(new Date(item.at), { addSuffix: true })}
      </time>
    </li>
  );
}

/**
 * A vertical activity timeline in a card.
 *
 * The list fills whatever height the card is given (e.g. stretched to match
 * the card beside it in a grid row) and shows only the items that fit
 * completely — never fewer than `minItems`. It is positioned out of flow, so
 * it never makes the row taller itself; the box's minimum height is measured
 * from what the first `minItems` items need, so wrapped text never clips.
 * "View all" opens every item (up to `maxItems`) in a dialog, leaving the
 * card's size untouched.
 */
export function ActivityTimelineCard({
  title,
  icon: TitleIcon,
  items,
  isLoading,
  isError,
  errorText = "Couldn’t load the activity. Please refresh to try again.",
  emptyText = "No activity yet.",
  minItems = 4,
  maxItems = 20,
  className,
}: {
  title: string;
  icon: LucideIcon;
  items: TimelineItem[];
  isLoading?: boolean;
  isError?: boolean;
  errorText?: string;
  emptyText?: string;
  minItems?: number;
  maxItems?: number;
  className?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fit, setFit] = useState(minItems);
  // Height the first `minItems` items really need (they wrap more on narrow cards).
  const [minHeight, setMinHeight] = useState(232);
  const listRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const children = Array.from(el.children);
      const last = children[Math.min(minItems, children.length) - 1];
      if (last) setMinHeight(Math.ceil(last.getBoundingClientRect().bottom - top) + 2);
      const bottom = el.getBoundingClientRect().bottom + 0.5;
      let n = 0;
      for (const child of children) {
        if (child.getBoundingClientRect().bottom <= bottom) n++;
        else break;
      }
      setFit(Math.max(minItems, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    // Rows are measured before the web font may have loaded; re-measure once it has.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // `isLoading` / `isError` / item count decide whether the list is mounted at all.
  }, [items, minItems, isLoading, isError]);

  const list = items.slice(0, maxItems);
  const visible = Math.min(list.length, fit);
  const hasMore = items.length > visible;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <Card
        className={cn(
          "flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient",
          className,
        )}
      >
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
            <TitleIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            {title}
          </CardTitle>
          {hasMore ? (
            <DialogTrigger asChild>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View all
              </button>
            </DialogTrigger>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{errorText}</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            <div className="relative flex-1" style={{ minHeight }}>
              <ol ref={listRef} className="absolute inset-0 space-y-1 overflow-hidden">
                {list.map((item, i) => (
                  <TimelineRow
                    key={item.key}
                    item={item}
                    hidden={i >= visible}
                    showConnector={i < visible - 1}
                  />
                ))}
              </ol>
            </div>
          )}
        </CardContent>

        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <TitleIcon className="h-5 w-5 text-primary" aria-hidden="true" />
              {title}
            </DialogTitle>
            <DialogDescription>
              {items.length > maxItems
                ? `The latest ${maxItems} of ${items.length} updates, newest first.`
                : `${items.length} ${items.length === 1 ? "update" : "updates"}, newest first.`}
            </DialogDescription>
          </DialogHeader>
          <ol className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
            {list.map((item, i) => (
              <TimelineRow key={item.key} item={item} showConnector={i < list.length - 1} />
            ))}
          </ol>
        </DialogContent>
      </Card>
    </Dialog>
  );
}
