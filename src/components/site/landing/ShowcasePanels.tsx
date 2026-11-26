import type { LucideIcon } from "lucide-react";
import { MessageSquareText, Monitor, ShieldCheck, Sparkles } from "lucide-react";
import { ChecklistCopy } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets, type MarketingImage } from "@/components/site/marketing/marketing-assets";

type Panel = {
  chip: string;
  chipIcon: LucideIcon;
  title: string;
  desc: string;
  points: string[];
  image: MarketingImage;
  imageAlt: string;
  /** Tailwind width for the illustration column on sm+. */
  imageWidth: string;
};

const panels: Panel[] = [
  {
    chip: "Security Workflows",
    chipIcon: ShieldCheck,
    title: "Keep your residences safe and compliant",
    desc: "End-to-end security workflows for students, staff and visitors.",
    points: [
      "Visitor management & gate passes",
      "Real-time entry/exit logs",
      "Role-based access & approvals",
      "Emergency alerts & broadcasts",
    ],
    image: marketingAssets.visitorPass,
    imageAlt: "Approved visitor pass with QR code",
    imageWidth: "sm:w-[34%]",
  },
  {
    chip: "Complaint Management",
    chipIcon: MessageSquareText,
    title: "Resolve issues faster with a streamlined flow",
    desc: "A simple, transparent complaint workflow from raise to resolution.",
    points: [
      "Easy complaint submission",
      "Auto-assignment to the right team",
      "Real-time status updates",
      "SLA tracking and resolution insights",
    ],
    image: marketingAssets.complaintBoard,
    imageAlt: "Complaint list showing in-progress, resolved and open issues",
    imageWidth: "sm:w-[44%]",
  },
  {
    chip: "Role-Based Dashboards",
    chipIcon: Monitor,
    title: "The right view for everyone",
    desc: "Personalized dashboards for admins, wardens, staff, students and parents.",
    points: [
      "Role-specific insights & actions",
      "Relevant data, no clutter",
      "Better coordination across teams",
      "Real-time updates and notifications",
    ],
    image: marketingAssets.roleDashboards,
    imageAlt: "Stacked dashboard cards for Admin, Warden, Student and Parent roles",
    imageWidth: "sm:w-[44%]",
  },
  {
    chip: "Hostylia AI Suite",
    chipIcon: Sparkles,
    title: "AI that makes residential operations smarter",
    desc: "Use AI to save time, improve responses and run more personalized residences.",
    points: [
      "AI-powered insights & recommendations",
      "Smart complaint categorization",
      "Automated communication & alerts",
      "Predictive occupancy & demand planning",
    ],
    image: marketingAssets.aiSuite,
    imageAlt: "",
    imageWidth: "sm:w-[38%]",
  },
];

export function ShowcasePanels() {
  return (
    <section className="bg-background py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 md:px-6 lg:grid-cols-2">
        {panels.map((p) => (
          <article
            key={p.chip}
            className="relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-brand-green/10 bg-linear-to-br from-mint via-mint/60 to-card p-6 shadow-card-ambient sm:flex-row sm:items-center md:p-8"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-brand-green/10 blur-3xl"
            />
            <div className="relative min-w-0 flex-1">
              <ChecklistCopy
                chip={p.chip}
                chipIcon={p.chipIcon}
                title={p.title}
                desc={p.desc}
                points={p.points}
                headingLevel="h3"
                isCompact
                chipClassName="bg-card"
              />
            </div>
            <img
              src={p.image.src}
              srcSet={p.image.srcSet}
              sizes="(min-width: 640px) 288px, 50vw"
              alt={p.imageAlt}
              aria-hidden={p.imageAlt === "" ? true : undefined}
              width={p.image.w}
              height={p.image.h}
              loading="lazy"
              decoding="async"
              className={`relative mx-auto h-auto w-3/5 max-w-64 shrink-0 sm:max-w-none ${p.imageWidth}`}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
