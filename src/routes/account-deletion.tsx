import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { LegalCompanyCard, LegalSection, LegalTocNav } from "@/components/site/LegalLayout";

const LAST_UPDATED = "11 September 2026";

const TOC = [
  { id: "how", label: "How to request deletion" },
  { id: "scope", label: "What we delete" },
  { id: "timing", label: "Timing" },
  { id: "operators", label: "Hostel operators" },
  { id: "contact", label: "Contact" },
];

export const Route = createFileRoute("/account-deletion")({
  head: () => ({
    meta: [
      { title: "Delete your Hostylia account — Hostylia" },
      {
        name: "description",
        content:
          "Request deletion of your Hostylia mobile or web account. Operated by Jeevijay Technologies Private Limited.",
      },
      { property: "og:title", content: "Delete your Hostylia account" },
      {
        property: "og:description",
        content: "How students, parents and wardens can request account deletion.",
      },
      { property: "og:url", content: "/account-deletion" },
    ],
    links: [{ rel: "canonical", href: "/account-deletion" }],
  }),
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Legal"
        title="Delete your account"
        desc={`How to request deletion of a Hostylia account. Last updated ${LAST_UPDATED}.`}
      />

      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:px-6 lg:grid-cols-[260px_1fr]">
          <LegalTocNav items={TOC} />

          <article className="min-w-0">
            <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5 text-sm text-soft-grey">
              Google Play and App Store policies require a publicly reachable account-deletion path.
              This page is that path for Hostylia, operated by{" "}
              <strong className="text-foreground">Jeevijay Technologies Private Limited</strong>.
            </div>

            <div className="mt-8">
              <LegalSection id="how" title="1. How to request deletion">
                <p>You can request deletion of your Hostylia login in any of these ways:</p>
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    In the Hostylia Android app: Profile (or Account &amp; Security) → Delete
                    account, then follow the prompts.
                  </li>
                  <li>
                    Email{" "}
                    <a
                      href="mailto:team@hostylia.com?subject=Hostylia%20account%20deletion%20request"
                      className="text-soft-teal hover:underline"
                    >
                      team@hostylia.com
                    </a>{" "}
                    from the same phone or email used to sign in. Include your full name, role
                    (student / parent / warden / staff), and the mobile number on the account.
                  </li>
                </ul>
                <p>
                  We will verify that the request comes from the account holder (or a parent /
                  guardian for a minor) before acting.
                </p>
              </LegalSection>

              <LegalSection id="scope" title="2. What we delete">
                <p>
                  After verification we delete or anonymise authentication credentials and profile
                  data we control as a platform operator. Hostel operators (our customers) remain
                  the data controllers for occupancy, fee, and attendance records they legally must
                  retain. Those records may be retained or anonymised according to the operator's
                  statutory obligations (for example tax and hostel registers in India).
                </p>
                <p>
                  See the{" "}
                  <Link to="/privacy" className="text-soft-teal hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  for subprocessors (including Razorpay for payments and MSG91 for SMS OTPs) and
                  retention.
                </p>
              </LegalSection>

              <LegalSection id="timing" title="3. Timing">
                <p>
                  We aim to complete verified deletion requests within 30 days, unless a longer
                  period is required by law or by an ongoing dispute (for example unpaid invoices
                  that the hostel operator must keep).
                </p>
              </LegalSection>

              <LegalSection id="operators" title="4. Hostel operators">
                <p>
                  If your data was uploaded by a hostel or PG using Hostylia, you may also need to
                  contact that operator. We will support them in fulfilling a valid erasure request.
                </p>
              </LegalSection>

              <LegalSection id="contact" title="5. Contact">
                <p>Grievance officer and company details:</p>
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
