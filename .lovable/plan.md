
# Add CribApp-style Hero Illustrations Across Hostylia

Generate premium 3D illustration-style hero images (matching the CribApp reference screenshots) in Hostylia's brand palette — deep navy/indigo backgrounds with teal `#4FB7A8`, brand blue `#0E6BA8`, and gold `#D9A441` accents — and embed them as the visual anchors for each major feature section across the site.

## Images to generate

All images use the `imagegen` tool at `premium` quality, saved under `src/assets/illustrations/`. Each uses Hostylia's dark navy/indigo background with the teal + blue + gold accent palette, glassmorphism cards, 3D objects, and floating UI mockups — same composition language as the CribApp reference screenshots.

1. `building-hero.jpg` — luminous modern residential tower at dusk, warm window glow, navy/indigo sky, teal accent lighting. Used in Home hero + Stats section.
2. `tenant-agreement.jpg` — 3D floating "AGREEMENT" card with signature, gold verified badge, layered folder of orange documents, on indigo gradient. Used in Tenant Management / Onboarding section.
3. `dues-lock.jpg` — 3D purple-to-teal padlock with floating phone mockup showing a dues card with rent + maintenance line items, on dark navy. Used in Fee Management section.
4. `move-out-notice.jpg` — 3D luxury apartment building with floating notice-details card (countdown gauge, lock-in/notice timestamps), gold exit-door icon, indigo backdrop. Used in Renewals / Stay Lifecycle section.
5. `property-booking.jpg` — 3D phone mockup showing a room photo with "Option" pricing card and "Book Property" CTA, gold price badge, on indigo gradient. Used in Property Listing / Solutions hero.
6. `inventory-status.jpg` — 3D phone mockup showing Vacant / On hold / Occupied / On notice colored room-status pills with "Assign Tenant" tag, on indigo. Used in Property Hierarchy / Room Grid section.
7. `services-panel.jpg` — 3D phone mockup showing icon row (meals, wifi, laundry, housekeeping, devices) over a room photo with "YourBrand — One" caption, on indigo. Used in Operations / Services section.
8. `attendance-outpass.jpg` — light lavender card with attendance entry (avatar, check-in/check-out dates, "Pending" pill), gold gear icon. Used in Attendance & Outpass section.
9. `collection-chart.jpg` — light card with Collection bar chart (green Received / coral Pending), totals in INR, Excel export icon, "Download report" pill. Used in Finance Analytics section.
10. `ai-insights.jpg` — 3D dashboard with AI sparkle icons, occupancy gauge, predictive trend lines, in teal + indigo glow. Used in AI Suite section.

## Where each image lands

- `src/routes/index.tsx`
  - Hero right-side panel: `building-hero.jpg` as a subtle backdrop behind the `HeroDashboard` mockup
  - Property Hierarchy section: add `inventory-status.jpg` alongside the existing color-coded room grid
  - Complaint / Fee Management band: replace placeholder mockup with `dues-lock.jpg` and `collection-chart.jpg` in a two-column layout
  - AI Suite preview: `ai-insights.jpg` as the section's visual anchor
- `src/routes/solutions.tsx` — add `property-booking.jpg` as the page hero illustration
- `src/routes/features.tsx` — interleave `tenant-agreement.jpg`, `services-panel.jpg`, `attendance-outpass.jpg` into the feature group rows
- `src/routes/platform.tsx` — `move-out-notice.jpg` in the lifecycle section
- `src/routes/ai-suite.tsx` — `ai-insights.jpg` as page hero
- `src/routes/about.tsx` — `building-hero.jpg` as a soft background accent in the hero band

## Reusable component

Create `src/components/site/IllustrationCard.tsx` — a rounded glass-edged frame (matching the CribApp rounded card with gradient border + soft glow) used to present each illustration with a section eyebrow + heading + body + optional CTA. All section embeds use this component so the visual language stays consistent.

## Technical notes

- All `imagegen` calls use `model: "premium"`, `width: 1280`, `height: 1280` (1:1) or `1280x960` (4:3) depending on layout slot, jpg output.
- Prompts explicitly specify Hostylia palette: `deep navy #070B18`, `indigo #111B3D`, `teal #4FB7A8`, `brand blue #0E6BA8`, `gold #D9A441 accents`, `no purple, no Crib branding, no text labels in the illustration except UI mockup labels`.
- No image contains the word "Crib" or "cribapp.com" — these are originals for Hostylia.
- Each `<img>` includes descriptive `alt` text and `loading="lazy"` except the home-hero illustration which is eager.
- Images are imported via the asset-pointer JSON pattern already used in the project (`@/assets/illustrations/<name>.jpg.asset.json`).
- All section grids remain 1-column on mobile, 2-column from `md:` up — illustrations scale to `w-full h-auto` and never break the existing responsive grid.
