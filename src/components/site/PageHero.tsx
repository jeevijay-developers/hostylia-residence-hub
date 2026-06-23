import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export function PageHero({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc?: string; children?: ReactNode }) {
  return (
    <section className="bg-hero-gradient border-b border-dark-border">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center md:px-6 md:py-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-dark-border bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold">
          {eyebrow}
        </div>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight text-white md:text-5xl lg:text-6xl">{title}</h1>
        {desc && <p className="mx-auto mt-5 max-w-2xl text-base text-soft-grey md:text-lg">{desc}</p>}
        {children && <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>}
      </div>
    </section>
  );
}

export function CTAStrip() {
  return (
    <section className="bg-section-dark py-16">
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="glass-panel flex flex-col items-start justify-between gap-5 rounded-2xl p-8 md:flex-row md:items-center">
          <div>
            <h3 className="text-2xl font-extrabold text-white">See Hostylia in action</h3>
            <p className="text-sm text-soft-grey">Personalized walkthrough for your property type.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/book-demo" className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy">
              Book Demo <ArrowRight size={16} />
            </Link>
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-white/5 px-5 py-3 text-sm font-bold text-white">
              Contact Sales
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
