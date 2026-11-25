export type Faq = { q: string; a: string };

/** Commercial trial offer — shared so /pricing and /book-demo never drift apart. */
export const TRIAL_FAQ: Faq = {
  q: "Is there a free trial?",
  a: "Yes — book a demo and we'll configure a trial environment for your property.",
};

/** schema.org FAQPage structured data for a route's head(), built from the visible FAQs. */
export function faqPageJsonLd(faqs: readonly Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}
