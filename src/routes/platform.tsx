import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  BellRing,
  Boxes,
  Building2,
  CalendarDays,
  CreditCard,
  DatabaseZap,
  FileLock,
  History,
  IndianRupee,
  KeyRound,
  LayoutGrid,
  Link2,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { canonicalUrl } from "@/lib/site";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";
import { FeatureSplit } from "@/components/site/marketing/FeatureSplit";
import { FaqSection } from "@/components/site/marketing/FaqSection";
import { faqPageJsonLd, type Faq } from "@/components/site/marketing/faq";
import { CtaBanner } from "@/components/site/marketing/CtaBanner";
import { PlatformHero } from "@/components/site/platform/PlatformHero";

// Copy here describes what the product does today (see docs/PRD.md stages):
// no uptime / latency / certification figures, SSO, public API or native apps.
const foundations: FeatureItem[] = [
  {
    title: "Property hierarchy",
    desc: "Property → Block → Floor → Room → Bed, modelled end to end so occupancy is accurate down to the bed.",
    icon: Building2,
  },
  {
    title: "Role-based workspaces",
    desc: "Admins, accountants, wardens, students and parents each get a workspace built around their job.",
    icon: Users,
  },
  {
    title: "Live updates",
    desc: "Gate passes, attendance and activity feeds refresh on their own — no reloading to see what changed.",
    icon: RefreshCw,
  },
  {
    title: "Works on any device",
    desc: "A responsive web app that works from a phone to a desktop browser — nothing to install.",
    icon: MonitorSmartphone,
  },
  {
    title: "Fees and payments",
    desc: "Online payments through Razorpay, automatic receipts and invoices that are never silently edited.",
    icon: IndianRupee,
  },
  {
    title: "Notifications",
    desc: "In-app alerts and SMS keep wardens, students and parents in the loop as things happen.",
    icon: BellRing,
  },
];

const safeguards: FeatureItem[] = [
  {
    title: "Isolated data",
    desc: "Every record belongs to one organisation, and the database itself enforces it.",
    icon: DatabaseZap,
  },
  {
    title: "Linked parents only",
    desc: "A parent sees a student only after an admin has linked them.",
    icon: Link2,
  },
  {
    title: "Verified payments",
    desc: "A payment counts only once Razorpay's signed confirmation is verified.",
    icon: BadgeCheck,
  },
  {
    title: "No card data stored",
    desc: "Card details stay with the payment gateway; Hostylia never stores them.",
    icon: CreditCard,
  },
  {
    title: "Two-person refunds",
    desc: "A refund needs a second person's approval — never the requester's own.",
    icon: UserCheck,
  },
  {
    title: "Audit trail",
    desc: "Sensitive actions are recorded with who did what, and when.",
    icon: History,
  },
  {
    title: "Private documents",
    desc: "KYC files are stored privately and opened through short-lived links.",
    icon: FileLock,
  },
  {
    title: "Secure sign-in",
    desc: "Phone OTP or email and password, over encrypted connections.",
    icon: KeyRound,
  },
];

const faqs: Faq[] = [
  {
    q: "Do students and parents need to install an app?",
    a: "No. Hostylia is a responsive web app that works in any modern browser on phones, tablets and computers — there is nothing to download from an app store.",
  },
  {
    q: "Can one hostel see another hostel's data?",
    a: "No. Every record belongs to a single organisation, and the database itself refuses requests for another organisation's data. It is not left to the app screens to hide it.",
  },
  {
    q: "How is an online payment confirmed?",
    a: "Payments are processed by Razorpay. An invoice is marked paid only after Razorpay's signed server-to-server confirmation has been verified — never from the browser redirect alone.",
  },
  {
    q: "Can I manage more than one property?",
    a: "Yes. One account can hold several properties, each with its own blocks, rooms, staff and fees, and admins switch between them without signing out.",
  },
  {
    q: "Can I control what wardens and accountants can do?",
    a: "Yes. Admins can customise each warden's and accountant's permissions — for example, letting a warden see rooms and beds without touching fee plans.",
  },
  {
    q: "Which languages are supported?",
    a: "English, with Hindi available for sign-in and the parent portal. More screens are being translated.",
  },
];

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Platform — Hostylia" },
      {
        name: "description",
        content:
          "The secure platform behind Hostylia: property hierarchy, role-based workspaces, verified payments and data isolated per organisation.",
      },
      { property: "og:title", content: "Platform — Hostylia" },
      {
        property: "og:description",
        content: "One secure platform behind every residence.",
      },
      { property: "og:url", content: canonicalUrl("/platform") },
      { "script:ld+json": faqPageJsonLd(faqs) },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/platform") },
      {
        rel: "preload",
        as: "image",
        href: marketingAssets.devices.src,
        fetchPriority: "high",
      },
    ],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  return (
    <div className="landing-type">
      <PlatformHero />

      <FeatureGrid
        chip="Platform foundations"
        chipIcon={Boxes}
        title="Everything Runs on One System"
        desc="The building blocks every Hostylia workspace shares."
        items={foundations}
        columns={3}
        sectionClassName="bg-background"
      />

      <FeatureSplit
        copy={{
          chip: "Live occupancy",
          chipIcon: Building2,
          title: "Your whole property, down to the bed",
          desc: "Blocks, floors, rooms and beds are live records, not spreadsheet rows. Allocate, transfer and vacate in a few clicks, and everyone sees the same status.",
          points: [
            "Property → Block → Floor → Room → Bed",
            "Bed-level allocation and vacancy at a glance",
            "Several properties under one account",
            "Wardens scoped to the blocks they manage",
          ],
        }}
        image={marketingAssets.room}
        imageAlt="Isometric hostel room with two of three beds occupied"
        imageSide="left"
        sectionClassName="bg-linear-to-b from-background to-mint/40"
      />

      <FeatureSplit
        copy={{
          chip: "Role-based access",
          chipIcon: UserCog,
          title: "Every role sees exactly what it should",
          desc: "Fixed roles with clear boundaries, so the right people act on the right information — and nobody sees more than their job needs.",
          points: [
            "Admins run the property; accountants own finance",
            "Wardens handle daily operations and the gate",
            "Students see only their own room, fees and requests",
            "Parents see only the students they're linked to",
          ],
        }}
        image={marketingAssets.roleDashboards}
        imageAlt="Stacked workspace cards for Admin, Warden, Student and Parent roles"
        sectionClassName="bg-linear-to-b from-mint/40 to-background"
      />

      <FeatureGrid
        chip="Security & trust"
        chipIcon={ShieldCheck}
        title="Safeguards Built Into the Core"
        desc="Protections that work the same way for every property, every day."
        items={safeguards}
        columns={4}
        layout="inline"
        isPanel
        sectionClassName="bg-background"
      />

      <FaqSection
        title="Platform Questions, Answered"
        desc="How Hostylia works under the hood."
        faqs={faqs}
        sectionClassName="bg-linear-to-b from-background to-mint/40"
      />

      <CtaBanner
        title="See the platform in action"
        desc="Book a walkthrough and we'll show Hostylia set up around your properties, roles and fee structure."
        primary={{ label: "Book a Demo", to: "/book-demo", icon: CalendarDays }}
        secondary={{ label: "Explore Solutions", to: "/solutions", icon: LayoutGrid }}
      />
    </div>
  );
}
