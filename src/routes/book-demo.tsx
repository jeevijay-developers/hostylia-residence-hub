import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Calendar, CheckCircle2, Send, Sparkles, Users, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHero } from "@/components/site/PageHero";

export const Route = createFileRoute("/book-demo")({
  head: () => ({
    meta: [
      { title: "Book a Demo — Hostylia" },
      { name: "description", content: "Book a personalized walkthrough of Hostylia for your residential property." },
      { property: "og:title", content: "Book a Demo — Hostylia" },
      { property: "og:description", content: "See Hostylia in action." },
      { property: "og:url", content: "/book-demo" },
    ],
    links: [{ rel: "canonical", href: "/book-demo" }],
  }),
  component: BookDemoPage,
});

function BookDemoPage() {
  const [loading, setLoading] = useState(false);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      (e.target as HTMLFormElement).reset();
      toast.success("Demo request received", { description: "We'll reach out shortly to schedule your walkthrough." });
    }, 700);
  }
  const types = ["Student Hostel", "PG / Co-Living", "Boarding School", "University Dorm", "Multi-Property"];
  return (
    <div className="bg-section-dark">
      <PageHero eyebrow="Book Demo" title="See Hostylia in action" desc="A 30-minute personalized walkthrough tailored to your property type." />
      <section className="py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[1.3fr_1fr]">
          <form onSubmit={onSubmit} className="glass-panel rounded-2xl p-6 md:p-8">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" name="name" placeholder="Your name" required />
              <Field label="Work email" name="email" type="email" placeholder="you@property.com" required />
              <Field label="Phone" name="phone" placeholder="+91 ..." />
              <Field label="Property name" name="property" placeholder="e.g. Sunrise Hostels" required />
              <Field label="City" name="city" placeholder="Mumbai" />
              <Field label="Number of beds" name="beds" placeholder="e.g. 250" />
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-widest text-soft-grey">Property type</span>
              <select name="type" className="mt-1.5 w-full rounded-lg border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] px-3 py-2.5 text-sm text-white focus:border-soft-teal focus:outline-none focus:ring-2 focus:ring-soft-teal/30">
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <Field label="Anything we should know?" name="notes" textarea placeholder="Tell us about your operations" />
            <button disabled={loading} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy disabled:opacity-60">
              <Send size={14} /> {loading ? "Submitting..." : "Request Demo"}
            </button>
          </form>
          <div className="space-y-4">
            <Bullet icon={Calendar} title="30-minute walkthrough" desc="A focused session, no pressure." />
            <Bullet icon={Sparkles} title="Tailored to your property" desc="We adapt the demo to your operations." />
            <Bullet icon={Users} title="Owner, manager, warden views" desc="See every role in action." />
            <Bullet icon={ShieldCheck} title="Security & compliance" desc="Discuss your data and privacy needs." />
            <Bullet icon={CheckCircle2} title="Trial environment" desc="We can set up a sandbox for you." />
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, required, textarea }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; textarea?: boolean }) {
  const cls = "mt-1.5 w-full rounded-lg border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] px-3 py-2.5 text-sm text-white placeholder:text-soft-grey/60 focus:border-soft-teal focus:outline-none focus:ring-2 focus:ring-soft-teal/30";
  return (
    <label className={textarea ? "mt-4 block" : "block"}>
      <span className="text-xs font-semibold uppercase tracking-widest text-soft-grey">{label}</span>
      {textarea ? (
        <textarea name={name} placeholder={placeholder} required={required} rows={4} className={cls} />
      ) : (
        <input type={type} name={name} placeholder={placeholder} required={required} className={cls} />
      )}
    </label>
  );
}

function Bullet({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="card-lift rounded-2xl border border-dark-border bg-card p-5">
      <Icon size={20} className="text-soft-teal" />
      <div className="mt-2 text-base font-bold text-white">{title}</div>
      <div className="text-sm text-soft-grey">{desc}</div>
    </div>
  );
}
