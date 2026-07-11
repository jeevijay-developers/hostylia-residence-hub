import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, Phone, MapPin, Send, Clock, ShieldCheck, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { SectionHeading, FeatureCard } from "@/components/site/Primitives";
import {
  MockParentApp,
  MockComplaintBoard,
  StatBand,
  BenefitList,
  TestimonialCard,
} from "@/components/site/HtmlMockups";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Hostylia" },
      { name: "description", content: "Talk to the Hostylia team about your residential property." },
      { property: "og:title", content: "Contact — Hostylia" },
      { property: "og:description", content: "Reach out to Hostylia." },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [loading, setLoading] = useState(false);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      (e.target as HTMLFormElement).reset();
      toast.success("Message sent", { description: "Our team will get back to you within one business day." });
    }, 700);
  }
  return (
    <div className="bg-section-dark">
      <PageHero eyebrow="Contact" title="Let's talk residential operations" desc="Tell us about your property and we'll get back to you within one business day." />

      <section className="py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            <InfoCard icon={Mail} title="Email" value="hello@hostylia.com" />
            <InfoCard icon={Phone} title="Phone" value="+91 80000 00000" />
            <InfoCard icon={MapPin} title="Office" value="Jeevijay Technologies Private Limited" />
          </div>
          <form onSubmit={onSubmit} className="glass-panel rounded-2xl p-6 md:p-8">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" name="name" placeholder="Your name" required />
              <Field label="Work email" name="email" type="email" placeholder="you@property.com" required />
              <Field label="Property name" name="property" placeholder="e.g. Sunrise Hostels" />
              <Field label="Beds" name="beds" placeholder="e.g. 250" />
            </div>
            <Field label="Message" name="message" textarea placeholder="How can we help?" required />
            <button disabled={loading} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy disabled:opacity-60">
              <Send size={14} /> {loading ? "Sending..." : "Send Message"}
            </button>
          </form>
        </div>
      </section>

      <section className="border-t border-dark-border py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <StatBand stats={[
            { v: "< 1 day", l: "Average response time" },
            { v: "24 × 7", l: "Live ops monitoring" },
            { v: "11 cities", l: "On-ground partners" },
            { v: "4.9 / 5", l: "Support CSAT" },
          ]} />
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <MockParentApp />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Built for every stakeholder</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">From owners to parents — one team, one app</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Whether you're an owner exploring Hostylia, a warden onboarding tomorrow or a parent
              with a question — our team responds within hours, not days.
            </p>
            <BenefitList items={[
              "Dedicated residential ops specialists, not generic helpdesk.",
              "WhatsApp, email and phone — your channel, your timing.",
              "On-ground partners in 11 Indian cities.",
            ]} />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:px-6 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Support that ships</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Every ticket tracked, every promise kept</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              We use the same complaint board our customers do. Your request is triaged, assigned and
              followed up automatically — with full visibility for you.
            </p>
            <BenefitList items={[
              "SLA-backed response and resolution timers.",
              "Auto-escalation to the right specialist team.",
              "Status updates on email and WhatsApp.",
            ]} />
          </div>
          <MockComplaintBoard />
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="What you get" title="Support without the runaround" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={Clock} title="Same-day response" desc="Every message gets a human reply within one business day." />
            <FeatureCard icon={ShieldCheck} title="Secure intake" desc="Property and student data is encrypted from the first message." tone="blue" />
            <FeatureCard icon={MessageSquare} title="WhatsApp first" desc="Talk to us on the channel your team already lives in." tone="gold" />
          </div>
        </div>
      </section>

      <section className="border-t border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="In their words" title="Why operators stay" />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <TestimonialCard
              quote="Their team gets residential ops. We don't have to explain the basics — we just get to solutions."
              name="Sneha Iyer"
              role="Operations Lead · 900-bed boarding school"
            />
            <TestimonialCard
              quote="We've shipped product changes we requested within the same quarter. That's rare."
              name="Mohit Bansal"
              role="Co-founder · Co-living chain, Delhi NCR"
            />
          </div>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}

function InfoCard({ icon: Icon, title, value }: { icon: any; title: string; value: string }) {
  return (
    <div className="card-lift rounded-2xl border border-dark-border bg-card p-5">
      <Icon size={18} className="text-soft-teal" />
      <div className="mt-2 text-xs font-semibold uppercase tracking-widest text-soft-grey">{title}</div>
      <div className="text-base font-bold text-white">{value}</div>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, required, textarea }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; textarea?: boolean }) {
  const cls = "mt-1.5 w-full rounded-lg border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] px-3 py-2.5 text-sm text-white placeholder:text-soft-grey/80 focus:border-soft-teal focus:outline-none focus:ring-2 focus:ring-soft-teal/30";
  return (
    <label className={textarea ? "mt-4 block" : "block"}>
      <span className="text-xs font-semibold uppercase tracking-widest text-soft-grey">{label}</span>
      {textarea ? (
        <textarea name={name} placeholder={placeholder} required={required} rows={5} className={cls} />
      ) : (
        <input type={type} name={name} placeholder={placeholder} required={required} className={cls} />
      )}
    </label>
  );
}
