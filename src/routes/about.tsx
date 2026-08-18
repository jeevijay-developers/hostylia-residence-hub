import { createFileRoute } from "@tanstack/react-router";
import {
  Target,
  Heart,
  ShieldCheck,
  Sparkles,
  Building2,
  Rocket,
  Users,
  Globe,
} from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { SectionHeading, FeatureCard } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import buildingHero from "@/assets/illustrations/building-hero.jpg";
import aiInsights from "@/assets/illustrations/ai-insights.jpg";
import {
  MockOccupancyDashboard,
  MockComplaintBoard,
  StatBand,
  BenefitList,
  TestimonialCard,
} from "@/components/site/HtmlMockups";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Hostylia" },
      {
        name: "description",
        content:
          "Hostylia is built to simplify residential management for hostels, schools and institutional properties. Powered by Jeevijay Technologies.",
      },
      { property: "og:title", content: "About — Hostylia" },
      { property: "og:description", content: "Our mission and the team behind Hostylia." },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="About"
        title="Built to modernize residential operations"
        desc="Hostylia is a smart residential operating system, powered by Jeevijay Technologies Private Limited."
      />

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <IllustrationCard
            src={buildingHero}
            alt="Modern residential tower powered by Hostylia"
            eager
          />
          <div>
            <SectionHeading
              eyebrow="Our Mission"
              title="Make residential operations effortless"
              align="left"
              desc="We help hostels, schools and institutions run their properties with the same elegance and intelligence as modern SaaS — without the chaos of spreadsheets, paper registers and disconnected tools."
            />
            <BenefitList
              items={[
                "One operating system across every role and property.",
                "Automation that returns hours back to wardens every day.",
                "Transparent communication that earns parent trust.",
                "Insights that turn occupancy and dues into growth.",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="border-y border-dark-border py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <StatBand
            stats={[
              { v: "120+", l: "Properties live" },
              { v: "65,000", l: "Beds managed" },
              { v: "₹240 Cr+", l: "Fees collected" },
              { v: "11 cities", l: "Across Indiaaa" },
            ]}
          />
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Our Values" title="What we stand for" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={Target}
              title="Operator-First"
              desc="Built with input from real wardens, managers and owners."
            />
            <FeatureCard
              icon={Heart}
              title="Parent Trust"
              desc="Transparent communication keeps families confident."
              tone="green"
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Safety & Security"
              desc="Workflows that prioritize student well-being."
              tone="blue"
            />
            <FeatureCard
              icon={Sparkles}
              title="Continuous Innovation"
              desc="Quarterly AI releases tuned to your operations."
              tone="gold"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <MockOccupancyDashboard />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">
              Why we built it
            </div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">
              A control room, not a clipboard
            </h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Wardens were drowning in registers. Owners couldn't see what was happening across
              blocks. Parents kept calling for updates. Hostylia replaces every one of those moments
              with a single live view.
            </p>
            <BenefitList
              items={[
                "Live occupancy down to the bed.",
                "Real-time fee dashboards owners can trust.",
                "Parent app that ends the daily phone calls.",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">
              Operations, simplified
            </div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">
              Complaints close in hours, not days
            </h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              AI triages every ticket, assigns the right vendor and keeps students and parents
              updated automatically — so wardens can finally focus on hospitality, not paperwork.
            </p>
            <BenefitList
              items={[
                "AI triage with auto-routing to the right team.",
                "SLA timers visible to every stakeholder.",
                "Average resolution time down 38%.",
              ]}
            />
          </div>
          <MockComplaintBoard />
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Our Journey" title="From idea to operating system" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={Rocket}
              title="2023 · Founded"
              desc="Jeevijay Technologies starts Hostylia after running a 400-bed pilot."
              tone="gold"
            />
            <FeatureCard
              icon={Users}
              title="2024 · 10k beds"
              desc="First multi-city deployments across boarding schools and PGs."
              tone="teal"
            />
            <FeatureCard
              icon={Sparkles}
              title="2025 · AI Suite"
              desc="Launched purpose-built models for fees, complaints and occupancy."
              tone="blue"
            />
            <FeatureCard
              icon={Globe}
              title="2026 · 65k beds"
              desc="Scaling across 11 Indian cities and select international campuses."
              tone="green"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">
              Intelligent by default
            </div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">
              Built with AI in the foundation
            </h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Every screen in Hostylia is paired with an AI assistant. Insights surface before you
              ask for them — so owners and wardens stay ahead of every risk.
            </p>
          </div>
          <IllustrationCard src={aiInsights} alt="AI insights dashboard preview" />
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="What customers say" title="Trusted by operators across India" />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <TestimonialCard
              quote="Hostylia turned three Excel sheets and a WhatsApp group into one calm dashboard. Our wardens got their evenings back."
              name="Riya Menon"
              role="Owner · 2-property PG chain, Bengaluru"
            />
            <TestimonialCard
              quote="Parent escalations dropped almost overnight. They open the app instead of calling the warden."
              name="Captain S. Rao"
              role="Principal · Residential school, Hyderabad"
            />
          </div>
        </div>
      </section>
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 md:px-6">
          <div className="glass-panel rounded-3xl p-8 text-center md:p-12">
            <Building2 className="mx-auto text-soft-teal" size={40} />
            <h3 className="mt-4 text-2xl font-extrabold text-white">
              Powered by Jeevijay Technologies
            </h3>
            <p className="mt-3 text-base text-soft-grey">
              Jeevijay Technologies Private Limited builds intelligent operations software for
              regulated, real-world industries. Hostylia is our flagship product for residential
              management.
            </p>
          </div>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
