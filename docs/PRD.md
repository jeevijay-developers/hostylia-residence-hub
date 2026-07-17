# Hostylia — Product Requirements Document (PRD)

**Product:** Hostylia — Hostel & PG Management Platform
**Company:** Jeevijay Technologies Private Limited
**Document version:** 2.1 (Simplified role model; tenancy + stack alignment)
**Last updated:** July 15, 2026
**Status:** Living document (v1 scope defined)
**Owner:** Product Team

> **What changed from v1.0:** This version replaces the 14-role, vendor/trustee/alumni-inclusive model with a **6-role model** validated against real-world PG/hostel/coaching-hostel SaaS products (RentOk, Crib, Zolo, Stanza Living, SpaceBasic, MasterSoft, Cloudbeds). The rationale for every cut and every kept role is in **Sec. 4.3** and **Appendix A**.

---

## 1. Executive Summary

Hostylia is a cloud-based hostel & PG management platform built for **coaching-institute hostels, PGs, and small-to-mid dormitory operators in India**. It unifies **property management, student lifecycle, fee collection, complaints, gate pass/attendance, and parent communication** into a single platform, run by a lean set of six roles instead of a sprawling permission matrix.

The platform is delivered as a **mobile-responsive web application** — no native mobile apps. Every screen (hostel admin dashboards, warden operations, student portal, parent view) is designed to feel like a native app on phones while providing full desktop density for admins.

**Positioning:** "The simplest way to run a hostel — from one building to a chain."

**Design philosophy for this version:** ship the smallest role set that matches how real hostels are actually staffed and run today, backed by comparative research on commercial products (see Appendix A). Add complexity only when adoption data demands it, not upfront.

---

## 2. Goals & Success Metrics

### 2.1 Product Goals
1. Replace 4+ tools (spreadsheets, WhatsApp, accounting, complaint email) with one platform.
2. Push on-time fee collection above 92%.
3. Reduce warden daily admin from 45 min → under 10 min.
4. Give parents visibility into safety and payments — zero-call operations.
5. Let a single Hostel Admin run an entire property without needing extra staff logins.

### 2.2 KPIs (North-Star + Supporting)
| Metric | Target | Category |
|---|---|---|
| On-time fee collection | ≥ 92% | Finance |
| Days Sales Outstanding (DSO) | ≤ 7 days | Finance |
| Warden daily time on Hostylia | ≤ 10 min | Operations |
| Complaint SLA compliance | ≥ 90% | Operations |
| Parent NPS | ≥ 60 | Communication |
| Occupancy accuracy vs physical audit | ≥ 99% | Data quality |
| Uptime | ≥ 99.9% | Platform |
| Time-to-first-value (signup → first invoice sent) | ≤ 1 day | Onboarding |
| % hostels operating with Admin-only (no extra staff seats) | Tracked, not targeted | Adoption insight |

---

## 3. Target Users & Personas

| Persona | Primary need | Key device |
|---|---|---|
| **Hostel Admin (Owner)** | Full property control: config, revenue, staff, students | Desktop + mobile |
| **Accountant** *(optional seat)* | Fee reconciliation, receipts, dues reports | Desktop |
| **Warden** | Attendance, complaints, gate pass, mess, notices | Mobile-first |
| **Student / Resident** | Fees, complaints, gate pass, mess menu | Mobile-first |
| **Parent / Guardian** | Payments, attendance, safety alerts | Mobile-first |
| **Super Admin (Hostylia internal)** | Tenant provisioning, subscriptions, MRR/churn, support access | Desktop |

Five roles run the hostel; one role runs the business (Hostylia itself). This mirrors the two-tier pattern used by RentOk and Crib (operator + tenant) extended with Accountant and Parent, which research shows are the two additions that matter specifically for the coaching-institute/PG segment (see Appendix A, Finding 1–2).

---

## 4. User Roles

### 4.1 Complete Role List (v1)

| # | Role | Scope | Tenancy | Can see hostel revenue? |
|---|---|---|---|---|
| 1 | **Super Admin** | Global (Hostylia staff) — provisioning, billing, tenancy, support/impersonation | All tenants | N/A (sees SaaS revenue, not hostel P&L) |
| 2 | **Hostel Admin** | One or more properties — full control | Property-scoped (multi-property if chain) | Yes — full |
| 3 | **Accountant** | Fees, invoices, refunds, receipts | Property-scoped | Yes — finance view only |
| 4 | **Warden** | Day-to-day operations for assigned block(s)/property | Property or block-scoped | No (unless granted) |
| 5 | **Student / Resident** | Self only | Self | View own dues only |
| 6 | **Parent / Guardian** | Their child(ren) only | Linked students | View child's dues only |

That's it. No Support Agent (merged into Super Admin), no Security Guard, no Mess/Kitchen Staff, no Maintenance Staff, no Vendor, no Alumni, no Trustee/Board as system roles — see Sec. 4.3.

### 4.2 What each role actually does

**Super Admin (Hostylia internal — merges former "Support Agent")**
- Onboard/offboard hostel tenants; manage subscription plans, billing status, MRR/churn dashboard.
- Impersonate any tenant account for support (time-boxed, consent-logged, audit-visible — same safeguard as v1.0).
- Global feature-flagging per tenant/plan tier.
- No involvement in day-to-day hostel operations.

**Hostel Admin (Owner)** — the one role that "wears all hats," matching how solo/small operators actually run PG and hostel properties today (Appendix A, Finding 3):
- Property setup: rooms, blocks, floors, beds, pricing, amenities, branding.
- Full revenue visibility: P&L, collections, dues, aging reports.
- Staff management: invite/remove Wardens and Accountants, reset access.
- Everything an Accountant or Warden can do, since in solo-operator hostels the Admin *is* the accountant and the warden. Accountant and Warden seats are **optional additions**, not mandatory separate people.
- Approves refunds, waivers, and discounts above threshold (maker-checker retained for these financial actions only).

**Accountant** *(optional, lightweight, finance-only)*
- Configure fee plans; generate/view invoices; record cash/cheque payments; issue receipts.
- View aging/DSO reports, GST invoicing.
- Cannot edit property structure, cannot manage staff, cannot see/edit non-finance student data.
- Exists as a role because coaching-institute hostels frequently do delegate finance to a bookkeeper distinct from the Admin — this is the one place research supports keeping a dedicated role rather than folding it into Admin (Appendix A, Finding "single Admin" caveat).

**Warden** — absorbs what used to be three separate roles (Security Guard, Mess/Kitchen Staff, Maintenance triage), delivered as *modules* the Warden operates, not separate logins (Appendix A, Finding 2 & 5):
- Attendance (bulk, per-room).
- Complaints: triage, assign, track SLA, close.
- Gate pass / out-pass approval and QR issuance (replaces a standalone Security Guard role — the Warden or a front-desk device running the Warden login scans QR at the gate).
- Mess menu, headcount, and feedback (replaces a standalone Mess Staff role).
- Notices/broadcast to students and parents.
- No revenue visibility by default.

**Student**
- View/pay fees, raise complaints, apply for gate pass, view mess menu and notices.

**Parent**
- View child's attendance, gate events, fee status, complaint tracker.
- Pay fees on behalf of child; co-approve gate passes for minors.
- Message warden directly.

### 4.3 Roles cut from v1.0 — and why

| Cut role | Where its function goes | Why it's cut |
|---|---|---|
| Support Agent | Merged into Super Admin | At current scale, one internal role covering both provisioning and support avoids maintaining two near-identical global roles (per your decision). |
| Security Guard | Gate/visitor module under Warden | No commercial PG platform researched (RentOk, Crib, Zolo, Stanza) ships a distinct guard login; it's a feature, not a role (Appendix A, Finding 3). Revisit only if multi-block campus deployments demand a front-desk-only login. |
| Mess / Kitchen Staff | Mess module under Warden | Same rationale — mess is consistently a module, not a role, across every product researched. |
| Maintenance Staff | Complaint assignment under Warden (or informal delegation outside the system) | Removing the separate assignee role removes a whole tier of ticket-routing logic with no evidence it's needed at this stage. |
| Vendor (external) | Cut entirely | Confirmed cut per product decision; no vendor portal, no vendor tickets. |
| Alumni (read-only archive) | Cut entirely | Confirmed cut; students simply become inactive/archived records, admin-visible only. |
| Trustee / Board Member | Cut entirely | Confirmed cut; not part of the target market (small-to-mid coaching-institute hostels/PGs) and absent from every comparable product researched. |
| Finance/Accountant as sub-role of Prop Admin | Promoted to its own lightweight role | Per your decision — kept separate because it's a real, common delegation pattern, unlike guard/mess/maintenance. |

> **Reintroduction trigger:** if >30% of prospective customers are large multi-block campuses (not solo/small coaching hostels), reconsider promoting Warden's gate and mess functions back into distinct roles, per Appendix A's "benchmarks that would change this."

---

## 5. Property Hierarchy & Data Model

### 5.1 Hierarchy
```
Tenant (Hostylia billing account / customer)
└── Organization (Legal entity — GSTIN, billing identity)
    └── Property (Hostel / PG Building)
        └── Block (Wing / Tower) [optional — small properties can skip this level]
            └── Floor
                └── Room (Type: Single / Double / Triple / Dorm)
                    └── Bed
```

**Tenant vs. Organization.** These are deliberately separate. A **Tenant** is the Hostylia customer/billing account — it carries subscription state (`TRIAL` / `ACTIVE` / `PAST_DUE` / `SUSPENDED`) and onboarding status, and is what Super Admin manages. An **Organization** is the legal business entity beneath it (GSTIN, PAN, registered address, billing email) — what appears on a GST invoice. Keeping them separate lets SaaS billing state and hostel GST identity evolve independently, and allows a single customer to hold more than one legal entity if a chain ever requires it. Most small operators will have exactly one Organization per Tenant.

### 5.2 Core Entities

| Entity | Key fields | Relationships |
|---|---|---|
| Tenant | slug, status (TRIAL/ACTIVE/PAST_DUE/SUSPENDED), onboarding_status | 1 → n Organization; owns Subscription |
| Organization | legal name, GSTIN, PAN, registered address, billing email | belongs to Tenant; 1 → n Property |
| Plan | name, tier, price, bed/seat limits, feature entitlements | referenced by Subscription |
| Subscription | plan, status, current period, seats/beds | belongs to Tenant; references Plan |
| Property | name, address, amenities, rules, cover photos | belongs to Org; 1 → n Block |
| Block | name, assigned warden(s), gender policy | belongs to Property; 1 → n Floor |
| Floor | number, layout | belongs to Block; 1 → n Room |
| Room | number, type, rent, amenities | belongs to Floor; 1 → n Bed |
| Bed | code, status (vacant/occupied/blocked/maintenance) | belongs to Room; 0 → 1 active Allocation |
| Student | name, DOB, gender, KYC, guardians, academic info | belongs to Property; 0…1 active Allocation |
| Guardian / Parent | name, phone, email, relation, portal access | n → n Student |
| Allocation | student, bed, start/end date, rent snapshot, deposit | Student ↔ Bed |
| FeePlan | period, components (rent, mess, deposit, one-off) | Property |
| Invoice | student, period, line items, due date, status | Student, FeePlan |
| Payment | amount, mode (UPI/cash/card/netbanking/cheque), gateway ref | Invoice(s) |
| Refund | reason, amount, mode, approver | Payment |
| Complaint | title, category, priority, room/bed, media, SLA | Student, Warden (assignee) |
| GatePass / OutPass | student, out-time, expected in, reason, approver | Student, Warden |
| GateEvent | student/visitor, direction (in/out), method (QR/manual) | Property |
| Visitor | name, phone, purpose, host student, ID proof | Student |
| Notice | title, body, audience, channels (in-app/SMS/WhatsApp) | Property |
| MessMenu | date, meal, items, headcount, feedback | Property |
| Attendance | date, student, status (present/absent/on-leave) | Student |
| Document | type (agreement, KYC, invoice), URL, acceptance record (accepted_at, IP, user-agent, hash) | Student / Allocation |
| AuditLog | actor, action, entity, before/after, timestamp | Global |
| Role & Permission | role, resource, action | Tenant / Property |

**Simplification note:** MaintenanceTicket is folded into Complaint (no separate vendor-facing entity); no Trustee/Board or Alumni entities exist in the schema.

### 5.3 Data model diagram (simplified)
```text
Org ── Property ──┬─ Block ── Floor ── Room ── Bed
                   ├─ FeePlan ── Invoice ── Payment ── Refund
                   ├─ Complaint / GatePass / GateEvent / Visitor
                   └─ Notice / MessMenu / Attendance

User ──┬─ Role (Super Admin / Hostel Admin / Accountant / Warden / Student / Parent)
       ├─ Student ── Guardian
       └─ Allocation (Student ↔ Bed)
```

---

## 6. Feature Inventory

Legend: **[S] v1 Ship** · **[F] Fast-follow (Stage 2)** · **[R] Roadmap (Stage 3)**

### 6.1 Property Management
| # | Feature | Status |
|---|---|---|
| 6.1.1 | Property tree (Org → Property → Block → Floor → Room → Bed), Block optional for small properties | S |
| 6.1.2 | Bulk room/bed import (CSV) | S |
| 6.1.3 | Amenities, rules, photo gallery per property | S |
| 6.1.4 | Property-level branding (logo, colors) | S |
| 6.1.5 | Multi-property roll-up dashboard for Hostel Admin (chains) | S |
| 6.1.6 | Public listing microsite (SEO page per property) | F |
| 6.1.7 | Occupancy heatmap by block/floor | R |

### 6.2 Student Lifecycle
| # | Feature | Status |
|---|---|---|
| 6.2.1 | Digital admission form (public link) | S |
| 6.2.2 | KYC upload + document vault | S |
| 6.2.3 | Room/bed allocation with one-tap swap | S |
| 6.2.4 | Digital boarding agreement + click-wrap acceptance (accepted_at, IP, user-agent, document hash) | S |
| 6.2.4a | Aadhaar eSign / DSC (legally-binding signature) | F |
| 6.2.5 | Lock-in / notice period tracking | S |
| 6.2.6 | Move-out workflow with refund calculation | S |
| 6.2.7 | Bulk admission import | S |
| 6.2.8 | Archive on move-out (replaces separate Alumni role — just an inactive student record, Admin-visible) | S |
| 6.2.9 | Waitlist management | F |
| 6.2.10 | Medical/dietary flags on student profile | F |

### 6.3 Finance & Fees
| # | Feature | Status |
|---|---|---|
| 6.3.1 | Configurable fee plans (monthly/quarterly/one-off) | S |
| 6.3.2 | Auto-invoice generation on due date | S |
| 6.3.3 | UPI, card, netbanking payments (Razorpay or equivalent gateway) | S |
| 6.3.4 | Cash/cheque entry with receipt (Admin or Accountant) | S |
| 6.3.5 | Auto-receipts (PDF + WhatsApp + email) | S |
| 6.3.6 | GST invoicing | S |
| 6.3.7 | Fee reminders (SMS/WhatsApp/email/in-app) | S |
| 6.3.8 | Aging reports (0-30, 31-60, 60+) | S |
| 6.3.9 | Owner P&L per property | S |
| 6.3.10 | Discounts/waivers with Admin approval | S |
| 6.3.11 | Refunds with maker-checker (Accountant initiates, Admin approves) | S |
| 6.3.12 | Deposit ledger + auto-adjustment on move-out | S |
| 6.3.13 | Split payments (parent + student share) | F |
| 6.3.14 | Bank auto-reconciliation | R |
| 6.3.15 | Tally/Zoho Books/QuickBooks export | R |

### 6.4 Operations (Warden Toolkit — now includes gate & mess)
| # | Feature | Status |
|---|---|---|
| 6.4.1 | Digital attendance (bulk, per-room) | S |
| 6.4.2 | Mess menu + weekly planner, headcount | S |
| 6.4.3 | Notice board + multi-channel broadcast | S |
| 6.4.4 | Feedback surveys (mess, cleanliness, warden) | S |
| 6.4.5 | QR-based gate pass / out-pass with approval | S |
| 6.4.6 | Entry/exit logs, instant parent SMS on gate event | S |
| 6.4.7 | Late entry/curfew alerts | S |
| 6.4.8 | Visitor management (photo + ID + host approval) | S |
| 6.4.9 | Emergency alert (panic button) | S |
| 6.4.10 | Food waste analytics | F |
| 6.4.11 | Face recognition / biometric at gate | R |

### 6.5 Complaints
| # | Feature | Status |
|---|---|---|
| 6.5.1 | Student-raised complaints with photos | S |
| 6.5.2 | Category taxonomy + SLA per category | S |
| 6.5.3 | Assignment to Warden (no separate maintenance-staff role) | S |
| 6.5.4 | Ratings on resolution + reopen flow | S |
| 6.5.5 | Preventive maintenance scheduling | R |

### 6.6 Parent Experience
| # | Feature | Status |
|---|---|---|
| 6.6.1 | Parent portal (mobile-first web) | S |
| 6.6.2 | Live fee dues + one-tap payment | S |
| 6.6.3 | Attendance & gate history | S |
| 6.6.4 | Complaint tracker (their child) | S |
| 6.6.5 | Direct messaging with warden | S |
| 6.6.6 | Parent SSO via phone OTP | S |
| 6.6.7 | Multilingual support (English + Hindi at minimum) | S |
| 6.6.8 | Additional Indian languages | R |

### 6.7 Student Experience
| # | Feature | Status |
|---|---|---|
| 6.7.1 | Student portal (mobile-first web) | S |
| 6.7.2 | Fee summary + pay online | S |
| 6.7.3 | Raise complaint with photos | S |
| 6.7.4 | Apply gate pass/out-pass | S |
| 6.7.5 | View mess menu + rate meal | S |
| 6.7.6 | Notice board + web push | S |
| 6.7.7 | Room-swap request | S |
| 6.7.8 | Community board (student ↔ student) | R |

### 6.8 Platform, Integrations & Super Admin Console
| # | Feature | Status |
|---|---|---|
| 6.8.1 | Multi-tenant with property isolation | S |
| 6.8.2 | SSO via phone OTP (all roles) | S |
| 6.8.3 | Email + password login (Admin/Accountant/Warden) | S |
| 6.8.4 | Role-based access control (6 roles above) | S |
| 6.8.5 | Audit logs for every mutation | S |
| 6.8.6 | UPI/payment gateway integration (e.g., Razorpay) | S |
| 6.8.7 | SMS + WhatsApp gateway integrations | S |
| 6.8.8 | **Super Admin console:** tenant onboarding, subscription/plan management, billing status per tenant, MRR/churn dashboard, feature flags per tenant, time-boxed impersonation with audit banner | S |
| 6.8.9 | Data export per student (privacy request) | S |
| 6.8.10 | Daily backups + point-in-time recovery | S |
| 6.8.11 | Google/Microsoft SSO (staff) | R |
| 6.8.12 | Public REST API + Webhooks | R — confirmed non-essential at this stage; even category leader RentOk ships no public API (Appendix A) |
| 6.8.13 | Zapier/Make connector | R |
| 6.8.14 | BI connector (Metabase/PowerBI) | R |

### 6.9 Responsive "App-like" Web (Mobile Strategy)
> Explicit requirement: **no native app; mobile web must feel like a native app.**

| # | Requirement | Status |
|---|---|---|
| 6.9.1 | Every module usable on 375px width | S |
| 6.9.2 | Bottom nav on mobile for Student, Parent, Warden | S |
| 6.9.3 | Touch-first interactions | S |
| 6.9.4 | Camera capture (KYC, complaint photo, visitor ID) | S |
| 6.9.5 | Installable PWA with offline attendance/gate-pass QR | F |
| 6.9.6 | Web push notifications | F |

### 6.10 AI Suite — deliberately deferred
Per Appendix A (AI is consistently marketed but positioned as a differentiator, not table-stakes), all AI features move to Stage 3 roadmap rather than v1, to keep initial scope focused on the core workflow six roles need:

| # | Feature | Status |
|---|---|---|
| 6.10.1 | AI Complaint Classification | R |
| 6.10.2 | AI Fee Reminder timing/channel optimization | R |
| 6.10.3 | AI Occupancy/vacancy forecast | R |
| 6.10.4 | AI Parent Support chatbot | R |
| 6.10.5 | AI Warden morning brief | R |

---

## 7. Role → Permission Matrix (RBAC)

**Actions:** `V` view · `C` create · `E` edit · `D` delete · `A` approve · `X` export · `–` no access

| Module / Action | Super Admin | Hostel Admin | Accountant | Warden | Student | Parent |
|---|---|---|---|---|---|---|
| **Tenant / Subscription / Billing (SaaS-level)** | VCEDX | – | – | – | – | – |
| **Property (create/edit)** | VX | VCED | – | – | – | – |
| **Block/Floor/Room/Bed** | VX | VCED | V | V | – | – |
| **Student profiles** | VX | VCED | V | VE (assigned block) | V (self) | V (linked) |
| **Guardian/Parent records** | VX | VCED | V | VE | V (self) | VE (self) |
| **Allocation (assign bed)** | VX | VCED | V | VCE | – | – |
| **Move-out / Refund calc** | VX | VCEA | VCEA | VC (initiate) | VC (request) | V |
| **Fee plans / pricing** | VX | VCED | VCE | V | V (own) | V (own) |
| **Invoices** | VX | VCEDX | VCEDX | V | V (own) | V (linked) |
| **Payments (record cash)** | VX | VCE | VCE | – | – | – |
| **Online payment (pay)** | – | – | – | – | C (own) | C (linked) |
| **Refunds** | VX | VA | VCE | – | V (own) | V (linked) |
| **Discounts / waivers** | VX | VA | VCE | – | V (own) | V (linked) |
| **Attendance** | VX | VCED | V | VCED (assigned) | V (self) | V (linked) |
| **Complaints** | VX | VCEDA | V | VCEDA (assigned) | VC (self) | VC (linked) |
| **Gate pass / out-pass** | VX | VCEA | – | VCEA (assigned) | VC (self) | VA (linked) |
| **Gate events (entry/exit)** | VX | V | – | VCE | V (self) | V (linked) |
| **Visitors** | VX | VCED | – | VCE | VC (request) | – |
| **Notices** | VX | VCED | V | VCE (assigned) | V | V |
| **Mess menu** | VX | VCED | – | VCED | V | V |
| **Feedback surveys** | VX | VCED | – | V | VC (self) | VC (linked) |
| **Reports & analytics** | VX (SaaS) | VX (property) | VX (finance) | VX (assigned) | V (self) | V (linked) |
| **Users & roles (invite)** | VCED | VCED (property) | – | – | – | – |
| **Audit logs** | VX | VX (property) | VX (own) | – | – | – |
| **Data export (student PII)** | X | X (property) | X (finance) | – | X (self) | X (linked child) |
| **Impersonate user (support)** | X | – | – | – | – | – |

### 7.1 Cross-cutting rules
- **Scope enforcement:** every query is filtered by the caller's assigned property/block on the server side; the matrix above is a UI + policy layer, not the primary guard.
- **Maker–checker:** Refunds and waivers above a configurable threshold always require Hostel Admin approval, regardless of who initiates.
- **Delete = soft-delete + audit** for all business entities; hard-delete only via Super Admin runbook.
- **Impersonation** is time-boxed (max 60 min), consent-logged, and shown as a visible banner to the impersonated Hostel Admin post-session.
- **Parent access** is derived from the linked-student relationship only; parents can never see other students' data even in aggregate.
- **Hostel Admin is a superset role:** everything an Accountant or Warden can do, the Admin can also do. Accountant and Warden are opt-in seats, not required staffing.

---

## 8. Core User Journeys

### 8.1 Property onboarding (Hostel Admin, solo — no extra staff needed)
1. Admin signs up → creates Property.
2. Uploads logo, cover photos, amenities, rules.
3. Bulk-imports Blocks/Floors/Rooms/Beds via CSV (or adds manually for small properties).
4. Configures Fee Plans and connects payment gateway.
5. *(Optional)* Invites a Warden and/or Accountant if the Admin won't run ops solo.
6. Property goes live for admissions — achievable in under a day with zero additional staff logins.

### 8.2 Student admission → allocation → move-in
1. Student (or parent) fills public admission form.
2. Uploads KYC + guardian details.
3. Admin (or Warden, if delegated) verifies → allocates Bed → generates agreement.
4. Student accepts agreement (click-wrap; acceptance recorded) → deposit + first-month invoice generated.
5. On payment success, allocation becomes **active** → bed status flips vacant → occupied.

### 8.3 Monthly fee cycle
1. On Day 1 of billing cycle, invoices auto-generate per Allocation.
2. Reminder sent (in-app + SMS + WhatsApp + email).
3. Payment (UPI/card/netbanking/cash) → receipt auto-issued.
4. On due-date + N, escalation to Accountant (if present) then Admin.
5. Aging report reflects DSO live — visible to Admin and Accountant only.

### 8.4 Complaint lifecycle
1. Student raises complaint with photo.
2. Auto-assigned to Warden by category + block (no separate maintenance-staff routing tier).
3. SLA timer starts; escalation to Admin if breached.
4. Warden updates + closes with proof.
5. Student rates resolution → can reopen within 48h.

### 8.5 Gate pass (out-pass) flow — no separate Security Guard role
1. Student applies via portal with time + reason.
2. Warden approves (parent co-approval if minor).
3. QR code issued to student's phone.
4. Warden (or a shared front-desk device logged in as Warden) scans QR at gate → exit logged → parent SMS sent.
5. On return, QR scanned → entry logged → parent SMS sent.
6. Late-entry alerts to Warden if past curfew.

### 8.6 Move-out
1. Student/Parent initiates notice.
2. System calculates notice period, unpaid dues, deposit balance.
3. Warden confirms room inspection.
4. Accountant (or Admin) approves refund → paid out.
5. Allocation closed; bed goes to `maintenance` for X hours then `vacant`.
6. Student record archived (inactive), Admin-visible — no separate Alumni portal.

### 8.7 Warden's day (mobile) — now includes gate & mess duties
1. Morning brief: late-payers in block, unresolved complaints, students on out-pass.
2. Mark attendance (bulk, per-room) — target 3 min.
3. Approve gate-pass requests; monitor gate events.
4. Triage new complaints.
5. Update mess menu / review headcount.
6. Post notice on any schedule change.

### 8.8 Parent's day (mobile)
1. Push/SMS: "Rahul entered hostel at 8:42 pm."
2. Open portal → see attendance streak + no pending fees.
3. Fee due next month → pays via one tap.
4. Messages warden directly with a question.

### 8.9 Super Admin's day (Hostylia internal)
1. Reviews new tenant signups and onboarding status.
2. Checks MRR/churn dashboard and overdue-billing tenants.
3. Handles a support ticket via time-boxed impersonation.
4. Adjusts a tenant's plan/feature flags as needed.

---

## 9. Non-Functional Requirements (summary)

| Area | Requirement |
|---|---|
| Performance | Any dashboard renders in < 2s p95; API p95 < 200ms |
| Availability | 99.9% monthly on production |
| Security | Encryption in transit (TLS 1.2+), at rest; RBAC + audit; secrets in vault |
| Privacy | India data residency; per-student data export & deletion on request |
| Accessibility | WCAG 2.1 AA on public + parent + student surfaces |
| Localization | English + Hindi shipped; framework for more Indian languages |
| Browser support | Latest 2 versions of Chrome, Safari, Edge, Firefox; iOS 15+ Safari; Android 10+ Chrome |
| Responsive | Fully usable from 360px width upward |
| Backups | Daily automated + 30-day retention + point-in-time recovery |

---

## 10. Release Phases

| Phase | Contents |
|---|---|
| **v1 (Ship)** | All items marked [S] above — 6-role model, core property/student/finance/ops/parent workflows, Super Admin console |
| **Stage 2 — Fast-follow** | Items marked [F]: PWA offline, web push, split payments, waitlist, public listing microsite, granular privilege toggles on Warden/Accountant roles (Cloudbeds-style), multi-property staff assignment |
| **Stage 3 — Roadmap** | Items marked [R]: AI Suite, biometric/RFID gate integration, public REST API + Webhooks, bank auto-reconciliation, accounting exports, BI connectors, additional Indian languages, custom report builder |

**Reintroduction triggers for cut roles** (tracked, not scheduled): promote Warden's gate/mess/maintenance sub-functions back into distinct roles only if multi-block campus deployments become a meaningful share of the customer base (see Sec. 4.3).

---

## 11. Assumptions

1. Every property has reliable internet at the front desk/warden device; students may be intermittently online (drives the PWA offline requirement in Stage 2).
2. All payments in India route through a licensed gateway (e.g., Razorpay); no direct card storage inside Hostylia.
3. Parents are reachable primarily via phone number (SMS + WhatsApp), not email.
4. Target market is India-first: coaching-institute hostels and PGs, not university campuses with dedicated security/mess departments (that's a future segment, not v1).
5. Most customers will run with 1-3 human logins per property (Admin, optionally Warden and/or Accountant) — this assumption directly shaped the 6-role model and should be validated against actual signups within the first quarter.

---

## 12. Out of Scope (explicit)

- Native iOS/Android apps — mobile experience is delivered via responsive web + PWA.
- HR/payroll for hostel staff.
- Full academic Learning Management System.
- Vendor/contractor portal — no external vendor logins or vendor-facing tickets.
- Alumni portal/archive — move-out simply archives the student record.
- Trustee/board-member view-only access.
- Separate Security Guard and Mess/Kitchen Staff logins — delivered as Warden-operated modules.
- Separate Support Agent role — merged into Super Admin.
- Public (outbound) API/webhooks for customers, biometric hardware certification, AI features — all deferred to Stage 3. Note: *inbound* webhooks that Hostylia receives from providers (e.g. Razorpay payment callbacks) are in v1 scope — the exclusion is about exposing outbound public webhooks/APIs to customers, not receiving provider callbacks.

---

## 13. Open Questions

1. At what property size (bed count / block count) does a solo Warden become insufficient, and should Hostylia support multiple Wardens per block before multiple Wardens per property?
2. Should Accountant be a paid add-on seat (separate from base plan) given it's the one role kept specifically for delegation, per your decision?
3. Should the gate-pass QR scan require a dedicated low-privilege "front desk" login distinct from full Warden access, or is shared-device Warden login acceptable for v1?
4. Should parent SSO also accept email-magic-link, or remain phone-OTP only?
5. Refund SLA — is 7 working days the enforceable promise?
6. If a customer is a multi-block coaching campus (i.e., outside the "small/solo operator" assumption in Sec. 11.5), do we want a fast-track plan tier that unlocks Stage-2 privilege toggles early?

---

## 14. Glossary

| Term | Meaning |
|---|---|
| Allocation | Active assignment of a Student to a Bed |
| Block | Wing/tower under a Property (optional level for small properties) |
| Bed | Smallest inventory unit; billable |
| DSO | Days Sales Outstanding — avg days to collect fees |
| MRR | Monthly Recurring Revenue (Super Admin / SaaS-level metric) |
| Out-pass | Approved permission for a student to leave the premises |
| PWA | Progressive Web App — installable web app with offline capabilities |
| RBAC | Role-Based Access Control |
| SLA | Service Level Agreement (e.g., complaint resolution time) |
| Warden | Staff member responsible for day-to-day operations of a Property/Block, including gate and mess duties in this model |

---

## Appendix A — Research Summary & Rationale

This section summarizes the comparative research behind the role simplification in this version. Full detail available on request.

**Method:** Compared role structures and feature sets across commercial PG/co-living platforms (RentOk, Crib, Zolo, Stanza Living) and campus/college hostel ERPs (SpaceBasic, MasterSoft, EDU ERP, Vidyalaya), plus general hostel PMS (Cloudbeds) and RBAC/MVP-scoping best practices.

**Key findings applied to this PRD:**
1. **Commercial PG/co-living apps (RentOk, Crib, Zolo) converge on a 2-tier operator/tenant model** with staff added as generic permissioned team members rather than named roles — validating that Hostylia should not default to a large role catalogue.
2. **Parent is essential for the coaching-institute/campus segment** (confirmed by SpaceBasic's dedicated parent module) but absent from pure PG apps — since Hostylia's target explicitly includes coaching-institute hostels, Parent stays in v1.
3. **A single Hostel Admin genuinely runs the whole property** in the SMB segment (RentOk, My PG Manager, TrackMyPG all confirm this pattern); splitting responsibilities further is a mid-market/enterprise concern handled via privilege toggles (Cloudbeds' model), not separate mandatory roles — this is why Accountant and Warden are framed as optional seats layered on top of a superset Admin role.
4. **Security guard and mess staff are consistently delivered as modules, not roles**, across every commercial product researched — directly supporting folding both into the Warden role.
5. **Role explosion is a well-documented anti-pattern**: RBAC literature notes organizations typically carry 40-60% redundant roles from ungoverned role creation, and recommends scoping by property/block rather than minting new roles — this directly motivated cutting Vendor, Alumni, and Trustee.
6. **AI features, public APIs, and biometric integration are consistently roadmap/differentiator features, not table-stakes** — even category leader RentOk ships no public API — supporting the Stage 3 placement of Hostylia's AI Suite and integrations.

---

*End of document. This PRD is a living artifact — see version history and the roadmap in Sec. 10 for latest state.*
