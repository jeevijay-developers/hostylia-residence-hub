import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ChevronDown } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { MegaMenuSolutions } from "./MegaMenuSolutions";
import { MegaMenuFeatures } from "./MegaMenuFeatures";
import { MobileNav } from "./MobileNav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type NavItem = { label: string; to: string; mega?: "solutions" | "features" };

const navItems: NavItem[] = [
  { label: "Solutions", to: "/solutions", mega: "solutions" },
  { label: "Features", to: "/features", mega: "features" },
  { label: "Platform", to: "/platform" },
  { label: "AI Suite", to: "/ai-suite" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

export function SiteHeader() {
  const [openMega, setOpenMega] = useState<null | "solutions" | "features">(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-dark-border bg-[color-mix(in_oklab,var(--navy)_85%,transparent)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 md:px-6">
        <Logo className="h-9 w-auto md:h-10" />

        <nav className="hidden items-center justify-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = pathname === item.to;
            return (
              <div
                key={item.to}
                className="relative"
                onMouseEnter={() => item.mega && setOpenMega(item.mega)}
                onMouseLeave={() => item.mega && setOpenMega(null)}
              >
                <Link
                  to={item.to}
                  className={`group inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "text-white" : "text-soft-grey hover:text-white"
                  }`}
                >
                  {item.label}
                  {item.mega && <ChevronDown size={14} className="opacity-60 transition-transform group-hover:rotate-180" />}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gold" aria-hidden />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <Link
            to="/book-demo"
            className="hidden rounded-lg bg-gold px-4 py-2 text-sm font-bold text-navy transition-opacity hover:opacity-90 md:inline-flex"
          >
            Book Demo
          </Link>
          <Link
            to="/contact"
            className="hidden rounded-lg border border-dark-border bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 md:inline-flex"
          >
            Sign In
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-dark-border bg-white/5 text-white lg:hidden"
              >
                <Menu size={20} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-sm overflow-y-auto border-l-dark-border bg-navy p-0 text-white">
              <MobileNav onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mega menu overlay */}
      {openMega && (
        <div
          className="absolute inset-x-0 top-full hidden lg:block"
          onMouseEnter={() => setOpenMega(openMega)}
          onMouseLeave={() => setOpenMega(null)}
        >
          <div className="mx-auto max-w-7xl px-4 pt-2 md:px-6">
            {openMega === "solutions" ? <MegaMenuSolutions /> : <MegaMenuFeatures />}
          </div>
        </div>
      )}
    </header>
  );
}
