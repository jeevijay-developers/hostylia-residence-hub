import { CircleHelp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { MarketingHeading } from "./MarketingPrimitives";
import type { Faq } from "./faq";

/**
 * Centred FAQ accordion inside an inset card, shared by the Pricing and
 * Support pages. Routes pass the same `faqs` to faqPageJsonLd() (./faq) for
 * FAQPage structured data.
 */
export function FaqSection({
  title,
  desc,
  faqs,
  sectionClassName,
}: {
  title: string;
  desc?: string;
  faqs: readonly Faq[];
  sectionClassName?: string;
}) {
  return (
    <section className={cn("py-16 md:py-20", sectionClassName)}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading chip="FAQ" chipIcon={CircleHelp} title={title} desc={desc} />
        <Accordion
          type="single"
          collapsible
          className="mx-auto mt-10 max-w-3xl rounded-3xl border border-border bg-card px-5 shadow-card-ambient sm:px-8 md:mt-12"
        >
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`} className="border-border last:border-b-0">
              <AccordionTrigger className="rounded-md py-5 text-left text-base font-semibold text-foreground outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-card">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground md:text-base">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
