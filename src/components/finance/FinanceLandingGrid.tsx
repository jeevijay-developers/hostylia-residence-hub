import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn, toneClasses, toneTextClasses, type SemanticTone } from "@/lib/utils";

export interface FinanceLandingItem {
  to: LinkProps["to"];
  label: string;
  desc: string;
  cta: string;
  icon: LucideIcon;
  tone: SemanticTone;
}

interface FinanceLandingGridProps {
  items: readonly FinanceLandingItem[];
}

/** Shared Finance landing: heading + action count + 2-column action cards. */
export function FinanceLandingGrid({ items }: FinanceLandingGridProps) {
  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground">Finance Management</h2>
          <p className="text-sm text-muted-foreground">Manage your financial operations</p>
        </div>
        <span className="shrink-0 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          {items.length} {items.length === 1 ? "Action" : "Actions"}
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className="group flex min-h-44 flex-col rounded-2xl border border-border/80 bg-card p-5 shadow-card-ambient transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl",
                    toneClasses[item.tone],
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
              </div>
              <h3 className="mt-5 font-display text-base font-semibold text-foreground">
                {item.label}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              <span
                className={cn(
                  "mt-auto flex items-center gap-1 pt-4 text-sm font-medium",
                  toneTextClasses[item.tone],
                )}
              >
                {item.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
