import { Fragment } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const steps = [
  {
    n: 1,
    title: "Onboard",
    desc: "Set up properties, blocks, floors, rooms and beds.",
    asset: marketingAssets.stepOnboard,
  },
  {
    n: 2,
    title: "Operate",
    desc: "Manage occupancy, attendance, fees and complaints.",
    asset: marketingAssets.stepOperate,
  },
  {
    n: 3,
    title: "Optimize",
    desc: "Use AI insights, alerts and automation to run smarter.",
    asset: marketingAssets.stepAi,
  },
];

export function HowItWorksSteps() {
  return (
    <section className="bg-linear-to-b from-mint/50 to-background py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="Get started in 3 simple steps"
          chipIcon={Zap}
          title="From kickoff to AI co-pilot in three moves"
          desc="Set up and run your residential operations quickly, operate effortlessly, and keep getting better with AI."
        />

        <ol className="mt-12 grid items-center gap-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-3">
          {steps.map((s, i) => (
            <Fragment key={s.n}>
              <li className="card-lift relative flex min-h-40 items-center gap-3 overflow-hidden rounded-3xl border border-brand-green/10 bg-linear-to-br from-card via-card to-mint p-6 shadow-card-ambient">
                <div className="relative z-10 min-w-0 flex-1">
                  <span className="grid size-8 place-items-center rounded-full bg-brand-green-soft font-heading text-sm font-bold text-brand-green">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-xl font-extrabold text-foreground">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
                <img
                  src={s.asset.src}
                  srcSet={s.asset.srcSet}
                  sizes="160px"
                  alt=""
                  aria-hidden
                  width={s.asset.w}
                  height={s.asset.h}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-[42%] max-w-40 shrink-0 object-contain"
                />
              </li>
              {i < steps.length - 1 && (
                <li aria-hidden className="hidden justify-center text-brand-green lg:flex">
                  <ArrowRight className="size-5" />
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </div>
    </section>
  );
}
