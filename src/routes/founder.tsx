import { createFileRoute, Link } from "@tanstack/react-router";
import { Linkedin, Mail, ArrowRight, Quote } from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import vikasPhoto from "@/assets/vikas-patel.jpeg.asset.json";


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
                src={vikasPhoto.url}
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
      <CTAStrip />
    </div>
  );
}
