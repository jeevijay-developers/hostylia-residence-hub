import { createFileRoute } from "@tanstack/react-router";
import { BedDouble, CalendarDays, LayoutGrid, MessageCircle, Users } from "lucide-react";
import { canonicalUrl } from "@/lib/site";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";
import { SplitHero } from "@/components/site/marketing/SplitHero";
import { CheckList } from "@/components/site/marketing/MarketingPrimitives";
import { LeadForm } from "@/components/site/marketing/LeadForm";
import { FeatureSplit } from "@/components/site/marketing/FeatureSplit";
import { FaqSection } from "@/components/site/marketing/FaqSection";
import { faqPageJsonLd, TRIAL_FAQ, type Faq } from "@/components/site/marketing/faq";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";

const faqs: Faq[] = [
  {
    q: "How long is the demo?",
    a: "About 30 minutes — a focused, no-pressure walkthrough tailored to your property type.",
  },
  TRIAL_FAQ,
  {
    q: "Who should attend?",
    a: "Owners, managers and wardens are all welcome — we'll show each role's view of the platform.",
  },
  {
    q: "Do I need to prepare anything?",
    a: "No preparation needed. Knowing your number of properties, beds and current tools helps us tailor the walkthrough.",
  },
];

export const Route = createFileRoute("/book-demo")({
  head: () => ({
    meta: [
      { title: "Book a Demo — Hostylia" },
      {
        name: "description",
        content: "Book a personalized walkthrough of Hostylia for your residential property.",
      },
      { property: "og:title", content: "Book a Demo — Hostylia" },
      { property: "og:description", content: "See Hostylia in action." },
      { property: "og:url", content: canonicalUrl("/book-demo") },
      { "script:ld+json": faqPageJsonLd(faqs) },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/book-demo") }],
  }),
  component: BookDemoPage,
});

function BookDemoPage() {
  return (
    <div className="landing-type">
      <SplitHero
        chip="Book a demo"
        chipIcon={CalendarDays}
        title={
          <>
            See Hostylia <span className="text-brand-green sm:block">in action</span>
          </>
        }
        desc="A personalized walkthrough tailored to your property — see every role, from owner to warden, working on one platform."
        extra={
          <CheckList
            className="mt-8"
            items={[
              "A focused 30-minute walkthrough",
              "Tailored to your property type",
              "Owner, manager and warden views",
              "Trial environment on request",
            ]}
          />
        }
        media={<LeadForm kind="demo" />}
      />

      <FeatureSplit
        copy={{
          chip: "What you'll see",
          chipIcon: BedDouble,
          title: "Every bed, at a glance",
          desc: "We'll walk you through a sample residence set up like yours — occupancy down to the bed, move-out notices and vacancies.",
          points: [
            "Property → Block → Floor → Room → Bed in one view",
            "Vacant, occupied, blocked and maintenance beds at a glance",
            "Move-ins, move-outs and bed transfers in a few clicks",
          ],
        }}
        image={marketingAssets.room}
        imageAlt="Isometric hostel room with two of three beds occupied"
        imageSide="left"
        sectionClassName="bg-background"
      />

      <FeatureSplit
        copy={{
          chip: "Every role",
          chipIcon: Users,
          title: "One platform, a view for every role",
          desc: "We'll show you how each person in your residence works in Hostylia — each with their own focused view of the same live data.",
          points: [
            "Owners and admins: occupancy, collections and dues",
            "Wardens: rooms, attendance, complaints and gate passes",
            "Accountants: invoices, payments and receipts",
            "Students and parents: fees, notices and updates",
          ],
        }}
        image={marketingAssets.roleDashboards}
        imageAlt="Stacked dashboard cards for the Admin, Warden, Student and Parent roles"
        sectionClassName="bg-linear-to-b from-background to-mint/40"
      />

      <FaqSection
        title="Demo Questions, Answered"
        faqs={faqs}
        sectionClassName="bg-linear-to-b from-mint/40 to-background"
      />

      <CtaBanner
        title="Have a quick question first?"
        desc="Our team is happy to help — or explore how Hostylia fits your type of residence."
        primary={{ label: "Talk to Our Team", to: "/contact", icon: MessageCircle }}
        secondary={{ label: "Explore Solutions", to: "/solutions", icon: LayoutGrid }}
      />
    </div>
  );
}
