import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles, ShieldCheck, Headphones, Layers } from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { SectionHeading, FeatureCard } from "@/components/site/Primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  MockFeeReceipt,
  MockFinanceDashboard,
  StatBand,
  BenefitList,
  TestimonialCard,
} from "@/components/site/HtmlMockups";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Hostylia" },
      { name: "description", content: "Per student, per month pricing. Plans for single hostels, growing chains and enterprise portfolios." },
      { property: "og:title", content: "Pricing — Hostylia" },
      { property: "og:description", content: "Transparent pricing that scales with your residence." },
      { property: "og:url", content: "/pricing" },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: PricingPage,
});

const plans = [
  { name: "Starter", price: "₹115", desc: "For single hostels getting started.",
    features: ["Up to 100 beds", "Core operations", "Fee collection", "Parent app", "Email support"] },
  { name: "Professional", price: "₹140", desc: "For growing properties and small chains.", featured: true,
    features: ["Unlimited beds", "AI Suite included", "Security workflows", "Owner dashboard", "Priority support"] },
  { name: "Enterprise", price: "Custom", desc: "For multi-property owners and institutions.",
    features: ["Multi-property roll-up", "SSO and SAML", "Custom SLAs", "White-label options", "Dedicated CSM"] },
];

const faqs = [
  { q: "How is Hostylia priced?", a: "Hostylia is priced per student per month, with plans for hostels of every size." },
  { q: "Is there a free trial?", a: "Yes — book a demo and we'll configure a trial environment for your property." },
  { q: "Do you support multiple properties?", a: "Absolutely. Multi-property owners get portfolio-wide roll-ups on Enterprise." },
  { q: "Which payment methods are supported?", a: "UPI, cards, net-banking, cash and cheque — all auto-reconciled." },
];

function PricingPage() {
  return (
    <div className="bg-section-dark">
      <PageHero eyebrow="Pricing" title="Simple pricing, per student per month" desc="Pick a plan that matches your residential operations." />

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <div key={p.name} className={`card-lift rounded-2xl border p-7 ${p.featured ? "border-gold/60 bg-gradient-to-b from-[color-mix(in_oklab,var(--indigo-deep)_85%,transparent)] to-card" : "border-dark-border bg-card"}`}>
                {p.featured && <div className="mb-3 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-navy">MOST POPULAR</div>}
                <div className="text-sm font-semibold text-soft-grey">{p.name}</div>
                <div className="mt-2 text-4xl font-extrabold text-white">{p.price}<span className="text-base font-medium text-soft-grey"> /student/mo</span></div>
                <div className="mt-2 text-sm text-soft-grey">{p.desc}</div>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-white/90">
                      <Check size={14} className="text-[color:var(--trust-green)]" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/book-demo" className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-bold ${p.featured ? "bg-gold text-navy" : "border border-dark-border bg-white/5 text-white hover:bg-white/10"}`}>
                  Book Demo for Pricing
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <StatBand stats={[
            { v: "92%", l: "On-time fee collection" },
            { v: "6 weeks", l: "Average payback period" },
            { v: "12 hrs", l: "Saved per warden / week" },
            { v: "4.9 / 5", l: "Operator satisfaction" },
          ]} />
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <MockFinanceDashboard />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Returns on day one</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Pricing that pays for itself</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Most properties recover the full subscription cost within the first collection cycle —
              automated reminders, UPI auto-reconciliation and AI nudges close the gaps manual
              processes miss.
            </p>
            <BenefitList items={[
              "Recover 4 of every 5 overdue fees on auto-pilot.",
              "Cut reconciliation time from days to minutes.",
              "Owner dashboard with FY-level finance roll-up.",
              "Unlimited UPI and gateway transactions.",
            ]} />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Loved by parents</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">A premium receipt — every single time</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Parents pay in a tap and instantly get a branded receipt, GST-ready and stored
              forever in their app. No more "did the payment go through?" calls.
            </p>
            <BenefitList items={[
              "UPI, cards, net-banking, cash and cheque — auto-reconciled.",
              "GST-ready receipts and ledgers, exportable to Tally and Excel.",
              "Multi-currency support for international campuses.",
            ]} />
          </div>
          <MockFeeReceipt />
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Every plan includes" title="The essentials, on the house" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={Sparkles} title="Onboarding included" desc="White-glove setup with data migration and staff training." tone="gold" />
            <FeatureCard icon={ShieldCheck} title="Enterprise-grade security" desc="SSO, RBAC, audit logs and daily backups." tone="blue" />
            <FeatureCard icon={Headphones} title="Human support" desc="Real residential ops specialists, not generic helpdesk." />
            <FeatureCard icon={Layers} title="Unlimited admins" desc="Owners, managers and wardens — no per-seat fees." tone="green" />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Real numbers" title="What operators report after switching" />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <TestimonialCard
              quote="Hostylia paid for itself in the first month. The AI fee reminders alone recovered ₹6.4 lakh we'd written off."
              name="Pratik Joshi"
              role="Director · 4-property hostel chain"
            />
            <TestimonialCard
              quote="We moved from a ₹2,000/month tool to Hostylia and saw ROI in 5 weeks. The pricing is honest and the value is obvious."
              name="Anjali Verma"
              role="Founder · 220-bed PG, Pune"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <SectionHeading eyebrow="FAQ" title="Pricing questions, answered" />
          <Accordion type="single" collapsible className="mt-8">
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`f-${i}`} className="border-dark-border">
                <AccordionTrigger className="text-left text-white">{f.q}</AccordionTrigger>
                <AccordionContent className="text-soft-grey">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
