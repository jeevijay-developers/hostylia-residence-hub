## Goal

Polish the landing page and add two new legal routes (Terms & Conditions, Privacy Policy) wired into the footer, using the company details you provided.

---

## 1. Landing page enhancements (`src/routes/index.tsx`)

Targeted upgrades — keep the existing section order, sharpen the visuals and add a few high-impact blocks that match the rest of the site (HTML mockups, StatBands, BenefitLists).

- **Hero refresh**
  - Add a small "Trusted by 120+ properties · 65,000 beds" trust pill above the headline.
  - Add a 4-up StatBand directly under the Hero (Beds managed · Cities · On-time collection · Operator CSAT).
- **Trusted For band**: convert the static logo row into animated chips with subtle hover lift and add a one-line value prop ("From a single hostel to a national chain").
- **New "How it works" section** (3 steps with numbered cards): Onboard → Operate → Optimize, each with a benefit list.
- **Inject mockups already used elsewhere** for visual rhythm:
  - `MockOccupancyDashboard` in the Property Hierarchy band.
  - `MockFinanceDashboard` in the Fee Management band (replaces one illustration card to add motion/UI feel).
  - `MockComplaintBoard` in the Complaint Flow band.
  - `MockParentApp` next to Role Dashboards.
- **New "Built for every role" mini-grid** with 5 role chips (Owner, Manager, Warden, Student, Parent) linking to relevant sections.
- **New testimonial strip** above the video testimonials — 3 short `TestimonialCard`s from operators (text-only, complements the video grid).
- **Final CTA polish**: add secondary "Talk to founder" link and a tiny ISO/data-residency reassurance line.

No changes to header/footer layout in this step beyond adding the two new legal links (see §3).

---

## 2. New legal pages

Both pages use the same design language as About / Platform — `PageHero`, dark sections, `bg-section-dark`, gold eyebrow, soft-grey body — so they feel native, not bolted on.

### `src/routes/terms.tsx` → `/terms`
Sections:
1. Acceptance of Terms
2. Definitions ("Hostylia", "Customer", "User", "Services")
3. Account Registration & Eligibility
4. Subscription, Pricing & Payments
5. Acceptable Use
6. Customer Data & Property Information
7. Intellectual Property
8. Confidentiality
9. Service Availability & Support
10. Suspension and Termination
11. Disclaimers & Limitation of Liability
12. Indemnification
13. Governing Law (India, Bengaluru jurisdiction)
14. Changes to these Terms
15. Contact — company block (see §4)

### `src/routes/privacy.tsx` → `/privacy`
Sections:
1. Introduction & Scope
2. Information We Collect (account, property, student/parent, payment, technical/cookies)
3. How We Use Information (operate Hostylia, billing, support, AI features, security)
4. Legal Bases (consent, contract, legitimate interest)
5. Sharing & Subprocessors (payment gateways, SMS/WhatsApp, cloud hosting — generic mention, no specific certifications)
6. Data Retention
7. Security Practices (RBAC, encryption in transit, backups — factual, no certification claims)
8. Your Rights (access, correction, deletion, portability, withdrawal of consent)
9. Children & Student Data (handled on behalf of the customer/institution as data processor)
10. Cookies & Analytics
11. International Data Transfers
12. Changes to this Policy
13. Grievance Officer / Contact — company block (see §4)

Each page includes a "Last updated: June 23, 2026" date and a back-to-home link, plus the standard `CTAStrip` at the bottom to match other pages.

`head()` metadata is route-specific (title, description, og:title, og:description, canonical) per the project rule that every shareable route gets its own metadata.

> **Important disclaimer in the page body:** A short qualifier — "This page is maintained by Jeevijay Technologies Private Limited to describe how Hostylia is operated. It is not legal advice; please consult counsel before relying on it for compliance purposes." — and we will NOT include any certification claims (SOC 2, ISO, HIPAA, GDPR compliance statements) unless you give the wording.

---

## 3. Footer + nav wiring (`src/components/layout/SiteFooter.tsx`)

- Add "Terms" and "Privacy" links in the Legal column of the footer.
- No header nav changes (legal pages live in footer only).

---

## 4. Shared company / contact block (used in both legal pages)

```
Jeevijay Technologies Private Limited
H No 1, Sai Extension Colony, Bengaluru, India
Email: hello@hostylia.com
Phone: +91 86194 83010
```

Rendered as a small `glass-panel` card with mail/phone/address icons.

---

## Technical notes

- All new files follow the existing TanStack Start pattern (`createFileRoute` + `head()` + component).
- Reuse existing primitives: `PageHero`, `CTAStrip`, `SectionHeading`, `FeatureCard`, `BenefitList`, `StatBand`, `TestimonialCard`, `IllustrationCard`, `Mock*` components.
- No new dependencies, no new image generation (reuse existing illustrations).
- No backend / Cloud changes.

---

## Out of scope

- Cookie consent banner (can be added later if you want).
- Localising the legal pages.
- Specific compliance certification claims (SOC 2, GDPR, ISO) — left out unless you provide approved wording.
