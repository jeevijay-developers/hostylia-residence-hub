import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { siteNavItems } from "./site-nav";

export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-border px-5 py-4">
        <Logo variant="lockup" className="h-8 w-auto" />
      </div>
      <nav className="flex-1 p-4" aria-label="Main">
        <ul className="space-y-1">
          {siteNavItems.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                onClick={onNavigate}
                className="block rounded-xl px-3 py-3 text-base font-semibold text-foreground hover:bg-foreground/5"
                activeProps={{ className: "bg-brand-green-soft text-brand-green" }}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-border p-4">
        <Button asChild variant="brand" size="pill-lg" className="w-full">
          <Link to="/book-demo" onClick={onNavigate}>
            Book a Demo <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
