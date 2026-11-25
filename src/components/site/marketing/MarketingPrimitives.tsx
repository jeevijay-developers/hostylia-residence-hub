import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small emerald pill used above section headings ("Pricing", "Property types"…). */
export function SectionChip({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-brand-green/15 bg-brand-green-soft px-3.5 py-1.5 text-xs font-semibold text-brand-green",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** Centred heading: optional chip, title (h2, or h1 on a page hero), optional description. */
export function MarketingHeading({
  chip,
  chipIcon,
  title,
  desc,
  headingLevel = "h2",
  className,
}: {
  chip?: string;
  chipIcon?: LucideIcon;
  title: ReactNode;
  desc?: string;
  headingLevel?: "h1" | "h2";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div className={cn("mx-auto max-w-5xl text-center", className)}>
      {chip && chipIcon && <SectionChip icon={chipIcon}>{chip}</SectionChip>}
      <Heading
        className={cn(
          "font-extrabold leading-tight tracking-tight text-foreground",
          headingLevel === "h1" ? "mt-6 text-4xl sm:text-5xl" : "mt-4 text-3xl md:text-4xl",
        )}
      >
        {title}
      </Heading>
      {desc && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{desc}</p>}
    </div>
  );
}

/** Filled emerald check badge for benefit bullets. */
function CheckBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full bg-brand-green text-brand-green-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none">
        <path
          d="M2.5 6.2 5 8.5l4.5-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Bulleted benefit list with a CheckBadge per item. */
export function CheckList({
  items,
  className,
  itemClassName = "text-sm text-foreground/90 md:text-base",
}: {
  items: readonly string[];
  className?: string;
  itemClassName?: string;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item} className={cn("flex items-start gap-3", itemClassName)}>
          <CheckBadge className="mt-px md:mt-0.5" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Rounded emerald icon tile used on feature cards, pricing rows and pills. */
export function IconTile({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl bg-brand-green-soft text-brand-green",
        className,
      )}
    >
      <Icon className={cn("size-5", iconClassName)} strokeWidth={1.9} />
    </span>
  );
}

/**
 * Chip + heading + description + checklist — the copy half of every
 * "text beside an illustration" block (showcase panels, operations section).
 */
export function ChecklistCopy({
  chip,
  chipIcon,
  title,
  desc,
  points,
  headingLevel = "h2",
  isCompact = false,
  chipClassName,
}: {
  chip: string;
  chipIcon: LucideIcon;
  title: string;
  desc: string;
  points: readonly string[];
  headingLevel?: "h2" | "h3";
  /** Card-sized type scale (showcase panels) instead of section-sized. */
  isCompact?: boolean;
  chipClassName?: string;
}) {
  const Heading = headingLevel;
  return (
    <div className="min-w-0">
      <SectionChip icon={chipIcon} className={chipClassName}>
        {chip}
      </SectionChip>
      <Heading
        className={cn(
          "mt-4 font-extrabold leading-tight tracking-tight text-foreground",
          isCompact ? "text-2xl md:text-[1.7rem]" : "text-3xl md:text-4xl",
        )}
      >
        {title}
      </Heading>
      <p
        className={cn(
          "leading-relaxed text-muted-foreground",
          isCompact ? "mt-2 text-sm md:text-base" : "mt-3 max-w-md text-base",
        )}
      >
        {desc}
      </p>
      <CheckList
        items={points}
        className={isCompact ? "mt-5 space-y-2.5" : "mt-6"}
        itemClassName={isCompact ? "text-sm text-foreground/90" : undefined}
      />
    </div>
  );
}
