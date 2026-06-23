import { createFileRoute } from "@tanstack/react-router";
import {
  Building2, Home, Users, School, GraduationCap, BookOpen,
  Hospital, BriefcaseBusiness, Network, Stethoscope, Church, Building,
} from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { FeatureCard, SectionHeading } from "@/components/site/Primitives";

export const Route = createFileRoute("/solutions")({
  head: () => ({
    meta: [
      { title: "Solutions — Hostylia" },
      { name: "description", content: "Solutions for hostels, boarding schools, PGs, co-living, dormitories, medical and corporate residences." },
      { property: "og:title", content: "Solutions — Hostylia" },
      { property: "og:description", content: "One platform for every residential property type." },
      { property: "og:url", content: "/solutions" },
    ],
    links: [{ rel: "canonical", href: "/solutions" }],
  }),
  component: SolutionsPage,
});

const groups = [
  {
    title: "Residential",
    desc: "From single hostels to multi-city PG networks.",
    items: [
      { icon: Building2, title: "Student Hostels", desc: "Operations for student hostels of every size." },
      { icon: Home, title: "PG Accommodation", desc: "Tailored workflows for paying guest properties." },
      { icon: Users, title: "Co-Living Spaces", desc: "Modern shared living with community features." },
      { icon: Building, title: "Rental Homes", desc: "Long-term rental tracking and tenant lifecycle." },
      { icon: BriefcaseBusiness, title: "Staff Accommodation", desc: "Employer-managed residential stays." },
    ],
  },
  {
    title: "Campus",
    desc: "Built for academic residential environments.",
    items: [
      { icon: School, title: "Boarding Schools", desc: "K-12 boarding with parent and academic integration." },
      { icon: GraduationCap, title: "University Dormitories", desc: "Multi-block dormitory operations at scale." },
      { icon: BookOpen, title: "Coaching Hostels", desc: "Residences for test-prep students with strict workflows." },
      { icon: Building2, title: "College Accommodation", desc: "Affiliated college hostels with central admin." },
      { icon: Network, title: "Residential Campuses", desc: "Integrated campus living across departments." },
    ],
  },
  {
    title: "Institutional",
    desc: "For mission-driven and large institutional residences.",
    items: [
      { icon: Hospital, title: "Medical Hostels", desc: "MBBS and allied health student housing." },
      { icon: Stethoscope, title: "Nursing Hostels", desc: "Hospital-attached residences with shift schedules." },
      { icon: Church, title: "Religious Hostels", desc: "Trust-run residences with custom rule sets." },
      { icon: BriefcaseBusiness, title: "Corporate Hostels", desc: "Workforce housing with employer dashboards." },
      { icon: Network, title: "Multi-Property Owners", desc: "Portfolio-wide reporting and roll-ups." },
    ],
  },
];

function SolutionsPage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Solutions"
        title="One platform, every residential property type"
        desc="Hostylia adapts to your operating model — hostel, school, dormitory, PG, co-living or institutional residence."
      />
      {groups.map((g) => (
        <section key={g.title} className="border-b border-dark-border py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <SectionHeading eyebrow={g.title} title={`${g.title} solutions`} desc={g.desc} />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => <FeatureCard key={it.title} {...it} tone="teal" />)}
            </div>
          </div>
        </section>
      ))}
      <CTAStrip />
    </div>
  );
}
