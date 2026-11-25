import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Building, Building2, ChevronLeft, ChevronRight, School, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

type Slide = {
  title: string;
  meta: string;
  icon: LucideIcon;
  image: { src: string; w: number; h: number };
};

// Three slides: one centred, one either side.
const slides: Slide[] = [
  {
    title: "Hostylia Kota Residency",
    meta: "1,200+ Residents",
    icon: Building2,
    image: marketingAssets.propertyColiving,
  },
  {
    title: "Boarding School",
    meta: "800+ Students",
    icon: School,
    image: marketingAssets.propertySchool,
  },
  {
    title: "Student Hostel",
    meta: "450+ Residents",
    icon: Building,
    image: marketingAssets.propertyHostel,
  },
];

const AUTOPLAY_MS = 5500;

type Position = "center" | "left" | "right";

const positionClasses: Record<Position, string> = {
  center: "z-20 -translate-x-1/2 scale-100 opacity-100",
  left: "z-10 -translate-x-[125%] scale-[0.8] opacity-0 sm:opacity-70",
  right: "z-10 translate-x-1/4 scale-[0.8] opacity-0 sm:opacity-70",
};

function positionFor(index: number, active: number, total: number): Position {
  const offset = (index - active + total) % total;
  if (offset === 0) return "center";
  return offset === 1 ? "right" : "left";
}

export function TrustedCarousel() {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const total = slides.length;

  const go = useCallback((dir: 1 | -1) => setActive((a) => (a + dir + total) % total), [total]);

  useEffect(() => {
    if (isPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => go(1), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [isPaused, go]);

  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-mint/50 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="Trusted by modern residentials"
          chipIcon={Users}
          title="Built for Hostels, Boarding Schools & Student Housing"
          desc="A modern, scalable platform trusted by residentials across India."
        />

        <div
          className="relative mt-12"
          role="region"
          aria-roledescription="carousel"
          aria-label="Residential properties running on Hostylia"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onFocus={() => setIsPaused(true)}
          onBlur={() => setIsPaused(false)}
        >
          <div className="relative mx-auto h-56 max-w-5xl sm:h-64 lg:h-80">
            {slides.map((s, i) => {
              const pos = positionFor(i, active, total);
              return (
                <SlideCard
                  key={s.title}
                  slide={s}
                  isActive={pos === "center"}
                  className={positionClasses[pos]}
                  label={`${i + 1} of ${total}`}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous property"
            className="liquid-glass absolute left-0 top-1/2 z-30 grid size-11 -translate-y-1/2 place-items-center rounded-full text-foreground transition-transform hover:scale-105 md:left-4"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next property"
            className="liquid-glass absolute right-0 top-1/2 z-30 grid size-11 -translate-y-1/2 place-items-center rounded-full text-foreground transition-transform hover:scale-105 md:right-4"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="mt-6 flex justify-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${s.title}`}
                aria-current={i === active}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === active
                    ? "w-6 bg-brand-green"
                    : "w-2 bg-foreground/15 hover:bg-foreground/30",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideCard({
  slide,
  isActive,
  className,
  label,
}: {
  slide: Slide;
  isActive: boolean;
  className: string;
  label: string;
}) {
  const Icon = slide.icon;
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      aria-hidden={!isActive}
      className={cn(
        "absolute left-1/2 top-0 h-full w-[88%] overflow-hidden rounded-3xl transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:w-[58%] lg:w-[46%]",
        isActive
          ? "shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--brand-green-strong)_45%,transparent)] ring-4 ring-card"
          : "pointer-events-none shadow-card-ambient",
        className,
      )}
    >
      <img
        src={slide.image.src}
        alt={slide.title}
        width={slide.image.w}
        height={slide.image.h}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-t from-navy/75 via-navy/10 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-5 text-white">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-md">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="truncate font-heading text-lg font-bold">{slide.title}</div>
          <div className="text-sm text-white/80">{slide.meta}</div>
        </div>
      </div>
    </div>
  );
}
