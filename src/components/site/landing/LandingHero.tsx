import { ArrowRight, Building2, CirclePlay } from "lucide-react";
import { SplitHero } from "@/components/site/marketing/SplitHero";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const image = marketingAssets.hero;

export function LandingHero() {
  return (
    <SplitHero
      chip="Built for hostels, PGs & boarding schools"
      chipIcon={Building2}
      title={
        <>
          Run Modern Residential Operations with{" "}
          <span className="text-brand-green sm:block">Smart AI-Powered Management</span>
        </>
      }
      desc="Manage hostels, boarding schools and student housing end-to-end — from attendance and fees to rooms, parents and security, all in one intelligent platform."
      actions={[
        {
          label: "Book a Demo",
          to: "/book-demo",
          variant: "brand",
          icon: ArrowRight,
          iconSide: "end",
        },
        { label: "Explore Platform", to: "/platform", variant: "glass", icon: CirclePlay },
      ]}
      highlights={["Go live in days", "Real-time operations", "Built for scale"]}
      media={
        // Laptop on a marble pedestal; the pedestal base fades out. Static — no motion.
        <div className="relative lg:-mr-16 xl:-mr-24">
          <img
            src={image.src}
            alt="Hostylia admin dashboard on a laptop showing occupancy, residents, collections and attendance for Kota Residency"
            width={image.w}
            height={image.h}
            fetchPriority="high"
            decoding="async"
            className="block h-auto w-full [mask-image:linear-gradient(to_bottom,black_82%,transparent)]"
          />
        </div>
      }
    />
  );
}
