import { Link } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Logo } from "@/components/site/Logo";
import { MegaMenuSolutions } from "./MegaMenuSolutions";
import { MegaMenuFeatures } from "./MegaMenuFeatures";

const simpleLinks = [
  { label: "Platform", to: "/platform" },
  { label: "AI Suite", to: "/ai-suite" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Founder", to: "/founder" },
  { label: "Contact", to: "/contact" },
];

export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-dark-border px-5 py-4">
        <Logo className="h-9 w-auto" />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="solutions" className="border-dark-border">
            <AccordionTrigger className="text-white">Solutions</AccordionTrigger>
            <AccordionContent>
              <MegaMenuSolutions onNavigate={onNavigate} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="features" className="border-dark-border">
            <AccordionTrigger className="text-white">Features</AccordionTrigger>
            <AccordionContent>
              <MegaMenuFeatures onNavigate={onNavigate} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <ul className="mt-2 space-y-1">
          {simpleLinks.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                onClick={onNavigate}
                className="block rounded-md px-3 py-3 text-base font-semibold text-white hover:bg-white/5"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2 border-t border-dark-border p-4">
        <Link
          to="/book-demo"
          onClick={onNavigate}
          className="block rounded-lg bg-gold px-4 py-3 text-center text-sm font-bold text-navy"
        >
          Book Demo
        </Link>
        <Link
          to="/contact"
          onClick={onNavigate}
          className="block rounded-lg border border-dark-border bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
