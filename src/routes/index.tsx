import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, MessageCircle } from "lucide-react";
import { LandingHero } from "@/components/site/landing/LandingHero";
import { TrustedCarousel } from "@/components/site/landing/TrustedCarousel";
import { HowItWorksSteps } from "@/components/site/landing/HowItWorksSteps";
import { PropertyHierarchySection } from "@/components/site/landing/PropertyHierarchySection";
import { CoreFeatures } from "@/components/site/landing/CoreFeatures";
import { ShowcasePanels } from "@/components/site/landing/ShowcasePanels";
import { OperatorTestimonials } from "@/components/site/landing/OperatorTestimonials";
import { PricingPlans } from "@/components/site/landing/PricingPlans";
import { MobileAppSection } from "@/components/site/landing/MobileAppSection";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";
import {
  marketingFontPreloads,
  rupeeFontPreload,
} from "@/components/site/marketing/marketing-assets";
import { canonicalUrl } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hostylia — Smart Residential Management Platform" },
      {
        name: "description",
        content:
          "One intelligent operating system for hostels, boarding schools, student housing, PGs and co-living. Rooms, fees, attendance, complaints and security in one platform.",
      },
      { property: "og:title", content: "Hostylia — Smart Residential Management Platform" },
      {
        property: "og:description",
        content:
          "Rooms, students, wardens, parents, fees, attendance, complaints and security — unified.",
      },
      { property: "og:url", content: canonicalUrl("/") },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Hostylia",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: canonicalUrl("/"),
          description:
            "One intelligent operating system for hostels, boarding schools, student housing, PGs and co-living. Rooms, fees, attendance, complaints and security in one platform.",
        },
      },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/") },
      ...marketingFontPreloads,
      rupeeFontPreload,
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="landing-type">
      <LandingHero />
      <TrustedCarousel />
      <HowItWorksSteps />
      <PropertyHierarchySection />
      <CoreFeatures />
      <ShowcasePanels />
      <OperatorTestimonials />
      <PricingPlans />
      <MobileAppSection />
      <CtaBanner
        title="Ready to digitize your residential business?"
        desc="Book a demo, see Hostylia in action, and get a plan that fits your needs."
        primary={{ label: "Book a Demo", to: "/book-demo", icon: CalendarDays }}
        secondary={{ label: "Talk to Sales", to: "/contact", icon: MessageCircle }}
      />
    </div>
  );
}
