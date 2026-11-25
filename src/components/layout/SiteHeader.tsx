import { useState, useEffect } from "react";

import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ArrowRight } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { MobileNav } from "./MobileNav";
import { siteNavItems } from "./site-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoTheme } from "@/stores/theme-store";

/**
 * Floating liquid-glass pill header, pinned with `position: fixed` (sticky is
 * unreliable here because html/body set overflow-x, which can turn body into
 * the scroll container). A h-20 spacer keeps page content below it; the
 * landing hero pulls itself back up under the glass with `-mt-20 pt-20`.
 */
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  useAutoTheme();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className="landing-type pointer-events-none fixed inset-x-0 top-0 z-50 flex h-20 items-center px-3 md:px-6">
        <div
          data-scrolled={isScrolled}
          className="liquid-glass pointer-events-auto relative mx-auto grid h-14 w-full max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-4 rounded-full pl-4 pr-2 md:pl-6"
        >
          <Logo variant="lockup" className="h-7 w-auto md:h-8" />

          <nav className="hidden items-center justify-center gap-1 md:flex" aria-label="Main">
            {siteNavItems.map((item) => {
              const isActive = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-green-soft text-brand-green"
                      : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 justify-self-end">
            <Button asChild variant="brand" size="pill" className="hidden sm:inline-flex">
              <Link to="/book-demo">
                Book a Demo <ArrowRight />
              </Link>
            </Button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card/70 text-foreground md:hidden"
                >
                  <Menu size={20} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="landing-type w-full max-w-sm overflow-y-auto border-l border-border bg-background p-0 text-foreground"
              >
                <MobileNav onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {/* Reserves the fixed header's height in normal flow. */}
      <div aria-hidden className="h-20 shrink-0" />
    </>
  );
}
