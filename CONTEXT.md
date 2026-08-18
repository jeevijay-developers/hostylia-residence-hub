# CONTEXT.md

Living notes on open questions/design gaps discovered while working in this repo. Not a doc of
record like `./docs` — treat as a scratchpad of "here's what we found and haven't decided yet."

---

## How does a tenant (hostel) register itself? — 2026-07-25

**Short answer: it doesn't, yet.** There is no working path — self-serve or Super-Admin-assisted —
from "someone fills out the signup form" to "a real Tenant/Organization exists and that person can
reach `/admin/dashboard`." This was discovered while testing the signup flow: a Hostel Admin signup
(email + hostel name) succeeds, but the user is then stranded on `/access-pending`, which is a page
built for a _different_ scenario (see below).

### What the docs say should happen

- **`docs/PRD.md` Sec. 8.1 ("Property onboarding")**: "Admin signs up → creates Property" — framed as
  simple self-serve, no separate approval step mentioned.
- **`docs/PRD.md` Sec. 8.9 ("Super Admin's day")**: "Reviews new tenant signups and onboarding
  status" — implies Super Admin has _visibility_ into new signups, and possibly a review/approval
  role, which sits in some tension with 8.1's "just signs up and goes."
- **`docs/ARCHITECTURE.md` Sec. 3.1 / 8.2, `docs/RULES.md` Sec. ~partial**: "Tenant provisioning"
  is explicitly listed as a **sensitive operation that must go through an Edge Function**, never raw
  browser CRUD — consistent with payments, refunds, role assignment, etc.
- **`docs/PHASES.md`**: this is the most telling gap. Phase 1 only creates the `tenants` /
  `organizations` tables (schema only). Phase 2 ("Authentication") documents login for
  _already-provisioned_ users plus the Parent `/access-pending` state — it does **not** scope a
  self-serve tenant-creation flow. Phase 4 ("Hostel Management") assumes a tenant/property scope
  already exists. **No phase explicitly scopes "turn a fresh signup into a real Tenant."** The PRD's
  simple narrative in 8.1 was never broken down into an engineering phase.

So even the docs are unresolved on this — PRD implies self-serve, PHASES.md never actually plans it,
and ARCHITECTURE.md is clear it must be Edge-Function-mediated whichever way it's decided.

### What actually exists in code today

1. `src/components/auth/SignupForm.tsx` — `EmailSignupForm`/`PhoneSignupForm` call
   `supabase.auth.signUp()` / `signInWithOtp()` directly, storing `full_name` and `hostel_name` as
   raw `user_metadata` on the `auth.users` row. Nothing else is created.
2. The `handle_new_user` Postgres trigger (`supabase/migrations/20260715105729_...sql`) fires on
   `auth.users` insert and creates a `public.profiles` row (`full_name`/`email`/`phone` only). It does
   **not** read `hostel_name` or create a `tenants`/`organizations`/`role_assignments` row.
3. **`hostel_name` is captured and then never read anywhere else in the codebase** — confirmed via
   full-repo grep. It's dead data.
4. `src/lib/super-admin.functions.ts` — the only file that touches `tenants` — has a stats/list query
   and an `UPDATE` (for status changes on an _existing_ tenant). **There is no tenant `INSERT`
   anywhere in the app**, not even a Super-Admin-only one. So today, literally nothing can create a
   new tenant — not self-serve, not Super Admin console either.
5. After signup, `src/components/auth/RoleRedirect.tsx` resolves the user's role: no
   `platform_role_assignments` row → no `tenant_memberships` row → falls to the phone/guardian check
   → no match → lands on `/access-pending`.
6. `src/routes/access-pending.tsx` is hardcoded copy for **"Parent phone not yet linked to a
   student"** (confirmed by `docs/PHASES.md` Phase 2, which scopes `/access-pending` explicitly as
   that Parent-only state). A Hostel Admin who just signed up sees this same page and is told to
   "contact your hostel administration" — which is nonsensical for someone who _is_ the hostel
   administration. This isn't really a copy bug in isolation; it's the visible symptom of there being
   no Hostel-Admin-signup landing state at all, because that whole path doesn't exist yet.

### The actual gap

Nothing between "auth user created" and "user has a `tenants` row + `organizations` row +
`role_assignments(role=HOSTEL_ADMIN)` + `tenant_memberships(status=ACTIVE)`." No Edge Function, no
Super Admin review queue/UI, no self-serve provisioning wizard.

### Two ways to close it (undecided — needs a product call)

**A. Fully self-serve, automatic** (matches PRD 8.1's simple framing)

- On signup (or on first login if no tenant found), call a `provision-tenant` Edge Function that:
  creates `tenants` (status likely `TRIAL`, `onboarding_status` in progress), `organizations` (name
  from `hostel_name`), a `subscriptions` row against a default plan (`STARTER` exists as a seed
  fixture), `role_assignments(role='HOSTEL_ADMIN', is_active=true)`, `tenant_memberships(status='ACTIVE')`.
- Lowest friction, matches "time-to-first-value ≤ 1 day" NFR in PRD Sec. 9.
- Means anyone can spin up a tenant with no human review — fine for a self-serve PLG motion, less fine
  if Hostylia wants sales/eligibility screening before granting a trial.

**B. Reviewed / Super-Admin-approved** (matches PRD 8.9's "reviews new tenant signups" framing)

- Signup creates a "pending signup" state (e.g. a `profiles.status` value, or a lightweight
  `tenant_signup_requests` table — doesn't exist yet either) visible in the Super Admin console.
- Super Admin approves → triggers the same `provision-tenant` Edge Function.
- Needs: a genuine `/access-pending`-style state _for this case specifically_ (distinct from the
  Parent one), plus a new Super Admin console screen to list/approve pending signups.
- Slower time-to-first-value, but matches a more sales-assisted, high-touch onboarding motion — which
  may fit "Indian coaching-institute hostel owners" as a buyer profile better than pure self-serve.

Either way: the actual tenant/org/role-assignment creation should be one Edge Function (per
`docs/ARCHITECTURE.md`'s sensitive-operations list), not client-side inserts — those tables don't
currently grant `INSERT` to `authenticated` for exactly that reason.

### Not yet checked / worth a follow-up pass if this gets built

- Whether `tenants.slug` needs a uniqueness/generation strategy (from `hostel_name`?) — not specified
  in docs.
- Whether phone-based signup (no email) should provision differently — `PhoneSignupForm` sends OTP
  with `hostel_name` in metadata the same way; same gap applies.
- RLS: `tenants`/`organizations` INSERT policies would need defining as part of whichever Edge
  Function approach is chosen (currently service-role-only by omission, same pattern as
  `platform_role_assignments`).
