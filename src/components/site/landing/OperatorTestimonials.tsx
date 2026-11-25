import { useState } from "react";
import { ArrowLeft, ArrowRight, Quote, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";

type Testimonial = { quote: string; name: string; role: string };

// TODO(content): confirm every quote, name and organisation is a real,
// consenting customer before launch.
const testimonials: Testimonial[] = [
  {
    quote:
      "Hostylia simplified our entire hostel operations—from room allocation to fee collection. It's fast, reliable and easy to use.",
    name: "Rohit Mehta",
    role: "Operations Head, Kota Residency",
  },
  {
    quote:
      "The role-based access and real-time dashboards have made coordination between our staff, wardens and parents seamless.",
    name: "Priya Sharma",
    role: "Director, Sunrise Boarding School",
  },
  {
    quote:
      "The AI features and automated workflows save us hours every week. It's a complete solution for modern residential management.",
    name: "Aman Verma",
    role: "CEO, StudentStay Homes",
  },
  {
    quote:
      "Collections jumped 22% in the first quarter. The AI fee nudges paid for the whole platform.",
    name: "Pratik Joshi",
    role: "Director, 4-property hostel chain",
  },
  {
    quote:
      "Wardens got their evenings back. One screen replaced three Excel sheets and a WhatsApp group.",
    name: "Riya Menon",
    role: "Owner, 2-property PG chain, Bengaluru",
  },
  {
    quote:
      "Parents stopped calling the warden. They open the app instead — that alone changed our culture.",
    name: "Captain S. Rao",
    role: "Principal, Residential school, Hyderabad",
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !w.endsWith("."))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

export function OperatorTestimonials() {
  const [start, setStart] = useState(0);
  const total = testimonials.length;
  const go = (dir: 1 | -1) => setStart((s) => (s + dir + total) % total);
  // Three visible on lg, two on md, one on mobile.
  const visible = [0, 1, 2].map((k) => testimonials[(start + k) % total]);

  return (
    <section className="bg-linear-to-b from-background to-mint/50 py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="What operators say"
          chipIcon={Quote}
          title="Trusted by residential operators across India"
          desc="Here's what hostels, boarding schools and student housing operators love about Hostylia."
        />

        <div className="relative mt-12 px-0 md:px-14">
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-live="polite">
            {visible.map((t, k) => (
              <li
                key={t.name}
                className={cn(
                  "flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-card-ambient animate-fade-in",
                  k === 1 && "hidden md:flex",
                  k === 2 && "hidden lg:flex",
                )}
              >
                <blockquote className="text-[15px] leading-relaxed text-foreground/90">
                  “{t.quote}”
                </blockquote>
                <div className="mt-6 flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-green-soft font-heading text-sm font-bold text-brand-green"
                  >
                    {initials(t.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-sm font-bold text-foreground">
                      {t.name}
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{t.role}</div>
                  </div>
                  <div className="flex shrink-0 gap-0.5" role="img" aria-label="Rated 5 out of 5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className="size-3.5 fill-gold text-gold" aria-hidden />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex justify-center gap-3 md:mt-0">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous testimonials"
              className="liquid-glass grid size-11 place-items-center rounded-full text-foreground transition-transform hover:scale-105 md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next testimonials"
              className="liquid-glass grid size-11 place-items-center rounded-full text-foreground transition-transform hover:scale-105 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2"
            >
              <ArrowRight className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
