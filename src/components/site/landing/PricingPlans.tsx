import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BedDouble,
  Building,
  Building2,
  ChartNoAxesCombined,
  Headphones,
  House,
  Infinity as InfinityIcon,
  Layers,
  Mail,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconTile, MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

type Plan = {
  name: string;
  icon: LucideIcon;
  audience: string;
  /** Display string only — pricing is not computed money. */
  price: string;
  features: { label: string; icon: LucideIcon }[];
  image: { src: string; w: number; h: number };
  isFeatured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Starter",
    icon: House,
    audience: "For single hostels getting started.",
    price: "₹115",
    features: [
      { label: "Up to 100 beds", icon: BedDouble },
      { label: "Core operations", icon: Settings },
      { label: "Email support", icon: Mail },
    ],
    image: marketingAssets.planStarter,
  },
  {
    name: "Professional",
    icon: Building2,
    audience: "For growing properties and small chains.",
    price: "₹140",
    features: [
      { label: "Unlimited beds", icon: InfinityIcon },
      { label: "AI Suite (coming soon)", icon: Sparkles },
      { label: "Priority support", icon: Headphones },
    ],
    image: marketingAssets.planProfessional,
    isFeatured: true,
  },
  {
    name: "Enterprise",
    icon: Building,
    audience: "For multi-property owners and institutions.",
    price: "Custom",
    features: [
      { label: "Multi-property roll-up", icon: Layers },
      { label: "Custom SLAs · SSO coming soon", icon: ShieldCheck },
      { label: "Dedicated success manager", icon: ChartNoAxesCombined },
    ],
    image: marketingAssets.planEnterprise,
  },
];

/**
 * Plan cards. On the landing page it is a regular section; on /pricing
 * (isPageHero) it becomes the page hero: h1, mint hero ground, and it slides
 * up under the fixed h-20 glass header.
 */
export function PricingPlans({ isPageHero = false }: { isPageHero?: boolean }) {
  return (
    <section
      className={cn(
        isPageHero
          ? "bg-landing-hero relative -mt-20 pb-16 pt-28 md:pb-20 lg:pt-32"
          : "bg-linear-to-b from-mint/50 to-background py-16 md:py-20",
      )}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="Pricing"
          chipIcon={Tag}
          headingLevel={isPageHero ? "h1" : "h2"}
          title={
            <>
              Per student, <span className="text-brand-green">per month</span>
            </>
          }
          desc="Transparent pricing that scales with your residence."
        />

        <ul className="mt-12 grid gap-6 md:mx-auto md:max-w-xl lg:max-w-none lg:grid-cols-3 lg:items-stretch">
          {plans.map((plan) => (
            <li key={plan.name} className="flex">
              <PlanCard plan={plan} isPageHero={isPageHero} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PlanCard({ plan, isPageHero }: { plan: Plan; isPageHero: boolean }) {
  const PlanHeading = isPageHero ? "h2" : "h3";
  const { icon: PlanIcon, isFeatured } = plan;

  return (
    <article
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-3xl bg-card p-5 shadow-card-ambient sm:p-6 lg:p-5 xl:p-7",
        isFeatured
          ? "border-2 border-brand-green bg-linear-to-b from-mint via-card to-card lg:-translate-y-3"
          : "border border-border",
      )}
    >
      {/* Building illustration: fades into the card on its left and bottom
          edges so the art's soft foliage edges blend in both themes. */}
      <img
        src={plan.image.src}
        alt=""
        aria-hidden
        width={plan.image.w}
        height={plan.image.h}
        loading={isPageHero ? "eager" : "lazy"}
        decoding="async"
        className="pointer-events-none absolute right-0 top-0 h-auto w-[58%] max-w-72 select-none mask-l-from-55% mask-b-from-55% dark:opacity-85"
      />

      <div className="relative min-h-32 sm:min-h-36">
        {isFeatured && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-green-foreground">
            <Star className="size-3 fill-current" aria-hidden />
            Most popular
          </span>
        )}
        <div className="flex max-w-[68%] items-start gap-2.5 xl:gap-3">
          <IconTile icon={PlanIcon} className="size-10 xl:size-11" />
          <div className="min-w-0">
            <PlanHeading className="text-lg font-extrabold leading-tight text-foreground sm:text-xl lg:text-lg xl:text-xl">
              {plan.name}
            </PlanHeading>
            <p className="mt-1 max-w-36 text-xs leading-snug text-muted-foreground">
              {plan.audience}
            </p>
          </div>
        </div>
      </div>

      <p className="relative mt-2 flex items-baseline gap-1.5">
        <span className="font-heading text-4xl font-extrabold tracking-tight text-foreground md:text-[2.6rem]">
          {plan.price}
        </span>
        <span className="text-sm text-muted-foreground">/student/mo</span>
      </p>

      <hr className="relative my-5 border-border" />

      <ul className="relative space-y-3">
        {plan.features.map(({ label, icon: FeatureIcon }) => (
          <li key={label} className="flex items-center gap-3 text-sm text-foreground/90">
            <IconTile icon={FeatureIcon} className="size-8 rounded-lg" iconClassName="size-4" />
            {label}
          </li>
        ))}
      </ul>

      <div className="relative mt-auto pt-7">
        <Button
          asChild
          variant={isFeatured ? "brand" : "brand-soft"}
          size="pill-lg"
          className="w-full"
        >
          <Link to="/book-demo">
            <ArrowRight aria-hidden />
            Book Demo for Pricing
            <span className="sr-only"> ({plan.name} plan)</span>
          </Link>
        </Button>
      </div>
    </article>
  );
}
