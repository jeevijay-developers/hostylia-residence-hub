import { ArrowRight, Layers, MessageCircle } from "lucide-react";
import { SplitHero } from "@/components/site/marketing/SplitHero";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const devices = marketingAssets.devices;

export function PlatformHero() {
  return (
    <SplitHero
      chip="The Hostylia platform"
      chipIcon={Layers}
      title={
        <>
          One secure platform{" "}
          <span className="text-brand-green sm:block">behind every residence</span>
        </>
      }
      desc="Rooms, residents, fees, gate passes and parent updates run on one live system — with every role seeing exactly what it should, on any screen."
      actions={[
        {
          label: "Book a Demo",
          to: "/book-demo",
          variant: "brand",
          icon: ArrowRight,
          iconSide: "end",
        },
        { label: "Talk to Our Team", to: "/contact", variant: "glass", icon: MessageCircle },
      ]}
      highlights={["Works on any device", "Data isolated per organisation", "Verified payments"]}
      media={
        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[8%] inset-y-[10%] rounded-full bg-linear-to-br from-mint via-brand-green-soft to-brand-green/20 blur-3xl"
          />
          <img
            src={devices.src}
            alt="Hostylia admin dashboard on a laptop alongside the Hostylia resident view on a phone"
            width={devices.w}
            height={devices.h}
            fetchPriority="high"
            decoding="async"
            className="relative h-auto w-full"
          />
        </div>
      }
    />
  );
}
