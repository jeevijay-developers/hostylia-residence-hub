# Hostylia Marketing Site

Premium dark SaaS site for Hostylia (Smart Residential Management), inspired by CribApp's structure but original. All 10 pages, mega menus, dashboard mockups, and brand-aligned design.

## Brand & Design System

- Add brand color tokens to `src/styles.css` using oklch equivalents of the provided hex values (navy `#070B18`, indigo `#111B3D`, brand blue `#0E6BA8`, trust green `#2F8F6B`, soft teal `#4FB7A8`, gold `#D9A441`, card `#111827`, light bg `#F7F8FB`, border `#263247`, soft grey `#B8C0CC`).
- Typography: Plus Jakarta Sans via `<link>` tag in `__root.tsx` head.
- Default theme: dark premium (navy/indigo gradients). Light sections use `#F7F8FB`.
- Gold used sparingly: active nav underline, small accents, CTA highlight, selected states.
- No emojis anywhere. Icons exclusively from `lucide-react`.

## Logo

- Use the horizontal Hostylia logo (second image with logo + text side-by-side) everywhere — navbar, footer, founder card. Save once as `src/assets/hostylia-logo.png` via lovable-assets and reference through a shared `<Logo />` component.

## Routing (TanStack Start file-based)

Create routes under `src/routes/`:
- `index.tsx` (Home)
- `solutions.tsx`, `features.tsx`, `platform.tsx`, `ai-suite.tsx`, `pricing.tsx`, `about.tsx`, `founder.tsx`, `contact.tsx`, `book-demo.tsx`
- Each route has unique `head()` meta (title, description, og:title, og:description).
- Scroll-to-top: rely on router's `scrollRestoration: true` (already set) plus add `scrollToTopSelectors` — and add a `useEffect` scroll-to-top hook in `__root.tsx` based on pathname to guarantee every navigation opens at the top.

## Shared Layout

`src/components/layout/`:
- `SiteHeader.tsx` — sticky dark header with logo, nav links, "Book Demo" (gold-accent) + "Sign In" buttons. Hover on Solutions / Features opens glassmorphism mega menus.
- `MegaMenuSolutions.tsx` — 3 columns (Residential, Campus, Institutional) with Lucide icons per item.
- `MegaMenuFeatures.tsx` — 5 columns (Finance, Student, Operations, Security, Analytics) with Lucide icons.
- `MobileNav.tsx` — Sheet-based drawer with collapsible sections for mega menus, fully responsive.
- `SiteFooter.tsx` — brand block (logo + tagline + "Powered by Jeevijay Technologies Private Limited"), link columns, legal.
- Wrap routes via a layout component used inside each page (or via `__root.tsx` shell with header/footer + `<Outlet />`).

## Home Page Sections

1. **Hero** — dark navy/indigo gradient with subtle building silhouette SVG, headline, subheadline, "Book a Demo" + "Explore Platform" CTAs. Right side: a hand-built dashboard mockup component (`HeroDashboard.tsx`) showing occupancy %, fee collection, complaints, attendance, block/floor/room grid with status colors, parent notification toast.
2. **Trusted Residential Operations Platform** — 4 cards.
3. **Property Hierarchy Visual** — Property → Block → Floor → Room → Bed flow with color-coded room grid (green vacant, blue occupied, amber maintenance, red alert).
4. **Complete Feature System** — 8 cards.
5. **Security System** — heading + 6 cards.
6. **Complaint Management Flow** — horizontal timeline with Lucide icons + status chips.
7. **Fee Management** — feature list + payments dashboard mockup.
8. **Role-Based Dashboards** — 6 cards.
9. **Hostylia AI Suite** — 6 cards.
10. **Founder Section** — dark premium card with Vikas Patel, CEO + Jeevijay Technologies attribution.
11. **Pricing Preview** — 3 plans (Starter, Professional, Enterprise), per student per month, "Book Demo for Pricing" CTA.
12. **Final CTA** — gradient band with two CTAs.

## Other Pages

Each page reuses the layout, opens at top, and contains rich content:
- **Solutions** — expanded version of mega-menu grid with descriptions per residential category.
- **Features** — full feature matrix grouped by Finance / Student / Operations / Security / Analytics.
- **Platform** — architecture overview, role-based portals, integrations.
- **AI Suite** — detailed AI capability cards.
- **Pricing** — three plan cards with feature lists + FAQ + CTA.
- **About** — company story, mission, values, Jeevijay Technologies block.
- **Founder** — dedicated Vikas Patel profile page.
- **Contact** — contact info, form (frontend-only, shows toast on submit), office details.
- **Book Demo** — demo request form (frontend-only) + what to expect section.

## Reusable Components

`src/components/site/`:
- `SectionHeading.tsx`, `FeatureCard.tsx`, `StatusChip.tsx`, `RoomGrid.tsx`, `DashboardMockup.tsx`, `PricingCard.tsx`, `TimelineStep.tsx`, `Logo.tsx`.

## Motion

Use existing Tailwind animation utilities (`animate-fade-in`, `hover-scale`) plus subtle CSS transitions for mega menu open/close, card lift on hover.

## Mobile Responsiveness

- All grids collapse to single/two columns under `md:`.
- Mega menus replaced by Sheet drawer with accordion sections.
- Hero stacks vertically; dashboard mockup scales down.
- Follow the responsive header pattern (grid + min-w-0 + shrink-0) for the navbar.

## Technical Notes

- No backend; all forms are frontend-only with `sonner` toasts.
- No Lovable Cloud needed for this scope.
- Replace placeholder `src/routes/index.tsx`.
- Add Plus Jakarta Sans via `<link>` in `__root.tsx` head (not `@import` in CSS).
- Update default meta in `__root.tsx` to Hostylia branding.
