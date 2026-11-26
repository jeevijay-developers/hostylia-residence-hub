import { Fragment } from "react";
import { ArrowRight, BedDouble, Building, Building2, DoorOpen, Layers } from "lucide-react";
import { CheckList, MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const levels = [
  { label: "Property", icon: Building2 },
  { label: "Block", icon: Building },
  { label: "Floor", icon: Layers },
  { label: "Room", icon: DoorOpen },
  { label: "Bed", icon: BedDouble },
];

const benefits = [
  "Structured hierarchy for any scale",
  "Real-time room and bed occupancy",
  "Easy allocation, transfer and vacancy management",
];

export function PropertyHierarchySection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-mint/40 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="Complete Residential Hierarchy"
          chipIcon={Layers}
          title="From property down to a single bed"
          desc="Get complete visibility and control across your entire residential hierarchy."
        />

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <ol
              className="grid max-w-xl grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1 sm:gap-2"
              aria-label="Property hierarchy"
            >
              {levels.map((l, i) => (
                <Fragment key={l.label}>
                  <li className="card-lift flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card px-1 py-3 shadow-card-ambient sm:py-4">
                    <l.icon
                      className="size-5 text-brand-green sm:size-7"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="text-[11px] font-semibold text-foreground sm:text-sm">
                      {l.label}
                    </span>
                  </li>
                  {i < levels.length - 1 && (
                    <li aria-hidden className="text-brand-green">
                      <ArrowRight className="size-3.5 sm:size-4" />
                    </li>
                  )}
                </Fragment>
              ))}
            </ol>

            <CheckList items={benefits} className="mt-8" />
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-[8%] rounded-full bg-brand-green/10 blur-3xl"
            />
            <img
              src={marketingAssets.room.src}
              srcSet={marketingAssets.room.srcSet}
              sizes="(min-width: 1280px) 611px, (min-width: 1024px) 47vw, calc(100vw - 32px)"
              alt="Isometric hostel room B2-204 with two of three beds occupied"
              width={marketingAssets.room.w}
              height={marketingAssets.room.h}
              loading="lazy"
              decoding="async"
              className="relative h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
