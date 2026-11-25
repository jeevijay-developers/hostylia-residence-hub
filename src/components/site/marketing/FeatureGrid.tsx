import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, MarketingHeading } from "./MarketingPrimitives";

export type FeatureItem = { title: string; desc: string; icon: LucideIcon };

const columnClasses = {
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
} as const;

/**
 * Heading + grid of icon cards. Shared by the landing "Core platform features",
 * the Solutions "Core features" and "Why choose Hostylia" sections.
 */
export function FeatureGrid({
  chip,
  chipIcon,
  title,
  desc,
  items,
  columns,
  layout = "stacked",
  linkTo,
  isPanel = false,
  sectionClassName,
}: {
  chip: string;
  chipIcon: LucideIcon;
  title: string;
  desc: string;
  items: readonly FeatureItem[];
  columns: keyof typeof columnClasses;
  /** "inline": icon beside the title. "stacked": icon above the title. */
  layout?: "inline" | "stacked";
  /** When set, every card links here (and lifts on hover); otherwise cards are static. */
  linkTo?: "/features";
  /** Wrap the content in an inset mint panel. */
  isPanel?: boolean;
  sectionClassName?: string;
}) {
  const content = (
    <>
      <MarketingHeading chip={chip} chipIcon={chipIcon} title={title} desc={desc} />
      <ul className={cn("mt-10 grid gap-4 md:mt-12", columnClasses[columns])}>
        {items.map((item) => {
          const card = (
            <>
              <div className={cn(layout === "inline" && "flex items-center gap-3")}>
                <IconTile icon={item.icon} className="transition-transform group-hover:scale-105" />
                <h3
                  className={cn(
                    "text-[15px] font-bold leading-snug text-foreground",
                    layout === "stacked" && "mt-4",
                  )}
                >
                  {item.title}
                </h3>
              </div>
              <p
                className={cn(
                  "text-sm leading-relaxed text-muted-foreground",
                  layout === "inline" ? "mt-3" : "mt-2",
                )}
              >
                {item.desc}
              </p>
            </>
          );
          const cardClass =
            "flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-card-ambient";
          return (
            <li key={item.title}>
              {linkTo ? (
                <Link
                  to={linkTo}
                  className={cn(
                    cardClass,
                    "card-lift group outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  {card}
                </Link>
              ) : (
                <div className={cardClass}>{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <section className={cn("py-16 md:py-20", sectionClassName)}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {isPanel ? (
          <div className="rounded-[2rem] border border-brand-green/10 bg-linear-to-b from-mint to-mint/40 px-4 py-12 sm:px-8 md:px-10 md:py-14 lg:px-12">
            {content}
          </div>
        ) : (
          content
        )}
      </div>
    </section>
  );
}
