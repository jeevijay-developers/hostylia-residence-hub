# Hostylia — Rules.md

**Product:** Hostylia — Hostel & PG Management Platform  
**Company:** Jeevijay Technologies Private Limited  
**Rules version:** 2.0  
**Based on:** PRD v2.1, React + TypeScript + Supabase Architecture, DB-Schema v1.0  
**Last updated:** July 15, 2026  
**Status:** Living document  
**Primary audience:** Product team, developers, QA, DevOps, designers, and AI coding agents

---

## 1. Purpose

This document defines the non-negotiable rules for building Hostylia.

It sets boundaries for:

- Product scope
- Technology stack
- Code structure
- React implementation
- Supabase usage
- Database access
- Multi-tenancy
- Authentication
- Authorization
- Row Level Security
- Payments and finance
- File storage
- Error handling
- Security
- Testing
- Accessibility
- Responsive behavior
- Documentation
- AI coding agents
- Release discipline

These rules are mandatory unless the product owner explicitly approves a change and the relevant source documents are updated.

---

## 2. Source-of-Truth Priority

When documents conflict, follow this order:

1. `PRD.md`
2. `Rules.md`
3. `Architecture.md`
4. `DB-Schema.md`
5. `Design.md`
6. `Phases.md`
7. `Memory.md`

Per-phase testing checklists live inside `Phases.md`; there is no separate test-checklist file.

### 2.1 Product scope

`PRD.md` is the source of truth for:

- Roles
- Features
- User journeys
- v1 scope
- Stage 2 features
- Stage 3 roadmap
- Out-of-scope items
- Open product questions

### 2.2 Technical structure

`Architecture.md` is the source of truth for:

- React frontend structure
- Supabase backend structure
- File and folder organization
- Edge Function boundaries
- Data access patterns
- Deployment model

### 2.3 Database structure

`DB-Schema.md` is the source of truth for:

- Tables
- Columns
- Relationships
- Constraints
- Indexes
- Row Level Security
- Triggers
- Functions
- Reporting views

---

## 3. Confirmed Technology Rules

Hostylia must use the following stack.

### 3.1 Required frontend stack

- React
- Vite
- TypeScript
- TSX
- Tailwind CSS
- shadcn/ui (Radix primitives)
- React Router DOM
- Supabase JavaScript client (`@supabase/supabase-js`)
- TanStack Query
- React Hook Form
- Zod
- Lucide React
- Recharts
- date-fns
- i18next or an approved equivalent

This stack is Lovable-native. Lovable scaffolds React + TypeScript + Tailwind + shadcn/ui by default, so the project must follow that grain rather than fight it. Zod schemas double as the single source of truth for both runtime validation and inferred TypeScript types (`z.infer`), which is why TypeScript is required rather than optional.

### 3.2 Required backend platform

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions
- Supabase Realtime only where justified
- PostgreSQL Row Level Security
- PostgreSQL functions and triggers
- Supabase migrations

### 3.3 Forbidden technology substitutions

Do not replace the approved stack with:

- Next.js
- Express
- NestJS
- Firebase
- MongoDB
- Prisma
- Sequelize
- TypeORM
- Laravel
- Django
- Rails
- Angular
- Vue
- Svelte
- Redis or any external datastore as a v1 dependency (see Sec. 3.4)
- Self-hosted Node/Deno servers outside Supabase Edge Functions

A stack change requires explicit approval and updates to the architecture documents.

### 3.4 Deferred infrastructure (not in v1)

The following are architecturally anticipated but must NOT be added in v1:

- Redis / Upstash (rate limiting is Postgres-backed in v1 — see Sec. 29.5)
- Read replicas
- A dedicated background-worker tier outside Supabase

These are documented as scale seams in `Architecture.md`. They are deferred because they are out-of-band components Lovable cannot manage, and adding them prematurely reintroduces exactly the multi-source-of-truth drift these documents exist to prevent. Introducing any of them requires an ADR (Sec. 36.3) and updates to `Architecture.md` and `Phases.md`.

---

## 4. Language Rules

### 4.1 TypeScript only

Use:

```text
.ts
.tsx
```

Do not use plain `.js` / `.jsx` for application code. (Config files that must be JS, e.g. `postcss.config.js`, `tailwind.config.js`, are the only exception.)

### 4.2 Type discipline

- Derive types from Zod schemas with `z.infer` rather than hand-writing duplicate interfaces.
- Do not use `any`. Use `unknown` + a Zod parse at trust boundaries (form input, Edge Function payloads, webhook bodies, API responses).
- Do not use non-null assertions (`!`) to silence the compiler on values that can genuinely be null — handle the null.
- Do not use `@ts-ignore` / `@ts-expect-error` to hide real type errors; fix the underlying issue.
- Enable and respect `strict` mode in `tsconfig.json`.

### 4.3 Code quality

Use:

- Clear variable names
- Small focused functions
- Explicit return types on exported functions and services
- Defensive input checks at trust boundaries
- Consistent async/await
- Named constants (string-literal unions or enums) for business states

Avoid:

- Deeply nested callbacks
- Unclear abbreviations
- Large unstructured files
- Magic strings scattered across the project
- Silent exception swallowing
- Global mutable state

---

## 5. Product Scope Rules

### 5.1 v1 roles

The only v1 roles are:

```text
SUPER_ADMIN
HOSTEL_ADMIN
ACCOUNTANT
WARDEN
STUDENT
PARENT
```

### 5.2 No additional role creation

Do not add:

- Security Guard
- Mess Staff
- Kitchen Staff
- Maintenance Staff
- Vendor
- Alumni
- Trustee
- Board Member
- Support Agent
- Front Desk Agent
- Manager
- Custom Role

A new role requires a PRD update.

### 5.3 Role simplification must be preserved

- Hostel Admin is the superset hostel role.
- Accountant is optional and finance-focused.
- Warden is optional and operations-focused.
- Parent access is child-linked.
- Student access is self-only.
- Super Admin is Hostylia internal.

### 5.4 v1 exclusions

Do not build the following in v1:

- Native iOS app
- Native Android app
- Full HR/payroll
- Academic LMS
- Vendor portal
- Alumni portal
- Trustee portal
- Separate guard login
- Separate mess login
- Separate maintenance login
- Public REST API
- Public webhooks
- AI features
- Biometric integration
- RFID integration
- Bank auto-reconciliation
- Accounting software integration
- BI connectors
- Community board
- Advanced custom report builder

### 5.5 Stage discipline

A Stage 2 or Stage 3 feature must not be implemented early unless:

1. Product approval exists.
2. `PRD.md` is updated.
3. `Phases.md` is updated.
4. `Architecture.md` is updated if needed.
5. `DB-Schema.md` is updated if needed.

---

## 6. Development Phase Rules

### 6.1 Work only on the active phase

Before coding:

1. Read `Phases.md`.
2. Identify the active phase.
3. Implement only active-phase scope.
4. Do not begin later phases automatically.

### 6.2 Definition of done

A phase is not complete until:

- Functional requirements pass
- RLS tests pass
- Role access tests pass
- Responsive behavior passes
- Error states exist
- Loading states exist
- Accessibility checks pass
- No blocking console errors remain
- Documentation is updated
- `Memory.md` is updated

### 6.3 No phase skipping

Do not skip foundational work such as:

- Auth
- Tenant context
- RLS
- Property scope
- Error handling
- Audit logging
- Database constraints

to build attractive UI faster.

---

## 7. Repository and Folder Rules

### 7.1 Feature-based organization

Use feature folders.

Example:

```text
src/features/complaints/
src/features/finance/
src/features/gate/
src/features/students/
```

### 7.2 Separation of concerns

A component file must not also contain:

- Large Supabase query logic
- Payment provider logic
- Complex business rules
- RLS assumptions
- Database migration SQL
- Environment configuration

### 7.3 Service layer

Use:

```text
Component
  -> Hook
    -> Service
      -> Supabase client or Edge Function
```

### 7.4 File size

Avoid oversized files.

Preferred limits:

- React component: under 250 lines where practical
- Service file: under 300 lines where practical
- Hook file: under 200 lines where practical
- Edge Function entry file: small and orchestration-focused

Split by responsibility when a file becomes difficult to review.

### 7.5 Shared code

Place shared code in approved locations:

```text
src/components/ui
src/lib
src/hooks
src/schemas
src/services
```

Do not duplicate the same validation, formatting, permission or query logic across features.

---

## 8. React Rules

### 8.1 Components

Components must be:

- Focused
- Reusable where appropriate
- Accessible
- Responsive
- Easy to test

Avoid:

- Monolithic page components
- Business logic directly in TSX/JSX
- Deep prop drilling
- Excessive context usage
- UI hidden only with CSS while still exposing forbidden data

### 8.2 Hooks

Use hooks for:

- Data fetching
- Mutations
- Form behavior
- Reusable UI logic
- Session and tenant context

Do not:

- Call hooks conditionally
- Hide side effects inside utility functions
- Create unnecessary custom hooks for one-line logic

### 8.3 State priority

Use state in this order:

1. URL state
2. TanStack Query
3. Local component state
4. React Context
5. Zustand

### 8.4 Global state

Do not store Supabase server data in Zustand.

Zustand is only for client-only cross-screen state, for example:

- Temporary UI preferences
- Multi-step form draft state
- Non-authoritative scanner state

### 8.5 TanStack Query

Rules:

- Centralize query keys.
- Include tenant and property context.
- Use server pagination.
- Invalidate only affected queries.
- Clear query cache on logout.
- Do not use optimistic updates for finance.
- Do not cache sensitive data longer than necessary.
- Do not rely on cache as authorization.

### 8.6 Effects

Use `useEffect` only for genuine side effects.

Do not use it for:

- Derived values
- Simple transformations
- State that can be calculated during render
- Replacing TanStack Query

### 8.7 Routing

Use React Router DOM.

Route guards may control UX, but they are not security boundaries.

Forbidden assumption:

```text
The route is protected, therefore the data is secure.
```

Real protection must exist in RLS or secure functions.

---

## 9. UI and Design Rules

### 9.1 Role-aware layouts

Use:

- Super Admin layout
- Staff layout
- Warden layout
- Student layout
- Parent layout

### 9.2 Mobile-first roles

Student, Parent and Warden interfaces must be mobile-first.

### 9.3 Desktop-focused roles

Hostel Admin, Accountant and Super Admin may use denser desktop interfaces, but must remain responsive.

### 9.4 Bottom navigation

On mobile, bottom navigation is required for:

- Student
- Parent
- Warden

### 9.5 No generic AI dashboard design

Avoid:

- Excessive cards
- Random gradients
- Decorative glassmorphism everywhere
- Unnecessary huge empty spaces
- Generic dashboard templates
- Emoji icons
- Repeated identical card layouts
- Visual noise

### 9.6 Icons

Use Lucide React or approved icon set.

Do not use emojis as interface icons.

### 9.7 Tables

Tables must support:

- Server pagination
- Filtering
- Sorting
- Loading state
- Empty state
- Error state
- Responsive fallback

Do not load thousands of records into the browser.

### 9.8 Destructive actions

Destructive actions must:

- Use clear labels
- Require confirmation where appropriate
- Explain the effect
- Respect soft delete
- Be permission protected

### 9.9 Financial UI

Financial UI must:

- Display currency clearly
- Show status clearly
- Show confirmation before sensitive action
- Avoid optimistic confirmation
- Show pending and failed states
- Show audit/approval context where relevant

### 9.10 Styling and Tailwind

Hostylia styles with Tailwind CSS and shadcn/ui only. (This is the section referenced by `Design.md`.)

Rules:

- Use Tailwind utility classes and shadcn/ui components. Do not add a second styling system (no CSS Modules, styled-components, MUI, Chakra, Emotion).
- **No raw hex values in components.** Never write `bg-[#00696F]` or inline `style={{ color: '#...' }}`. Use semantic design tokens defined in `tailwind.config.ts` and the CSS variables in the shadcn theme (e.g. `bg-primary`, `text-foreground`, `bg-success`, `text-muted-foreground`).
- All brand and semantic colors come from `Design.md`'s token table. If a needed token is missing, add it to the theme first, then use it — do not hardcode.
- Support light and dark mode through the theme's CSS variables. Do not branch on theme with conditional hex values.
- Compose shadcn/ui primitives (Button, Dialog, Table, Form, Toast, etc.) rather than hand-building equivalents. Extend via the component's own variants, not by overriding with arbitrary utilities.
- Respect `prefers-reduced-motion`. Keep motion purposeful (see `Design.md`).
- Status colors (occupied/paid/resolved vs. vacant/overdue/open) must use the dedicated semantic tokens, never reuse the primary brand color — this keeps the occupancy grid and finance badges unambiguous.

---

## 10. Responsive Rules

### 10.1 Minimum width

All v1 screens must work from:

```text
360px
```

Primary mobile design target:

```text
375px
```

### 10.2 Touch targets

Interactive controls must be at least approximately:

```text
44px
```

### 10.3 No hover-only behavior

Any action available on desktop hover must also be accessible through touch or keyboard.

### 10.4 Mobile tables

Use one of:

- Mobile card layout
- Priority columns
- Controlled horizontal scroll
- Details drawer

Do not compress tables until content becomes unreadable.

### 10.5 Camera inputs

Support camera capture for:

- KYC
- Complaint photos
- Visitor ID/photo

---

## 11. Accessibility Rules

Target WCAG 2.1 AA for:

- Public admission
- Student portal
- Parent portal
- Critical staff flows

Mandatory:

- Semantic HTML
- Keyboard support
- Visible focus
- Form labels
- Error summaries
- Accessible dialogs
- Proper heading order
- Sufficient contrast
- Screen-reader announcements
- Reduced-motion support
- No color-only status meaning
- Accessible chart alternatives

Do not:

- Remove focus outlines without replacement
- Use placeholder as the only label
- Make clickable `div` elements without keyboard behavior
- Hide important information from assistive technology
- Auto-focus aggressively on mobile

---

## 12. Localization Rules

### 12.1 Required languages

v1 must support:

- English
- Hindi

### 12.2 Translation keys

Do not hardcode reusable user-facing text.

Use translation keys.

### 12.3 Backend messages

Edge Functions and database functions should return:

- Stable error code
- Parameters
- Optional fallback message

The frontend resolves localized user-facing messages.

### 12.4 Date and currency

Use:

- Property timezone
- Locale-aware date formatting
- INR formatting by default
- Paise-to-rupees display conversion

Do not perform financial calculations with floating-point rupee values.

---

## 13. Supabase Client Rules

### 13.1 Browser client

Use the public Supabase anon key in the React app.

This is safe only because RLS must be enabled.

### 13.2 Service-role key

The service-role key:

- Must never be in React code
- Must never be in Vite public environment variables
- Must never be committed to Git
- Must never appear in logs
- Must only be used in secure Edge Functions or approved server environments

### 13.3 Direct data access

React may directly query Supabase only when:

- RLS fully protects the table/view
- Operation is simple
- No provider secret is needed
- No privileged transaction is needed
- No service-role bypass is required

### 13.4 Edge Function access

Use Edge Functions for:

- Payments
- Refunds
- Cash payment recording
- Discounts
- Waivers
- Invoice issuance
- Bulk imports
- Tenant provisioning
- Subscription management
- Super Admin support sessions
- Notification provider calls
- Export generation
- Privacy deletion
- Gate QR validation
- Any service-role operation

---

## 14. Database Rules

### 14.1 Migrations only

Every schema change must be a committed migration.

Do not make undocumented production changes through the Supabase dashboard.

### 14.2 Tenant columns

Every tenant-owned table must include:

```text
tenant_id
```

Operational tables should include:

```text
property_id
```

Block-scoped tables may include:

```text
block_id
```

### 14.3 Foreign keys

Use foreign keys for all business relationships.

Do not store relationship IDs only inside JSON.

### 14.4 Constraints

Use database constraints for:

- Unique invoice numbers
- Unique receipt numbers
- Active allocation limits
- Valid status values
- Positive money amounts
- Valid date relationships
- Same-property consistency

Do not rely only on form validation.

### 14.5 Money

Store money in paise using integer/bigint.

Never store money as:

- Float
- Double
- Free-form text

### 14.6 Timestamps

Use `timestamptz`.

Do not store local time without timezone context.

### 14.7 JSONB

Use JSONB only for:

- Flexible metadata
- Provider payload metadata
- Non-core configuration
- Snapshot data

Do not use JSONB to replace normalized core entities.

### 14.8 Soft delete

Use soft delete for business records.

Do not hard-delete:

- Students
- Allocations
- Invoices
- Payments
- Refunds
- Gate events
- Audit logs
- Complaint history

### 14.9 Append-only tables

The following should be append-only:

- Audit logs
- Gate events
- Notification attempts
- Webhook events
- Deposit ledger entries
- Complaint activity history

---

## 15. Row Level Security Rules

### 15.1 Mandatory RLS

RLS must be enabled on every tenant-owned table.

### 15.2 No temporary disablement

Do not disable RLS to make development easier.

### 15.3 RLS policy dimensions

Policies must consider:

- Authenticated user
- Tenant membership
- Role
- Property assignment
- Block assignment
- Student ownership
- Guardian relationship
- Feature entitlement
- Record status where relevant

### 15.4 Parent access

Parent access must always require an active guardian-student relationship.

Never grant Parent access based only on:

- Same property
- Same tenant
- Matching surname
- Matching phone without verified link
- Frontend filter

### 15.5 Student access

Student access must be self-only unless the PRD explicitly allows otherwise.

### 15.6 Warden access

Warden access must be restricted to assigned:

- Property
- Block
- Operational modules

### 15.7 Accountant access

Accountant access must be finance-focused.

Do not expose unnecessary:

- Medical data
- Complaint details
- Gate history
- Personal notes
- Operational private information

### 15.8 Super Admin access

Super Admin must not casually browse tenant data.

Use:

- Controlled support session
- Explicit reason
- Time limit
- Audit record
- Visible impersonation banner

### 15.9 RLS testing

Every new table must include tests for:

- Same-tenant allowed access
- Cross-tenant denied access
- Wrong-property denied access
- Wrong-block denied access
- Parent-child relationship
- Student self-access
- Revoked assignment
- Suspended membership

---

## 16. Authentication Rules

### 16.1 Login methods

v1 supports:

- Phone OTP for all roles
- Email/password for staff
- Phone OTP for Student and Parent

### 16.2 Profile data

Keep application profile data in `public.profiles`.

Do not place all business data in Supabase Auth metadata.

### 16.3 Session handling

- Listen for auth state changes.
- Clear sensitive state on logout.
- Clear TanStack Query cache on logout.
- Revalidate role and tenant after login.
- Handle expired sessions gracefully.
- Revoke access after membership removal.

### 16.4 OTP abuse prevention

Implement:

- Cooldown
- Expiry
- Attempt limit
- Per-phone limit
- Per-IP limit
- Generic errors

### 16.5 Password handling

- Never log passwords.
- Never store plaintext passwords.
- Use Supabase Auth.
- Do not build custom password storage.

---

## 17. Authorization Rules

### 17.1 Authorization formula

Use:

```text
role
+ tenant
+ property
+ block
+ ownership
+ relationship
+ feature entitlement
```

### 17.2 Frontend checks

Frontend permission checks may:

- Hide unavailable actions
- Disable controls
- Adjust navigation

They must not be treated as data security.

### 17.3 Hostel Admin superset

Hostel Admin can perform Accountant and Warden actions within assigned scope.

Do not duplicate contradictory logic.

### 17.4 Maker-checker

Maker-checker applies to:

- Refunds
- Waivers
- Discounts above configured threshold

Rules:

- Initiator cannot approve own request when approval applies.
- Hostel Admin approval is required.
- Decision reason is mandatory.
- All transitions are audited.

---

## 18. Financial Rules

### 18.1 Browser is not authoritative

Never mark a payment successful based only on:

- Browser callback
- Redirect
- Client-side SDK result

Use verified provider webhook.

### 18.2 Payment webhook

Must:

- Verify signature
- Verify provider event ID
- Verify amount
- Verify currency
- Enforce idempotency
- Record webhook event
- Update financial records transactionally
- Create audit entry

### 18.3 No direct card storage

Hostylia must never store:

- Full card number
- CVV
- Card PIN
- Raw sensitive payment credentials

### 18.4 Offline payments

Cash and cheque recording must use secure Edge Function or RPC.

Required:

- Actor
- Amount
- Mode
- Date
- Reference
- Student
- Invoice allocation
- Receipt
- Audit log

### 18.5 Invoice edits

Issued invoices must not be silently edited.

Use:

- Void
- Adjustment
- Credit/reversal workflow
- Reissue

### 18.6 Refunds

Refunds must preserve:

- Original payment reference
- Initiator
- Approver
- Reason
- Amount
- Provider reference
- Status history
- Audit trail

### 18.7 Financial UI

Never show "Paid" until authoritative confirmation exists.

Use explicit states:

- Pending
- Authorized
- Captured
- Failed
- Refunded
- Partially refunded

### 18.8 P&L label

Do not label a collections-only report as full P&L.

A true P&L requires approved expense data.

---

## 19. Allocation and Occupancy Rules

### 19.1 One active bed per student

A Student must not have more than one active allocation.

### 19.2 One active student per bed

A Bed must not have more than one active allocation.

### 19.3 Atomic operations

Allocation actions must be atomic.

Use secure database function or Edge Function for:

- Allocate bed
- Activate allocation
- Swap bed
- Start move-out
- Complete move-out

### 19.4 Bed status

Allowed statuses:

```text
VACANT
OCCUPIED
BLOCKED
MAINTENANCE
```

### 19.5 No frontend-only occupancy updates

Do not update:

```text
bed.status
```

from the frontend independently of allocation state.

### 19.6 Cross-property prevention

Student, allocation, room and bed must belong to the same property and tenant.

---

## 20. Complaint Rules

### 20.1 Complaint ownership

Student may create and view own complaints.

Parent may view linked child's complaints according to relationship permissions.

### 20.2 Warden scope

Warden may manage complaints only within assigned scope.

### 20.3 Complaint timeline

Status changes must create append-only activity records.

### 20.4 SLA

SLA must be calculated from category configuration.

Do not calculate SLA only in frontend code.

### 20.5 Media

Complaint media must use private Supabase Storage.

### 20.6 Close and reopen

Closing must capture resolution evidence.

Reopen window must be enforced by database or secure function.

---

## 21. Gate Pass Rules

### 21.1 QR content

QR must not expose raw student personal data.

Use:

- Signed token
- Opaque token
- Token hash

### 21.2 Scan validation

Gate scan must verify:

- Tenant
- Property
- Student
- Pass status
- Time window
- Direction
- Duplicate scan
- Parent approval where required
- Warden scope

### 21.3 Gate event immutability

Gate events are append-only.

Corrections require a separate audited correction record or approved workflow.

### 21.4 No seventh role

Do not create a Front Desk or Security Guard role in v1.

---

## 22. File and Storage Rules

### 22.1 Private by default

The following must be private:

- KYC
- Student photos
- Guardian documents
- Agreements
- Complaint media
- Visitor ID
- Receipts
- Exports

### 22.2 Public files

Only explicitly approved property marketing media may be public.

### 22.3 Storage paths

Use tenant-scoped paths.

Example:

```text
tenant_id/property_id/entity_type/entity_id/file_id
```

### 22.4 Signed URLs

Use short-lived signed URLs for private files.

### 22.5 File validation

Validate:

- MIME type
- Extension
- Size
- Ownership
- Category
- Permission

### 22.6 No public KYC URLs

Never generate permanent public URLs for KYC or visitor ID.

### 22.7 File deletion

Do not orphan storage objects.

Use controlled cleanup jobs.

---

## 23. Edge Function Rules

### 23.1 Responsibility

Edge Functions should handle:

- Provider secrets
- Privileged workflows
- Cross-table transactions
- Service-role actions
- Sensitive exports
- Webhooks

### 23.1a Short and idempotent

Supabase Edge Functions are serverless Deno with cold starts. They must be short-lived and idempotent.

- Do not loop synchronously over large datasets (e.g. generating thousands of invoices, sending thousands of notifications) inside a single request.
- Bulk and recurring work (fee-cycle invoice generation, reminder batches, exports) must be enqueued into `background_jobs` and processed in bounded batches, not run inline.
- Design every function to be safe to retry: use `idempotency_keys` for anything that creates money movement or external side effects.

### 23.1b Database connections

Treat Postgres as a remote, pooled service.

- All Edge Function and client database access goes through the Supabase connection pooler (Supavisor / PgBouncer). Never open a direct unpooled connection from a function.
- Do not hold long-lived connections across requests.
- This is the primary defense against connection exhaustion under concurrency (e.g. signup or fee-day spikes). Connection discipline — not row count — is the real scaling limit at Hostylia's target size.

### 23.2 Validation

Every Edge Function must validate:

- Authentication
- Authorization
- Tenant
- Property
- Input
- Idempotency where relevant

### 23.3 Service-role use

Service-role use does not remove the need for business permission checks.

### 23.4 Response format

Use a consistent response:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "..."
  }
}
```

Error response:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "..."
  },
  "meta": {
    "requestId": "..."
  }
}
```

### 23.5 Logging

Log:

- Request ID
- Tenant ID
- Property ID
- Actor ID
- Function name
- Duration
- Result
- Error code

Do not log sensitive payloads.

---

## 24. Background Job Rules

### 24.1 Durable jobs

Use database-backed jobs/outbox for retryable work.

### 24.2 Suitable jobs

- Invoice generation
- Fee reminders
- Notification sending
- Receipt generation
- Complaint SLA checks
- Late gate alerts
- Bulk import
- Export generation
- Subscription checks

### 24.3 Idempotency

Every retryable job must be idempotent.

### 24.4 Retry behavior

Use:

- Attempt counter
- Backoff
- Maximum attempts
- Dead-letter state
- Last error
- Run-after timestamp

### 24.5 No provider calls in database triggers

Triggers may enqueue work.

Triggers must not call external APIs.

---

## 25. Notification Rules

### 25.1 Channels

v1 supports:

- In-app
- SMS
- WhatsApp
- Email

Web push is Stage 2.

### 25.2 Provider abstraction

Feature code must not directly call provider SDKs.

Use provider adapters.

### 25.3 Templates

Templates must be:

- Versioned
- Localized
- Parameter validated
- Approved
- Channel specific

### 25.4 Duplicate prevention

Use idempotency keys.

### 25.5 Consent

Respect:

- Communication consent
- Provider rules
- WhatsApp template requirements
- Applicable law and policy

---

## 26. Realtime Rules

Use Supabase Realtime only where it materially improves UX.

Approved examples:

- Complaint status
- Gate activity
- Payment status refresh
- New notice
- Support session banner

Do not:

- Subscribe to entire large tables
- Use unfiltered subscriptions
- Treat Realtime as authoritative for financial state
- Leave subscriptions active after logout
- Use Realtime to bypass RLS

---

## 27. Error Handling Rules

### 27.1 No silent failures

Do not ignore errors.

### 27.2 Stable error codes

Use stable codes such as:

```text
VALIDATION_ERROR
AUTHENTICATION_REQUIRED
SESSION_EXPIRED
PERMISSION_DENIED
TENANT_SCOPE_VIOLATION
PROPERTY_SCOPE_VIOLATION
RESOURCE_NOT_FOUND
RESOURCE_CONFLICT
DUPLICATE_REQUEST
RATE_LIMITED
PAYMENT_PENDING
PAYMENT_FAILED
WEBHOOK_INVALID
FILE_TOO_LARGE
UNSUPPORTED_FILE_TYPE
SERVICE_UNAVAILABLE
INTERNAL_ERROR
```

### 27.3 User messages

User-facing errors must be:

- Clear
- Actionable
- Localized
- Non-technical
- Safe

### 27.4 Internal errors

Do not expose:

- Stack traces
- SQL errors
- Provider secrets
- Internal table names
- Service-role details
- Raw exception objects

### 27.5 Recovery actions

Every error state should offer a next step when possible.

Examples:

- Retry
- Re-authenticate
- Change input
- Contact Admin
- Check payment status
- Return to dashboard

---

## 28. Loading and Empty State Rules

Every data surface must define:

- Loading
- Empty
- Error
- Success
- Partial data
- Permission denied

Do not show a blank page while loading.

Empty states must explain:

- Why no data exists
- What action is available
- Whether the user lacks permission

---

## 29. Security Rules

### 29.1 Secrets

Secrets must be stored in approved environment/secret management.

Never commit:

- Supabase service-role key
- Payment secret
- Webhook secret
- SMS secret
- WhatsApp secret
- Email provider secret

### 29.2 Environment files

Commit only:

```text
.env.example
```

Do not commit real `.env` files.

### 29.3 Logging

Never log:

- Passwords
- OTPs
- Access tokens
- Refresh tokens
- Full KYC numbers
- Card data
- Provider secrets
- Full private document URLs

### 29.4 Input validation

Validate all:

- Forms
- Query parameters
- Edge Function payloads
- Webhook payloads
- CSV imports
- File metadata

**Single-source-of-truth schemas (mandatory).** Every validated entity has exactly one Zod schema, defined once in `src/schemas/`, and imported everywhere it is needed:

- The React form (via React Hook Form's Zod resolver)
- The Edge Function that receives the payload
- The CSV importer for that entity
- The inferred TypeScript type (`type Student = z.infer<typeof studentSchema>`)

Never hand-write a second copy of a field's validation in a different file. Client-side validation and server-side validation must run the _same_ schema object, not two parallel implementations. Client validation is UX; the Edge Function re-validating with the same schema is the security boundary — the browser is never trusted (Sec. 18.1).

**Login / signup are the worked reference.** Define once and reuse: email (`z.string().email()`), phone (E.164 via a shared `phoneSchema`), password policy (length + composition), and OTP shape (fixed-length numeric). Any auth screen or auth Edge Function uses these shared schemas — no re-implementation.

### 29.5 Rate limiting

Apply to:

- Login
- OTP request
- OTP verification
- Password reset
- Admission form
- File upload
- Payment order
- Gate scan
- Export
- Messaging

**v1 implementation is Postgres-backed.** All rate limiting goes through a single function, `checkRateLimit(key, limit, windowSeconds)`, implemented as a Postgres `SECURITY DEFINER` function backed by the `rate_limits` table (see `DB-Schema.md`). Every rate-limited Edge Function calls it _before_ doing work (before sending an OTP, creating a payment order, accepting an admission, etc.).

**Do not add Redis/Upstash in v1.** The limiter is deliberately built behind one function so the storage can be swapped later. When OTP/SMS volume genuinely outgrows Postgres, the _body_ of `checkRateLimit` is changed to call Upstash Redis over HTTP — the designated Stage-3 upgrade — and no call site changes. This swap point is documented in `Architecture.md` (Scale Seams). Until then, Redis is forbidden (Sec. 3.4).

### 29.6 CORS

Use strict allowed origins.

Do not use unrestricted production CORS.

### 29.7 Security review

Before production, test:

- Cross-tenant access
- Parent data isolation
- Warden block scope
- Accountant restriction
- Service-role misuse
- Storage access
- Payment webhook spoofing
- QR token tampering
- Impersonation abuse

---

## 30. Privacy Rules

### 30.1 Data minimization

Collect only data required by approved product scope.

### 30.2 Sensitive fields

Sensitive fields include:

- KYC
- Student details
- Guardian details
- Visitor ID
- Complaint media
- Medical information
- Payment references

### 30.3 Medical and dietary data

Medical and dietary flags are not v1 by default.

Do not add them early.

### 30.4 Data export

Export access must follow role and relationship permissions.

### 30.5 Deletion requests

Deletion workflows must:

- Verify requester
- Respect retention obligations
- Preserve required financial/audit data
- Anonymize where hard delete is not allowed
- Record audit history

### 30.6 Analytics

Do not send personal data to analytics tools.

---

## 31. Audit Rules

Audit the following:

- Role grants and revocations
- Property changes
- Student changes
- Allocation and swaps
- Invoice actions
- Payments
- Refunds
- Discounts
- Waivers
- Attendance edits
- Complaint changes
- Gate events
- Support sessions
- Data exports
- Privacy deletion
- Feature flags

Audit records must include:

- Actor
- Effective user
- Tenant
- Property
- Action
- Entity
- Before/after where safe
- Timestamp
- Request ID
- Support session ID where relevant

Audit logs must be append-only.

---

## 32. Testing Rules

### 32.1 Required test layers

- Unit tests
- Integration tests
- RLS tests
- Edge Function tests
- End-to-end tests
- Accessibility tests
- Responsive tests

### 32.2 Required tools

Preferred:

- Vitest
- React Testing Library
- Playwright

### 32.3 Critical journeys

Must be tested:

1. Sign in
2. Tenant access
3. Property setup
4. Student admission
5. Bed allocation
6. Invoice generation
7. Online payment
8. Cash payment
9. Refund approval
10. Complaint flow
11. Gate pass flow
12. Parent access
13. Move-out
14. Super Admin support session

### 32.4 RLS tests

Every feature must test unauthorized access, not only successful access.

### 32.5 Test data

Use deterministic fake data.

Never use production personal data.

### 32.6 No fake passing tests

Do not:

- Skip failing tests without explanation
- Mock away the business rule being tested
- Disable RLS in tests
- Mark critical tests as optional

---

## 33. Performance Rules

### 33.1 Frontend

- Lazy-load routes.
- Paginate large lists.
- Debounce search.
- Avoid oversized bundles.
- Optimize images.
- Load charts only when visible or needed.
- Avoid unnecessary renders.
- Avoid broad Realtime subscriptions.

### 33.2 Database

- Index foreign keys.
- Use tenant-first composite indexes.
- Avoid N+1 queries.
- Use limits.
- Analyze slow queries.
- Avoid unrestricted full-table scans.
- Use views carefully.

### 33.3 Reports

Large reports and exports must be asynchronous.

Do not block UI waiting for large CSV/PDF generation.

---

## 34. Dependency Rules

### 34.1 Before adding a dependency

Check:

- Is it necessary?
- Is there an existing package already solving it?
- Is it actively maintained?
- Is the bundle impact acceptable?
- Is the license acceptable?
- Does it introduce security risk?
- Does it support TypeScript?

### 34.2 Avoid duplicate libraries

Do not use multiple libraries for the same job without approval.

Examples:

- One date library
- One form library
- One chart library
- One query library
- One icon library

### 34.3 No untrusted packages

Do not add obscure packages for core security, payments or auth without review.

---

## 35. Git and Change Rules

### 35.1 Small changes

Prefer small, reviewable commits.

### 35.2 Commit messages

Use clear messages.

Example:

```text
feat(finance): add refund approval flow
fix(rls): restrict parent complaint access
test(gate): add duplicate scan coverage
docs(schema): document allocation constraints
```

### 35.3 No unrelated rewrites

Do not rewrite working modules while implementing unrelated features.

### 35.4 Migration review

Database migrations require special review.

### 35.5 Generated files

Do not commit temporary local files, secrets or large unneeded exports.

---

## 36. Documentation Rules

### 36.1 Update docs with code

When implementation changes:

- Architecture
- Schema
- Permissions
- Workflow
- Feature scope
- Dependencies

update relevant documentation in the same work.

### 36.2 Memory.md

After each meaningful task, update `Memory.md` with:

- What was completed
- Files changed
- Decisions made
- Known issues
- Pending work
- Next recommended step

### 36.3 ADRs

Create an Architecture Decision Record for major decisions such as:

- New auth method
- New provider
- New role
- New multi-tenant strategy
- New data region
- New background-job mechanism
- New payment provider

---

## 37. AI Coding Agent Rules

### 37.1 Mandatory reading

Before coding, an AI agent must read:

1. `PRD.md`
2. `Rules.md`
3. `Architecture.md`
4. `DB-Schema.md`
5. Active phase in `Phases.md`
6. `Memory.md`

### 37.2 No assumptions

The AI must not invent:

- New roles
- New modules
- New pricing rules
- New approval rules
- New database fields
- New external integrations
- New workflows

without evidence from project documents or explicit approval.

### 37.3 Clarification threshold

Ask for clarification when:

- Product behavior is genuinely ambiguous
- An open PRD question blocks implementation
- A security-sensitive decision is unresolved
- A schema change would expand scope
- A provider choice is required

Do not ask unnecessary questions for ordinary implementation details already covered by documents.

### 37.4 Respect active phase

Do not build the entire application in one step.

### 37.5 Preserve working code

Do not delete or rewrite working code without a clear reason.

### 37.6 No security shortcuts

The AI must never:

- Disable RLS
- Use service-role in frontend
- Remove permission checks
- Hardcode tenant IDs
- Hardcode user IDs
- Trust frontend role values
- Mark payments successful from browser response
- Make private buckets public
- Skip audit logging for sensitive actions

### 37.7 Error handling

The AI must implement:

- Loading
- Empty
- Error
- Permission denied
- Retry
- Validation

states for user-facing features.

### 37.8 Testing

The AI must add or update tests for every:

- Permission rule
- Financial rule
- State transition
- Multi-tenant behavior
- Critical UI flow

### 37.9 Documentation after task

The AI must update:

- `Memory.md`
- Relevant docs
- Test checklist where applicable

### 37.10 No fake completion claims

The AI must not claim a feature is complete when:

- Tests have not run
- RLS is missing
- Error states are missing
- Mobile behavior is untested
- Database migration is incomplete
- Only UI mockup exists

---

## 38. Forbidden Actions

The following are explicitly forbidden:

1. Adding a seventh role without PRD approval.
2. Disabling RLS.
3. Using service-role key in React.
4. Storing secrets in Git.
5. Hardcoding tenant IDs.
6. Hardcoding production user IDs.
7. Storing money as float.
8. Marking payment successful from browser redirect.
9. Publicly exposing KYC.
10. Hard-deleting financial records.
11. Allowing cross-tenant queries.
12. Granting Parent access without relationship check.
13. Granting Warden unrestricted property access.
14. Giving Accountant all student private data.
15. Performing privileged finance mutations through unrestricted browser CRUD.
16. Calling external providers from database triggers.
17. Building Stage 2 or Stage 3 features during v1 without approval.
18. Using plain JavaScript/JSX for application code, or using `any` to bypass type safety.
19. Replacing React or Supabase without approval.
20. Skipping tests for permissions and tenancy.
21. Editing production schema manually without migration.
22. Logging OTPs, tokens or passwords.
23. Creating public file URLs for private documents.
24. Bypassing maker-checker.
25. Renaming collections reports as full P&L without expense data.

---

## 39. Code Review Checklist

Before approving a pull request, verify:

### Product

- Feature exists in PRD.
- Feature belongs to active phase.
- No new role introduced.
- No deferred feature introduced.

### React

- Components are focused.
- State strategy is correct.
- Loading/error/empty states exist.
- Mobile behavior works.
- Accessibility basics are present.

### Supabase

- RLS exists.
- RLS tests exist.
- Tenant/property/block scope is correct.
- No service-role exposure.
- Direct browser query is appropriate.

### Database

- Migration exists.
- Foreign keys exist.
- Constraints exist.
- Indexes exist where needed.
- Money uses paise.
- Soft delete is respected.

### Security

- Input validated.
- Sensitive data not logged.
- Provider secrets protected.
- File access protected.
- Payment and webhook logic is safe.

### Testing

- Unit/integration tests pass.
- RLS tests pass.
- Critical E2E flow is covered.
- No tests were disabled without approval.

### Documentation

- Relevant docs updated.
- `Memory.md` updated.
- Open issues documented.

---

## 40. Definition of Rule Compliance

A task is rule-compliant only when:

- It matches approved product scope.
- It uses React + Vite + TypeScript + Tailwind + shadcn/ui + Supabase.
- It preserves the six-role model.
- It respects active development phase.
- It enforces tenant isolation.
- It uses RLS correctly.
- It protects parent and student data.
- It handles finance securely.
- It uses private storage correctly.
- It includes error and loading states.
- It is responsive.
- It is accessible.
- It includes tests.
- It includes documentation updates.
- It introduces no forbidden shortcut.

---

## 41. Final Rule Summary

Hostylia must remain:

- Simple in role design
- Strict in tenant isolation
- Secure by default
- Mobile-first for Student, Parent and Warden
- Desktop-efficient for Admin and Accountant
- Auditable for finance and support
- Transactional for payments and allocations
- Private for KYC and personal data
- Controlled through migrations
- Tested through RLS and end-to-end workflows
- Built only with React, Vite, TypeScript, Tailwind, shadcn/ui and Supabase

---

_End of Rules.md_
