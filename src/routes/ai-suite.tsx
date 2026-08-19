import { createFileRoute } from "@tanstack/react-router";
import {
  Brain,
  Wallet,
  BarChart3,
  Languages,
  Bot,
  FileBarChart,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { FeatureCard, SectionHeading } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import aiInsights from "@/assets/illustrations/ai-insights.jpg";
import {
  MockAiInsights,
  StatBand,
  BenefitList,
  TestimonialCard,
} from "@/components/site/HtmlMockups";

export const Route = createFileRoute("/ai-suite")({
  head: () => ({
    meta: [
      { title: "AI Suite — Hostylia" },
      {
        name: "description",
        content:
          "AI-powered residential intelligence — complaint triage, fee recovery, occupancy insights and more.",
      },
      { property: "og:title", content: "AI Suite — Hostylia" },
      { property: "og:description", content: "Models tuned for residential operations." },
      { property: "og:url", content: "/ai-suite" },
    ],
    links: [{ rel: "canonical", href: "/ai-suite" }],
  }),
  component: AISuitePage,
});

const cards = [
  {
    icon: Brain,
    title: "AI Complaint Classification",
    desc: "Auto-tag, prioritize and route complaints to the right team in seconds.",
  },
  {
    icon: Wallet,
    title: "AI Fee Reminder Assistant",
    desc: "Personalized nudges across SMS, WhatsApp and email with smart timing.",
  },
  {
    icon: BarChart3,
    title: "AI Occupancy Insights",
    desc: "Predict turnover, identify under-utilized beds and optimize allocation.",
  },
  {
    icon: Languages,
    title: "AI Parent Support",
    desc: "24x7 multilingual answers about fees, attendance and gate-pass status.",
  },
  {
    icon: Bot,
    title: "AI Warden Assistant",
    desc: "Daily briefings and exception summaries tailored to each warden's block.",
  },
  {
    icon: FileBarChart,
    title: "AI Report Generator",
    desc: "Ask in natural language, get beautifully formatted operational reports.",
  },
];

function AISuitePage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Hostylia AI"
        title="AI-powered residential intelligence"
        desc="Purpose-built AI assistants that turn raw operations data into action."
      />
      <section className="py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_1fr]">
          <MockAiInsights />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">
              Why operators love Hostylia AI
            </div>
            <h2 className="mt-2 text-3xl font-extrabold text-white md:text-4xl">
              An AI co-pilot, not a chatbot
            </h2>
            <p className="mt-4 text-base leading-relaxed text-soft-grey">
              Every model is tuned on residential operations data — fees, attendance, complaints,
              security. The result: actions, not summaries.
            </p>
            <BenefitList
              items={[
                "Recovers 4 of every 5 overdue fees on auto-pilot.",
                "Cuts complaint resolution time by 38% on average.",
                "Predicts vacancy 30 days ahead with 91% accuracy.",
                "Replies to parents in their preferred language.",
              ]}
            />
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <StatBand
            stats={[
              { v: "38%", l: "Faster complaint resolution" },
              { v: "4 / 5", l: "Auto-recovered dues" },
              { v: "91%", l: "Vacancy forecast accuracy" },
              { v: "12 hrs", l: "Saved per warden / week" },
            ]}
          />
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <FeatureCard key={c.title} {...c} tone="teal" />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="From the field"
            title="What teams say after a month with AI on"
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <TestimonialCard
              quote="The AI fee reminder paid for the whole platform in 6 weeks. We never went back to manual calls."
              name="Vivek Sharma"
              role="Finance Head · 3-campus boarding school"
            />
            <TestimonialCard
              quote="Wardens get a morning brief — who's late on dues, who has complaints, who's leaving. It's magical."
              name="Neha Kulkarni"
              role="Operations Manager · 600-bed co-living"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <SectionHeading
            eyebrow="Responsible AI"
            title="Built with safety and privacy in mind"
            desc="Every Hostylia AI feature is auditable, controllable and aligned with your property's privacy rules."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                t: "Privacy Controls",
                d: "Granular consent and data residency.",
              },
              {
                icon: Sparkles,
                t: "Human in the Loop",
                d: "Wardens review and approve AI actions.",
              },
              { icon: Brain, t: "Continuously Learning", d: "Improves with your property's data." },
            ].map((x) => (
              <div
                key={x.t}
                className="card-lift rounded-2xl border border-dark-border bg-card p-6"
              >
                <x.icon size={22} className="text-soft-teal" />
                <div className="mt-3 text-base font-bold text-white">{x.t}</div>
                <div className="mt-1 text-sm text-soft-grey">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
