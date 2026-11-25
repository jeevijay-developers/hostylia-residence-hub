import { Link } from "@tanstack/react-router";
import { Mail, Phone } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { cn } from "@/lib/utils";
import {
  PUBLIC_EMAIL,
  PUBLIC_EMAIL_MAILTO,
  PUBLIC_PHONE_DISPLAY,
  PUBLIC_PHONE_TEL,
} from "@/lib/site";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Solutions", to: "/solutions" },
      { label: "AI Suite", to: "/ai-suite" },
      { label: "Pricing", to: "/pricing" },
      { label: "Book a Demo", to: "/book-demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Founder", to: "/founder" },
      { label: "Support", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Refund Policy", to: "/refund-policy" },
    ],
  },
] as const;

const linkClass =
  "rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteFooter() {
  return (
    <footer className="landing-type border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Logo variant="lockup" className="h-8" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              All-in-one residential management for hostels, PGs and boarding schools.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-sm font-semibold text-foreground">{col.title}</p>
                <ul className="mt-3 space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} Hostylia · Powered by Jeevijay Technologies Private Limited
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={PUBLIC_EMAIL_MAILTO}
              className={cn(linkClass, "inline-flex items-center gap-1.5 text-xs")}
            >
              <Mail aria-hidden className="size-3.5 text-brand-green" />
              {PUBLIC_EMAIL}
            </a>
            <a
              href={PUBLIC_PHONE_TEL}
              className={cn(linkClass, "inline-flex items-center gap-1.5 text-xs")}
            >
              <Phone aria-hidden className="size-3.5 text-brand-green" />
              {PUBLIC_PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
