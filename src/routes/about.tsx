import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Heart,
  Lightbulb,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { canonicalUrl } from "@/lib/site";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";
import { FeatureSplit } from "@/components/site/marketing/FeatureSplit";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";
import { AboutHero } from "@/components/site/about/AboutHero";
import { FounderNote } from "@/components/site/about/FounderNote";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Hostylia" },
      {
        name: "description",
        content:
          "Hostylia is a smart residential operating system for hostels, PGs and boarding schools, built in India by Jeevijay Technologies Private Limited.",
      },
      { property: "og:title", content: "About — Hostylia" },
      {
        property: "og:description",
        content: "Our mission, our values and the team behind Hostylia.",
      },
      { property: "og:url", content: canonicalUrl("/about") },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/about") },
      {
        rel: "preload",
        as: "image",
        href: marketingAssets.propertyColiving.src,
        fetchPriority: "high",
      },
    ],
  }),
  component: AboutPage,
});

const values: FeatureItem[] = [
  {
    title: "Operator-first",
    desc: "Shaped with real wardens, managers and owners — around how residences actually run.",
    icon: Target,
  },
  {
    title: "Parent trust",
    desc: "Transparent, verified communication that keeps families confident.",
    icon: Heart,
  },
  {
    title: "Safety & security",
    desc: "Workflows and access controls that put resident well-being first.",
    icon: ShieldCheck,
  },
  {
    title: "Always improving",
    desc: "Regular releases shaped by feedback from the residences we serve.",
    icon: Sparkles,
  },
];

function AboutPage() {
  return (
    <div className="landing-type">
      <AboutHero />

      <FeatureSplit
        copy={{
          chip: "Our mission",
          chipIcon: Target,
          title: "Make residential operations effortless",
          desc: "We help hostels, schools and institutions run their properties with the clarity of modern software — without spreadsheets, paper registers and disconnected tools.",
          points: [
            "One operating system across every role and property",
            "Automation that gives wardens their time back",
            "Transparent communication that earns parent trust",
            "Insights that turn occupancy and dues into growth",
          ],
        }}
        image={marketingAssets.room}
        imageAlt="Isometric hostel room with two of three beds occupied"
        imageSide="left"
        sectionClassName="bg-background"
      />

      <FeatureGrid
        chip="Our values"
        chipIcon={Heart}
        title="What We Stand For"
        desc="The principles behind every feature we ship."
        items={values}
        columns={4}
        layout="inline"
        sectionClassName="bg-linear-to-b from-background to-mint/40"
      />

      <FeatureSplit
        copy={{
          chip: "Why we built it",
          chipIcon: Lightbulb,
          title: "A control room, not a clipboard",
          desc: "Wardens were buried in registers, owners couldn't see across blocks and parents kept calling for updates. Hostylia replaces all of it with one live view.",
          points: [
            "Live occupancy, down to the bed",
            "Fee dashboards owners can trust",
            "Parents stay updated without the phone calls",
          ],
        }}
        image={marketingAssets.devices}
        imageAlt="Hostylia admin dashboard on a laptop alongside the Hostylia resident app on a phone"
        sectionClassName="bg-linear-to-b from-mint/40 to-background"
      />

      <FounderNote />

      <CtaBanner
        title="Let's build better residences together"
        desc="See how Hostylia fits your hostel, PG or boarding school — or simply say hello to our team."
        primary={{ label: "Book a Demo", to: "/book-demo", icon: CalendarDays }}
        secondary={{ label: "Talk to Our Team", to: "/contact", icon: MessageCircle }}
      />
    </div>
  );
}
