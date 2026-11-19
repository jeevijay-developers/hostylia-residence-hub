# Manual Test Plan — Admin &amp; Warden Panels (Hostylia Residence Hub)

> **Yeh sirf TEST-PLAN hai, execution nahi.** Koi test yahan run nahi hua hai. Har test case ka
> "Actual Result" aur "Status" column blank hai — human tester ko khud app khol kar fill karna hai.
> Yeh plan [full codebase audit], [Admin Panel audit], aur [Warden Panel audit] (isi conversation
> mein pehle generate hui) ke evidence par based hai. Jahan code-evidence insufficient tha, wahan
> case ko **"Needs Investigation"** mark kiya gaya hai — "assume it works" nahi kiya.

**Status legend:** `Not Run` · `Pass` · `Fail` · `Blocked` · `Needs Investigation`
**Priority legend:** `P0` = Critical (money/security/data-loss) · `P1` = High · `P2` = Medium · `P3` = Low

---

## 1. Master Test Plan

### 1.1 Scope
- **Admin Panel (HOSTEL_ADMIN)**: Dashboard, Properties, Students/Admissions, Allocations,
  Attendance, Finance (Fee Plans/Invoices/Payments/PnL/Refunds), Complaints, Support Tickets,
  Staff &amp; granular permissions, Notices, Reports, Settings/Subscription/Profile.
- **Warden Panel (WARDEN)**: Daily Brief, Students, Allocations &amp; Rooms-Beds, Attendance,
  Gate Pass + QR + Visitors, Complaints, Mess, Notices, Finance (permission-gated), Refund
  (submit-only), Reports, Activity/Profile.
- **Cross-role &amp; security**: route/API authorization, tenant isolation, maker-checker, hidden
  routes, expired-auth handling — across HOSTEL_ADMIN, WARDEN (default perms), WARDEN (customized
  perms), ACCOUNTANT, STUDENT, PARENT.
- **Out of scope for this pass**: SUPER_ADMIN panel, public marketing site, native payment gateway
  certification (Razorpay live mode) — these need their own staging-only test plans.

### 1.2 Known unknowns going in (carried over from the audits — verify, don't assume)
These were flagged "Unverified" or "Potential issue" in the prior audits. Treat every related test
case below as **primary verification targets**, not confirmed bugs:

1. Does Notice "Publish" actually trigger a `send-notification` Edge Function call, or only insert a
   `notices` row? (Admin + Warden)
2. Is `warden.rooms-beds.tsx` intentionally hidden from nav, or a forgotten route?
3. Does the Warden "Change stay" bed-change go through the atomic swap RPC, or a raw update that
   could race with another concurrent allocation?
4. Do direct client-side mutations (Admin: properties, attendance-delete, complaints,
   support-attachment-metadata; Warden: complaints, Mess CRUD, bed-change) still correctly reject
   cross-tenant/cross-property writes at the RLS layer, even though there's no server-fn in front of
   them?
5. Does the Admin attendance route surface an error state, or silently show 0 on query failure?
6. Do PnL/Revenue summary numbers actually reconcile against the sum of underlying `payments` rows?

### 1.3 Environment readiness (do this before any test below)
- [ ] Confirm you are testing against a **staging/sandbox Supabase project**, NOT production — this
  is mandatory before any write, payment, refund, or notification test.
- [ ] Confirm Razorpay is in **test mode** (test API keys), not live keys.
- [ ] Confirm SMS/Email providers (MSG91/Resend) are either disabled, pointed at a sandbox, or that
  test phone/email addresses are used — never a real guardian's phone/email.
- [ ] Have at least 2 separate test tenants provisioned (for tenant-isolation tests in Section 4).
- [ ] Browser dev tools open throughout, Network tab visible, to inspect actual request
  payloads/responses (useful for "Backend/Data Check" columns below, since you don't have DB
  console access as a tester necessarily — ask your dev for Supabase Table Editor access if you do
  have staging DB access, it will make "Backend/Data Check" steps much faster).

---

## 2. Test Data Preparation Guide (do NOT create this yourself — this is the spec for your dev/QA setup)

| # | Item | Minimum needed | Notes |
|---|---|---|---|
| 1 | Test Tenant A | 1 | with 1 Organization, 1 Property, Block optional, 2+ Floors, 4+ Rooms, 8+ Beds |
| 2 | Test Tenant B | 1 | completely separate tenant — used ONLY for cross-tenant isolation tests |
| 3 | HOSTEL_ADMIN account | 1 per tenant | |
| 4 | WARDEN account — default permissions | 1 | "Customize Permissions" OFF → only Students/Attendance/Complaints/Gate/Visitors |
| 5 | WARDEN account — customized permissions | 1 | explicitly grant Finance keys + Allocations + Rooms&amp;Beds + Mess + Notices, to test the "granted" path |
| 6 | ACCOUNTANT account | 1 | for cross-role tests |
| 7 | STUDENT accounts | 3+ | at least one ACTIVE allocation, one PENDING_PAYMENT allocation, one moved-out |
| 8 | PARENT accounts | 2+ | one correctly linked via `student_guardians` with `portal_access_enabled=true`, one with a REVOKED/unlinked link (for negative tests) |
| 9 | Dummy fee plan | 1+ | with 2+ components (e.g. Room Rent + Mess Fee) |
| 10 | Dummy invoices | 3+ | one unpaid, one partially paid, one fully paid |
| 11 | Dummy payments | 2+ | at least one via test-mode Razorpay checkout, one manual/cash entry |
| 12 | Dummy complaints | 3+ | one anonymous, one assigned, one resolved (to test reopen) |
| 13 | Dummy gate passes | 3+ | one PENDING_PARENT, one PENDING_WARDEN, one fully APPROVED |
| 14 | Dummy visitors | 2+ | one checked-in-not-out, one fully checked-out |
| 15 | Dummy mess menu + headcount | 1+ | for Warden Mess CRUD tests |
| 16 | Dummy support ticket | 1+ | with at least one attachment, to test the attachment-metadata path |
| 17 | Dummy notice | 1+ | not yet published — used in the publish-flow verification tests |

**Cleanup convention**: every test case below that creates data should be cleaned up via the same
UI action (e.g. void the invoice, delete the test property) at the end of its own test, not left for
a separate pass — unless marked "Cleanup: N/A (read-only)".

---

## 3. Admin Panel Checklist

> Preconditions for all Admin cases unless noted: logged in as HOSTEL_ADMIN of Test Tenant A, scoped
> to its one property.

### 3.1 Dashboard

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-DASH-001 | Dashboard loads with real counts | P1 | 1. Log in as Admin 2. Open Dashboard/home | All widgets show numbers matching actual DB state (not placeholder/zero when data exists) | Compare displayed counts vs. direct count of underlying table rows for that property | Admin only |
| ADM-DASH-002 | Dashboard on empty property | P2 | 1. Use a brand-new property with 0 students/complaints/etc. 2. Open Dashboard | Widgets show 0/empty state gracefully, no crash, no "undefined" text | — | Admin only |

### 3.2 Properties

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-PROP-001 | Create new property — valid data | P1 | 1. Go to Properties → New 2. Fill name, address, city, state, pincode (valid) 3. Submit | Property created, redirected to its setup page, appears in property list | Direct client `insert` on `properties` — confirm `tenant_id` set to current admin's tenant, not client-editable | Admin only |
| ADM-PROP-002 | Create property — missing required field | P1 | 1. Open New Property form 2. Leave name blank 3. Submit | Form blocks submission with validation error, no partial row created | — | Admin only |
| ADM-PROP-003 | Create property — invalid pincode format | P2 | 1. Enter a non-numeric/too-short pincode 2. Submit | Validation error shown, submission blocked | Zod schema validation message should be field-specific | Admin only |
| ADM-PROP-004 | Edit property details | P1 | 1. Open existing property → Setup 2. Change name/address 3. Save | Changes persist after page refresh | — | Admin only |
| ADM-PROP-005 | Finish setup wizard | P1 | 1. Complete all setup steps (structure, policies, etc.) 2. Mark setup complete | Property status flips to "active"/ready, shows correctly in list | — | Admin only |
| ADM-PROP-006 | **[Risk]** Cross-tenant property edit via direct URL | P0 | 1. As Tenant-A Admin, note Tenant-B's property ID (from staging DB) 2. Navigate directly to `/admin/properties/<tenant-B-id>/setup` | Must be blocked (403 or RLS-denied error) — Tenant-A admin must NOT see/edit Tenant-B's property | This is a direct-client-mutation path (no server-fn) — RLS is the only defense here. **High-value test** given the audit flagged this path as unguarded by a server function. | Denied for all other tenants |

### 3.3 Students &amp; Admissions

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-STU-001 | View student list with filters | P1 | 1. Go to Students 2. Apply status filter (Active/Pending/Moved-out) | List updates correctly, pagination works if &gt;1 page | Server-side pagination expected per CLAUDE.md — watch Network tab for a paginated request, not a full-table fetch | Admin only |
| ADM-STU-002 | Search students by name/phone | P2 | 1. Type a known student's partial name in search | Correct student(s) appear, no false positives from other tenants | — | Admin only |
| ADM-STU-003 | View student detail — guardian info | P1 | 1. Open a student with a linked guardian | Guardian name/phone/relationship displayed correctly | — | Admin only |
| ADM-STU-004 | Confirm admission &amp; link account | P0 | 1. Create a new admission in PENDING state 2. Click "Confirm &amp; link account" | Student status flips, login credentials/invite triggered | Goes through `confirmStudentAdmission` server fn — confirm via Network tab it's a server-fn call, not raw insert | Admin only |
| ADM-STU-005 | Move-out a student | P0 | 1. Open an ACTIVE student 2. Go to Move-out flow 3. Complete with a move-out date and reason | Allocation status → MOVED_OUT, bed becomes available again in Rooms&amp;Beds | Check `allocations` status transition and that the vacated bed shows as free immediately after | Admin only (Warden cannot — see WRD-STU-004) |
| ADM-STU-006 | Negative: move-out with future/invalid date | P2 | 1. Attempt move-out with a date in the far future or before admission date | Validation error, no state change | — | Admin only |
| ADM-STU-007 | **[Risk]** Edit student — cross-property access | P0 | 1. As Admin of Property A, attempt to open a student belonging to Property B (same tenant, different property) via direct URL/ID | Should be denied per `has_property_access()` RLS — Admin is tenant-superset but CLAUDE.md implies property scoping still applies for multi-property tenants; **verify actual expected behavior with your dev before marking Fail** | Mark "Needs Investigation" if unclear whether Admin is scoped per-property or whole-tenant |

### 3.4 Allocations

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-ALLOC-001 | Allocate a vacant bed to a student | P0 | 1. Open Allocations board 2. Pick a vacant bed 3. Assign to an unallocated student | Allocation created as PENDING_PAYMENT (or ACTIVE if no fee due), bed marked occupied | — | Admin only |
| ADM-ALLOC-002 | Negative: allocate an already-occupied bed | P0 | 1. Attempt to allocate a bed that already has an active allocation | Must be blocked with a clear conflict message, no double-booking | This exercises the conflict-prevention logic — if it silently succeeds and creates two allocations on one bed, that's a **P0 data-integrity bug** | Admin only |
| ADM-ALLOC-003 | Swap bed for an existing student | P1 | 1. Open an active allocation 2. Trigger bed-swap to another vacant bed | Old bed freed, new bed occupied, single allocation record updated (not duplicated) | Should use the atomic swap RPC (`atomic_swap_allocation_bed` per migration) — if Admin's UI path for this exists, confirm no race-condition duplicate allocation under rapid double-click (see ADM-ALLOC-004) | Admin only |
| ADM-ALLOC-004 | Edge case: rapid double-click on allocate/swap | P1 | 1. Click "Confirm allocation" twice in quick succession (or use network throttling to slow the first response) | Only one allocation/swap should be committed — button should disable after first click | — | Admin only |

### 3.5 Attendance

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-ATT-001 | Mark bulk attendance for today | P0 | 1. Open Attendance 2. Mark a mix of Present/Absent/Late with remarks for Absent/Late | Saved via `bulkMarkAttendance`, reflected immediately in list and in Dashboard's Present/Absent counts | — | Admin only |
| ADM-ATT-002 | Negative: mark attendance for a future date | P1 | 1. Attempt to select a future date and mark attendance | Should be blocked client-side; **also check that it's blocked server-side** (try via direct API replay if possible) — client-only validation would be a gap | — | Admin only |
| ADM-ATT-003 | Negative: duplicate attendance for same student/date | P1 | 1. Mark a student Present for today 2. Try marking the same student again for the same date | Should update the existing record, not create a duplicate row | — | Admin only |
| ADM-ATT-004 | **[Risk]** Delete an attendance record | P0 | 1. Open an existing attendance record 2. Delete it | Record removed from UI and (verify) from DB | **This is a direct client-side `.delete()` per the audit — confirm RLS still blocks a cross-tenant/cross-property delete attempt.** Also confirm there's no confirmation dialog missing that could cause accidental data loss. | Admin only — verify Warden genuinely has no delete option (WRD-ATT checklist) |
| ADM-ATT-005 | **[Risk]** Error state on query failure | P2 | 1. Simulate a network failure while Attendance list loads (DevTools → offline, then reload) | Should show a clear error message, NOT silently render "0 present / 0 absent" as if that were real data | Audit flagged this as a possible silent-failure gap | Admin only |

### 3.6 Finance

#### 3.6.1 Fee Plans

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-FEE-001 | Create a fee plan with multiple components | P0 | 1. New Fee Plan 2. Add "Room Rent" + "Mess Fee" components with amounts | Plan saved, both components visible, total = sum of components | — | Admin only |
| ADM-FEE-002 | Edit an existing fee plan (not insert-duplicate) | P0 | 1. Open an existing fee plan 2. Change one component's amount 3. Save | The SAME plan is updated in place — no duplicate plan created, old amount gone from active view | Audit noted `upsertFeePlan` previously always-inserted (per MEMORY.md) but current code appears to have an edit path — **this test directly verifies that fix is real** | Admin only |
| ADM-FEE-003 | Soft-deactivate a removed component | P1 | 1. Remove a component from an existing plan 2. Save | Component disappears from active plan but historically-issued invoices referencing it are unaffected | Check that past invoices don't retroactively change | Admin only |

#### 3.6.2 Invoices

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-INV-001 | Create a manual invoice | P0 | 1. New Invoice for a student 2. Pick fee plan / enter amount 3. Issue | Invoice created with status "Unpaid", correct amount in paise internally (ask dev to confirm via DB, not float) | `createManualInvoice` server fn | Admin only |
| ADM-INV-002 | Edit an unpaid invoice | P1 | 1. Open unpaid invoice 2. Edit amount/line items 3. Save | Edit succeeds (per CLAUDE.md, only via edit/void/reissue flow, never silent raw edit) | `editInvoice` server fn | Admin only |
| ADM-INV-003 | **[Money rule]** Attempt to silently edit a PAID invoice | P0 | 1. Open a fully-paid invoice 2. Try to edit its amount | Must be blocked or routed through a credit-note/reissue flow — CLAUDE.md explicitly forbids silent edits of issued invoices | If this succeeds as a plain edit, it's a **P0 finance-integrity bug** | Admin only |
| ADM-INV-004 | Void an invoice | P0 | 1. Open an unpaid invoice 2. Void it with a reason | Status → Voided, reason recorded, invoice excluded from outstanding-balance totals | `voidInvoice` server fn | Admin only |
| ADM-INV-005 | List pagination with many invoices | P2 | 1. Property with 50+ invoices 2. Scroll/paginate | Server-side pagination, no client-side full-table load (per CLAUDE.md table convention) | Watch Network tab — request should include page/limit params | Admin only |

#### 3.6.3 Payments

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-PAY-001 | Record a manual/cash payment against an invoice | P0 | 1. Open unpaid invoice 2. Record manual payment for full amount | Invoice flips to Paid, payment appears in Payments history | — | Admin only |
| ADM-PAY-002 | Record a partial payment | P1 | 1. Record payment less than invoice total | Invoice status → Partially Paid, remaining balance correctly computed | Verify balance = total − sum(payments), not a hardcoded value | Admin only |
| ADM-PAY-003 | **[Money rule]** Online payment success is only via verified webhook | P0 | 1. In staging, complete a test-mode Razorpay checkout 2. Before the webhook fires (if you can pause it), check invoice status 3. After webhook fires, recheck | Invoice/payment must NOT flip to Paid purely from the browser redirect — only after the signed webhook is processed | This directly tests the money rule in CLAUDE.md: "never trust a browser redirect as proof of payment." Needs staging with webhook visibility (dev/QA collaboration). | Admin/Student/Parent initiating payment |
| ADM-PAY-004 | Negative: duplicate payment prevention | P0 | 1. Attempt to replay/resubmit the same payment webhook event (ask dev to resend a captured test webhook payload) | Second attempt must be a no-op (idempotency key / `webhook_events` dedup), not a duplicate payment record | Needs dev/staging collaboration — mark Blocked if you can't safely replay a webhook yourself | N/A |

#### 3.6.4 PnL / Revenue &amp; Refunds

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-FIN-001 | Revenue &amp; Collections summary reconciles | P0 | 1. Note total of all recorded payments for the property/date range 2. Open Admin's PnL/Revenue page for same range | Displayed total matches your manually-summed total | This is the "Special Risk" item from Phase 7 — reports must agree with underlying records | Admin only |
| ADM-FIN-002 | Page does NOT mislabel as full P&amp;L | P2 | 1. Open the PnL page | Page title/labels should say "Revenue &amp; Collections" or similar, not claim to be a full P&amp;L (per CLAUDE.md, collections-only ≠ P&amp;L without approved expenses) | Confirm label language | Admin only |
| ADM-REFUND-001 | Approve a refund request | P0 | 1. Have a Warden/Accountant submit a refund request (maker) 2. As Admin (checker), approve it | Refund approved, status changes, reason/approver recorded distinctly from the initiator | **Maker-checker**: confirm initiator ≠ approver is enforced — if the same user who submitted can also approve, that's a P0 finding | Admin approves; Warden/Accountant submit only |
| ADM-REFUND-002 | Negative: Admin tries to approve their OWN submitted refund | P0 | 1. As Admin, submit a refund request yourself 2. Try to approve it | Should be blocked — maker ≠ checker must hold even for Admin | Verify this isn't silently allowed because Admin is "superset" | Admin only, but self-approval must be denied |

### 3.7 Complaints

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-COMP-001 | Assign a complaint to self/Warden | P1 | 1. Open an unassigned complaint 2. Assign to a Warden | `assigned_to` updates, Warden should now see it in their queue | **Risk**: this is a direct client `.update()` per audit — verify it still respects tenant/property RLS scoping | Admin only |
| ADM-COMP-002 | Resolve a complaint | P1 | 1. Open assigned complaint 2. Add resolution summary 3. Mark Resolved | Status → Resolved, `resolved_by` set to current user, resolution text saved | — | Admin + assigned Warden |
| ADM-COMP-003 | Reopen a resolved complaint | P1 | 1. Open a resolved complaint 2. Reopen with a reason | Status → Reopened, history/comments preserved | — | Admin only (verify Student/Parent cannot reopen on their own) |
| ADM-COMP-004 | View an anonymous complaint | P2 | 1. Open a complaint flagged anonymous | Student identity hidden/masked in UI | — | Admin only |
| ADM-COMP-005 | Negative: cross-property complaint edit | P0 | 1. Attempt to assign/resolve a complaint belonging to a different property (direct URL/ID if multi-property tenant) | Must be denied | Same direct-client-mutation risk as ADM-PROP-006 | Denied cross-property |

### 3.8 Support Tickets

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-SUP-001 | Create a support ticket | P2 | 1. New ticket, fill subject/description 2. Submit | Ticket created, visible in list | `createSupportTicket` server fn | Admin only |
| ADM-SUP-002 | Reply to a ticket | P2 | 1. Open ticket 2. Add reply | Reply appears in thread with correct author/timestamp | `addSupportTicketMessage` server fn | Admin only |
| ADM-SUP-003 | Attach a file to a ticket | P1 | 1. Open ticket 2. Attach an image/PDF | File uploads, visible/downloadable from the thread | Storage upload + `documents` row insert is a **direct client insert** per audit — verify the uploaded file lands under the correct tenant-scoped storage path (`{tenant_id}/{property_id}/...`), not a guessable/shared path | Admin only |
| ADM-SUP-004 | Close a ticket | P2 | 1. Open ticket 2. Close it | Status → Closed, no further replies accepted (or clearly marked read-only) | `closeSupportTicket` server fn | Admin only |
| ADM-SUP-005 | Negative: oversized/wrong-type attachment | P2 | 1. Attempt to upload a file above any stated size limit, or an unexpected file type | Should be rejected with a clear message | — | Admin only |

### 3.9 Staff &amp; Granular Permissions

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-STAFF-001 | Invite a new Warden | P0 | 1. Staff → Invite 2. Enter email/phone, role=Warden 3. Send | Invite created, invitee can complete signup and gets WARDEN role assigned to correct tenant | `inviteStaff` server fn | Admin only |
| ADM-STAFF-002 | Customize a Warden's permissions | P0 | 1. Open a Warden's staff record 2. Toggle ON: Finance (specific keys), Allocations, Rooms&amp;Beds, Mess, Notices 3. Save | Grid saves; **log in as that Warden and confirm the newly granted modules actually appear/function** (don't just trust the admin-side checkbox) | `updateStaff` server fn — cross-check against `*_granular_*_permissions` tables | Admin only |
| ADM-STAFF-003 | Revoke a Warden's access | P0 | 1. Revoke a staff member | That user immediately loses access — test by having them try to load a previously-accessible page | `revokeStaff` server fn | Admin only |
| ADM-STAFF-004 | Delete a staff record | P1 | 1. Delete a revoked/inactive staff entry | Record removed/archived appropriately, no orphaned role_assignments granting access | `deleteStaff` server fn | Admin only |
| ADM-STAFF-005 | Resend invite | P2 | 1. Resend a pending invite | New invite email/SMS triggered (verify in staging only — no real send to real numbers) | `resendStaffInvite` server fn | Admin only |
| ADM-STAFF-006 | Negative: Accountant tries to grant themselves Admin-level access | P0 | 1. Log in as Accountant 2. Attempt to reach `/admin/staff` directly | Must be denied (redirect to /403) and the underlying data read must also fail at RLS, not just UI redirect | This is the core "route guard is UX-only, RLS is the real boundary" claim — verify it holds | Admin only |

### 3.10 Notices

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-NOT-001 | Compose &amp; publish a notice | P1 | 1. New Notice, select audience (e.g. all students) 2. Publish | Notice appears in Student/Parent notice feed | — | Admin only |
| ADM-NOT-002 | **[Unverified — primary target]** Does publish trigger an actual notification send? | P0 | 1. Publish a notice targeted at a test student/parent with a safe test phone/email 2. Check whether an SMS/email/push actually arrives (staging provider only) | Document exactly what happens: (a) row inserted only, no send — or (b) `send-notification` Edge Function actually fires | This was flagged Unverified in the Warden audit too — **this is the single most important thing to nail down in this whole plan**, since CLAUDE.md says notification sends must go through Edge Functions, not implicit row-insert hope | Admin only |
| ADM-NOT-003 | Schedule a notice for future publish | P2 | 1. Create notice with a future publish time 2. Confirm it does NOT appear immediately | Notice stays unpublished until the scheduled time; confirm it actually appears automatically at that time (needs a scheduled-job check) | `schedule_notice_publishing` migration | Admin only |
| ADM-NOT-004 | Edit/delete an unpublished notice | P2 | 1. Edit draft notice 2. Delete a different draft | Both succeed cleanly for drafts | — | Admin only |

### 3.11 Reports

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-REP-001 | Occupancy report matches actual bed state | P1 | 1. Open Occupancy report 2. Manually count occupied vs vacant beds from Rooms&amp;Beds | Numbers match | — | Admin only |
| ADM-REP-002 | SLA Compliance report | P2 | 1. Open SLA report for complaints | Overdue complaints flagged correctly vs. their `sla_due_at` | — | Admin only |
| ADM-REP-003 | Export a report (CSV/PDF) | P1 | 1. Export Attendance report | File downloads, contains correct/complete data for the selected range | — | Admin only |
| ADM-REP-004 | Report with empty date range | P2 | 1. Select a date range with zero records | Graceful empty state, not an error/crash | — | Admin only |

### 3.12 Settings, Subscription, Profile

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| ADM-SET-001 | Update property settings | P2 | 1. Settings → Property tab 2. Change a value 3. Save | Persists | `updatePropertySettings` server fn | Admin only |
| ADM-SET-002 | Update organization (GST entity) details | P2 | 1. Settings → Organization tab 2. Edit 3. Save | Persists | `updateOrganization` server fn | Admin only |
| ADM-SET-003 | Cancel subscription | P0 | 1. Settings → Billing 2. Cancel subscription | Subscription status changes appropriately, confirm no accidental immediate data/access loss if cancellation should be "at period end" | `cancelMySubscription` server fn — **verify this is staging-safe and does not touch a real billing provider** | Admin only |
| ADM-SET-004 | Edit own profile / change password | P2 | 1. Profile → Edit 2. Change a field / change password | Persists, new password works on next login | — | Admin only |

---

## 4. Warden Panel Checklist

> Run EVERY Warden section twice where noted: once as "Warden — default permissions" and once as
> "Warden — customized permissions" (see Test Data Guide #4/#5). This is the single most important
> structural difference in Warden testing — a feature "not visible" to default-Warden is not a bug.

### 4.1 Daily Brief Dashboard

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-BRIEF-001 | KPI tiles match real data | P1 | 1. Log in as Warden 2. Note Active/Present/Absent/Pending Complaints/Pending Gate Pass/Visitors-Today tiles | Each matches a manual count from the respective list page | — | Warden (any permission level — brief is unconditional) |
| WRD-BRIEF-002 | **[Risk]** Error state on data-load failure | P2 | 1. Simulate offline/failed request while Brief loads | Should show error, not silently show 0 as if accurate | Same silent-zero risk noted for Admin attendance | Warden |
| WRD-BRIEF-003 | Quick action links go to the right place | P3 | 1. Click each quick-action (Mark Attendance, View Complaints, Approve Gate Pass, Publish Mess Menu) | Each navigates correctly AND respects that Warden's own permissions (e.g. if Mess isn't granted, the link should not silently 404 or crash) | — | Warden |

### 4.2 Students

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-STU-001 | View student list (default perms) | P1 | 1. Log in as default-permission Warden 2. Open Students | List visible (Students is a default-ON module) | — | Warden (default) |
| WRD-STU-002 | Create/Delete buttons respect granted permission | P1 | 1. As default-Warden, check for Create/Delete student actions 2. Repeat as customized-Warden with those grants | Create/Delete should be absent/disabled for default-Warden unless explicitly granted, present for customized-Warden if granted | `canCreate`/`canDelete` derived from actual permission, not hardcoded | Permission-gated |
| WRD-STU-003 | Edit a student profile | P1 | 1. Open student detail 2. Edit (if `students_edit` granted) | Saves correctly | `StudentProfileEditDialog` | Permission-gated |
| WRD-STU-004 | **[Confirmed gap — verify, don't "fix"]** Attempt move-out as Warden | P1 | 1. Open an ACTIVE student as Warden 2. Look for a Move-out action/route | Per the audit, no move-out route exists for Warden at all — confirm this is actually the case in the live UI, and confirm it's an intentional design decision (Admin-only) rather than a missing feature nobody noticed | — | Admin only (expected) |
| WRD-STU-005 | "Change stay" (bed change) — functional check | P0 | 1. As Warden with allocation-edit rights, change a student's bed via "Change stay" | Bed updates correctly, old bed freed, new bed occupied | **Primary verification target**: audit found this is a raw `.update()`, not the atomic swap RPC — specifically test concurrent/rapid double-submission (see WRD-STU-006) | Permission-gated |
| WRD-STU-006 | **[Risk]** Race condition on "Change stay" | P0 | 1. Open the same student's "Change stay" dialog in two browser tabs 2. In both, select the SAME target bed 3. Submit both within 1-2 seconds of each other | Only one should succeed; the other should get a clear "bed no longer available" error — NOT both silently succeed, leaving two students on one bed | This is the exact race condition the audit flagged as possible given no RPC guard | Permission-gated |

### 4.3 Allocations &amp; Rooms-Beds

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-ALLOC-001 | View/create allocation (if granted) | P1 | 1. As customized-Warden with `allocations_create`, allocate a vacant bed | Succeeds same as Admin's equivalent flow | Shared `AllocationBoard` component | Permission-gated |
| WRD-ALLOC-002 | Allocations hidden for default-Warden | P1 | 1. As default-Warden, confirm Allocations does not appear in sidebar | Not present | — | Permission-gated |
| WRD-RB-001 | **[Primary verification target]** Rooms &amp; Beds route access | P0 | 1. As ANY Warden (default or customized) with `rooms_beds_create` permission, manually navigate to `/warden/rooms-beds` by typing the URL directly (it has no nav link) | Page loads and is fully functional despite having no sidebar/bottom-nav/more-sheet entry anywhere | This is the "hidden route" flagged in the audit — confirm it with your own eyes, then raise with your dev whether this is intentional (soft-launch) or an oversight (forgotten nav wiring) | Permission-gated, but **ask your dev to clarify intent** before treating missing-nav as a bug |
| WRD-RB-002 | Rooms &amp; Beds denied without permission | P1 | 1. As a Warden WITHOUT `rooms_beds_create`, navigate to `/warden/rooms-beds` directly | Should be denied/redirected, not silently shown a broken page | — | Permission-gated |

### 4.4 Attendance

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-ATT-001 | Mark bulk attendance for today | P0 | 1. As Warden (default perms — Attendance is default-ON), mark Present/Absent/Late with remarks | Saves via `bulkMarkAttendance`, reflected in Daily Brief tiles | — | Warden (default) |
| WRD-ATT-002 | Negative: future-date attendance blocked | P1 | 1. Attempt to select a future date | Blocked client-side; confirm server-side too if possible | — | Warden |
| WRD-ATT-003 | **[Confirmed gap — verify]** No delete option for Warden | P1 | 1. Open an existing attendance record as Warden | Confirm there is genuinely no delete button/action available (unlike Admin) | Matches audit finding — verify it holds in the live UI | Admin-only delete (expected) |

### 4.5 Gate Pass, QR Scan, Visitors

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-GATE-001 | Approve a gate pass pending Warden decision | P0 | 1. Open a PENDING_WARDEN gate pass 2. Approve | Status updates, approval chain (`gate_pass_approvals`) shows Warden step completed | `decideGatePass({role:"WARDEN"})` server fn | Warden (default-ON) |
| WRD-GATE-002 | Reject a gate pass | P1 | 1. Open a pending pass 2. Reject with reason | Status → Rejected, reason recorded | Same server fn, different decision | Warden |
| WRD-GATE-003 | Parent-approval-first flow respected | P0 | 1. Create a gate pass that requires parent approval first 2. As Warden, attempt to approve BEFORE parent has approved | Should be blocked or clearly show "waiting on parent" — Warden approval must not bypass a required parent step | This tests the actual approval-chain ordering, not just the final state | Order-dependent |
| WRD-GATE-004 | Negative: duplicate gate-pass request | P2 | 1. Submit a second active request for the same student while one is already pending | Should be prevented or clearly flagged as duplicate, not silently create two open passes | — | — |
| WRD-GATE-005 | QR scan — valid pass | P1 | 1. Use camera scanner (or manual Pass ID+token entry) on a valid approved pass | Check-in/out recorded correctly, `gate_events` row created | `scanGatePass` server fn | Warden |
| WRD-GATE-006 | QR scan — invalid/expired/already-used token | P1 | 1. Scan an already-used or expired pass | Clear rejection message, no duplicate entry recorded | — | Warden |
| WRD-GATE-007 | Register a new visitor | P2 | 1. Visitor tab → Register new visitor with details | Visitor record created, status "expected" or "checked in" per flow | `createVisitor` server fn | Warden |
| WRD-GATE-008 | Visitor check-in / check-out | P2 | 1. Check in a registered visitor 2. Later check them out | Timestamps recorded correctly for both | `checkVisitor` server fn | Warden |
| WRD-GATE-009 | Live feed reflects recent entries/exits | P2 | 1. After a scan/check-in, open Live Feed tab | New event appears promptly | `gate_events` read | Warden |

### 4.6 Complaints

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-COMP-001 | View assigned/unassigned complaints | P1 | 1. As Warden (default-ON), open Complaints | List shows complaints relevant to this property, correctly scoped | — | Warden (default) |
| WRD-COMP-002 | Resolve a complaint | P1 | 1. Open assigned complaint 2. Add `resolution_summary` 3. Resolve | Status updates, `resolved_by` = warden's user id | **Direct client update** per audit — same cross-property risk check as ADM-COMP-005, run the equivalent cross-property negative test here too | Permission-gated |
| WRD-COMP-003 | Reopen a complaint | P1 | 1. Reopen a resolved complaint with reason | Status → Reopened | — | Permission-gated |
| WRD-COMP-004 | Anonymous complaint identity hidden | P2 | 1. Open an anonymous complaint | Student identity masked (EyeOff icon / hidden name) | — | Permission-gated |
| WRD-COMP-005 | Add a comment to a complaint | P2 | 1. Add a comment via `ComplaintCommentThread` | Comment appears with correct author/timestamp | — | Permission-gated |

### 4.7 Mess

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-MESS-001 | Create &amp; publish a mess menu (if granted) | P1 | 1. As customized-Warden with Mess permission, create a new menu | Menu + items saved, visible to students | **Direct client CRUD per audit — no server fn at all for Mess.** Verify RLS still correctly scopes this write to the Warden's own property/tenant. | Permission-gated |
| WRD-MESS-002 | Edit an existing menu | P1 | 1. Edit a published menu's items | Old items replaced correctly (delete-reinsert pattern per audit) — confirm no duplicate/orphaned items left behind | — | Permission-gated |
| WRD-MESS-003 | Delete a menu | P1 | 1. Delete a menu | Removed cleanly, no dangling headcount/feedback references causing errors elsewhere | — | Permission-gated |
| WRD-MESS-004 | Record headcount | P2 | 1. Enter a headcount for a meal | Saved, visible in summary | — | Permission-gated |
| WRD-MESS-005 | View student feedback | P2 | 1. Open Mess feedback view | Student ratings/comments display correctly | Read from `mess_feedback` | Permission-gated |
| WRD-MESS-006 | Mess hidden for default-Warden | P1 | 1. As default-Warden (no Mess grant), confirm no Mess access/nav entry | Not present | — | Permission-gated |

### 4.8 Notices

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-NOT-001 | Compose &amp; publish notice (if granted) | P1 | 1. As Warden with Notices permission, publish a notice | Appears in student/parent feed | `NoticeComposer` shared component | Permission-gated |
| WRD-NOT-002 | **[Unverified — same as ADM-NOT-002]** Does Warden's publish trigger an actual send? | P0 | 1. Same verification as ADM-NOT-002, run from the Warden side too | Document actual behavior | — | Permission-gated |

### 4.9 Finance (permission-gated)

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-FIN-001 | Finance landing shows only granted sub-features | P1 | 1. As default-Warden, open Finance | "Access denied" with a hint to contact Hostel Admin, since no finance keys are default-ON | — | Permission-gated per key |
| WRD-FIN-002 | Finance landing with specific keys granted | P1 | 1. As customized-Warden with e.g. `invoices_view`+`payments_create` only | Only those cards are enabled, others still show denied | Verify granularity is per-key, not all-or-nothing | Permission-gated |
| WRD-FIN-003 | Record a payment (if `payments_create` granted) | P1 | 1. Record a manual payment against an invoice | Succeeds identically to Admin's equivalent flow | — | Permission-gated |
| WRD-REFUND-001 | Submit a refund request | P0 | 1. As Warden with refund-submit access, submit a refund request with reason | Request created in pending/awaiting-approval state | `RefundRequestForm` | Permission-gated (submit only) |
| WRD-REFUND-002 | **[Maker-checker — critical]** Warden attempts to approve a refund | P0 | 1. As Warden, try to find/trigger an "approve" action on ANY refund request (own or others') — check UI for the action, and if found, attempt it | Must be impossible — code comment explicitly says refund-approval is Admin-only. If a Warden can approve (even their own submitted request), this is a **P0 security finding** | Confirm both UI absence AND backend rejection if you can test the underlying call directly | Must be denied |

### 4.10 Reports, Activity, Profile

| TC ID | Feature | Priority | Steps | Expected Result | Backend/Data Check | Permission |
|---|---|---|---|---|---|---|
| WRD-REP-001 | Attendance report export allowed | P2 | 1. Export Attendance report as Warden | Succeeds | — | Warden |
| WRD-REP-002 | Occupancy/SLA export restricted | P2 | 1. Attempt to export Occupancy or SLA report as Warden | Export button should be absent/disabled (`showExport={false}` per audit) — confirm this holds in the live UI | — | Restricted for Warden |
| WRD-PROF-001 | View activity log | P3 | 1. Open Activity page | Recent actions list correctly | `useRecentActivity` | Warden |
| WRD-PROF-002 | Edit profile / change password | P3 | 1. Edit profile fields 2. Change password | Persists, login works with new password | — | Warden |

---

## 5. Cross-Role &amp; Security Checklist

> Run each applicable row once per role listed. Mark **"Needs Investigation"** (not "Pass") for any
> case where you only confirmed UI-hiding and could not confirm the backend/RLS check — client-side
> hiding is explicitly NOT sufficient evidence per the audit's own caution.

| TC ID | Test | Roles to try | Expected | Notes |
|---|---|---|---|---|
| XR-001 | Direct URL access to `/admin/*` as non-Admin | Warden, Accountant, Student, Parent | Redirect to `/403`, AND the underlying data query must also fail (check Network tab for a 4xx/empty-due-to-RLS response, not just a client redirect) | Route guards are UX-only per CLAUDE.md — this is the core thing to verify |
| XR-002 | Direct URL access to `/warden/staff`-equivalent admin-only pages | Warden (even customized) | Denied | Warden's permissions never include staff management |
| XR-003 | Direct URL access to `/warden/rooms-beds` without the specific permission | Warden (default) | Denied/blocked despite the route technically existing | Confirms permission (not just role) gates this hidden route |
| XR-004 | Accountant attempts a Finance mutation outside their granted scope | Accountant | Denied for ungranted actions, allowed for granted ones | Compare against `accountant_granular_operational_permissions` |
| XR-005 | Student attempts to view another student's profile/invoices by guessing/changing an ID in the URL | Student | Denied — self-access only | Core self-only rule for Student role |
| XR-006 | Parent attempts to view a student they are NOT linked to via `student_guardians` | Parent | Denied | Never infer access from same-property/surname/phone per CLAUDE.md |
| XR-007 | Parent with `portal_access_enabled=false` or `unlinked_at` set attempts access to their (formerly) linked student | Parent | Denied | Tests the exact relationship-gating condition, not just existence of a link row |
| XR-008 | Cross-tenant data access — Tenant-A user attempts to reach Tenant-B's data by ID manipulation | Admin, Warden, Accountant | Denied for all | Use your two separate test tenants (Test Data #1/#2) |
| XR-009 | Refund maker-checker across roles | Warden (submit), Admin (approve) | Submit succeeds for Warden, approve succeeds for Admin, approve fails for Warden (incl. on their own request) | Combines WRD-REFUND-001/002 + ADM-REFUND-001/002 into one cross-check |
| XR-010 | Expired/invalid auth token | Any | Should force re-login, not silently fail or show stale cached data as current | Simulate by letting a session sit idle past token expiry, or manually clearing the session token in DevTools and reloading |
| XR-011 | Direct server-function call bypassing the UI (if you have API-testing tooling like Postman/curl with a captured request) | Student calling an Admin-only server fn (e.g. `inviteStaff`) with their own valid Student JWT | Server-side rejection, not just UI absence | This is the strongest possible test of "RLS/middleware is the real boundary" — needs a teammate comfortable replaying requests; mark Blocked if no tooling available |
| XR-012 | Property-level scoping for multi-property tenants | Admin, Warden | Each user only sees/affects their assigned property's data, even within the same tenant | Relevant wherever `has_property_access()` is the stated RLS mechanism |

---

## 6. Finance &amp; Data-Integrity Checklist

| TC ID | Test | Priority | Steps | Expected | Notes |
|---|---|---|---|---|---|
| FIN-001 | Invoice total = sum of fee-plan components | P0 | Compare a created invoice's total against its component line items | Must match exactly (in paise) | Float/rounding bugs would show here |
| FIN-002 | Invoice balance after partial payment | P0 | balance = invoice total − sum(payments) | Must reconcile | Already covered as ADM-PAY-002, re-verify as a pure data-integrity check |
| FIN-003 | Revenue/PnL summary reconciles with payments ledger | P0 | Sum raw `payments` rows for a date range vs. displayed summary | Must match | Already covered as ADM-FIN-001 |
| FIN-004 | Refund reduces the correct ledger/deposit entry | P1 | After an approved refund, check `deposit_ledger_entries` or payment records reflect it | Must show the refund distinctly, not overwrite history | Relevant migration: `deposit_ledger_credit_and_refund_fix` |
| FIN-005 | Voided invoice excluded from outstanding totals | P1 | Void an invoice, recheck any "total outstanding" figure | Voided amount must not count | — |
| FIN-006 | No currency stored as float/text anywhere visible | P2 | Spot-check displayed amounts for rounding artifacts (e.g. ₹999.9999999) | Should always be clean 2-decimal INR display | Backed by paise-storage rule — rounding bugs at the display layer are still worth catching |
| FIN-007 | Payment idempotency under replay | P0 | See ADM-PAY-004 | No duplicate payment from a replayed/duplicate webhook event | Requires staging webhook access |
| FIN-008 | No card data ever stored/displayed | P0 | Review any payment-related screen/record for full PAN/CVV | Must never appear — Razorpay handles card data, Hostylia should never store it | Quick compliance check |

---

## 7. Priority-Wise Test Execution Order

Follow this order — later stages assume earlier ones are stable. Don't jump to Stage 8 (negative/edge)
before Stage 3-4 (happy-path) pass, since a broken happy path makes negative-test results meaningless.

1. **Stage 1 — Environment &amp; test-account readiness** (Section 1.3 + Section 2)
2. **Stage 2 — Login, role access, navigation smoke test**: log in as each of the 6 test accounts once,
   confirm correct landing page and visible nav items per role/permission level.
3. **Stage 3 — Basic Admin workflows (happy path only)**: ADM-PROP-001/004/005, ADM-STU-001/003/004,
   ADM-ALLOC-001, ADM-ATT-001, ADM-FEE-001, ADM-INV-001, ADM-PAY-001, ADM-COMP-002, ADM-STAFF-001/002.
4. **Stage 4 — Basic Warden workflows (happy path only)**: WRD-BRIEF-001, WRD-STU-001, WRD-ATT-001,
   WRD-GATE-001/005, WRD-COMP-002.
5. **Stage 5 — Finance &amp; allocation workflows (deeper)**: all remaining ADM-FEE/ADM-INV/ADM-PAY,
   ADM-REFUND-*, WRD-FIN-*, WRD-REFUND-*, ADM-ALLOC-002/003/004, WRD-STU-005/006.
6. **Stage 6 — Complaints, Gate Pass, Mess, Notices**: remaining ADM-COMP/WRD-COMP, WRD-GATE-002..009,
   WRD-MESS-*, ADM-NOT-*/WRD-NOT-* (prioritize ADM-NOT-002/WRD-NOT-002 — the notification-send
   verification — early in this stage since it informs several other "did a notification fire"
   assumptions elsewhere).
7. **Stage 7 — Reports &amp; data consistency**: ADM-REP-*, WRD-REP-*, FIN-001..008.
8. **Stage 8 — Negative &amp; edge cases**: every "Negative:"/"Edge case:"/"[Risk]" labeled row across
   Sections 3-4 not already covered above.
9. **Stage 9 — Cross-role authorization &amp; tenant isolation**: all of Section 5.
10. **Stage 10 — Regression &amp; final sign-off**: re-run Stage 3-4 happy paths once more after all bug
    fixes from this round are applied, then complete the Final Testing Summary (Section 9).

---

## 8. Bug Report Template

Copy this block for every Fail/Needs-Investigation finding:

```
### BUG-[sequential number]: [one-line summary]

- **Test Case ID**: 
- **Module**: Admin / Warden / Cross-Role / Finance
- **Severity**: Critical (P0) / High (P1) / Medium (P2) / Low (P3)
- **Affected Role(s)**: 
- **Environment**: staging / which tenant / which browser

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Result**:


**Actual Result**:


**Evidence**: (screenshot filename / screen-recording link / Network-tab request-response if relevant)

**Additional Notes**: (e.g. "only reproduces on double-click", "only affects default-permission Warden")
```

---

## 9. Final Testing Summary Template

Fill this in once all stages are complete:

```
# Manual Test Run Summary — [date]

Tester: 
Environment: staging project ref ___ / commit or branch ___

## Totals
- Total test cases defined in plan: ___
- Not Run: ___
- Pass: ___
- Fail: ___
- Blocked: ___
- Needs Investigation: ___

## By Module
| Module | Total | Pass | Fail | Blocked | Needs Investigation |
|---|---|---|---|---|---|
| Admin Panel | | | | | |
| Warden Panel | | | | | |
| Cross-Role & Security | | | | | |
| Finance & Data Integrity | | | | | |

## Critical (P0) Fails — must fix before any production use
1. 

## Needs-Investigation items still unresolved (hand to dev for a code-level answer)
1. 

## Sign-off
- [ ] All P0 cases Pass or have a tracked fix ticket
- [ ] All "Unverified"/"Needs Investigation" items from the original audits are now resolved one way or the other
- [ ] No test data / dummy records left in a shared staging environment that could confuse future testers
```

---

## Final Notes for the Tester

- This plan intentionally does **not** mark anything as pre-verified "Pass" — every row starts at
  `Not Run`. Where the underlying code audit found strong evidence a feature works, the test still
  exists here because *code reading ≠ runtime behavior*.
- Rows marked **[Risk]**, **[Unverified — primary target]**, or **[Confirmed gap]** came directly
  from the two prior audits' open questions — treat these as the highest-value 20% of this plan if
  you're time-constrained and can't run everything.
- Do not mark any P0 money/security case as "Pass" from UI appearance alone if a "Backend/Data Check"
  column is specified — actually check it, or mark "Needs Investigation" instead.
