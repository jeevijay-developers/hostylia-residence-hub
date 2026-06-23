import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/site/Logo";
import { Mail, MapPin, Globe } from "lucide-react";

const cols = [
  {
    title: "Solutions",
    links: [
      { label: "Student Hostels", to: "/solutions" },
      { label: "Boarding Schools", to: "/solutions" },
      { label: "PG Accommodation", to: "/solutions" },
      { label: "Co-Living Spaces", to: "/solutions" },
      { label: "Multi-Property Owners", to: "/solutions" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Features", to: "/features" },
      { label: "Platform", to: "/platform" },
      { label: "AI Suite", to: "/ai-suite" },
      { label: "Pricing", to: "/pricing" },
      { label: "Book Demo", to: "/book-demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Founder", to: "/founder" },
      { label: "Contact", to: "/contact" },
      { label: "Privacy Policy", to: "/about" },
      { label: "Terms", to: "/about" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-dark-border bg-[#06091A]">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo className="h-10 w-auto" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-soft-grey">
              Smart Residential Management for hostels, boarding schools, student housing and
              institutional residences. One intelligent platform.
            </p>
            <div className="mt-5 space-y-2 text-sm text-soft-grey">
              <p className="flex items-center gap-2"><Globe size={14} className="text-soft-teal" /> hostylia.com</p>
              <p className="flex items-center gap-2"><Mail size={14} className="text-soft-teal" /> hello@hostylia.com</p>
              <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-soft-teal" /> Powered by Jeevijay Technologies Private Limited</p>
            </div>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-gold">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-soft-grey transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-dark-border pt-6 text-xs text-soft-grey md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Hostylia. All rights reserved.</p>
          <p>Powered by Jeevijay Technologies Private Limited</p>
        </div>
      </div>
    </footer>
  );
}
