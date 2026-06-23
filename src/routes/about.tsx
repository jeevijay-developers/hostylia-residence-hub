import { createFileRoute } from "@tanstack/react-router";
import { Target, Heart, ShieldCheck, Sparkles, Building2 } from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { SectionHeading, FeatureCard } from "@/components/site/Primitives";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Hostylia" },
      { name: "description", content: "Hostylia is built to simplify residential management for hostels, schools and institutional properties. Powered by Jeevijay Technologies." },
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
        <div className="mx-auto max-w-4xl px-4 md:px-6">
          <SectionHeading eyebrow="Our Mission" title="Make residential operations effortless" desc="We help hostels, schools and institutions run their properties with the same elegance and intelligence as modern SaaS — without the chaos of spreadsheets, paper registers and disconnected tools." />
        </div>
      </section>
      <section className="border-y border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Our Values" title="What we stand for" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Target} title="Operator-First" desc="Built with input from real wardens, managers and owners." />
            <FeatureCard icon={Heart} title="Parent Trust" desc="Transparent communication keeps families confident." tone="green" />
            <FeatureCard icon={ShieldCheck} title="Safety & Security" desc="Workflows that prioritize student well-being." tone="blue" />
            <FeatureCard icon={Sparkles} title="Continuous Innovation" desc="Quarterly AI releases tuned to your operations." tone="gold" />
          </div>
        </div>
      </section>
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 md:px-6">
          <div className="glass-panel rounded-3xl p-8 text-center md:p-12">
            <Building2 className="mx-auto text-soft-teal" size={40} />
            <h3 className="mt-4 text-2xl font-extrabold text-white">Powered by Jeevijay Technologies</h3>
            <p className="mt-3 text-base text-soft-grey">
              Jeevijay Technologies Private Limited builds intelligent operations software for
              regulated, real-world industries. Hostylia is our flagship product for residential management.
            </p>
          </div>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
