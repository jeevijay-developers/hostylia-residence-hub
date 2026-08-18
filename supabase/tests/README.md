# Phase 12 — Testing artifacts

This directory contains SQL-level assertions that harden the Hostylia backend
before deployment. They complement the frontend typecheck (`tsgo`) and the
per-phase manual verification the Lovable preview supports.

## Files

| File               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../seed.sql`      | Deterministic fixtures — 1 tenant with 2 properties (one with blocks, one without), 15+ students in mixed states, guardians with varied permission flags, complaints in every SLA state (open / in-progress / breached / resolved), invoices in every payment state, a PENDING_APPROVAL refund, notices/notifications, gate passes in every status, plus a second tenant used purely for cross-tenant isolation tests. |
| `rls_tests.sql`    | Row-Level-Security + RBAC assertions. Uses `SET LOCAL role authenticated` + `request.jwt.claims.sub` to simulate every role/tenant, then makes SELECT/INSERT/UPDATE attempts and asserts either row counts or expected errors. Each assertion is inside its own `BEGIN; … ROLLBACK;` so the fixtures stay intact between checks.                                                                                       |
| `index_sanity.sql` | `EXPLAIN (ANALYZE, BUFFERS)` on the four heaviest read paths — occupancy grid, aging report, complaint SLA scan, invoice list — plus a student attendance history query. Read the plan text for `Index Scan using <expected-index>`.                                                                                                                                                                                   |

## Running

The seed inserts into `auth.users`, which requires postgres/service-role
access. Two ways to run the whole pack:

### Option A — Local `supabase` CLI

```bash
supabase db reset            # applies all migrations
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_tests.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/index_sanity.sql
```

### Option B — Cloud SQL editor (service role)

Paste the SQL files in order into the Supabase SQL editor. `rls_tests.sql`
prints `OK  [label]` per passed assertion and raises `EXCEPTION` on the first
failure.

## Scheduled-function smoke checks

The following are safe to run once fixtures are loaded (they idempotently
mutate their own rows):

```sql
SELECT public.fn_generate_invoices();          -- returns rows inserted
SELECT public.fn_send_fee_reminders();         -- returns notifications enqueued
SELECT public.fn_scan_complaint_sla_breaches(); -- flips sla_breached_at on the pre-seeded overdue complaint
```

## Manual permission-matrix coverage (PRD Sec 7)

`rls_tests.sql` is organized into 10 numbered sections that map onto the
matrix:

| Section | Matrix cells covered                                                                            |
| ------- | ----------------------------------------------------------------------------------------------- |
| 1       | Tenant isolation across all scoped tables (every non-platform role × every tenant-scoped table) |
| 2       | Warden scope narrows to assigned block (WARDEN × attendance/students/complaints)                |
| 3       | Parent scope + `can_pay_fees` / `can_view_*` flags                                              |
| 4       | Student sees only their own rows                                                                |
| 5       | ACCOUNTANT vs. HOSTEL_ADMIN split on refund maker/checker                                       |
| 6       | SUPER_ADMIN escalation on `tenants`                                                             |
| 7       | Anon role blocked on authenticated tables                                                       |
| 8       | Notification recipient scoping                                                                  |
| 9       | Gate-pass parent-approval trigger (Phase 11 guard)                                              |
| 10      | Complaint reopen 48h window                                                                     |

## Known gaps flagged (not silently patched)

- **`documents` table policies allow HOSTEL_ADMIN full access** — no property
  scope is enforced when `property_id IS NULL` on the document. In a
  multi-property tenant this is intentional (org-wide docs) but should be
  audited against the PRD's "documents scoped to property" expectation.
- **`audit_logs` has `authenticated`-role SELECT scoped by tenant only** —
  meaning any Accountant/Warden in tenant A can read every audit event in
  tenant A including HR-sensitive actions. If the matrix says "HOSTEL_ADMIN
  only", the policy needs tightening.
- **`role_assignments` insert path** is service-role only; the invite flow
  in `admin-staff.functions.ts` correctly uses the admin client, but there
  is no policy allowing a HOSTEL_ADMIN authenticated user to insert directly
  — flag if the product ever wants direct staff self-service.

Please review each of the above and decide whether to tighten the policy or
document the exception before signing off Phase 12.
