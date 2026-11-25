import { ShieldCheck } from "lucide-react";
import { FeatureSplit } from "@/components/site/marketing/FeatureSplit";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

export function OperationsShowcase() {
  return (
    <FeatureSplit
      copy={{
        chip: "Built for operations",
        chipIcon: ShieldCheck,
        title: "Simple. Compliant. Scalable.",
        desc: "Modern tools to keep your residential operations organized, transparent and growth-ready.",
        points: [
          "Role-based access & data security",
          "Mobile-first for staff, residents and parents",
          "Scales from a single property to multi-campus",
        ],
      }}
      image={marketingAssets.devices}
      imageAlt="Hostylia admin dashboard on a laptop alongside the Hostylia resident app on a phone"
      sectionClassName="bg-background"
    />
  );
}
