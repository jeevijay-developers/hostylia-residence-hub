import { ArrowRight, CirclePlay, LayoutGrid } from "lucide-react";
import { SplitHero } from "@/components/site/marketing/SplitHero";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const image = marketingAssets.planProfessional;

export function SolutionsHero() {
  return (
    <SplitHero
      chip="Solutions"
      chipIcon={LayoutGrid}
      title="Complete Residential Management Solutions"
      desc="Flexible, scalable and role-based solutions for hostels, PGs, co-living spaces, boarding schools and institute residences."
      actions={[
        {
          label: "Talk to Our Team",
          to: "/contact",
          variant: "brand",
          icon: ArrowRight,
          iconSide: "end",
        },
        { label: "See How It Works", to: "/platform", variant: "glass", icon: CirclePlay },
      ]}
      media={
        // Cut-out building on a soft emerald glow. The art has whitish semi-transparent
        // foliage edges, so in dark mode a faint light halo sits behind it and the edges
        // are feathered with an elliptical mask. Static — no motion.
        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute left-[8%] top-[2%] aspect-square w-[62%] rounded-full bg-brand-green/15 blur-3xl dark:bg-foreground/10" />
            <div className="absolute inset-x-[4%] bottom-[2%] h-[22%] rounded-[50%] bg-brand-green/10 blur-2xl dark:bg-foreground/5" />
          </div>
          <img
            src={image.src}
            alt="Modern four-storey residential building with glass balconies, a covered entrance and landscaped gardens"
            width={image.w}
            height={image.h}
            fetchPriority="high"
            decoding="async"
            className="relative block h-auto w-full dark:[mask-image:radial-gradient(ellipse_at_center,black_72%,transparent)]"
          />
        </div>
      }
    />
  );
}
