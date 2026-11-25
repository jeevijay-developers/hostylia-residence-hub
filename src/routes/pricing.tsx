import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Headphones,
  Layers,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { canonicalUrl } from "@/lib/site";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";
import { PricingPlans } from "@/components/site/landing/PricingPlans";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";
import { FeatureSplit } from "@/components/site/marketing/FeatureSplit";
import { FaqSection } from "@/components/site/marketing/FaqSection";
import { faqPageJsonLd, type Faq } from "@/components/site/marketing/faq";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";

const faqs: Faq[] = [
  {
    q: "How is Hostylia priced?",
    a: "Hostylia is priced per student per month, with plans for hostels of every size.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — book a demo and we'll configure a trial environment for your property.",
  },
  {
    q: "Do you support multiple properties?",
    a: "Absolutely. Multi-property owners get portfolio-wide roll-ups on Enterprise.",
  },
  {
    q: "Which payment methods are supported?",
    a: "Parents can pay online by UPI, card or net-banking with an instant receipt. Cash and cheque payments are recorded by your admin or accountant, with a receipt too.",
  },
];

const included: FeatureItem[] = [
  {
    title: "Onboarding included",
    desc: "Guided setup with data migration and staff training.",
    icon: Sparkles,
  },
  {
    title: "Secure by design",
    desc: "Role-based access, audit logs and regular encrypted backups.",
    icon: ShieldCheck,
  },
  {
    title: "Human support",
    desc: "Residential operations specialists, not a generic helpdesk.",
    icon: Headphones,
  },
  {
    title: "Unlimited admins",
    desc: "Owners, managers and wardens — no per-seat fees.",
    icon: Layers,
  },
];

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Hostylia" },
      {
        name: "description",
        content:
          "Per student, per month pricing. Plans for single hostels, growing chains and enterprise portfolios.",
      },
      { property: "og:title", content: "Pricing — Hostylia" },
      {
        property: "og:description",
        content: "Transparent pricing that scales with your residence.",
      },
      { property: "og:url", content: canonicalUrl("/pricing") },
      { "script:ld+json": faqPageJsonLd(faqs) },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/pricing") }],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="landing-type">
      <PricingPlans isPageHero />

      <FeatureGrid
        chip="Every plan includes"
        chipIcon={Sparkles}
        title="The Essentials, On the House"
        desc="No hidden add-ons for the things every residence needs."
        items={included}
        columns={4}
        layout="inline"
        sectionClassName="bg-background"
      />

      <FeatureSplit
        copy={{
          chip: "Built-in fee collection",
          chipIcon: Wallet,
          title: "Fees that collect themselves",
          desc: "Automated reminders, online payments and instant receipts close the gaps that manual follow-ups miss.",
          points: [
            "Automated due reminders to students and parents",
            "UPI, cards, net-banking, cash and cheque",
            "Instant digital receipts and GST-ready invoices",
            "Owner dashboards for collections and dues",
          ],
        }}
        image={marketingAssets.hero}
        imageAlt="Hostylia dashboard on a laptop showing monthly collections, occupancy and attendance"
        imageSide="left"
        sectionClassName="bg-linear-to-b from-background to-mint/40"
      />

      <FaqSection
        title="Pricing Questions, Answered"
        desc="Everything you need to know before you get started."
        faqs={faqs}
        sectionClassName="bg-linear-to-b from-mint/40 to-background"
      />

      <CtaBanner
        title="Find the plan that fits your residence"
        desc="Book a demo for a walkthrough and a quote tailored to your beds, blocks and properties."
        primary={{ label: "Book a Demo", to: "/book-demo", icon: CalendarDays }}
        secondary={{ label: "Talk to Sales", to: "/contact", icon: MessageCircle }}
      />
    </div>
  );
}
