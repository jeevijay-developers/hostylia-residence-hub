import { ArrowRight, Building2, UserRound } from "lucide-react";
import { SplitHero } from "@/components/site/marketing/SplitHero";
import { IconTile } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const photo = marketingAssets.propertyColiving;

export function AboutHero() {
  return (
    <SplitHero
      chip="About Hostylia"
      chipIcon={Building2}
      title={
        <>
          Built to modernize{" "}
          <span className="text-brand-green sm:block">residential operations</span>
        </>
      }
      desc="Hostylia is a smart residential operating system for hostels, PGs and boarding schools — built in India by Jeevijay Technologies Private Limited."
      actions={[
        {
          label: "Book a Demo",
          to: "/book-demo",
          variant: "brand",
          icon: ArrowRight,
          iconSide: "end",
        },
        { label: "Meet the Founder", to: "/founder", variant: "glass", icon: UserRound },
      ]}
      highlights={["Made in India", "Built with real operators", "Secure by design"]}
      media={
        <div className="relative mx-auto w-full max-w-xl pb-8 lg:max-w-none">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 rounded-[2.5rem] bg-brand-green/10 blur-3xl"
          />
          <img
            src={photo.src}
            srcSet={photo.srcSet}
            sizes="(min-width: 1280px) 650px, (min-width: 1024px) 50vw, (min-width: 640px) 576px, calc(100vw - 32px)"
            alt="Modern residential building with balconies and a landscaped courtyard at dusk"
            width={photo.w}
            height={photo.h}
            fetchPriority="high"
            decoding="async"
            className="relative aspect-[4/3] w-full rounded-[2rem] object-cover shadow-card-ambient ring-4 ring-card"
          />
          <div className="liquid-glass absolute bottom-0 left-4 flex items-center gap-3 rounded-2xl bg-card/75 px-4 py-3 sm:left-8">
            <IconTile icon={Building2} className="size-10" />
            <div>
              <div className="text-xs text-muted-foreground">Powered by</div>
              <div className="font-heading text-sm font-bold text-foreground">
                Jeevijay Technologies
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
