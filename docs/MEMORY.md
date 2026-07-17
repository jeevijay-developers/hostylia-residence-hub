# Hostylia — Memory.md

**Purpose:** This is the live project ledger. It records what has actually been built, what decisions have been locked, known issues, and the next recommended step. Every AI coding agent must read this before working, and update it after each meaningful task (per `Rules.md` Sec. 36.2). It is the last item in the source-of-truth chain (`Rules.md` Sec. 2) and exists so no one — human or AI — re-derives project state or rebuilds finished work.

**Product:** Hostylia — Smart Residential Management (Hostel & PG platform)
**Company:** Jeevijay Technologies Private Limited
**Build target:** Lovable project `Hostylia: Smart Residential OS`
**Memory version:** 1.0
**Last updated:** July 15, 2026

---

## 1. How to use this file

- **Before coding:** read Sec. 3 (current state) and Sec. 4 (decisions) so you build on what exists and honour locked decisions.
- **After coding:** update Sec. 3 (mark phase progress), append to Sec. 5 (changelog), and record any new Sec. 6 (known issues) or Sec. 7 (pending). Do not delete history — append.
- **Never** contradict a locked decision in Sec. 4 without a PRD/Rules update and an ADR (`Rules.md` Sec. 36.3).

---

## 2. One-paragraph project summary

Hostylia is a multi-tenant hostel/PG management platform for Indian coaching-institute hostels and PGs, built on React + TypeScript + Tailwind + shadcn/ui with a Supabase backend (Postgres, Auth, Storage, Edge Functions), delivered as responsive web only (no native app). It has exactly six roles — Super Admin (Hostylia internal), Hostel Admin (superset per-property owner), Accountant, Warden, Student, Parent — over a Tenant → Organization → Property → Block → Floor → Room → Bed hierarchy. v1 covers property setup, student lifecycle, fees/payments (Razorpay), complaints, gate pass/attendance/mess (Warden-operated), parent portal, and a Super Admin billing console. Security is RLS-first, scoped by `tenant_id` + `property_id`.

---

## 3. Current build state

**Phase model:** 13 phases defined in `Phases.md`. Status is tracked here.

| Phase | Name | Status |
|---|---|---|
| 1 | Project Setup | ☐ Not started |
| 2 | Authentication | ☐ Not started |
| 3 | Dashboard | ☐ Not started |
| 4 | Hostel Management (Property→Bed) | ☐ Not started |
| 5 | Student Management | ☐ Not started |
| 6 | Parent Portal | ☐ Not started |
| 7 | Complaints | ☐ Not started |
| 8 | Payments | ☐ Not started |
| 9 | Reports | ☐ Not started |
| 10 | Notifications | ☐ Not started |
| 11 | Settings & Ops (Attendance/Gate/Mess/Staff/Super Admin console) | ☐ Not started |
| 12 | Testing | ☐ Not started |
| 13 | Deployment | ☐ Not started |

**Status legend:** ☐ Not started · ◐ In progress · ☑ Complete (definition-of-done in `Rules.md` Sec. 6.2 met).

**As of this memory version:** planning/context documents are aligned and finalised (see Sec. 5). No application code written yet. Next step is Phase 1.

---

## 4. Locked decisions

These were decided during the context-alignment review and are binding. Changing any requires updating the cited documents and an ADR.

| # | Decision | Rationale | Governs |
|---|---|---|---|
| D1 | **Stack = React + Vite + TypeScript (strict) + Tailwind + shadcn/ui + Supabase.** JavaScript-only is reversed; TypeScript is required. | Lovable-native grain; Zod `z.infer` gives one source of truth for validation + types. | `Rules.md` Sec. 3–4, `Architecture.md` Sec. 2.1 |
| D2 | **Tenancy root = Tenant → Organization → Property.** Both levels kept. | Tenant = Hostylia billing account (subscription state); Organization = legal GST entity. Different lifecycles/RLS owners. | `PRD.md` Sec. 5, `DB-Schema.md`, `Architecture.md` Sec. 10.1 |
| D3 | **E-signature = click-wrap in v1** (accepted_at, IP, user-agent, hash in `agreements.signature_evidence`, `signature_method=CLICK_CONSENT`). Aadhaar eSign/DSC is Stage 2 (`EXTERNAL_ESIGN`). | Keeps admission fully digital with zero vendor dependency; schema already supports both. | `PRD.md` Sec. 6.2.4, `Architecture.md` Sec. 2.3 |
| D4 | **MEMORY.md created; Test-Checklist.md dropped** (per-phase checklists live in `Phases.md`). | One progress ledger; no seventh file to keep in sync. | `Rules.md` Sec. 2, all doc precedence lists |
| D5 | **Palette from the logo.** Primary deep teal `#00696F`; success forest green `#15803D`; navy ink `#0A141E`; brand cyan `#00D8CC` focus/dark accent. Brand teal is never a status colour. | Brand teal fails AA as a button fill; teal/green would collide in the occupancy grid. All tokens AA-verified. | `Design.md` Sec. 2, Sec. 4 |
| D6 | **Build target stays Lovable + Supabase. Redis deferred, seams documented.** | Redis is out-of-band and Lovable can't manage it → reintroduces hallucination risk. Not needed at target scale. | `Architecture.md` Sec. 26.3, `Rules.md` Sec. 3.4 |
| D7 | **Redis's only intended job = OTP/API rate limiting** (not caching/queue — those are already Postgres-backed via `background_jobs`/`idempotency_keys`). | Names the one defensible future use so it doesn't sprawl. | `Architecture.md` Sec. 26.3 |
| D8 | **v1 rate limiting = Postgres limiter behind `checkRateLimit(key, limit, window)`.** Upstash Redis is the documented Stage-3 swap (function body only; no call-site change). | Handles OTP/SMS abuse at target scale without a second datastore. | `Rules.md` Sec. 29.5, `DB-Schema.md` Sec. 75a `rate_limits`, `Architecture.md` Sec. 26.3 |

### Additional standing rules from the review
- **Edge Functions stay short + idempotent**; bulk/recurring work goes to `background_jobs` in bounded batches (`Rules.md` Sec. 23.1a).
- **All DB access via the Supabase pooler** (Supavisor/PgBouncer) — the real scaling limit is connections, not rows (`Rules.md` Sec. 23.1b).
- **One Zod schema per entity**, imported by form + Edge Function + CSV importer + type; client and server validate the same object (`Rules.md` Sec. 29.4).
- **RLS is the primary security boundary**, not the RBAC matrix; the PRD permission table is a UI/policy layer, enforcement is server-side RLS scoped by `tenant_id`+`property_id` (`Rules.md` Sec. 15, Sec. 8.7).
- **Inbound webhooks (Razorpay callbacks) are v1**; outbound public API/webhooks are Stage 3 (`PRD.md` Sec. 12, `DB-Schema.md` Sec. 74).

---

## 5. Changelog

| Date | Change | By |
|---|---|---|
| 2026-07-15 | Context alignment pass across all 7 docs. Reversed JS→TS + Tailwind/shadcn (D1). Added Tenant level to PRD & Phases (D2). Click-wrap e-sign (D3). Created this file, dropped Test-Checklist (D4). Rewrote Design.md from the logo, AA-verified (D5). Deferred Redis with documented seams; added Postgres `checkRateLimit()` + `rate_limits` table (D6–D8). Purged 5 phantom tables from Phases (property_staff→role_assignments, guardian_links→student_guardians, feature_flags→plan_features/tenant_feature_overrides, feedback→feedback_surveys/responses, audit_log→audit_logs, organizations.subscription_status→subscriptions). Added Edge-function/pooler/Zod/RLS standing rules. | Alignment review |

---

## 6. Known issues / risks

- **Load test pending:** the "50k users on Supabase Pro" posture is a design target, not load-tested. A realistic concurrent-active load test is required before launch (`Architecture.md` Sec. 26.3, Phase 12).
- **RLS is documented, not yet proven:** every table needs the RLS test pairs in `Rules.md` Sec. 15.9 before touching real student data.
- **India data residency:** Supabase region + all third-party processors must be verified before production (`Architecture.md` Sec. 2.4).

---

## 7. Pending / open questions

Carried from `PRD.md` Sec. 13 (product-level, unresolved):

1. Property size at which a solo Warden becomes insufficient (multiple Wardens per block vs per property).
2. Whether Accountant is a paid add-on seat.
3. Whether the gate-pass QR scan needs a dedicated low-privilege "front desk" login vs shared-device Warden login.
4. Whether parent SSO also accepts email magic-link or stays phone-OTP only.
5. Enforceable refund SLA (is 7 working days the promise?).
6. Fast-track plan tier unlocking Stage-2 privilege toggles early for multi-block campuses.

---

## 8. Next recommended step

**Begin Phase 1 — Project Setup.** Scaffold the Vite + React + TypeScript + Tailwind + shadcn/ui app, provision Supabase (local/staging/prod), wire design tokens from `Design.md` Sec. 14 into `src/index.css` + `tailwind.config.ts`, create the Phase-1 tables (`tenants`, `organizations`, `properties`, `profiles`, `plans`, `subscriptions`, `rate_limits`), and implement the `checkRateLimit()` function. Definition-of-done per `Rules.md` Sec. 6.2. Update Sec. 3 and Sec. 5 of this file when the phase completes.

---

*End of Memory.md*
