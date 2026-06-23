import { createFileRoute } from "@tanstack/react-router";
import {
  Building2, Home, Users, School, GraduationCap, BookOpen,
  Hospital, BriefcaseBusiness, Network, Stethoscope, Church, Building,
} from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { FeatureCard, SectionHeading } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import propertyBooking from "@/assets/illustrations/property-booking.jpg";
import servicesPanel from "@/assets/illustrations/services-panel.jpg";
import buildingHero from "@/assets/illustrations/building-hero.jpg";
import {
  MockRoomBooking, MockParentApp, MockOccupancyDashboard, MockSecurityLog,
  StatBand, BenefitList, TestimonialCard,
} from "@/components/site/HtmlMockups";

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

      <section className="py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <IllustrationCard src={propertyBooking} alt="Property listing and instant booking mockup with monthly pricing and amenities" eager />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Property Showcase</div>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white md:text-4xl">List, showcase and book your residences</h2>
            <p className="mt-4 text-base leading-relaxed text-soft-grey">
              Beautiful room cards, real photos, transparent amenities and one-tap booking — give
              every property type a consumer-grade experience parents and residents trust.
            </p>
          </div>
        </div>
      </section>

      {groups.map((g, gi) => (
        <section key={g.title} className="border-b border-dark-border py-20">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <SectionHeading eyebrow={g.title} title={`${g.title} solutions`} desc={g.desc} />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => <FeatureCard key={it.title} {...it} tone="teal" />)}
            </div>
            {gi === 0 && (
              <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <h3 className="text-2xl font-extrabold text-white md:text-3xl">A resident-first services panel</h3>
                  <p className="mt-3 text-base text-soft-grey">
                    Meals, Wi-Fi, laundry, housekeeping and device support — residents see exactly
                    what's included and request anything in a tap.
                  </p>
                </div>
                <IllustrationCard src={servicesPanel} alt="Resident services panel with meals, wifi, laundry, housekeeping icons" />
              </div>
            )}
            {gi === 1 && (
              <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
                <IllustrationCard src={buildingHero} alt="Modern campus residential building at night" />
                <div>
                  <h3 className="text-2xl font-extrabold text-white md:text-3xl">Engineered for campuses at scale</h3>
                  <p className="mt-3 text-base text-soft-grey">
                    From a single boarding school to multi-block university dorms, Hostylia models
                    every property, block, floor, room and bed in one unified tree.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      ))}
      <CTAStrip />
    </div>
  );
}
