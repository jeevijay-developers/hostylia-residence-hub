# Hostylia — Design.md

**Product:** Hostylia — Smart Residential Management (Hostel & PG platform)
**Company:** Jeevijay Technologies Private Limited
**Design version:** 2.0 (Brand-aligned rewrite from the Hostylia logo)
**Based on:** PRD v2.1, Architecture v2.0
**Last updated:** July 15, 2026
**Stack:** React + TypeScript + Tailwind CSS + shadcn/ui (Radix primitives)
**Scope:** One design system for a responsive-web-only SaaS spanning 6 roles, two device postures (mobile-first: Warden/Student/Parent; desktop-dense: Hostel Admin/Accountant/Super Admin), light + dark mode, and two shipped languages (English + Hindi).

> **Enforcement:** The colour, spacing, and component rules here are enforced by `Rules.md` Sec. 9.10 (Styling and Tailwind). Components consume **semantic tokens** only — never raw hex, never one-off bracket values like `bg-[#00696F]`.

---

## 1. Design Philosophy

Hostylia is a **utility-first operational tool**, not a marketing site. The system optimises for speed of task completion under real conditions: a warden marking attendance in a hallway, a parent glancing at a fee reminder between meetings, an accountant scanning an aging report on a monitor.

The brand comes from the logo: **ascending building columns** in a teal→cyan gradient rising out of a deep-navy home. That single idea — *rooms and floors stacking into a building, occupancy read as a vertical structure* — is the visual thesis of the product, because the app itself is fundamentally a set of physical-structure state machines (bed → room → floor → block → property).

Four principles govern every decision:

1. **Clarity over decoration.** Every screen answers "what do I need to do or know right now?" in one glance. No decorative illustration competes with data.
2. **One system, two postures.** The same tokens and components serve dense desktop surfaces and touch-first mobile surfaces — density scales by breakpoint, not by a second design language.
3. **Status is always legible.** Bed occupancy, invoice status, complaint SLA, gate-pass state — status must read without reading text, through a disciplined, *reserved* status palette that never collides with the brand colour.
4. **Trust through restraint.** Parents and students trust Hostylia with payments and safety. The UI stays calm, predictable, and free of dark patterns.

---

## 2. Brand Foundation

Derived directly from the Hostylia logo.

| Brand element | Value | Meaning |
|---|---|---|
| Primary brand gradient | `#00B4B4` → `#00D8CC` (teal → cyan) | The rising building columns. Used for the brand mark, hero moments, and the signature occupancy visual — **not** for primary buttons (fails AA as a fill). |
| Deep teal (action) | `#00696F` | The AA-safe deepening of the brand teal. This is the primary interactive colour. |
| Steel blue (secondary tower) | `#00609C` | The one blue tower in the mark. Becomes the informational accent. |
| Navy ink | `#0A141E` | The home/base of the logo. Primary text, dark-mode ground, sidebar. |

**The teal/green problem, solved.** The brand is teal; "paid / occupied / resolved" is conventionally green. Teal and green sit adjacent on the hue wheel and would be ambiguous in the occupancy grid and finance badges — the two densest status surfaces in the app. Resolution: **success is a distinctly yellower forest green (`#15803D`)**, deliberately pushed away from the brand teal, and the brand teal is **never** used as a status colour. Status tokens (Sec. 4.2) and brand tokens (Sec. 4.1) are disjoint sets.

---

## 3. UI Principles

- **Mobile-first for operational roles.** Warden, Student, Parent designed at 375px first, enhanced upward. Admin/Accountant/Super Admin designed desktop-first (dense tables, multi-column dashboards) with a genuinely usable mobile fallback down to 360px (PRD Sec. 9).
- **Touch targets ≥ 44×44px** on any surface reachable from a mobile viewport.
- **Progressive disclosure.** Complex forms (property setup, fee-plan config) are stepped, not single long forms.
- **Consistent iconography for consistent meaning.** An icon always means the same action app-wide (the QR icon is only ever gate-pass).
- **No silent failure.** Every async action defines loading, success, and error before it ships.
- **Bilingual by default.** All copy externalised to i18n files from day one (English + Hindi); no hardcoded strings in components.
- **shadcn/ui first.** Compose Radix-based shadcn primitives (Button, Dialog, Table, Form, Toast, Tabs, Sheet, DropdownMenu, Badge) rather than hand-building equivalents. Extend through the component's own variants, not arbitrary utility overrides.

---

## 4. Colour System

Colours are implemented as **CSS variables in HSL**, wired into the shadcn theme and Tailwind's semantic scale. Components reference semantic classes (`bg-primary`, `text-success`, `bg-muted`) — never raw hex. Every value below is WCAG-AA verified for its stated use.

### 4.1 Brand & Core (light mode)

| Semantic token | Hex | Use | Contrast |
|---|---|---|---|
| `--primary` | `#00696F` | Primary buttons, active nav, links, focus | 6.46:1 on white ✓ |
| `--primary-hover` | `#00565B` | Primary hover/active | 8.46:1 ✓ |
| `--primary-foreground` | `#FFFFFF` | Text on primary fill | — |
| `--brand-teal` | `#00B4B4` | Brand mark, gradient start (decorative only) | — |
| `--brand-cyan` | `#00D8CC` | Gradient end, focus ring accent, dark-mode highlight | — |
| `--accent` (info/steel) | `#00609C` | Informational accents, in-progress, links-on-dark | 6.66:1 ✓ |
| `--background` | `#F6F8F8` | App background (a whisper of teal in the grey) | — |
| `--card` | `#FFFFFF` | Cards, surfaces | — |
| `--foreground` | `#0A141E` | Primary text (navy ink) | 18.56:1 ✓ |
| `--muted-foreground` | `#51606B` | Secondary text | 6.49:1 ✓ |
| `--border` | `#DCE4E7` | Borders, dividers | — |
| `--input` | `#CBD6DA` | Input borders | — |

### 4.2 Status / Semantic (disjoint from brand)

| Semantic token | Hex (text/icon) | Tint bg | Use | Contrast |
|---|---|---|---|---|
| `--success` | `#15803D` | `#E7F6EC` | Paid, resolved, occupied-current, approved | 5.02:1 ✓ |
| `--warning` | `#B45309` | `#FBF0E2` | Due-soon, pending approval, near-SLA | 5.02:1 ✓ |
| `--destructive` | `#DC2626` | `#FCE9E9` | Overdue, SLA breached, rejected, emergency | 4.83:1 ✓ |
| `--info` | `#00609C` | `#E2EEF6` | Informational notices, in-progress | 6.66:1 ✓ |

### 4.3 Bed-status tokens (occupancy grid)

The occupancy grid is the app's signature surface, so bed status has its own explicit, colour-blind-safe mapping — always paired with an icon/label, never colour alone.

| Bed status | Token | Hex | Glyph |
|---|---|---|---|
| Vacant | `--bed-vacant` | `#8A98A0` (neutral) | ○ outline |
| Occupied | `--bed-occupied` | `#15803D` (success) | ● filled |
| Maintenance | `--bed-maintenance` | `#B45309` (warning) | ▨ wrench |
| Blocked | `--bed-blocked` | `#DC2626` (destructive) | ⊘ slash |

**Rule:** semantic and bed tokens are never used decoratively. `destructive` always means "needs attention now," never "a red accent." Brand teal is never a status.

### 4.4 Dark mode

Dark mode is user-toggleable (not property-branded). The navy ink becomes the ground; the brand cyan finally gets to shine as the accent (10.33:1 on navy).

| Token | Hex | Contrast on `#0A141E` |
|---|---|---|
| `--background` (dark) | `#0A141E` | — |
| `--card` (dark) | `#111E2A` | — |
| `--foreground` (dark) | `#E5EDF0` | 15.64:1 ✓ |
| `--muted-foreground` (dark) | `#94A7B2` | 7.45:1 ✓ |
| `--primary` (dark) | `#2AB3AB` | 7.19:1 ✓ (fills use cyan-family) |
| `--brand-cyan` accent (dark) | `#00D8CC` | 10.33:1 ✓ |
| `--success` (dark) | `#34D399` | 9.65:1 ✓ |
| `--warning` (dark) | `#FBBF24` | 11.12:1 ✓ |
| `--destructive` (dark) | `#F87171` | 6.71:1 ✓ |

Status colours are slightly desaturated/lightened in dark mode to keep AA without vibrating against the navy ground. Default is light (operational daylight use); dark is offered for Student/Parent evening use.

---

## 5. Signature Element — the Occupancy Column

Every design should have one memorable thing. Hostylia's is the **occupancy column**: a vertical, stacked representation of a property's beds that visually echoes the logo's rising towers.

- On the Admin dashboard and property page, occupancy renders as **stacked vertical bars per block/floor** — filled segments (occupied, forest green) rising from a navy base, vacant segments as outline, in the same ascending-tower silhouette as the mark.
- The header brand mark and the empty-states reuse this tower motif (e.g., an empty property shows a faint outline tower "waiting to fill").
- The brand teal→cyan gradient appears **here and in the logo only** — reserving it for the signature keeps it meaningful and keeps status colours unambiguous everywhere else.

This is where the boldness is spent (spend boldness in one place). Everything else stays quiet.

---

## 6. Typography

**Display / brand:** `Sora` — a geometric face whose rising, architectural letterforms echo the building-column motif. Used for page titles, KPI numbers, and wordmark context, with restraint.

**Body / UI:** `Inter` — the workhorse for all interface text, dense tables, and forms.

**Hindi:** `Noto Sans Devanagari` in the fallback stack so mixed English/Hindi content (a Hindi notice with an English student name) renders without font-swap jank.

**Mono:** `JetBrains Mono` for IDs, receipt numbers, and QR payloads.

```css
--font-display: "Sora", "Inter", "Noto Sans Devanagari", system-ui, sans-serif;
--font-sans:    "Inter", "Noto Sans Devanagari", -apple-system, system-ui, sans-serif;
--font-mono:    "JetBrains Mono", ui-monospace, monospace;
```

Pairing rationale: Sora and Inter share a humanist-geometric backbone so they sit together without clashing, but Sora's wider, architectural caps give titles a distinct voice — the type itself nods to the towers rather than being a neutral delivery vehicle.

### 6.1 Type scale

| Token | Size / Line-height | Font | Usage |
|---|---|---|---|
| `--text-xs` | 12 / 16 | Inter | Badge labels, timestamps, captions |
| `--text-sm` | 14 / 20 | Inter | Secondary text, helper text, dense cells |
| `--text-base` | 16 / 24 | Inter | Body, form inputs (16px avoids iOS zoom-on-focus) |
| `--text-lg` | 18 / 28 | Inter | Card titles, section labels |
| `--text-xl` | 20 / 28 | Sora | Section headers |
| `--text-2xl` | 24 / 32 | Sora | Page titles (desktop) |
| `--text-3xl` | 30 / 36 | Sora | KPI numbers, mobile page titles |
| `--text-4xl` | 36 / 40 | Sora | Public/admission hero only |

### 6.2 Weights

| Token | Weight | Usage |
|---|---|---|
| `--font-normal` | 400 | Body |
| `--font-medium` | 500 | Labels, table headers, nav |
| `--font-semibold` | 600 | Card titles, KPI labels, buttons |
| `--font-bold` | 700 | Page titles, KPI numbers, critical alerts |

---

## 7. Spacing

4px base unit (Tailwind default) plus two aliases.

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Icon-to-label gaps |
| `space-2` | 8px | Compact stacking (dense tables) |
| `space-3` | 12px | Form field internal padding |
| `space-4` | 16px | Default component padding, mobile page margin |
| `space-6` | 24px | Card padding, section spacing |
| `space-8` | 32px | Desktop page margin |
| `space-12` | 48px | Major layout gutters |
| `space-touch` | 44px | Minimum touch target (alias) |

---

## 8. Radius, Elevation, Motion

**Radius** (shadcn `--radius` base = 8px): `sm` 6px (badges, inputs), `md` 8px (buttons, cards), `lg` 12px (modals, sheets), `xl` 16px (mobile bottom-sheet top corners), `full` (pills, avatars).

**Elevation** — restrained, cool-tinted shadows (navy-based, not black) so cards lift without heaviness: `xs` (table row hover), `sm` (cards), `md` (dropdowns, popovers), `lg` (modals, sheets), `focus` (2px `--brand-cyan` ring at 45% + 2px offset).

**Motion** — purposeful only. 150ms ease-out for hovers/toggles, 200ms for popovers, 250ms slide for mobile bottom-sheets. The occupancy column animates its fill once on load (segments rise). **`prefers-reduced-motion` is always respected** — fills appear instantly, sheets fade instead of slide.

---

## 9. Grid & Breakpoints

- **Desktop (Admin/Accountant/Super Admin):** 12-column, max content `1440px`, 24px gutters, sidebar 260px (collapsible to 72px icon-rail).
- **Mobile (Warden/Student/Parent):** single-column fluid, 16px side margins, bottom nav reserves 64px + safe-area-inset.
- **Tablet (768–1023px):** Admin sidebar → icon-rail; mobile-posture roles gain a 2-column card grid, keep bottom nav.

| Breakpoint | Width | Primary consumers |
|---|---|---|
| `xs` | 360 (floor) | Student/Parent/Warden minimum |
| `sm` | 640 | Large phones |
| `md` | 768 | Tablets |
| `lg` | 1024 | Small laptops — Admin sidebar full |
| `xl` | 1280 | Desktop |
| `2xl` | 1440 | Max content cap |

---

## 10. Role Layouts

| Role | Posture | Nav | Landing |
|---|---|---|---|
| Super Admin | Desktop-dense | Left sidebar | Tenant/MRR console |
| Hostel Admin | Desktop-dense, mobile-usable | Left sidebar + property switcher | Property overview + occupancy column |
| Accountant | Desktop-dense | Left sidebar (finance-scoped) | Collections / aging |
| Warden | Mobile-first | Bottom nav | Daily brief |
| Student | Mobile-first | Bottom nav | Home (dues, notices) |
| Parent | Mobile-first | Bottom nav | Child snapshot |

Bottom nav is required for Student, Parent, Warden. Left sidebar for Admin, Accountant, Super Admin.

---

## 11. Core Components (shadcn/ui mapping)

Build on shadcn primitives; the mapping below is the canonical set. Domain components compose these.

| Need | shadcn primitive | Hostylia domain component |
|---|---|---|
| Actions | `Button` (variants: default/secondary/destructive/ghost/outline) | — |
| Data | `Table` + TanStack Table | `InvoiceTable`, `StudentTable`, `TenantTable` |
| Status | `Badge` | `StatusBadge` (maps status → Sec. 4.2 token) |
| Forms | `Form` + React Hook Form + Zod resolver | `AdmissionForm`, `FeePlanForm` |
| Overlays | `Dialog` (desktop) / `Sheet` (mobile bottom-sheet) | `ConfirmDialog`, `MoveOutWizard` |
| Menus | `DropdownMenu` | row actions |
| Notices | `Toast` (Sonner) + inline `Alert` | `ImpersonationBanner`, SLA banner |
| Tabs | `Tabs` | detail-page sections |
| Empty | custom on `Card` | `EmptyState` (tower motif) |

### 11.1 Buttons

Variants: `default` (deep-teal primary), `secondary` (steel-blue-tinted), `destructive`, `outline`, `ghost`. Sizes: `sm` 32px, `default` 40px, `lg` 44px (mobile primary). Loading state shows a spinner and disables — never a button that appears to do nothing.

### 11.2 Tables

Server pagination, filtering, sorting, and explicit loading/empty/error states are mandatory. Never load thousands of rows into the browser. Mobile fallback: card layout or priority-columns + details sheet, never a squashed table.

### 11.3 Badges

Pill shape, `text-xs` `font-medium`, coloured text on **tinted** background (not solid fill) so tables stay scannable. Status → token mapping is fixed (Sec. 4.2), never re-assigned per screen.

### 11.4 Financial UI

Currency shown in full with clear status; confirmation before sensitive actions; no optimistic confirmation on money; pending/failed states explicit; maker-checker/approval context surfaced where relevant.

### 11.5 Modals & sheets

Desktop: centered `Dialog`, max-width 560px (standard) / 720px (complex forms), backdrop `rgba(10,20,30,0.45)`. Mobile: `Sheet` bottom-sheet (rounded top, slide-up, drag-to-dismiss). Destructive confirmations state the consequence in plain language; the safe action is default-focused. Focus is trapped and restored.

---

## 12. Content & Voice

Words are design material. Rules:

- Name things by what people control: "Fee reminders," not "notification webhook config."
- Active voice on controls; the action keeps its name through the flow — a button that says **Publish** produces a toast that says **Published**.
- Errors explain what happened and how to fix it, in the interface's voice; they don't apologise or stay vague.
- Empty states are invitations to act ("Add your first block to start tracking beds"), reusing the tower motif.
- Sentence case everywhere. Plain verbs. No filler.

---

## 13. Accessibility (WCAG 2.1 AA, app-wide floor)

- Body text ≥ 4.5:1, large text/icons ≥ 3:1 — every token in Sec. 4 is pre-verified for its stated surface, light and dark.
- Keyboard-operable everything; visible focus ring (`--brand-cyan`) never suppressed.
- Inputs have programmatically associated labels (not placeholder-only).
- Status by colour is always paired with icon or text (critical for the bed grid and badges).
- Modals/sheets trap and restore focus; `Escape` closes non-destructive overlays.
- Realtime updates (gate events, complaint status) use `aria-live="polite"`.
- Touch targets ≥ 44×44px (motor accessibility, not just ergonomics).
- Hindi content carries `lang="hi"` on its container so screen readers switch pronunciation.

---

## 14. Theme Implementation (shadcn CSS variables)

Tokens live as HSL CSS variables in `src/index.css` under `:root` and `.dark`, consumed through `tailwind.config.ts`. Components use semantic classes only.

```css
/* src/index.css (excerpt) */
:root {
  --background: 180 12% 97%;      /* #F6F8F8 */
  --foreground: 209 48% 8%;       /* #0A141E navy ink */
  --card: 0 0% 100%;
  --primary: 184 100% 22%;        /* #00696F deep teal */
  --primary-foreground: 0 0% 100%;
  --secondary: 204 100% 31%;      /* #00609C steel */
  --muted-foreground: 202 15% 37%;/* #51606B */
  --border: 199 18% 89%;
  --success: 142 70% 29%;         /* #15803D forest */
  --warning: 32 91% 37%;          /* #B45309 */
  --destructive: 0 74% 50%;       /* #DC2626 */
  --accent: 204 100% 31%;         /* steel/info */
  --ring: 176 100% 42%;           /* #00D8CC brand cyan */
  --radius: 0.5rem;
  --brand-teal: 180 100% 35%;     /* #00B4B4 */
  --brand-cyan: 176 100% 42%;     /* #00D8CC */
}
.dark {
  --background: 209 48% 8%;        /* #0A141E */
  --foreground: 199 25% 92%;       /* #E5EDF0 */
  --card: 205 42% 12%;             /* #111E2A */
  --primary: 176 62% 43%;          /* #2AB3AB */
  --muted-foreground: 199 18% 64%; /* #94A7B2 */
  --success: 158 64% 52%;          /* #34D399 */
  --warning: 43 96% 56%;           /* #FBBF24 */
  --destructive: 0 91% 71%;        /* #F87171 */
  --ring: 176 100% 42%;
}
```

```ts
// tailwind.config.ts (excerpt) — semantic tokens, no raw hex in components
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))" },
        muted: { foreground: "hsl(var(--muted-foreground))" },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        destructive: "hsl(var(--destructive))",
        accent: "hsl(var(--accent))",
        ring: "hsl(var(--ring))",
        "brand-teal": "hsl(var(--brand-teal))",
        "brand-cyan": "hsl(var(--brand-cyan))",
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      spacing: { touch: "44px" },
    },
  },
} satisfies Config;
```

**No raw hex, arbitrary pixel values, or one-off bracket utilities (`bg-[#123456]`) in component code.** The enforced rule and rationale live in `Rules.md` Sec. 9.10.

---

## 15. Component Naming Convention

- **PascalCase** files/exports: `InvoiceTable.tsx`, `GatePassQr.tsx`.
- Tier is implicit via folder (`components/ui/button.tsx` = shadcn primitive; `features/finance/InvoiceTable.tsx` = domain) — see `Architecture.md`.
- Domain components are `<Entity><Purpose>`: `StudentCard`, `ComplaintTimeline`, `InvoiceDetail` — never `Card1` / `DetailView`.
- Page containers match the route: `pages/admin/students/StudentListPage.tsx`.
- Boolean props read as questions: `isLoading`, `hasError`, `canApprove`.
- Handler props are `on<Event>`: `onApprove`, `onSubmit`, `onDismiss`.
- Variant props are a closed string union named `variant`: `<Button variant="destructive">` — never per-variant booleans.

---

## 16. Design Checklist (per feature)

Before a feature ships:

- ☐ Uses semantic tokens only (no raw hex / bracket utilities)
- ☐ Loading, empty, error, and permission-denied states designed
- ☐ Works at 360px and at 1440px
- ☐ Status conveyed by colour **and** icon/label
- ☐ Touch targets ≥ 44px on mobile surfaces
- ☐ Keyboard-navigable with visible focus
- ☐ Light and dark mode both verified
- ☐ Copy in i18n files (English + Hindi), sentence case, active voice
- ☐ `prefers-reduced-motion` respected

---

*End of Design.md*
