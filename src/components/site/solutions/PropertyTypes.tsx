import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BedDouble,
  BookOpen,
  Briefcase,
  Building2,
  GraduationCap,
  School,
  Users,
} from "lucide-react";
import { marketingAssets, type MarketingImage } from "@/components/site/marketing/marketing-assets";
import { MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";

type PropertyType = {
  title: string;
  desc: string;
  icon: LucideIcon;
  image: MarketingImage;
  alt: string;
};

const propertyTypes: PropertyType[] = [
  {
    title: "Student Hostels",
    desc: "Manage students, rooms, attendance, fees and daily operations effortlessly.",
    icon: BedDouble,
    image: marketingAssets.propertyHostel,
    alt: "Modern multi-storey student hostel building with landscaped entrance",
  },
  {
    title: "Co-Living & PG",
    desc: "Run your PG or co-living space end-to-end with a modern, resident-friendly experience.",
    icon: Users,
    image: marketingAssets.propertyColiving,
    alt: "Contemporary co-living and PG residence with balconies and warm evening lighting",
  },
  {
    title: "Boarding Schools",
    desc: "Fully digital residential management for K-12 schools with hostels.",
    icon: School,
    image: marketingAssets.propertySchool,
    alt: "Boarding school campus building with a clock tower and front lawn",
  },
  {
    title: "Coaching Hostels",
    desc: "Test-prep residences with attendance, curfews and real-time parent updates.",
    icon: BookOpen,
    image: marketingAssets.propertyCoaching,
    alt: "Coaching hostel building with a covered entrance and landscaped garden",
  },
  {
    title: "College & University Dorms",
    desc: "Multi-block dormitory control for colleges, universities and campuses.",
    icon: GraduationCap,
    image: marketingAssets.propertyCollege,
    alt: "College and university dormitory building with lawns and benches",
  },
  {
    title: "Staff & Corporate Housing",
    desc: "Employer-managed accommodation for workforce and staff residences.",
    icon: Briefcase,
    image: marketingAssets.propertyStaff,
    alt: "Staff and corporate housing building with balconies and a modern entrance",
  },
];

export function PropertyTypes() {
  return (
    <section className="bg-background py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="Property types"
          chipIcon={Building2}
          title="Solutions for Every Residential Setup"
          desc="One powerful platform, tailored to your type of property."
        />

        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {propertyTypes.map((p) => (
            <li key={p.title}>
              <Link
                to="/book-demo"
                aria-label={`Book a demo for ${p.title}`}
                className="card-lift group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card-ambient outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="relative">
                  <div className="aspect-video overflow-hidden bg-muted">
                    <img
                      src={p.image.src}
                      srcSet={p.image.srcSet}
                      sizes="(min-width: 1280px) 393px, (min-width: 1024px) 30vw, (min-width: 768px) 45vw, calc(100vw - 32px)"
                      width={p.image.w}
                      height={p.image.h}
                      alt={p.alt}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <span
                    aria-hidden
                    className="absolute -bottom-6 left-5 grid size-12 place-items-center rounded-full bg-card text-brand-green shadow-card-ambient ring-1 ring-border/60"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-brand-green-soft">
                      <p.icon className="size-5" strokeWidth={1.9} />
                    </span>
                  </span>
                </div>

                <div className="flex flex-1 items-end gap-4 px-5 pb-6 pt-9">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold leading-snug text-foreground">{p.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                  </div>
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-green-soft text-brand-green transition-transform group-hover:translate-x-0.5"
                  >
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
