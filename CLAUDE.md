# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hostylia is a multi-tenant SaaS for running Indian coaching-institute hostels/PGs: property/room/bed
management, student admission-to-move-out lifecycle, fee collection (Razorpay), complaints, gate-pass/
attendance/mess operations, and parent communication in one responsive web app (no native apps). Six
hard-locked roles, no more, no less: `SUPER_ADMIN, HOSTEL_ADMIN, ACCOUNTANT, WARDEN, STUDENT, PARENT`.
Hostel Admin is the superset role. Parent access is always relationship-gated (via `student_guardians`),
Student access is self-only. Never invent a 7th role or new module without doc evidence.

The `./docs` folder (`PRD.md`, `RULES.md`, `ARCHITECTURE.md`, `DB-SCHEMA.md`, `DESIGN.md`, `PHASES.md`,
`MEMORY.md`) is the project's source of truth and is much more detailed than this file — read the
relevant doc before working in an unfamiliar area, especially `RULES.md` (rules/conventions) and
`DB-SCHEMA.md` (tables/RLS). **These docs are stale relative to the actual codebase** — `MEMORY.md`'s
phase table says "nothing started," but the repo already has ~250 files under `src/`, 70+ routes, and
19 DB migrations with RLS hardening commits. Treat the docs as intent/reference, not ground truth about
current progress — verify against the actual code. Update `docs/MEMORY.md` after meaningful tasks
(what changed, decisions made, known issues, next step) since it's meant to be a living ledger.

## Commands

- `bun run dev` — start dev server (Vite)
- `bun run build` — production build
- `bun run build:dev` — development-mode build
- `bun run preview` — preview a production build
- `bun run lint` — ESLint (flat config; Prettier violations surface as lint errors)
- `bun run format` — Prettier write
- Package manager is **bun** (`bun.lock`/`bunfig.toml` are authoritative; `package-lock.json` is a stray
  leftover, ignore it).
- **No JS/TS test runner is configured** (no Vitest/Playwright/Jest despite docs describing them as
  required) — don't assume `bun test` or similar works, and don't claim a feature is "tested" from a
  nonexistent suite.
- SQL-level tests exist under `supabase/tests/` (`rls_tests.sql`, `index_sanity.sql`), runnable via the
  Supabase CLI (`supabase test db`). Migrations: standard `supabase start` / `supabase db push` /
  `supabase migration up` workflow; no custom wrapper scripts. Migration files use Supabase-CLI
  timestamp+UUID naming (not the sequential `NNN_name.sql` scheme `DB-SCHEMA.md` describes).

## Architecture

Stack: TanStack Start (React 19 + Vite + TanStack Router/Query), Supabase (Postgres/Auth/Storage/Edge
Functions), Tailwind v4 + shadcn/ui (Radix, `new-york` style), i18next, Zustand, Zod, bun. This project
is scaffolded/synced via **Lovable.dev** — don't force-push, rebase, or amend already-pushed commits on
the connected branch (see `AGENTS.md`), and don't manually add `tanstackStart`/`viteReact`/
`tailwindcss`/`tsConfigPaths`/`nitro`/`componentTagger` plugins to `vite.config.ts` — the
`@lovable.dev/vite-tanstack-config` wrapper already injects them.

**Routing** — File-based under `src/routes/` (see `src/routes/README.md` before touching this — it's
TanStack Router, not Next/Remix; no `src/pages/` or `app/layout.tsx`, the only layout is
`src/routes/__root.tsx`). `src/routeTree.gen.ts` is auto-generated — never hand-edit. Public marketing
routes are flat (`index.tsx`, `about.tsx`, `pricing.tsx`, `apply.$propertySlug.tsx`). Logged-in routes
live under `src/routes/_authenticated/` with a dot-segment-per-role naming convention (e.g.
`admin.finance.invoices.tsx`, `warden.daily-brief.tsx`). `_authenticated/route.tsx` checks
`supabase.auth.getUser()` in `beforeLoad` and redirects to `/login`. **Route guards
(`RoleGuard`, etc.) are UX-only** — they redirect role mismatches to `/403` but RLS is the real security
boundary; never treat a route guard as an authorization control.

**Auth** — Supabase Auth (phone OTP + email/password). `src/schemas/auth.ts` is the single Zod source
of truth for phone/email/password/OTP shapes, reused by both client forms and server functions (one
schema per entity — never hand-write a parallel type/validator). `src/integrations/supabase/`:
`client.ts` (browser client, lazy singleton), `client.server.ts` (SSR), `auth-middleware.ts`
(`requireSupabaseAuth` — TanStack Start server middleware validating the bearer JWT), `types.ts`
(generated DB types — do not hand-edit). Role resolution via `useResolvedRole()` in
`src/lib/user-role.ts`.

**Data layer** — this is the load-bearing convention the docs don't fully capture, so read actual code
over `ARCHITECTURE.md`'s prescribed folder tree. There is **no `src/features/` or `src/services/`
folder** despite the docs prescribing one. Instead:

- Simple RLS-protected reads: direct `supabase.from(...)` calls wrapped in TanStack Query, colocated
  with the route/component (no dedicated per-domain hooks folder — `src/hooks/` only has
  `use-mobile.tsx`).
- Privileged/mutating work: `src/lib/<domain>.functions.ts` files exporting TanStack Start
  `createServerFn()`s, each with `.validator(schema.parse)` (reusing the shared Zod schema) and a
  `.handler()`. These sometimes instantiate a service-role Supabase client server-side
  (`process.env.SUPABASE_SERVICE_ROLE_KEY`) — **never** import or reference the service-role key from
  browser/client code, and never put it in a `VITE_`-prefixed env var.
- ESLint bans importing the `server-only` package directly — use TanStack Start's `*.server.ts` file
  naming or the `@tanstack/react-start/server-only` marker instead.
- True privileged/side-effecting flows (payments, refunds, cash recording, discounts, waivers, invoice
  issuance, bulk imports, tenant provisioning, notification sends, gate QR validation) go through
  Supabase Edge Functions (`supabase/functions/`: `generate-receipt`, `razorpay-create-order`,
  `razorpay-webhook`, `send-notification`, `send-sms-hook`), not raw browser CRUD, even where RLS
  would technically allow it.
- Background/recurring work goes into the `background_jobs` outbox table processed by scheduled Edge
  Functions in bounded batches — idempotent, retryable, use `idempotency_keys` for anything touching
  money or external side effects. Don't write synchronous loops over large datasets in an Edge Function.

**State management** — Zustand only for client-only cross-screen state; currently just
`src/stores/property-store.ts` (`activePropertyId`, persisted to localStorage). Priority order for new
state: URL state → TanStack Query → local component state → React Context → Zustand (last resort).
Never put Supabase server data in Zustand, and never treat query cache as an authorization check.
TanStack Query keys should be scoped by tenant+property; invalidate only affected queries; clear cache
on logout; no optimistic updates for finance mutations.

**i18n** — `src/i18n/index.ts`, i18next + react-i18next, two locales only: `en`/`hi`, loaded eagerly
from `en.json`/`hi.json`. Locale persisted via `hostylia_locale` cookie (not localStorage), 1yr,
`SameSite=Lax`. Translation coverage is still partial — `en.json` currently only has `common`,
`language`, `auth`, `parent` namespaces despite far more of the app being built; don't assume every
string is already wired for i18n.

**Multi-tenancy / DB shape** — `Tenant → Organization → Property → Block(optional) → Floor → Room →
Bed`. Tenant ≠ Organization by design (Tenant = Hostylia billing/subscription account, Organization =
legal GST entity) — this is a locked decision, don't "simplify" it. Every tenant-owned table carries
`tenant_id`; most operational tables also carry `property_id`; block-scoped ones carry `block_id`.
Core entity groups (~85 tables total): platform/tenancy (`tenants`, `organizations`, `plans`,
`subscriptions`), identity (`profiles`, `role_assignments`, `tenant_memberships`), property hierarchy
(`properties`, `blocks`, `floors`, `rooms`, `beds`), student lifecycle (`students`, `guardians`,
`admissions`, `allocations`, `agreements`), finance (`fee_plans`, `invoices`, `payments`, `receipts`,
`refunds`, `deposit_ledger_entries`), operations (`attendance`, `complaints`, `gate_passes`, `visitors`,
`mess_*`, `notices`, `conversations`/`messages`), platform ops (`notifications`, `background_jobs`,
`idempotency_keys`, `rate_limits`), audit (`audit_logs`, `privacy_requests`). See `docs/DB-SCHEMA.md`
for full detail before adding/modifying tables.

**RLS** — mandatory (`enable row level security` + `force row level security`) on every tenant-owned
table, never disabled "temporarily." Policies built from helper functions (`current_profile_id()`,
`current_tenant_id()`, `has_role()`, `has_property_access()`, `has_block_access()`, `is_guardian_of()`).
Parent access requires `student_guardians.guardian_id` linkage AND `portal_access_enabled = true` AND
`unlinked_at is null` — never infer parent access from same-property/tenant/surname/phone. RLS cannot do
column-level filtering — an Accountant's "finance-only" view of student data needs a secure view, not
raw table RLS. Never trust a client-supplied `tenant_id`; always validate against the authenticated
user's membership. Storage paths are tenant-scoped:
`{tenant_id}/{property_id}/{entity_type}/{entity_id}/{file_id}`. When adding a table, add RLS test pairs
(same-tenant allowed, cross-tenant denied, wrong-property denied, wrong-block denied, relationship-gated
access, self-access, revoked/suspended access) to `supabase/tests/rls_tests.sql`.

## Money / finance rules

- Store money as integer/bigint **paise**, never float/double/text; currency stored separately, default
  INR.
- Payment success is only ever confirmed via a verified, signature-checked, idempotent Razorpay webhook
  — never trust a browser redirect/callback as proof of payment.
- Never store card data (no full PAN/CVV/PIN).
- Issued invoices are never silently edited — void/adjustment/credit-reversal/reissue only.
- Refunds, waivers, and discounts above threshold require maker-checker: initiator ≠ approver, reason
  mandatory, all transitions audited.
- Never label a collections-only report as full P&L (needs approved expense data too).

## Code conventions

- TypeScript strict, `.ts`/`.tsx` only for app code. No `any` (use `unknown` + Zod at trust boundaries),
  no `!` non-null assertions, no `@ts-ignore`/`@ts-expect-error`.
- One Zod schema per entity in `src/schemas/`, types derived via `z.infer` — reused by both client forms
  and server function input validators. Don't hand-write a parallel interface/validator.
- Note: `noUnusedLocals`/`noUnusedParameters` are off in `tsconfig.json`, and
  `@typescript-eslint/no-unused-vars` is off in `eslint.config.js` — unused-var cleanup is intentionally
  not enforced project-wide; don't assume lint will catch it, but also don't go on unprompted cleanup
  sweeps because of this.
- Import alias `@/*` → `./src/*`.
- Styling: semantic Tailwind tokens only — no raw hex, no `bg-[#...]` bracket utilities, no inline
  colors. Status colors (paid/occupied/resolved vs overdue/vacant/open) use their own semantic tokens,
  never the brand teal gradient (that's reserved for the brand mark and the "occupancy column"
  visualization). Status is always color+icon together, never color alone. Lucide React only for icons,
  no emoji icons.
- Build UI from shadcn/ui primitives (`src/components/ui`, style `new-york`) and extend via variants —
  don't bypass with arbitrary utility overrides. Global styles live in `src/styles.css` (not
  `index.css`, despite what some docs say).
- Component naming: PascalCase files, `<Entity><Purpose>` names (`StudentCard`, `ComplaintTimeline`),
  boolean props as questions (`isLoading`), handlers as `on<Event>`.
- Mobile: bottom nav for Student/Parent/Warden; sidebar for Admin/Accountant/Super Admin. Tables use
  server-side pagination/filter/sort with loading/empty/error states — never load thousands of rows
  client-side.
- Forbidden stack substitutions — don't reach for these even if they'd be idiomatic elsewhere: Next.js,
  Express, NestJS, Firebase, MongoDB, Prisma/Sequelize/TypeORM, Angular/Vue/Svelte, Redis (deferred to a
  later stage per `docs/MEMORY.md` D-decisions, not available in v1), read replicas (v1), self-hosted
  Node/Deno servers outside Edge Functions. Rate limiting is Postgres-backed (`check_rate_limit` RPC over
  `rate_limits`), not Redis.
- Commit style: conventional-commits-with-scope, e.g. `feat(finance): add refund approval flow`,
  `fix(rls): restrict parent complaint access`.

## Config gotchas

- `.mcp.json` connects a `supabase` MCP server for project ref `umznrrdqduynifpatslb` — Supabase MCP
  tools are available and preferred over ad hoc scripting for DB inspection/migrations where practical.
- `.env` is real and present locally but gitignored; **there is no `.env.example`** committed — if you
  add a new required env var, consider whether one should exist.
- `.lovable/project.json` / `plan.md` confirm the Lovable scaffold/template in use.
