import { createFileRoute } from "@tanstack/react-router";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { LegalCompanyCard, LegalSection, LegalTocNav } from "@/components/site/LegalLayout";

const LAST_UPDATED = "23 June 2026";

const TOC = [
  { id: "acceptance", label: "Acceptance of Terms" },
  { id: "definitions", label: "Definitions" },
  { id: "account", label: "Account & Eligibility" },
  { id: "subscriptions", label: "Subscription & Payments" },
  { id: "acceptable-use", label: "Acceptable Use" },
  { id: "customer-data", label: "Customer Data" },
  { id: "ip", label: "Intellectual Property" },
  { id: "confidentiality", label: "Confidentiality" },
  { id: "availability", label: "Availability & Support" },
  { id: "termination", label: "Suspension & Termination" },
  { id: "disclaimers", label: "Disclaimers & Liability" },
  { id: "indemnity", label: "Indemnification" },
  { id: "governing-law", label: "Governing Law" },
  { id: "changes", label: "Changes to these Terms" },
  { id: "contact", label: "Contact" },
];

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Hostylia" },
      {
        name: "description",
        content:
          "Terms & Conditions governing your use of Hostylia, the smart residential management platform operated by Jeevijay Technologies Private Limited.",
      },
      { property: "og:title", content: "Terms & Conditions — Hostylia" },
      { property: "og:description", content: "The agreement that governs your use of Hostylia." },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Legal"
        title="Terms & Conditions"
        desc={`These Terms govern your access to and use of Hostylia. Last updated ${LAST_UPDATED}.`}
      />

      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:px-6 lg:grid-cols-[260px_1fr]">
          <LegalTocNav items={TOC} />

          <article className="min-w-0">
            <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5 text-sm text-white/90">
              This page is maintained by{" "}
              <strong className="text-white">Jeevijay Technologies Private Limited</strong> to
              describe the terms on which Hostylia is provided. It is not legal advice — please
              consult counsel before relying on it for any specific compliance purpose.
            </div>

            <div className="mt-8">
              <LegalSection id="acceptance" title="1. Acceptance of Terms">
                <p>
                  By accessing or using the Hostylia website, mobile applications or services
                  (collectively, the "Services"), you agree to be bound by these Terms & Conditions
                  ("Terms"). If you are using the Services on behalf of an organisation, you
                  represent that you are authorised to bind that organisation to these Terms.
                </p>
              </LegalSection>

              <LegalSection id="definitions" title="2. Definitions">
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    <strong className="text-white">"Hostylia"</strong>,{" "}
                    <strong className="text-white">"we"</strong>,{" "}
                    <strong className="text-white">"us"</strong> or{" "}
                    <strong className="text-white">"our"</strong> refers to Jeevijay Technologies
                    Private Limited.
                  </li>
                  <li>
                    <strong className="text-white">"Customer"</strong> means the organisation that
                    has subscribed to the Services (for example, a hostel, school or operator).
                  </li>
                  <li>
                    <strong className="text-white">"User"</strong> means any individual authorised
                    by the Customer to access the Services — including owners, managers, wardens,
                    students and parents.
                  </li>
                  <li>
                    <strong className="text-white">"Customer Data"</strong> means all data submitted
                    to the Services by the Customer or its Users.
                  </li>
                </ul>
              </LegalSection>

              <LegalSection id="account" title="3. Account Registration & Eligibility">
                <p>
                  You must provide accurate and complete information when registering and keep that
                  information current. You are responsible for safeguarding your account credentials
                  and for all activity that occurs under your account. You must be at least 18 years
                  old, or accessing the Services under the supervision of an adult guardian or
                  institution.
                </p>
              </LegalSection>

              <LegalSection id="subscriptions" title="4. Subscription, Pricing & Payments">
                <p>
                  Hostylia is offered on a subscription basis, billed per student per month or as
                  otherwise stated in your order form. Fees are exclusive of applicable taxes.
                  Unless stated otherwise, fees are non-refundable. We may revise pricing on renewal
                  with prior written notice.
                </p>
                <p>
                  All transactions are processed through authorised payment gateways. You authorise
                  us to charge the payment method you provide for all amounts due.
                </p>
              </LegalSection>

              <LegalSection id="acceptable-use" title="5. Acceptable Use">
                <p>You agree not to use the Services to:</p>
                <ul className="list-inside list-disc space-y-2">
                  <li>Violate any applicable law or third-party right.</li>
                  <li>Upload viruses, malware or any other malicious code.</li>
                  <li>
                    Attempt to gain unauthorised access to the Services, other accounts, or our
                    infrastructure.
                  </li>
                  <li>
                    Reverse engineer, decompile or copy the Services except as permitted by law.
                  </li>
                  <li>
                    Use the Services to harass, defame or harm any individual, including students or
                    parents.
                  </li>
                </ul>
              </LegalSection>

              <LegalSection id="customer-data" title="6. Customer Data & Property Information">
                <p>
                  As between you and Hostylia, the Customer owns all Customer Data. You grant
                  Hostylia a limited, non-exclusive licence to host, process and display Customer
                  Data solely to provide and improve the Services in accordance with our{" "}
                  <a href="/privacy" className="text-soft-teal hover:underline">
                    Privacy Policy
                  </a>
                  . You are responsible for the accuracy, legality and quality of Customer Data and
                  for obtaining all consents required to upload it (including consents from
                  students, parents and staff).
                </p>
              </LegalSection>

              <LegalSection id="ip" title="7. Intellectual Property">
                <p>
                  Hostylia, including all software, designs, trademarks and content (other than
                  Customer Data), is the exclusive property of Jeevijay Technologies Private Limited
                  or its licensors. No rights are granted to you except those expressly stated in
                  these Terms. Feedback you provide may be used by us without restriction.
                </p>
              </LegalSection>

              <LegalSection id="confidentiality" title="8. Confidentiality">
                <p>
                  Each party agrees to protect the other's confidential information using at least
                  the same degree of care it uses to protect its own confidential information, and
                  not to disclose it except to personnel and contractors who need it and are bound
                  by similar obligations.
                </p>
              </LegalSection>

              <LegalSection id="availability" title="9. Service Availability & Support">
                <p>
                  We strive to keep the Services available with high uptime and to resolve issues
                  promptly. Support is provided via email, in-app channels and during standard
                  business hours in India. Specific availability targets and response times, if any,
                  are set out in your order form.
                </p>
              </LegalSection>

              <LegalSection id="termination" title="10. Suspension & Termination">
                <p>
                  We may suspend or terminate your access to the Services if you breach these Terms,
                  fail to pay fees when due, or use the Services in a way that risks harm to others.
                  You may terminate your subscription at the end of the then-current term in
                  accordance with your order form. On termination, your right to use the Services
                  ends; we will make Customer Data available for export for a reasonable period and
                  then delete it in accordance with our retention policies.
                </p>
              </LegalSection>

              <LegalSection id="disclaimers" title="11. Disclaimers & Limitation of Liability">
                <p>
                  The Services are provided on an "as is" and "as available" basis. To the maximum
                  extent permitted by law, Hostylia disclaims all warranties, whether express or
                  implied, including merchantability, fitness for a particular purpose and
                  non-infringement.
                </p>
                <p>
                  To the maximum extent permitted by law, neither party shall be liable for any
                  indirect, incidental, special, consequential or punitive damages. Each party's
                  total aggregate liability arising out of or relating to these Terms shall not
                  exceed the fees paid by the Customer to Hostylia for the Services in the twelve
                  (12) months preceding the event giving rise to the claim.
                </p>
              </LegalSection>

              <LegalSection id="indemnity" title="12. Indemnification">
                <p>
                  You agree to indemnify and hold Hostylia harmless from claims arising out of your
                  Customer Data, your violation of these Terms, or your use of the Services in
                  violation of applicable law.
                </p>
              </LegalSection>

              <LegalSection id="governing-law" title="13. Governing Law & Jurisdiction">
                <p>
                  These Terms are governed by the laws of India. The courts at Bengaluru, Karnataka,
                  shall have exclusive jurisdiction over any dispute arising out of or in connection
                  with these Terms or the Services.
                </p>
              </LegalSection>

              <LegalSection id="changes" title="14. Changes to these Terms">
                <p>
                  We may update these Terms from time to time. If we make material changes, we will
                  notify you through the Services or by email. Your continued use of the Services
                  after the effective date of the updated Terms constitutes acceptance of the
                  changes.
                </p>
              </LegalSection>

              <LegalSection id="contact" title="15. Contact">
                <p>If you have questions about these Terms, please contact us at:</p>
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
