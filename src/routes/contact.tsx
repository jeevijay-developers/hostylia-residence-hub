import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  Headphones,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import {
  canonicalUrl,
  PUBLIC_EMAIL,
  PUBLIC_EMAIL_MAILTO,
  PUBLIC_PHONE_DISPLAY,
  PUBLIC_PHONE_TEL,
} from "@/lib/site";
import { SplitHero } from "@/components/site/marketing/SplitHero";
import { IconTile } from "@/components/site/marketing/MarketingPrimitives";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";
import { FaqSection } from "@/components/site/marketing/FaqSection";
import { faqPageJsonLd, type Faq } from "@/components/site/marketing/faq";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";
import { LeadForm } from "@/components/site/marketing/LeadForm";

const faqs: Faq[] = [
  {
    q: "How quickly will I hear back?",
    a: "Every message gets a reply from our team within one business day.",
  },
  {
    q: "Do you help with onboarding?",
    a: "Yes. Every plan includes guided setup, data migration and staff training.",
  },
  {
    q: "I'm a student or parent — who should I contact?",
    a: "For questions about a stay, fees or gate passes, please contact your hostel's administration first. They can reach our team directly if needed.",
  },
  {
    q: "How do I delete my account?",
    a: "Use the Delete account link in the footer to request deletion of your Hostylia account and data.",
  },
];

const promises: FeatureItem[] = [
  {
    title: "Reply within a business day",
    desc: "Every message gets a response from a real person, not a bot.",
    icon: Clock,
  },
  {
    title: "Residential specialists",
    desc: "A team that understands hostels, PGs and boarding schools.",
    icon: Headphones,
  },
  {
    title: "Guided onboarding",
    desc: "Setup, data migration and staff training to get you live.",
    icon: Rocket,
  },
  {
    title: "Secure by design",
    desc: "Role-based access and audit trails protect your residents' data.",
    icon: ShieldCheck,
  },
];

const channels = [
  { label: "Email", value: PUBLIC_EMAIL, href: PUBLIC_EMAIL_MAILTO, icon: Mail },
  { label: "Phone", value: PUBLIC_PHONE_DISPLAY, href: PUBLIC_PHONE_TEL, icon: Phone },
  { label: "Office", value: "Jeevijay Technologies Private Limited, Bengaluru", icon: MapPin },
] as const;

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Support — Hostylia" },
      {
        name: "description",
        content:
          "Talk to the Hostylia team about your residential property, onboarding or your account. We reply within one business day.",
      },
      { property: "og:title", content: "Support — Hostylia" },
      { property: "og:description", content: "Reach the Hostylia team." },
      { property: "og:url", content: canonicalUrl("/contact") },
      { "script:ld+json": faqPageJsonLd(faqs) },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/contact") }],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="landing-type">
      <SplitHero
        chip="Support"
        chipIcon={Headphones}
        title={
          <>
            Talk to the <span className="text-brand-green sm:block">Hostylia team</span>
          </>
        }
        desc="Questions about Hostylia, onboarding or your account? Tell us about your property and we'll get back to you within one business day."
        extra={
          <ul className="mt-8 space-y-3">
            {channels.map((c) => {
              const body = (
                <>
                  <IconTile icon={c.icon} className="size-10" />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{c.label}</span>
                    <span className="block break-words text-sm font-semibold text-foreground transition-colors group-hover:text-brand-green">
                      {c.value}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={c.label}>
                  {"href" in c ? (
                    <a
                      href={c.href}
                      className="group inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="inline-flex items-center gap-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        }
        media={<LeadForm kind="contact" />}
      />

      <FeatureGrid
        chip="How we support you"
        chipIcon={Headphones}
        title="Support Without the Runaround"
        desc="From your first question to go-live and beyond."
        items={promises}
        columns={4}
        layout="inline"
        sectionClassName="bg-linear-to-b from-background to-mint/40"
      />

      <FaqSection
        title="Support Questions, Answered"
        faqs={faqs}
        sectionClassName="bg-linear-to-b from-mint/40 to-background"
      />

      <CtaBanner
        title="Prefer a guided walkthrough?"
        desc="Book a demo and see Hostylia running on a setup like yours."
        primary={{ label: "Book a Demo", to: "/book-demo", icon: CalendarDays }}
        secondary={{ label: "Explore Solutions", to: "/solutions", icon: LayoutGrid }}
      />
    </div>
  );
}
