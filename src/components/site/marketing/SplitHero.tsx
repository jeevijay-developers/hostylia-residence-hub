import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionChip } from "./MarketingPrimitives";

type HeroAction = {
  label: string;
  to: "/book-demo" | "/contact" | "/platform" | "/founder";
  variant: "brand" | "glass";
  icon: LucideIcon;
  /** Icon before the label (default) or after it, e.g. a trailing arrow. */
  iconSide?: "start" | "end";
};

/**
 * Two-column marketing page hero: copy (chip, h1, description, CTAs, optional
 * highlights) on the left, page-specific media on the right. Its mint ground
 * slides up under the fixed h-20 glass header via -mt-20/pt-20.
 */
export function SplitHero({
  chip,
  chipIcon,
  title,
  desc,
  actions,
  highlights,
  extra,
  media,
}: {
  chip: string;
  chipIcon: LucideIcon;
  title: ReactNode;
  desc: string;
  actions?: readonly HeroAction[];
  highlights?: readonly string[];
  /** Rendered under the copy (e.g. contact details). */
  extra?: ReactNode;
  media: ReactNode;
}) {
  return (
    <section className="bg-landing-hero relative -mt-20 overflow-hidden pt-20">
      {/* Decorative sweeps behind the media */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-56 -top-24 h-[560px] w-[900px] -rotate-12 rounded-[50%] border-[56px] border-card/50 blur-2xl" />
        <div className="absolute -right-32 top-56 h-[420px] w-[760px] -rotate-6 rounded-[50%] border-[36px] border-brand-green/10 blur-2xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-16 pt-8 md:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-4 lg:pb-20 lg:pt-10">
        <div className="animate-fade-up">
          <SectionChip icon={chipIcon}>{chip}</SectionChip>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] text-foreground sm:text-5xl lg:text-4xl xl:text-[3.15rem]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {desc}
          </p>

          {actions && (
            <div className="mt-8 flex flex-wrap gap-3">
              {actions.map((a) => (
                <Button key={a.label} asChild variant={a.variant} size="pill-lg">
                  <Link to={a.to}>
                    {a.iconSide !== "end" && <a.icon />}
                    {a.label}
                    {a.iconSide === "end" && <a.icon />}
                  </Link>
                </Button>
              ))}
            </div>
          )}

          {highlights && (
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {highlights.map((h) => (
                <li key={h} className="inline-flex items-center gap-2">
                  <CircleCheck className="size-4 text-brand-green" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          )}

          {extra}
        </div>

        {media}
      </div>
    </section>
  );
}
