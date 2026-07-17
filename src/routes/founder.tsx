import { createFileRoute, Link } from "@tanstack/react-router";
import { Linkedin, Mail, ArrowRight, Quote, Rocket, Users, Sparkles, Globe } from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { SectionHeading, FeatureCard } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import vikasPhoto from "@/assets/vikas-patel.jpeg";
import buildingHero from "@/assets/illustrations/building-hero.jpg";
import aiInsights from "@/assets/illustrations/ai-insights.jpg";
import {
  MockOccupancyDashboard,
  MockAiInsights,
  StatBand,
  BenefitList,
  TestimonialCard,
} from "@/components/site/HtmlMockups";

export const Route = createFileRoute("/founder")({
  head: () => ({
    meta: [
      { title: "Founder — Hostylia" },
      { name: "description", content: "Vikas Patel, Founder & CEO of Hostylia. Building the smart residential operating system." },
      { property: "og:title", content: "Founder — Hostylia" },
      { property: "og:description", content: "Meet Vikas Patel, Founder & CEO of Hostylia." },
      { property: "og:url", content: "/founder" },
    ],
    links: [{ rel: "canonical", href: "/founder" }],
  }),
  component: FounderPage,
});

function FounderPage() {
  return (
    <div className="bg-section-dark">
      <PageHero eyebrow="Founder" title="Meet the founder" desc="The vision behind Hostylia." />

      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <div className="glass-panel relative overflow-hidden rounded-3xl p-8 md:p-12">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--soft-teal)_30%,transparent),transparent_70%)] blur-2xl" />
            <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
              <img
                src={vikasPhoto}
                alt="Vikas Patel, Founder & CEO of Hostylia"
                className="h-40 w-40 rounded-2xl object-cover ring-2 ring-[color:var(--soft-teal)]/40 shadow-2xl"
              />

              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-gold">Founder & CEO</div>
                <h2 className="mt-2 text-3xl font-extrabold text-white md:text-4xl">Vikas Patel</h2>
                <div className="text-sm text-soft-grey">Hostylia · Powered by Jeevijay Technologies Private Limited</div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href="#" className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                    <Linkedin size={14} /> LinkedIn
                  </a>
                  <a href="mailto:founder@hostylia.com" className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                    <Mail size={14} /> Email
                  </a>
                </div>
              </div>
            </div>
            <div className="mt-10 rounded-2xl border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] p-6">
              <Quote className="text-gold" size={22} />
              <p className="mt-3 text-lg leading-relaxed text-white">
                "Hostylia was created to simplify the way residential businesses manage students,
                parents, staff, rooms, fees and daily operations through one intelligent platform."
              </p>
              <div className="mt-4 text-sm text-soft-grey">— Vikas Patel, Founder & CEO</div>
            </div>
            <div className="mt-8">
              <Link to="/book-demo" className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy">
                Book a Demo with the Team <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-dark-border py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <StatBand stats={[
            { v: "120+", l: "Properties live" },
            { v: "65,000", l: "Beds managed" },
            { v: "11 cities", l: "Across India" },
            { v: "3 yrs", l: "Building Hostylia" },
          ]} />
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <IllustrationCard src={buildingHero} alt="Modern residential tower powered by Hostylia" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">The origin story</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">From a 400-bed pilot to a national operating system</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Hostylia started inside a single 400-bed residence where Vikas saw firsthand how
              spreadsheets and registers were costing operators their nights and weekends. Three
              years later, that prototype has grown into the operating system trusted across 11
              Indian cities.
            </p>
            <BenefitList items={[
              "Designed with wardens, owners and parents in the room.",
              "Shipped quarterly with input from operator advisory councils.",
              "One platform — owner, manager, warden, student and parent.",
            ]} />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">What the product proves</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">A live view of every residence on Hostylia</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              The vision is simple — owners should see real status from anywhere, wardens should act on
              the same screen, and parents should never have to call twice. This dashboard is the
              proof.
            </p>
            <BenefitList items={[
              "Real-time occupancy down to the bed.",
              "Move-out, refunds and lifecycle fully modeled.",
              "Multi-property roll-up for growing chains.",
            ]} />
          </div>
          <MockOccupancyDashboard />
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <MockAiInsights />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">AI in the foundation</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">A bet on AI built into every screen</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Vikas pushed Hostylia AI from day one. The result: a co-pilot that recovers dues,
              triages complaints and forecasts vacancy — so operators stay ahead of every risk.
            </p>
            <BenefitList items={[
              "Recovers 4 of 5 overdue fees on auto-pilot.",
              "Cuts complaint resolution time by 38%.",
              "Forecasts vacancy 30 days ahead with 91% accuracy.",
            ]} />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Milestones" title="The road so far" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Rocket} title="2023 · Founded" desc="Jeevijay Technologies starts Hostylia after a 400-bed pilot." tone="gold" />
            <FeatureCard icon={Users} title="2024 · 10k beds" desc="First multi-city deployments across boarding schools and PGs." />
            <FeatureCard icon={Sparkles} title="2025 · AI Suite" desc="Launched purpose-built models for fees, complaints and occupancy." tone="blue" />
            <FeatureCard icon={Globe} title="2026 · 65k beds" desc="Scaling across 11 Indian cities and select international campuses." tone="green" />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="From the field" title="What operators say about the vision" />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <TestimonialCard
              quote="Vikas and the team obviously live this problem. Every release feels like it was built for our exact workflow."
              name="Aarti Deshmukh"
              role="Owner · 3-property hostel chain, Pune"
            />
            <TestimonialCard
              quote="They listen. We've suggested features on Monday and seen them in beta by the end of the month."
              name="Faisal Khan"
              role="Operations Head · Boarding school, Lucknow"
            />
          </div>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
