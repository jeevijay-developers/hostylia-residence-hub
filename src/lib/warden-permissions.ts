/**
 * The one Warden effective-permission resolver. It mirrors the SQL checkers
 * (has_operational_permission_property/_scope in
 * 20261026100000_warden_default_permissions_five_modules.sql, has_role_permission
 * and has_finance_permission in 20260814110000 / 20260814070000) so the Admin
 * "Feature Access" panel, the "Customize Permissions" dialog and the Warden's own
 * UI gating (useWardenPermissions) all answer "does this Warden have key X?" the
 * same way RLS does. RLS remains the real enforcement; this is display/gating only.
 *
 * Rules (for a WARDEN row; HOSTEL_ADMIN is unconditional and never customised):
 *  1. An explicit `true` / `false` in role_assignments.permissions always wins.
 *  2. Admin-only capabilities (students_delete, rooms_beds_create/delete) and every
 *     Finance key are default-deny — an absent key is false whatever the bag holds.
 *  3. Any other key, with a NON-empty bag ("Customize Permissions" ON): absent = true.
 *  4. Any other key, with an EMPTY bag ("Customize Permissions" OFF): true only for the
 *     default Warden modules (Students, Attendance, Complaints, Gate Pass, Visitors,
 *     Gate events) plus the read-only allocations_view / rooms_beds_view the backend
 *     keeps on for the student-detail room/bed lookup. Notices, Mess, Allocations and
 *     Rooms/Beds writes, and Reports are not on by default.
 */

export type WardenPermissionBag = Partial<Record<string, boolean>> | null | undefined;

// Capabilities a Warden never had by default (has_role_permission(..., 'HOSTEL_ADMIN', key)).
const ADMIN_ONLY_KEYS = new Set(["students_delete", "rooms_beds_create", "rooms_beds_delete"]);

// Finance keys are default-deny for a Warden (has_finance_permission / has_role_permission
// with ACCOUNTANT as the default role). `fee_plans` / `payments` are the legacy coarse keys.
const FINANCE_KEYS = new Set([
  "fee_plans",
  "fee_plans_view",
  "fee_plans_create",
  "fee_plans_edit",
  "fee_plans_delete",
  "invoices_view",
  "invoices_create",
  "invoices_edit",
  "invoices_delete",
  "payments",
  "payments_view",
  "payments_create",
  "payments_edit",
  "payments_delete",
  "refunds",
]);

// Backend default list when the bag is empty — keep in sync with the SQL array.
const EMPTY_BAG_DEFAULT_KEYS = new Set([
  "students_view",
  "students_create",
  "students_edit",
  "attendance_view",
  "attendance_create",
  "attendance_edit",
  "attendance_delete",
  "complaints",
  "gate_passes_view",
  "gate_passes_create",
  "gate_passes_edit",
  "gate_passes_delete",
  "visitors_view",
  "visitors_create",
  "visitors_edit",
  "visitors_delete",
  "gate_events",
  "allocations_view",
  "rooms_beds_view",
]);

// Backend-on read-only keys whose Warden *pages* are hidden by default (UI gating only).
const UI_HIDDEN_BACKEND_READS = new Set(["allocations_view", "rooms_beds_view"]);

function explicit(bag: WardenPermissionBag, key: string): boolean | undefined {
  const v = bag?.[key];
  return typeof v === "boolean" ? v : undefined;
}

/** True when "Customize Permissions" is ON (the SQL `permissions <> '{}'` test). */
export function isWardenCustomized(bag: WardenPermissionBag): boolean {
  return !!bag && Object.keys(bag).length > 0;
}

/** Default for an absent key once the bag is non-empty (rules 2 and 3). */
export function wardenCustomizedDefault(key: string): boolean {
  return !(ADMIN_ONLY_KEYS.has(key) || FINANCE_KEYS.has(key));
}

/**
 * Effective Warden permission for `key`. `forUi` additionally hides the Allocations /
 * Rooms-Beds pages by default (the backend still allows their read-only data).
 */
export function resolveWardenPermission(
  bag: WardenPermissionBag,
  key: string,
  opts?: { forUi?: boolean },
): boolean {
  const override = explicit(bag, key);
  if (override !== undefined) return override;
  if (!wardenCustomizedDefault(key)) return false;
  if (isWardenCustomized(bag)) return true;
  if (opts?.forUi && UI_HIDDEN_BACKEND_READS.has(key)) return false;
  return EMPTY_BAG_DEFAULT_KEYS.has(key);
}

/**
 * Starting values for the Customize Permissions dialog: each key's current effective
 * value (so turning customisation on / saving changes nothing by itself), plus any
 * explicit keys the dialog has no control for (e.g. mess_menus), so a save keeps them.
 */
export function seedWardenPermissions(
  bag: WardenPermissionBag,
  keys: readonly string[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(bag ?? {})) if (typeof v === "boolean") out[k] = v;
  for (const k of keys) out[k] = resolveWardenPermission(bag, k);
  return out;
}

/**
 * The bag to store when the Admin saves the dialog. Keys that were already explicit
 * are kept as-is; a key that was absent is only written when the Admin's value differs
 * from the default it would otherwise get, so saving an unrelated change never turns a
 * missing / default permission into an explicit false (or true).
 */
export function buildWardenPermissionsPayload(
  original: WardenPermissionBag,
  edited: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(edited)) {
    if (explicit(original, k) !== undefined || v !== wardenCustomizedDefault(k)) out[k] = v;
  }
  // "Customize Permissions" ON must stay a non-empty bag, otherwise the backend would
  // fall back to the (narrower) empty-bag defaults.
  return Object.keys(out).length > 0 ? out : { ...edited };
}
