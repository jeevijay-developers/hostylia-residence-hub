import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { LegalCompanyCard, LegalSection, LegalTocNav } from "@/components/site/LegalLayout";

const LAST_UPDATED = "12 September 2026";

const TOC = [
  { id: "scope", label: "Scope" },
  { id: "no-shipping", label: "No shipping" },
  { id: "saas", label: "SaaS subscription refunds" },
  { id: "hostel-fees", label: "Hostel fee refunds" },
  { id: "how-to-request", label: "How to request a refund" },
  { id: "chargebacks", label: "Chargebacks & disputes" },
  { id: "contact", label: "Contact" },
];

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Cancellation & Refund Policy — Hostylia" },
      {
        name: "description",
        content:
          "Hostylia cancellation and refund policy for SaaS subscriptions and hostel fee payments. Operated by Jeevijay Technologies Private Limited.",
      },
      { property: "og:title", content: "Cancellation & Refund Policy — Hostylia" },
      {
        property: "og:description",
        content: "How SaaS subscriptions and hostel fee refunds are handled on Hostylia.",
      },
      { property: "og:url", content: "/refund-policy" },
    ],
    links: [{ rel: "canonical", href: "/refund-policy" }],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Legal"
        title="Cancellation & Refund Policy"
        desc={`How Hostylia handles cancellations and refunds. Last updated ${LAST_UPDATED}.`}
      />

      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:px-6 lg:grid-cols-[260px_1fr]">
          <LegalTocNav items={TOC} />

          <article className="min-w-0">
            <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5 text-sm text-soft-grey">
              This page is maintained by{" "}
              <strong className="text-foreground">Jeevijay Technologies Private Limited</strong>{" "}
              ("Hostylia", "we", "us"). It is not legal advice — please consult counsel for your
              specific situation. Payment processing is provided by authorised gateways such as
              Razorpay.
            </div>

            <div className="mt-8">
              <LegalSection id="scope" title="1. Scope">
                <p>
                  This Cancellation &amp; Refund Policy covers two kinds of payments on Hostylia:
                </p>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    <strong className="text-foreground">SaaS subscription fees</strong> paid by
                    hostel / PG operators (Customers) to Jeevijay Technologies for use of the
                    Hostylia platform.
                  </li>
                  <li>
                    <strong className="text-foreground">Hostel / PG fee payments</strong> paid by
                    students or parents to a residential operator, collected through Hostylia using
                    the operator's payment gateway configuration.
                  </li>
                </ul>
                <p>
                  For general terms of use, see our{" "}
                  <Link to="/terms" className="text-soft-teal hover:underline">
                    Terms &amp; Conditions
                  </Link>
                  . For how we handle personal data, see our{" "}
                  <Link to="/privacy" className="text-soft-teal hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </LegalSection>

              <LegalSection id="no-shipping" title="2. No physical shipping">
                <p>
                  Hostylia is a <strong className="text-foreground">digital software service</strong>
                  . We do not sell physical goods and we do{" "}
                  <strong className="text-foreground">not ship products</strong>. There is therefore
                  no shipping policy, delivery timeline, or logistics partner. All paid services are
                  delivered digitally (platform access and hostel fee settlement records).
                </p>
              </LegalSection>

              <LegalSection id="saas" title="3. SaaS subscription refunds (operators)">
                <p>
                  Hostylia subscriptions for hostel operators are billed as described on our{" "}
                  <Link to="/pricing" className="text-soft-teal hover:underline">
                    Pricing
                  </Link>{" "}
                  page and in the applicable order form.
                </p>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    Unless an order form or written agreement states otherwise,{" "}
                    <strong className="text-foreground">
                      subscription fees already charged are non-refundable
                    </strong>
                    , including unused portions of a billing period.
                  </li>
                  <li>
                    Operators may <strong className="text-foreground">cancel renewal</strong> so
                    that access ends at the close of the then-current paid term, subject to the
                    Terms and any notice period in the order form.
                  </li>
                  <li>
                    If Hostylia fails to provide the contracted service for a material period due
                    to a fault solely attributable to us, we may, at our discretion, offer a
                    pro-rata credit or refund for the affected period.
                  </li>
                  <li>
                    Duplicate or erroneous charges for Hostylia's own SaaS billing should be
                    reported to{" "}
                    <a href="mailto:team@hostylia.com" className="text-soft-teal hover:underline">
                      team@hostylia.com
                    </a>{" "}
                    within seven (7) days with the payment reference.
                  </li>
                </ul>
              </LegalSection>

              <LegalSection id="hostel-fees" title="4. Hostel / PG fee refunds (students & parents)">
                <p>
                  When a student or parent pays a hostel fee invoice through Hostylia, the{" "}
                  <strong className="text-foreground">residential operator (hostel / PG)</strong> is
                  the merchant of record for that fee. Hostylia provides software to issue invoices,
                  collect payments via the payment gateway, and record settlements.
                </p>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    <strong className="text-foreground">Refund eligibility</strong> for hostel rent,
                    deposits, mess charges, or other operator fees is determined by the hostel's own
                    admission agreement and policies — not by a blanket Hostylia platform refund.
                  </li>
                  <li>
                    Approved hostel-fee refunds are processed through Hostylia's{" "}
                    <strong className="text-foreground">in-app maker-checker workflow</strong>: a
                    staff member (for example Accountant or Hostel Admin) initiates a refund with a
                    mandatory reason; a different authorised approver must confirm before the refund
                    is recorded. Initiator and approver cannot be the same person above configured
                    thresholds.
                  </li>
                  <li>
                    Gateway settlement of an approved refund (return of funds to the original
                    payment method) follows the payment provider's timelines and the operator's
                    gateway credentials. Hostylia does not hold student card PAN/CVV data.
                  </li>
                  <li>
                    Students and parents should first contact their{" "}
                    <strong className="text-foreground">hostel administration</strong> for fee
                    disputes. Hostylia support can help operators locate payment references in the
                    dashboard.
                  </li>
                </ul>
              </LegalSection>

              <LegalSection id="how-to-request" title="5. How to request a refund or cancellation">
                <p>
                  <strong className="text-foreground">Operators (SaaS):</strong> email{" "}
                  <a href="mailto:team@hostylia.com" className="text-soft-teal hover:underline">
                    team@hostylia.com
                  </a>{" "}
                  with your organisation name, billing email, and Razorpay / invoice reference, or
                  use in-app subscription controls where available.
                </p>
                <p>
                  <strong className="text-foreground">Students / parents (hostel fees):</strong>{" "}
                  contact your hostel warden or admin. Once staff approve a refund in Hostylia, the
                  status appears on the relevant invoice / payment history.
                </p>
              </LegalSection>

              <LegalSection id="chargebacks" title="6. Chargebacks & payment disputes">
                <p>
                  If you raise a chargeback with your bank or card issuer, we (and/or the hostel
                  operator) may share transaction records needed to respond. Unfounded chargebacks
                  may result in suspension of portal access pending resolution, consistent with our
                  Terms.
                </p>
              </LegalSection>

              <LegalSection id="contact" title="7. Contact">
                <p>
                  For questions about this Cancellation &amp; Refund Policy, contact us at:
                </p>
                <LegalCompanyCard />
              </LegalSection>
            </div>
          </article>
        </div>
      </section>
      <CTAStrip />
    </div>
  );
}
