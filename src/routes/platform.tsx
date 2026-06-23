import { createFileRoute } from "@tanstack/react-router";
import { Cpu, Cloud, Shield, Layers, Smartphone, Database, Plug, Lock, Globe, Zap } from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { FeatureCard, SectionHeading } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import moveOutNotice from "@/assets/illustrations/move-out-notice.jpg";
import buildingHero from "@/assets/illustrations/building-hero.jpg";

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "Platform — Hostylia" },
      { name: "description", content: "A modern, secure platform built for residential operations at any scale." },
      { property: "og:title", content: "Platform — Hostylia" },
      { property: "og:description", content: "Architecture, integrations and security behind Hostylia." },
      { property: "og:url", content: "/platform" },
    ],
    links: [{ rel: "canonical", href: "/platform" }],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const pillars = [
    { icon: Cloud, title: "Cloud-Native", desc: "Multi-region cloud with 99.9% uptime SLAs." },
    { icon: Shield, title: "Enterprise Security", desc: "Role-based access, SSO, audit logs and encryption." },
    { icon: Layers, title: "Property Hierarchy", desc: "Property → Block → Floor → Room → Bed modeled end to end." },
    { icon: Smartphone, title: "Apps for Everyone", desc: "Owner, manager, warden, student and parent apps." },
    { icon: Database, title: "Reliable Data", desc: "Daily backups, point-in-time recovery, GDPR ready." },
    { icon: Plug, title: "Open Integrations", desc: "Webhooks, REST APIs and partner connectors." },
    { icon: Lock, title: "Privacy First", desc: "Granular consent, data residency and DPA support." },
    { icon: Globe, title: "Multi-Language", desc: "Built for India and global residential portfolios." },
    { icon: Zap, title: "Real-Time Sync", desc: "Live updates across every dashboard and app." },
  ];
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Platform"
        title="A modern operating system for residential properties"
        desc="Built on a secure, scalable architecture designed for hostels, schools and institutional residences."
      />
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Architecture" title="The Hostylia platform" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => <FeatureCard key={p.title} {...p} tone="teal" />)}
          </div>
        </div>
      </section>
      <section className="border-y border-dark-border py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <SectionHeading eyebrow="Stack" title="Trusted infrastructure" desc="Modern cloud, hardened security and battle-tested integrations." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {["Cloud Hosting", "Encrypted Storage", "UPI Gateways", "SMS / WhatsApp"].map((t) => (
              <div key={t} className="rounded-xl border border-dark-border bg-card p-5 text-center">
                <Cpu size={20} className="mx-auto text-soft-teal" />
                <div className="mt-2 text-sm font-bold text-white">{t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <IllustrationCard src={moveOutNotice} alt="Move-out lifecycle card showing lock-in and notice periods" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Stay Lifecycle</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">From onboarding to move-out — fully tracked</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Lock-in periods, notice windows, renewals and exits are modeled end to end. Wardens,
              owners and parents always see the same accurate status.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Engineered for Scale</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">A platform that grows with your portfolio</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              From a single hostel to a national chain, Hostylia's architecture is built for high
              availability, fast performance and secure multi-tenant isolation.
            </p>
          </div>
          <IllustrationCard src={buildingHero} alt="Luminous modern residential apartment tower at night" />
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
