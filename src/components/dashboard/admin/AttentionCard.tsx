import type { LucideIcon } from "lucide-react";
import { Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AttentionTone = "destructive" | "warning" | "info";

export interface AttentionItem {
  key: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  isLoading?: boolean;
  tone: AttentionTone;
  /** Accessible description of where the tile goes, e.g. "Open complaints list". */
  actionLabel: string;
  onSelect: () => void;
}

// Each tile keeps its own soft colour (red / amber / blue) whatever the count,
// so the three are recognisable at a glance — the number carries the state.
const TONE: Record<AttentionTone, { tile: string; icon: string }> = {
  destructive: {
    tile: "border-destructive/30 bg-destructive/[0.07] hover:bg-destructive/[0.11]",
    icon: "text-destructive",
  },
  warning: {
    tile: "border-warning/35 bg-warning/[0.09] hover:bg-warning/[0.13]",
    icon: "text-warning",
  },
  info: {
    tile: "border-info/30 bg-info/[0.08] hover:bg-info/[0.12]",
    icon: "text-info",
  },
};

export function AttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          Needs Your Attention
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="grid h-full grid-cols-1 gap-3 min-[420px]:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={item.onSelect}
                  aria-label={`${item.count ?? 0} ${item.label}. ${item.actionLabel}`}
                  className={cn(
                    "flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    TONE[item.tone].tile,
                  )}
                >
                  <Icon className={cn("h-7 w-7", TONE[item.tone].icon)} aria-hidden="true" />
                  {item.isLoading ? (
                    <Skeleton className="h-8 w-10" />
                  ) : (
                    <span className="font-display text-3xl font-semibold leading-tight text-foreground tabular-nums">
                      {item.count ?? 0}
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground/80">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
