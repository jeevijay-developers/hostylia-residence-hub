# Prompt — Futuristic UI for the Hostylia Hostel Owner (Admin) Dashboard

> Copy everything below the line into your AI UI generator (v0, Lovable, Bolt, Claude, etc.).
> If the tool has a size limit, paste Part A + Part B first, then one module from Part C per follow-up message.

---

## PART A — Role, product and goal

You are a senior product designer and front-end engineer. Design and build a **futuristic, premium, production-grade UI** for the **Hostel Owner ("Hostel Admin") dashboard** of **Hostylia**, a multi-tenant SaaS for Indian hostels, PGs, dormitories and coaching hostels.

The Hostel Admin is the owner who "wears all hats": they configure properties, admit students, allocate beds, run finance, approve refunds, handle complaints, mark attendance, send notices and manage staff (Wardens and Accountants). One owner may run **multiple properties**; everything is scoped to the property chosen in a global **Property Switcher**.

**Goal:** a redesign that is dramatically better than the current plain card-and-table UI. It should feel like an operations **command center**: dense, fast, beautiful, calm. It must keep **every feature, field, status, action and state listed in Part C**. Don't remove functionality. Where this prompt says "IMPROVE", add the improvement as well.

**Tech stack (must match the existing app):**
- React 19 + TypeScript.
- Tailwind CSS v4.
- shadcn/ui on Radix primitives.
- lucide-react icons.
- Recharts for charts.
- react-hook-form + zod for forms.
- date-fns.
- Sonner toasts.
- Route-style pages (TanStack Router file routes under `/admin/*`).

**Code rules:**
- Use semantic design tokens as CSS variables. No raw hex in components.
- Build reusable components.
- Use realistic **Indian mock data**: Indian names, ₹ amounts in en-IN format (₹1,25,000), +91 phone numbers, IST times, cities such as Kota, Pune, Bengaluru.

---

## PART B — Visual direction: "Calm futurism"

### B1. Mood
A dark-first **operations command center**:
- Deep navy ground.
- Frosted-glass panels.
- Faint blueprint grid lines.
- Soft cyan light, used rarely and on purpose.

Think "Linear × Vercel dashboard × architectural blueprint", **not** a neon gaming UI. It must still be a fast tool for daily work.

Ship both **dark (default for this redesign)** and **light** themes, plus a visible theme toggle with a "System" option.

### B2. Brand and colour tokens (keep these, they come from the logo)
- **Navy ink:** `#0A141E`. Dark ground and light-mode text.
- **Dark surfaces:**
  - card `#111E2A`
  - elevated `#16263A`
  - border `rgba(148,167,178,0.14)`
- **Primary (action):** `#00696F` in light mode, `#2AB3AB` in dark mode.
- **Brand gradient:** teal `#00B4B4` → cyan `#00D8CC`.
  - **Reserve it** for the logo, the signature Occupancy Tower (see B4), focus rings and one hero glow per page.
  - Never use it as a status colour.
- **Info / steel:** `#00609C`.
- **Status colours** must stay separate from the brand teal:
  - **success** (paid, occupied, resolved): forest green, `#15803D` light / `#34D399` dark.
  - **warning** (due soon, pending, near SLA): `#B45309` / `#FBBF24`.
  - **destructive** (overdue, breached, rejected): `#DC2626` / `#F87171`.
  - **info:** `#00609C` / a lighter steel.
- **Bed status tokens:**
  - Vacant: neutral `#8A98A0`, ○ outline glyph.
  - Occupied: success, ● filled glyph.
  - Maintenance: warning, wrench glyph.
  - Blocked: destructive, ⊘ glyph.
  - Every status also shows an icon or label. Never rely on colour alone.

### B3. Typography
- **Sora** for display text: page titles, KPI numbers, wordmark.
- **Inter** for UI and tables.
- **JetBrains Mono** for IDs: invoice #, payment #, admission #, ticket #TK-XXXXXX, refund #.
- **Noto Sans Devanagari** as a fallback. The app is bilingual (English / हिन्दी), so labels must handle roughly 30% longer Hindi strings.
- Use tabular numerals for money and counts.

### B4. Signature element: the Occupancy Tower
The logo is a set of rising building columns. Turn occupancy into **stacked vertical towers**:
- One tower per **block**, segmented by **floor**.
- Occupied segments fill upward in green. Vacant segments are outlines. Maintenance and blocked segments are hatched.
- A teal→cyan glow sits at the top of each tower.
- Segments rise once on load.

Use this tower on the Dashboard hero and the Allocations page. Empty properties show a faint outline tower "waiting to fill". Spend boldness here and keep everything else quiet.

### B5. Surfaces, depth, motion
- **Glass cards:**
  - `backdrop-blur`
  - a 1px inner highlight on the top edge
  - a cool navy-tinted shadow (not black)
  - radius 16px for cards, 12px for dialogs, full for pills
- **Bento grid** layouts on overview pages. 12 columns, max content width 1440px.
- **Status chips:** tinted background with coloured text and a leading dot. "Active" and live states get a slow pulsing dot.
- **Motion:**
  - 150ms for hover
  - 200ms for popovers
  - 250ms for sheets
  - number count-up on KPIs
  - subtle sheen on hover
  - **Always respect `prefers-reduced-motion`.**
- **Focus ring:** 2px cyan at 45% opacity with a 2px offset. Never suppress it.
- **Empty states:** a line-art tower or blueprint illustration, one sentence and one primary action.
- **Loading:** shimmer skeletons that match the real layout.
- **Errors:** an inline card with the error text and a **Try again** button.

### B6. Non-negotiables
- WCAG 2.1 AA contrast in both themes.
- Full keyboard support.
- Labels on every input.
- Touch targets of at least 44px on mobile.
- Mobile-usable down to 360px:
  - Tables turn into cards or a "priority columns + details sheet" layout.
  - Dialogs become bottom sheets.
- Money: always the full ₹ amount. Never confirm a money action optimistically. Always confirm destructive or money actions, and state the consequence in plain words.
- Times are shown in IST and labelled "IST" wherever scheduling happens.
- Sentence case. The action keeps its name through the flow: a **Publish** button gives a "Published" toast.
- `aria-live="polite"` for realtime updates.

---

## PART C — Everything the UI must contain (from the current codebase)

### C0. Global app shell

**Left sidebar** (260px, collapses to a 72px icon rail):
- Logo lockup, or just the mark when collapsed. Collapse/expand button.
- **Property Switcher:**
  - Building icon, active property name, list of properties with a check on the active one, and a "No property yet" state.
  - It scopes **every** page.
  - **IMPROVE:** show each property's occupancy % and city in the list, and add an "All properties" roll-up option.
- **Navigation** (in this order):
  1. Dashboard
  2. Properties
  3. Students
  4. Allocations
  5. Attendance
  6. Finance
  7. Complaints
  8. Support
  9. Notices
  10. Staff (page title "Users")
  11. Reports
  12. Settings
- Active item: a glowing left indicator bar plus tinted background.
- **IMPROVE:** add live count badges, for example open complaints, pending approvals, overdue returns.
- **IMPROVE:** group the items under the headings **Overview / Residents / Money / Operations / Admin**.

**Top bar** (sticky, glass):
- Mobile hamburger that opens the nav in a sheet, including the property switcher.
- Breadcrumb or page title.
- **Command palette** (Ctrl/⌘ K), with a "Search…" pill showing the shortcut.
  - Today it only searches pages.
  - **IMPROVE:** also search students (name / admission #), rooms and beds, invoices (#), complaints (#) and tickets. Add quick actions: Add student, Record payment, Create invoice, Compose notice, Mark attendance.
- **Notification bell:**
  - Unread badge capped at "9+". aria label "Notifications (n unread)".
  - Dropdown titled "Notifications" with 20 items. Each item has a title, a body (invoice # / complaint #) and a relative time. Unread items are tinted.
  - Opening the dropdown marks all as read. Footer link "View all notifications". Empty state "No notifications yet."
  - Clicking an item deep-links:
    - complaint → Complaints with that complaint open
    - support ticket → ticket detail
    - refund → Revenue & Collections
- **Language switcher:** EN / हिन्दी. Today it is only in the mobile header. **IMPROVE:** add it to the desktop top bar too.
- **Theme toggle.** Today admins can't choose; the theme follows the OS. **IMPROVE:** offer Light / Dark / System.
- **Account avatar menu:** photo or initial with a ring. Items: Profile, Sign out (red). Sign-out confirm dialog "Sign out?".

**Impersonation banner** (sticky above everything, cannot be dismissed, refreshes every 30s):
- Active session (red, shield icon): "A Hostylia support agent is currently accessing your account ({read only | standard | elevated}) until {time}. Reason: {reason}".
- Ended in the last 10 minutes (amber): "A Hostylia support session on your account ended at {time}. Review activity in your audit log if needed."

**IMPROVE: subscription banner.** The backend has expiry states that admins never see today: ENDING_SOON (7 days or fewer), ENDS_TODAY, ENDED. Show a slim banner, for example "Your plan ends in 3 days", with a link to Settings → Billing.

---

### C1. Dashboard (`/admin/dashboard`) — the hero page

**What it shows today** (keep all of it):
- **4 actionable KPI tiles.** Each tile is clickable and has a chevron, a tone colour, an icon and a faint watermark of the icon.
  1. **Occupancy %**, with a progress bar. Formula: occupied ÷ (occupied + vacant); maintenance and blocked beds are excluded. Opens Properties.
  2. **Collections this month** (₹, captured payments). Opens Revenue & Collections.
  3. **Open complaints** (counts OPEN, ASSIGNED, IN_PROGRESS, WAITING_FOR_STUDENT and REOPENED). Opens Complaints filtered to Open.
  4. **Active students.** Opens Students filtered to Active.
- **Room Occupancy:** a donut chart (Occupied / Available) with % in the centre, and a legend with Total beds, Occupied and Available. Empty state "No beds set up yet".
- **KYC Approvals queue:** pending student documents, oldest first. Each row: student name, admission #, "{AADHAAR | COLLEGE_ID | PHOTO | OTHER} • {filename}", and **View / Reject / Approve** buttons. Reject asks for a required reason. Empty state "No KYC documents awaiting review".
- **Recent Activity feed** (8 items). Each item has a type icon, a type label, detail text and a timestamp. The types are: Student Added, Staff Invited, Allocation Created, Payment Received, Invoice Created, Complaint Created, Complaint Resolved, Notice Created.
- **States:**
  - "Select a property to see live metrics."
  - No properties yet: EmptyState "Add your first property" / "Set up a property to start onboarding students, tracking fees and gate activity." with an **Add property** button.

**IMPROVE: futuristic bento layout.** Use only data the app already has:
- **Hero row:**
  - Greeting with the time of day, property name and IST date.
  - **Quick actions:** Add student, Allocate bed, Record payment, Create invoice, Compose notice, Mark attendance.
- **Occupancy Tower** (signature, see B4). Towers per block and floor, with hover tooltips per floor: occupied / vacant / maintenance / blocked.
- **KPI strip:** the 4 KPIs above, plus Outstanding ₹, Collection rate %, and Today's attendance (marked vs total).
- **"Needs your attention" inbox.** A single prioritised list with tabs and counts:
  - KYC documents pending
  - Refunds pending approval (Approve / Reject inline)
  - Leave requests awaiting review
  - Move-out notices ("Review & move out")
  - Overdue gate-pass returns (with time overdue)
  - SLA-breached complaints
- **Money pulse:**
  - Mini aging bars: Current / 0–30 / 31–60 / 60+.
  - Collected vs billed ring for this month.
- **Activity timeline:** a vertical glowing timeline with type filters.

---

### C2. Properties

**Properties list** (`/admin/properties`):
- Header: "Properties" — "Manage your hostel/PG properties and their setup". Button **+ Add new property**.
- **Table columns:**
  - Name (building icon)
  - City
  - Status badge: DRAFT / ACTIVE / INACTIVE / SUSPENDED
  - Beds
  - Occupancy %
  - Actions menu: **Setup**, **Structure**
- **IMPROVE:** a card/grid view where each property card has a mini occupancy tower.
- **States:**
  - Loading skeleton.
  - Empty: "No properties yet — Create your first property to onboard students, add rooms and start collecting fees." with an **Add property** button.
- **Add property dialog:**
  - **Property name:** must contain letters, at least 2 characters.
  - **City:** select of 30 Indian cities (Mumbai, Delhi, Bengaluru, Hyderabad, Ahmedabad, Chennai, Kolkata, Pune, Jaipur, Lucknow, Kanpur, Nagpur, Indore, Bhopal, Patna, Vadodara, Ludhiana, Agra, Nashik, Varanasi, Kota, Surat, Coimbatore, Chandigarh, Guwahati, Thiruvananthapuram, Dehradun, Ranchi, Raipur, Amritsar) plus "Other…", which reveals a free-text city field.
  - Buttons: **Cancel** / **Create & continue →**. The second leads into the Setup wizard.

**Setup wizard** (`/admin/properties/:id/setup`):
- Title "Setup — {name}". A 3-step stepper you can click: **Basics → Address → Branding**. Completed steps show a ✓.
- **Basics:**
  - Property name (2–120 characters).
  - Slug: auto-filled from the name, lowercase letters, digits and dashes. Hint "Public application link: /apply/{slug}".
  - Type: Hostel / PG / Dormitory / Coaching hostel.
  - Gender policy: Male only / Female only / Co-ed / Custom.
  - Phone and Email (both optional).
- **Address:**
  - Address line 1 (required)
  - Address line 2
  - Landmark
  - City (required)
  - State (required)
  - Postal code (6-digit PIN)
  - Country code (2 letters, default IN)
  - Timezone (IANA name, default Asia/Kolkata)
- **Branding:** logo upload (image only, saved immediately; used on invoices and in the student/parent app).
- Footer: **← Back**, **Save**, then **Save & continue →** on steps 1–2 or **Finish setup** on step 3 (sets the property ACTIVE).
- States: loading, and error with **Try again**.

**Structure** (`/admin/properties/:id/structure`), "Manage blocks, floors and rooms":
- Header actions: **Import CSV**, **+ Block**.
- Hierarchy: **Block cards** (name and code badge, **+ Floor**). Inside each block, **collapsible Floor rows** (name, "L{n}", "{n} rooms" badge, **+ Room**). Floors are ordered Basement, Ground, First … Terrace. Inside each floor, **Room cards**:
  - "Room {n} · Capacity {n}"
  - Room type badge: SINGLE / DOUBLE / TRIPLE / DORM / CUSTOM
  - Room status badge: ACTIVE / MAINTENANCE / BLOCKED / INACTIVE
  - A **bed grid**
- A separate card "No block (floors direct on property)".
- **Bed grid:**
  - Legend chips with counts for Vacant, Occupied, Maintenance and Blocked.
  - Each bed tile shows "Room 101 - B1", the occupant name, or a restriction note such as "{reason} · until {date}".
  - Clicking a tile opens **Manage status**.
- **Add block:** Block Name (required, max 80, unique), Block Code (optional, max 20, unique).
- **Add floor:** Floor Name (required, max 80, unique).
- **Add room:**
  - Block and floor shown read-only.
  - Room Number (required).
  - Room Type, default DOUBLE.
  - Capacity: locked to 1 / 2 / 3 for SINGLE / DOUBLE / TRIPLE; 1–50 for DORM / CUSTOM.
  - Base Rent ₹ (optional).
  - Button **+ Add room + beds** (beds are created automatically).
- **CSV import:**
  - Columns `block_name, block_code, floor_name, floor_number, room_number, room_type, capacity, base_rent`.
  - **Download sample CSV** button and a file picker.
  - Preview "{valid} valid • {n} errors" with an error list in the form "Row N (line L): msg".
  - Result "{n} rooms imported, {n} failed". Button **Import {n} rows**.
  - **IMPROVE:** make it a drag-and-drop zone with a preview table.
- **Manage bed status dialog:**
  - Occupied bed: read-only explanation.
  - Vacant bed: radio cards **Maintenance / Blocked**, a required reason, and an expected completion date (maintenance only, today or later). Buttons **Mark under maintenance** / **Mark blocked**.
  - Maintenance or blocked bed: **Return to vacant**.
- **IMPROVE:** edit or delete blocks, floors and rooms; drag to reorder.

---

### C3. Students

**Students list** (`/admin/students`):
- **Toolbar:**
  - **Share public form:** copies the `/apply/{slug}` link. Toast "Admission link copied — share it with applicants via WhatsApp/SMS."
  - **Bulk import**
  - **Add student**
  - Property select (only when there is more than one property)
  - **Status filter:** All, Applicant, Verified, Active, Notice given, Moved out, Archived
  - **Search** by name
- **Move-out notices panel** (only shown when there are notices):
  - Header with a count pill.
  - Each row: student name, #admission, "{property} · Room / Bed", "Notice {date} · Moving out {date}", reason, and a **Review & move out** button.
- **KPI cards:** Total, Active, Applicants.
- **Table columns:**
  - Name: coloured initials avatar, first and last name.
  - Admission # (mono)
  - Phone
  - Status badge:
    - APPLICANT: muted
    - VERIFIED: info
    - ACTIVE: success with a pulse
    - NOTICE_GIVEN: warning
    - MOVED_OUT: muted
    - ARCHIVED: muted
    - REJECTED: destructive
  - Actions:
    - **View**
    - **Archive.** Disabled with a tooltip when the student is ACTIVE or NOTICE_GIVEN, or has an open allocation.
    - **Permanently delete.** Only in the Archived view.
- **Pagination:** 10 / 25 / 50 per page, "X–Y of Z", Previous / Next, "Page N of M".
- **Archive confirm:** "Archive {name}?" — "Nothing is deleted… find them under the Archived filter."
- **Permanent delete confirm:**
  - Runs a dependency check first ("Checking what depends on this student…").
  - **Blocked:** lists the protected records as "{label}: {count}".
  - **Allowed:** lists the consequences — KYC files deleted, guardian links removed, what happens to the login, and that an audit entry is kept.
  - Button **Delete permanently**.
- **Add student dialog:**
  - Full name \*
  - Phone (+91)
  - Email
  - Date of birth
  - Gender: Male / Female / Other
  - Divider
  - Guardian name \*
  - Guardian phone \*
  - Toast "Student added — admission #{n}".
- **Bulk import students CSV:**
  - Columns `full_name, phone, email, date_of_birth, gender, academic_institute, course_name, guardian_name, guardian_phone`.
  - Sample download.
  - Duplicate detection ("Checking for duplicates…").
  - Preview "{n} will import • {n} duplicates (skipped) • {n} failed". Button **Import {n} valid rows**.
- **States:**
  - Loading.
  - Error.
  - Empty: "No students yet — Share your public admission link or bulk import to start onboarding."
- **IMPROVE:** bulk row actions and CSV export.

**Student detail** (`/admin/students/:id`):
- **← Back to students** link.
- **Header card:** avatar, name, status badge, "Admission #{n} • {phone}". Actions:
  - **Confirm & link account** (when the portal is not linked)
  - **Move out** (when ACTIVE or NOTICE_GIVEN)
- **IMPROVE:** make it a "profile hero" with stat chips: current room/bed, dues outstanding, attendance %, KYC state.
- **Profile card:**
  - Email
  - Institute
  - Date of birth
  - Course
  - Gender
  - Minor (Yes/No)
  - Portal access (Linked / Not linked yet)
- **Tabs** (stacked on mobile):
  - **Guardian / Parent:**
    - Each row: name, "Primary" badge, relationship, phone, and an **Edit phone** button that opens a dialog with an Indian mobile check.
    - Empty: "No guardian linked yet."
  - **KYC documents:**
    - Summary banner, one of:
      - "Pending — awaiting student upload"
      - "Rejected — awaiting re-upload"
      - "Uploaded — awaiting warden review"
      - "Complete"
    - **View details** dialog: each row has the document type (AADHAAR / COLLEGE_ID / PHOTO / OTHER), a status (VERIFIED / PENDING / REJECTED / NOT REQUIRED), the rejection reason, and **View**, **Approve** and **Reject** (Reject needs a reason).
    - The document viewer shows images and PDFs inline and has **Open in new tab**.
  - **Boarding agreement:**
    - Status: "Completed — signed {date}" or "Pending — awaiting student acceptance".
    - **View document** dialog: "Template {v} · signed {datetime} via click-wrap", plus the agreement text.
    - Empty: "No agreement yet — allocate a bed to generate one."
  - **Allocation history:**
    - Each entry: "{start} → {end | open}", "Block • Floor • Room • Bed", "Fee plan: {name (code)}", Rent ₹, Deposit ₹.
    - Empty: "No allocations yet. Assign a bed from Allocations."
    - **IMPROVE:** show it as a timeline.

**Move-out wizard** (`/admin/students/:id/move-out`):
- Header "Move out — {name} · Admission #{n}".
- Content depends on the allocation state:
  - **No allocation found:** "No active allocation found."
  - **Pending payment or pending agreement:** "This allocation is still awaiting payment/agreement — there is no stay to move out of yet."
  - **NOTICE_GIVEN:** a "Move-out notice" card with Notice given on, Proposed move-out date, Reason and Remarks.
  - **ACTIVE / NOTICE_GIVEN / MOVE_OUT_INSPECTION:** a "Move-out details" card with:
    - Notice period (days), Lock-in until, Earliest permissible move-out, Provisional refund ₹.
    - **Settlement table:** Outstanding invoice (number and due date), Due, From deposit.
    - Settlement figures: Deposit balance, Total outstanding dues, Deducted from deposit, Still outstanding after deposit, Refunds in progress, **Refundable deposit**.
    - **Actual move-out date:** defaults to today; can't be later than today or earlier than the stay start. Shows a warning when it is earlier than the permissible date.
    - Button **Confirm move-out & archive**.
  - **CLOSED:**
    - "Move-out completed" card, with the shortfall warning if dues are still outstanding.
    - **Deposit refund form:**
      - Against payment: "{payment#} · up to ₹X"
      - Refund mode: Bank transfer / Original method / Cash / Other
      - Reason (default "Security deposit refund at move-out")
      - Button **Submit refund for approval**
- **IMPROVE:** a proper visual stepper — Notice → Settlement → Move-out → Refund.

---

### C4. Allocations (`/admin/allocations`)
- Link card **Manage rooms & beds** that opens Structure.
- **4 status cards:** Vacant (available beds), Occupied, Maintenance, Blocked.
- **Search rooms:** by bed code, room number or occupant name.
  - With no search, only vacant beds are listed.
  - **IMPROVE:** a status filter chip row.
- **Grid / List view toggle.**
  - Bed cards: status icon, "Room X - B1", status pill, occupant or restriction note. Vacant beds get an **Allocate** button.
- Pagination: 48 per page.
- Tip strip: "Tip: Click on any room…" / "Occupancy status is updated in real-time", with a **Need help?** link to Support.
- **IMPROVE:** a floor-plan / tower view toggle where you click a segment to open its beds.
- **Allocate bed dialog:**
  - **Student picker:** searchable by name or admission #, paginated. Lists Applicant, Verified, Active and Notice-given students.
  - If the student already has an open allocation, show a warning card instead (current bed, room, status, since, rent) and offer **Swap**, which keeps the agreement, invoices and history.
  - Otherwise the form:
    - **Fee plan** (required). If there are none: "No active fee plan for this property — create one first…"
    - **Start date** (today)
    - **Rent ₹** (default 5000)
    - **Deposit ₹** (default 10000)
  - Buttons: **Cancel**, **Manage status**, **Allocate** / **Swap**.
  - Toast "Bed allocated — agreement sent to student".
- **Bed details dialog:**
  - Occupied: student box (name, admission #, phone), Since, Status, Rent, Deposit, and buttons **View student** and **Deallocate / move out**.
  - Other statuses: "This bed is currently {status}…" with a **Manage status** button.

---

### C5. Attendance (`/admin/attendance`)
- **Monthly "Attendance summary" panel:**
  - Month picker (no future months) and **Export** (CSV / PDF).
  - KPIs: Total Students, Present (days), Absent (days), Avg attendance %.
  - Sortable table, 25 per page:
    - Student (avatar)
    - Admission #
    - Present
    - Absent
    - Late
    - Leave
    - Out-pass
    - Marked days
    - Attendance %: green at 85 or above, info at 70 or above, amber at 50 or above, red below 50
- **Leave requests awaiting review ({n}):**
  - Each request: name · admission #, date or range, reason, remarks.
  - **Approve** / **Reject**. Reject needs a reason, which is shown to the student.
- **Overdue gate-pass alert:** "{n} overdue return(s) — out on a gate pass, no return scan". Each row: name, admission #, Room/Bed, pass #, "Left {t}", "Due back {t} · {Xh MMm} overdue".
- **Daily controls:**
  - Date picker. Saving is only allowed for today.
  - **Mark all Present** (skips students on leave or on an out-pass).
  - **Save**.
- **6 daily summary cards:** Total Students, Present, Absent, Late, On Leave, Out-Pass.
- **Filters:**
  - Search by name, student ID or room.
  - Status: All / Present / Absent / Late / On Leave / Out-Pass.
  - Room selector: searchable, "All Rooms ({n})" or "Room N ({count})".
- **Roster rows** (50 per page):
  - Avatar, name, "{admission#} · Room · Block".
  - Badges: On Leave; Out-Pass (left / due back / overdue); "Saved: {status} — {notes}".
  - Status select: Present / Absent / Late. **Locked** for students on leave or on an out-pass.
  - Remark field, required for Absent or Late. The row gets a red edge until the remark is filled.
  - Delete saved record, with a confirm dialog.
- **IMPROVE:** one-tap segmented Present / Absent / Late buttons instead of a select, keyboard shortcuts (P / A / L), and a sticky progress bar such as "142 / 180 marked".

---

### C6. Finance

**Finance hub** (`/admin/finance`): 4 cards. Today the descriptions exist in code but aren't shown. **IMPROVE:** show them, plus a live number on each card.

| Card | Description | Live number to show |
|---|---|---|
| Fee plans | Rent/mess/deposit templates | number of plans |
| Invoices | All invoices for this property | number overdue |
| Record payment | Cash, cheque, bank transfer or UPI | — |
| Revenue & Collections | Collections + aging + refunds | number of pending refunds |

**Fee plans:**
- **Form "Create / Edit Fee Plan":**
  - Name (2–120 characters)
  - Code (2–40 characters, e.g. STD-RENT)
  - Billing frequency: Monthly / Quarterly / Half-yearly / Yearly / One-time / Custom
  - Invoice generation day (1–28)
  - Grace days (0–30)
  - Plan starts from (date)
  - Status: Draft / Active / Inactive / Archived
  - **Components** list with **+ Add**. Each row:
    - Name
    - Type: Rent / Mess / Deposit / Maintenance / One-time / Late fee / Other
    - Amount ₹
    - Remove button
    - Checkbox "Allow zero amount"
  - At least one component is required.
  - **IMPROVE:** show the fields that exist in the schema but are hidden today:
    - Late fee type (None / Fixed / Percentage) and late fee value
    - Effective until
    - Per-component flags: Refundable, Taxable, and GST tax rate
- **Plan list:**
  - Each plan: name, "{code} · {frequency} · due day {n} · {status}", total ₹, **Edit**, **Delete**.
  - Delete confirm explains that a plan still used by an active allocation is deactivated instead of deleted.
  - Empty: "No fee plans yet."

**Invoices:**
- Header actions: **Export CSV**, **+ Create invoice**.
- **Overdue drill-down banner:** "Overdue invoices: past their due date with an outstanding balance, issued {range} ({count})", with **Clear filter**.
- **Status filter:**
  - All Invoices
  - Payment Pending (ISSUED)
  - Partially Paid
  - Paid
  - Overdue
  - Partially Refunded
  - Refunded
  - Cancelled (VOID)
- **Table:** #, Student, Due, Status, Total, Remaining Balance. Click a row to open the detail. 20 per page, server-side.
- **Status tones:**

| Status | Tone |
|---|---|
| DRAFT | muted |
| ISSUED | info |
| PARTIALLY_PAID | warning |
| PAID | success |
| OVERDUE | destructive |
| VOID | muted, line-through |
| PARTIALLY_REFUNDED | warning |
| REFUNDED | muted |

- **IMPROVE:** remove the fake static footer and add a summary strip above the table: Billed / Collected / Outstanding.
- **Create invoice dialog:**
  - Student/allocation combobox: search by name, admission #, room or bed. Items show "{name} ({admission}) — Room · Bed · {plan}".
  - Billing period start / end (defaults to the current month).
  - Due date (auto-set to today + the plan's grace days).
  - Notes (≤500).
  - Info: the total is computed from the fee plan components; a duplicate for the same allocation and period is rejected.
- **Invoice detail dialog:**
  - Invoice # (mono), status, student.
  - Subtotal, Tax, **Total**, Paid, Remaining Balance.
  - Editable due date and notes, with the hint "Amounts can't be edited once an invoice is issued — void and create a corrected invoice instead."
  - **Delete invoice:** voids the invoice and needs a reason (≥3 characters). Explains that issued invoices are never hard-deleted.
  - **IMPROVE:** also show Discount, Late fee, Refunded, the Seller and Buyer GSTIN block, the payment history list with receipt download, and actions **Record payment** and **Download PDF**.

**Record payment:**
- **Invoice** select: "{invoice#} — {student} — ₹{balance}". Lists open invoices only, updated live.
- **Mode:** Cash / Cheque / Bank transfer / UPI / Other.
- **Amount ₹.**
- **Reference** (depends on mode):
  - UPI and Bank transfer: "Transaction ID / UTR" (required)
  - Cheque: "Cheque Number" (required) plus Cheque date
  - Other: optional
  - Cash: hidden
- **Notes.**
- Button **Record payment**. Toast "Payment recorded: {payment#}".
- **IMPROVE:**
  - A two-pane layout: form on the left, live invoice preview on the right with the balance before and after.
  - Add the admin payment history list that exists for other roles: payment #, student, invoice #, mode, status, date, amount, receipt download.
  - **Payment status labels:**
    - CREATED: Created
    - PENDING: Pending
    - AUTHORIZED: Authorized
    - CAPTURED: Successful
    - FAILED: Failed
    - CANCELLED: Cancelled
    - PARTIALLY_REFUNDED: Partially refunded
    - REFUNDED: Refunded

**Revenue & Collections** ("Finance overview"):
- **Export** (CSV / PDF).
- **KPIs:** Total Invoiced, Collected, Outstanding.
- **Aging (outstanding balance):** Current / 0–30 days / 31–60 days / 60+ days.
- Collection rate %, with the note "not a full P&L (does not capture expense data)".
- **Pending refund approvals** (maker-checker; the owner is the approver):
  - Each row: refund # (mono), "{student} — ₹amount", reason, **Approve** / **Reject**.
  - **IMPROVE:** a confirmation step and an optional decision reason.
- **Refund history** (last 100; refreshes while any refund is processing):
  - Each card: refund # · student, status, ₹ · reason, decision reason, "Requested {d} · Decided {d}".
  - Status tones:

| Status | Tone |
|---|---|
| DRAFT | muted |
| PENDING_APPROVAL | warning |
| APPROVED | info |
| PROCESSING | info |
| COMPLETED | success |
| REJECTED | destructive |
| FAILED | destructive |
| CANCELLED | muted |

  - **Gateway (Razorpay) actions:**
    - **Process refund**
    - **Check status**
    - **Retry gateway request**
    - **Retry ({n}/5 attempts)**
  - **Offline payout action:** **Record payout**, which asks for a transaction/cheque reference, then **Confirm payout**.
- **IMPROVE:** a monthly billed-vs-collected trend chart and a refund pipeline (kanban-style status lanes).

---

### C7. Complaints (`/admin/complaints`)
- **Filters:**
  - Status: All / Open / Assigned / In progress / Resolved / Closed / Reopened ("Open" means every open status).
  - Category: the property's categories.
  - Block.
  - **IMPROVE:** add search, sort by SLA urgency, and a **Kanban view** with lanes Open → Assigned → In progress → Resolved → Closed, alongside the list view.
- **Default categories** (priority, SLA):

| Category | Priority | SLA |
|---|---|---|
| Electrical | HIGH | 4h |
| Plumbing | HIGH | 4h |
| Cleanliness | MEDIUM | 12h |
| Wifi/Internet | MEDIUM | 6h |
| Furniture | LOW | 24h |
| Mess/Food | MEDIUM | 8h |
| Security | URGENT | 1h |
| Other | MEDIUM | 12h |

- **Complaint card** (left edge coloured by SLA state):
  - Complaint # (mono)
  - Priority: LOW muted, MEDIUM info, HIGH warning, URGENT red
  - Category chip and title
  - **Status badge** with icon:

| Status | Tone | Icon |
|---|---|---|
| OPEN | muted | clock |
| ASSIGNED | primary | user-check |
| IN_PROGRESS | primary | loader |
| WAITING FOR STUDENT | warning | — |
| RESOLVED | success | — |
| CLOSED | muted | — |
| REOPENED | warning | — |
| CANCELLED | muted, line-through | — |

  - **SLA badge:** "SLA in {Xh Ym}" (turns amber under 60 minutes), "SLA breached {duration} ago" (red), or "Closed". Show the red "⚠ SLA breached" flag when it applies.
    - **IMPROVE:** a live countdown ring.
  - Student: avatar, name · admission # · Room · Block. Admins see the identity even for anonymous complaints.
  - "Raised {datetime}" | "Resolved on {datetime}".
  - Description (3 lines).
  - Resolution box: "Resolved by {name}", "Resolution: {summary}".
- **Actions:**
  - **View Details**
  - **Assign:** dialog "Choose a warden"; lists wardens in scope. States "No wardens in scope" and "Could not load wardens — try again".
  - **Start Working:** shown when ASSIGNED.
  - **Resolve:** a resolution summary is required (3–2000 characters), e.g. "Water leakage repaired and plumbing issue fixed." Button **Mark resolved**.
  - **Reopen Override** (outside the student's 48-hour window). Two steps:
    1. A reason of 10–1000 characters, with the note "Your name, the time and your reason are recorded in the complaint history."
    2. Confirm "Reopen this complaint?" with **Back** / **Confirm reopen override**.
- **Details dialog:**
  - "{#} — {title}", description, category · priority, the student box and the resolved box.
  - **Timeline:** Created, Assigned, SLA due, SLA breached, Resolved, Closed.
  - **Conversation thread:** each comment has the author, a role badge (Student / Warden / Admin) and a time. Composer "Add a comment" with **Post**.
- **Status workflow:**
  - OPEN → ASSIGNED / IN_PROGRESS / RESOLVED
  - ASSIGNED → IN_PROGRESS / RESOLVED
  - IN_PROGRESS → RESOLVED
  - REOPENED → ASSIGNED / IN_PROGRESS / RESOLVED
  - RESOLVED → REOPENED or CLOSED (CLOSED only via auto-close)
- Empty: "No complaints match these filters."

---

### C8. Notices (`/admin/notices`)
- **Compose notice** card:
  - Title (3–200 characters)
  - Body (3–4000 characters)
  - **Priority:** Normal / Important / Urgent
  - **Audience:** All / Students / Parents / Wardens / Accountants / Custom audience
  - **Channels** (multi-select toggle pills): In-app (always on), SMS, WhatsApp, Email. Unavailable channels are disabled with a tooltip reason: "Provider not configured", "Checking provider status…", "Could not verify provider status".
  - **Schedule (optional, IST)** and **Expires (optional, IST)** pickers:
    - Calendar with past days disabled.
    - Hour 01–12, minute in 5-minute steps, AM/PM, and an "IST" tag.
    - **Clear** / **Done**.
    - Errors for invalid, past, or expiry-before-schedule times.
  - **Custom audience picker** (two columns):
    - Blocks: searchable, each shows "{n} students".
    - Students: search by name or admission #.
    - Selected chips with ×.
    - Live counter: "{n} recipient(s) selected ({k} duplicate(s) removed)".
  - Submit button: **Publish now**, or **Schedule notice** when a schedule is set.
  - Result toasts: dispatched counts, skipped counts per channel, partial-failure warnings.
  - **IMPROVE:** a live phone-style preview of how the notice looks in-app, as SMS and on WhatsApp.
- **Recent notices** card:
  - Toggle **Active / History**; **View all** / **Show less**.
  - Each item:
    - Title
    - "{AUDIENCE} · {channels}"
    - Created date
    - "Scheduled for …" / "Expires …"
    - Status badge: PUBLISHED, SCHEDULED, DRAFT, CANCELLED, EXPIRED
    - ⋮ menu: **View**, **Edit**, **Cancel** (drafts and scheduled only)
  - **IMPROVE:** a confirmation and a toast for Cancel.
- **Edit notice:** Title, Body, Priority. For published notices, warn that editing won't resend anything already sent.

---

### C9. Staff — page title "Users" (`/admin/staff`)
- Header "Users" — "Manage all users and their access", with an **Add** button.
- **Staff list** (Wardens and Accountants of the active property):
  - Avatar, Name, Contact (email or +91 phone).
  - Role badge: Warden / Accountant.
  - Status: **Active** (green pulse), **Invited** (amber), **Revoked** (red).
  - Footer: "Showing {n} users".
- **Row actions:**
  - Invited: **Resend invitation**, **Cancel invitation**.
  - Active: **Edit**, **Revoke access**.
  - All: **Delete**.
  - Expand: **Show feature access**.
- **Feature Access panel** (read-only): permission check-grid grouped as Notices, Complaints, Invoices & Payments, Attendance, Students, Visitors, Rooms & Beds. Empty: "No custom permissions configured — using role defaults."
- **Add Staff dialog:**
  - Role: Accountant / Warden.
  - **Block access** (Warden only): "All blocks (property-wide)" or a single block.
  - Name.
  - Phone (optional, Indian mobile) and Email \*.
  - Contextual hint: with a phone they sign in by OTP; with email only they get an invite email.
  - Duplicate check: "This mobile number / email is already registered."
  - **Customize Permissions** switch:
    - **Warden:** a module × CRUD matrix. Columns **Read / Create / Update / Delete**, "—" where an action doesn't exist.
      - Students
      - Allocations (no delete)
      - Attendance
      - Complaints (read and update share one permission)
      - Rooms / Beds (also covers blocks and floors)
      - Gate Pass
      - Visitors
      - Notices (read and create share one permission)
      - Reports (read only; controls the Reports section)
    - **Warden finance add-ons:**
      - View / Create / Edit / Delete Fee Plans
      - View / Create / Edit / Delete Invoices
      - View Payments, Record Cash/Cheque Payments, Edit Payments, Delete Payments
      - Refunds
    - **Accountant operational add-ons:**
      - Manage Attendance
      - Manage Complaints
      - Manage Gate Pass/Out-Pass
      - Manage Gate Events
      - Manage Visitors
      - Manage Notices
      - Manage Mess Menu
      - Manage Feedback
      - Create / Edit / Delete Students
- **Edit dialog:** Name, Phone, Block access, Customize Permissions.
- **Revoke confirm:** "They lose access to this hostel immediately…"
- **Cancel invitation confirm.**
- **Delete confirm:** "unlike Revoke, this can't be undone".
- **States:** loading, error with **Try again**, empty "No staff yet — Invite your first Warden or Accountant above."
- **IMPROVE:**
  - Make the permission matrix a slick toggle grid with "Select row / column" helpers and role preset chips.
  - Add search, plus last-active time per user.

---

### C10. Reports (`/admin/reports`)
Four sections. **IMPROVE:** a sticky section nav or tabs. Every section has **Export CSV / PDF**.
1. **Occupancy accuracy:**
   - Bar chart of occupancy % per block. Bar colour: ≥85 green, ≥60 info, ≥40 amber, below that red.
   - Sortable table: Block, Total, Occupied, Vacant, Maintenance, Blocked, Occupancy %, with a pinned "Property Total" row.
2. **DSO & aging:**
   - **Date range filter:** Current month / Previous month / custom range calendar (IST, matched by issue date).
   - **6 KPIs:**
     - Total billed
     - Payments received
     - Refunded amount
     - Collection rate (with the formula detail)
     - Pending payments
     - **Overdue invoices**: clickable; opens Invoices filtered to overdue for that range
   - "DSO aging buckets (₹)" bar chart: Current, 0–30, 31–60, 60+.
   - Unpaid invoice table: Invoice #, Student, Due, Days overdue, Bucket, Outstanding, Status. 25 per page. Empty "No overdue invoices. 🎉"
3. **Complaint SLA compliance:**
   - Bar chart of compliance % per category. Colour: ≥90 green, ≥75 info, ≥50 amber, below that red.
   - Table: Category, Warden, Total, Within SLA, Breached, Compliance %.
4. **Attendance summary:** the same monthly panel as in C5.

---

### C11. Support (`/admin/support`)
- **New ticket** button.
- **Tickets table:**
  - Subject, with the ticket # "#TK-XXXXXX" in mono.
  - **Category** (icon and tone):
    - Technical Issue
    - Login/Authentication
    - Finance/Billing
    - Gate Pass
    - Attendance
    - Complaints
    - Reports
    - Student Management
    - Other
  - **Priority:**
    - Low: ↓
    - Medium: –
    - High: ↑, red
    - Urgent: flame, red
  - **Status:**
    - Open: warning
    - In Progress: info
    - Waiting for Admin: muted
    - Resolved: info
    - Closed: muted
- "Need help?" CTA card: "Create a new ticket and our team will get back to you." Empty "No support tickets yet."
- **New ticket dialog:**
  - Subject (3–200 characters)
  - Category (required)
  - Priority (default Medium)
  - Description (10–5000 characters, placeholder "What's happening, what did you expect, steps to reproduce…")
- **Ticket detail:**
  - **← Back to Support**.
  - Title, "{category} · Priority {p}", status badge, "Opened {datetime}".
  - Description card.
  - Resolution card when resolved or closed: Resolved by, Resolved at, Resolution.
  - **Chat-style thread:** "You" vs "Support", with timestamps and attachment links.
  - Reply composer (hidden when closed): textarea, **Attach screenshot**, **Send**.
  - **Close ticket** (only when resolved).
- **IMPROVE:**
  - Filters by status and priority, and show created / updated times.
  - Allow an attachment when creating a ticket.
  - Show the description as a human label, e.g. "High" rather than "HIGH".

---

### C12. Settings (`/admin/settings`)
Tabs **Property | Organization | Billing**. **IMPROVE:** a vertical settings nav with section cards.
- **Property:**
  - Curfew time (default 21:00; "Gate entries after this time flag as late.")
  - Timezone: Asia/Kolkata, UTC, America/New_York, Europe/London, Asia/Dubai, Asia/Singapore
  - Default notification channel: In-app / SMS / WhatsApp / Email (**show friendly labels, not raw enums**)
  - **Save changes**
- **Organization:**
  - Legal name
  - GSTIN (22AAAAA0000A1Z5)
  - Billing email
  - Billing phone
  - **IMPROVE:** show and edit the registered address, which already exists in the data.
- **Billing:**
  - Plan name, "₹{amount} / {interval}", status badge: TRIAL / ACTIVE / PAST_DUE / PAUSED / CANCELLED.
  - Started Date, Period Ends.
  - **Cancel subscription** (only when Active), which opens a dialog:
    - **Reason select:**
      - Too expensive
      - Missing required features
      - Difficult to use
      - Performance issue
      - Switching to another solution
      - Hostel/business closed
      - Temporary requirement
      - Other (reveals a "Tell us more" text field, ≤500)
    - "Would you like to continue using Hostylia in the future?" Yes / No
    - Additional feedback (≤2000)
    - Button **Confirm Cancellation**
  - **IMPROVE:** a plan card with a usage meter (beds and students against the plan limit, if available), trial-end date, and an "ends in N days" countdown.

---

### C13. My Profile (`/admin/profile`)
- **Header card:**
  - Avatar with a camera hover menu: **View**, **Edit** (upload), **Remove**.
  - Name, "Hostel Admin" with an **Active** badge, property name or "All properties".
  - **Edit Profile** button, which becomes **Cancel** / **Save Changes** in edit mode.
- **Contact & Identity:**
  - Full Name (editable; 2–80 characters; letters, space and . ' - only)
  - Employee ID (locked)
  - Role (locked)
  - Assigned Property (locked)
  - Phone (international format)
  - Email (locked)
- **Additional Details:**
  - Alternate Phone
  - Date of Birth
  - Gender: Male / Female / Other
  - Blood Group: A+ A- B+ B- AB+ AB- O+ O-
  - Emergency Contact Name
  - Emergency Contact Number
- **Account & Security:**
  - Email, with a "Verified" badge
  - Account Status: Active / Pending
  - Last Login
  - Password "••••••••"
  - **Change Password** inline form:
    - Current, New (8–128 characters, must differ from the current one), Confirm
    - Captcha (Turnstile)
    - **Update Password**
- **IMPROVE:** a password strength meter, a list of active sessions/devices, and a 2FA placeholder.

---

## PART D — Deliverables
1. A theme file: CSS variables for light and dark covering every token in B2, plus Tailwind v4 `@theme` mapping.
2. Shared components:
   - AppShell (Sidebar, Topbar, CommandPalette, NotificationBell, PropertySwitcher, ImpersonationBanner, SubscriptionBanner)
   - KpiTile, GlassCard, StatusBadge (one fixed status→tone map), SlaBadge
   - OccupancyTower, BedTile / BedGrid
   - DataTable (sorting, server pagination, loading / empty / error, mobile card fallback)
   - EmptyState, ConfirmDialog, ResponsiveDialog (dialog on desktop, bottom sheet on mobile)
   - DateRangeFilter, ISTDateTimePicker, ExportMenu, CsvImportDropzone, PermissionMatrix, Stepper
3. Pages, in this priority order:
   1. Dashboard
   2. Allocations
   3. Students list and Student detail
   4. Finance (hub, Invoices, Revenue & Collections)
   5. Complaints
   6. Attendance
   7. Notices
   8. Staff
   9. Reports
   10. Properties (list, Setup, Structure)
   11. Settings
   12. Support
   13. Profile
4. For every page, show the **loaded**, **loading (skeleton)**, **empty** and **error** states, plus desktop (1440px) and mobile (375px) layouts.
5. Keep every label, field, enum, validation message and action named in Part C. Add the IMPROVE items without removing anything.
