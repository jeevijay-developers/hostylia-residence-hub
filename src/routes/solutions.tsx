import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, MessageCircle } from "lucide-react";
import { canonicalUrl } from "@/lib/site";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";
import { SolutionsHero } from "@/components/site/solutions/SolutionsHero";
import { PropertyTypes } from "@/components/site/solutions/PropertyTypes";
import { SolutionsFeatures } from "@/components/site/solutions/SolutionsFeatures";
import { OperationsShowcase } from "@/components/site/solutions/OperationsShowcase";
import { WhyChooseHostylia } from "@/components/site/solutions/WhyChooseHostylia";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";

export const Route = createFileRoute("/solutions")({
  head: () => ({
    meta: [
      { title: "Solutions — Hostylia" },
      {
        name: "description",
        content:
          "Flexible, scalable and role-based residential management for hostels, PGs, co-living spaces, boarding schools and institute residences.",
      },
      { property: "og:title", content: "Solutions — Hostylia" },
      {
        property: "og:description",
        content: "One powerful platform, tailored to your type of residential property.",
      },
      { property: "og:url", content: canonicalUrl("/solutions") },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/solutions") },
      {
        rel: "preload",
        as: "image",
        href: marketingAssets.planProfessional.src,
        fetchPriority: "high",
      },
    ],
  }),
  component: SolutionsPage,
});

function SolutionsPage() {
  return (
    <div className="landing-type">
      <SolutionsHero />
      <PropertyTypes />
      <SolutionsFeatures />
      <OperationsShowcase />
      <WhyChooseHostylia />
      <CtaBanner
        title="Find the right setup for your residence"
        desc="Tell us how your property runs and we'll show you how Hostylia fits — from rooms and fees to parents and security."
        primary={{ label: "Talk to Our Team", to: "/contact", icon: MessageCircle }}
        secondary={{ label: "Book a Demo", to: "/book-demo", icon: CalendarDays }}
      />
    </div>
  );
}
