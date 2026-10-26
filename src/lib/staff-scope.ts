import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

/**
 * Returns the property scope for the current staff user (any role assigned a
 * property — Warden, Accountant, or Hostel Admin). Falls back to the Zustand
 * active property (for Hostel Admin, who can switch between all of a
 * tenant's properties) or the first property their own `role_assignments`
 * row is scoped to (RLS: "own role_assignments readable", `user_id =
 * auth.uid()` — works identically for every role, no per-role filter here).
 *
 * `tenantId` is optional (and unfiltered when omitted) for backward
 * compatibility with existing callers, but should be passed whenever it's
 * available: a staff member can hold `role_assignments` rows across more
 * than one tenant (re-invited, a second demo property, a stale duplicate
 * grant, etc.), and without a tenant filter this picks the most-recently
 * -granted row *for that user_id regardless of tenant* — which can resolve a
 * property belonging to a different tenant than the one the rest of the app
 * (sidebar, dashboard, `useResolvedRole`) currently has them signed into.
 * That property then legitimately has zero rows for whatever's being
 * queried (invoices, students, ...), which just looks like "data missing"
 * rather than a permissions error, since RLS itself is satisfied — the
 * property really is one this user is assigned to, just the wrong tenant's.
 */
export function useMyStaffProperty(
  userId: string | null | undefined,
  fallbackId?: string | null,
  tenantId?: string | null,
) {
  return useQuery({
    queryKey: ["my-staff-property", userId, fallbackId, tenantId],
    enabled: !!userId,
    queryFn: async () => {
      if (fallbackId) return fallbackId;
      let q = supabase
        .from("role_assignments")
        .select("property_id")
        .eq("user_id", userId!)
        .eq("is_active", true)
        .not("property_id", "is", null)
        .order("granted_at", { ascending: false })
        .limit(1);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data } = await q;
      return data?.[0]?.property_id ?? null;
    },
  });
}

/**
 * Convenience wrapper for Accountant pages: resolves the signed-in
 * Accountant's authorized property automatically via `useMyStaffProperty`,
 * instead of relying on the Zustand `activePropertyId` store — that store is
 * only ever populated by `PropertySwitcher` (Hostel-Admin-only UI), so
 * Accountant pages that read it directly always saw `null` and got stuck on
 * "Choose a property first" even when the Accountant has a real, RLS-scoped
 * property assignment. Every Accountant page should use this instead of
 * `usePropertyStore` directly.
 */
export function useAccountantProperty() {
  const { data: role } = useResolvedRole();
  const propQ = useMyStaffProperty(role?.userId, undefined, role?.tenantId);
  return { propertyId: propQ.data ?? null, isLoading: propQ.isLoading };
}

// Same defaults as the SQL functions in
// 20260820140000_warden_full_module_permissions.sql — a key absent from
// `role_assignments.permissions` means "use the role default", which for a
// Warden is true for every module key except these three (capabilities that
// never existed for a Warden before that migration, opt-in only).
const WARDEN_KEY_DEFAULT_FALSE = new Set([
  "students_delete",
  "rooms_beds_create",
  "rooms_beds_delete",
]);

// Finance keys never default on for a Warden, unlike the rest of
// WARDEN_KEY_DEFAULT_FALSE's "on by default, a few carved out" shape — this
// mirrors the SQL truth in has_finance_permission()/has_role_permission()
// (20260814070000/20260814090000): only HOSTEL_ADMIN or an explicit
// `permissions[key] = true` grants a Warden access; the "absent key still
// passes" default-true fallback those functions give ACCOUNTANT never
// applies to WARDEN. Without this, the client would show Finance
// nav/actions as allowed for every Warden by default while the RLS layer
// silently rejects the underlying query/mutation.
const WARDEN_FINANCE_KEYS = new Set([
  "fee_plans_view",
  "fee_plans_create",
  "fee_plans_edit",
  "fee_plans_delete",
  "invoices_view",
  "invoices_create",
  "invoices_edit",
  "invoices_delete",
  "payments_view",
  "payments_create",
  "payments_edit",
  "payments_delete",
  "refunds",
]);

// Default Warden access when Customize Permissions is OFF: Brief (no key),
// Students, Attendance, Complaints and Gate only. Mirrors the default list in
// 20261026100000_warden_default_permissions_five_modules.sql — keep in sync.
// allocations_view/rooms_beds_view are deliberately absent: the pages are
// hidden/guarded here, while the backend keeps read-only access so the
// student detail page can still show the student's current room/bed.
const WARDEN_DEFAULT_KEYS = new Set([
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
]);

/**
 * A Warden's own effective per-module permission overrides, read straight
 * from their `role_assignments` row (RLS already allows reading your own
 * row — same as useMyStaffProperty above). Client-side UI gating only, to
 * hide Create/Edit/Delete affordances the backend would reject anyway — the
 * real enforcement is the can_view / can_create / can_edit / can_delete
 * RLS functions, not this hook.
 */
export function useWardenPermissions() {
  const { data: role } = useResolvedRole();
  const q = useQuery({
    queryKey: ["my-warden-permissions", role?.userId, role?.tenantId],
    enabled: !!role?.userId && !!role?.tenantId && role.role === "WARDEN",
    queryFn: async () => {
      const { data } = await supabase
        .from("role_assignments")
        .select("property_id, block_id, permissions")
        .eq("user_id", role!.userId!)
        .eq("tenant_id", role!.tenantId!)
        .eq("role", "WARDEN")
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  const permissions = (q.data?.permissions ?? {}) as Record<string, boolean>;
  // "Customize Permissions" OFF is stored as an empty bag; ON always saves
  // at least one explicit key (admin.staff.tsx seeds every key).
  const isCustomized = Object.keys(permissions).length > 0;
  function can(key: string): boolean {
    const override = permissions[key];
    if (override !== undefined) return override;
    if (!isCustomized) return WARDEN_DEFAULT_KEYS.has(key);
    if (WARDEN_FINANCE_KEYS.has(key)) return false;
    return !WARDEN_KEY_DEFAULT_FALSE.has(key);
  }
  return {
    can,
    propertyId: q.data?.property_id ?? null,
    blockId: q.data?.block_id ?? null,
    isLoading: q.isLoading,
  };
}

// Finance keys default true for an Accountant (their own role defaults, see
// has_finance_permission() in 20260814070000); every other key — operational
// (attendance/complaints/gate_passes/.../reports_view) and the granular CRUD
// pilot keys — defaults false unless explicitly granted (see
// has_operational_permission_property/scope() in 20260814090000). Mirrors
// those two SQL functions exactly so the sidebar/route gating here never
// drifts from what RLS actually enforces.
const ACCOUNTANT_FINANCE_DEFAULT_TRUE = new Set([
  "fee_plans_view",
  "fee_plans_create",
  "fee_plans_edit",
  "fee_plans_delete",
  "invoices_view",
  "invoices_create",
  "invoices_edit",
  "invoices_delete",
  "payments_view",
  "payments_create",
  "payments_edit",
  "payments_delete",
  "refunds",
]);

/**
 * An Accountant's own effective per-module permission overrides — same
 * shape/intent as useWardenPermissions above, for the other direction
 * (Accountant's defaults are Warden's grantable-extras, and vice versa).
 * Client-side UI gating only; can_manage_()/can_view_() RLS is the real
 * enforcement.
 */
export function useAccountantPermissions() {
  const { data: role } = useResolvedRole();
  const q = useQuery({
    queryKey: ["my-accountant-permissions", role?.userId, role?.tenantId],
    enabled: !!role?.userId && !!role?.tenantId && role.role === "ACCOUNTANT",
    queryFn: async () => {
      const { data } = await supabase
        .from("role_assignments")
        .select("property_id, block_id, permissions")
        .eq("user_id", role!.userId!)
        .eq("tenant_id", role!.tenantId!)
        .eq("role", "ACCOUNTANT")
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  const permissions = (q.data?.permissions ?? {}) as Record<string, boolean>;
  function can(key: string): boolean {
    const override = permissions[key];
    if (override !== undefined) return override;
    return ACCOUNTANT_FINANCE_DEFAULT_TRUE.has(key);
  }
  return {
    can,
    propertyId: q.data?.property_id ?? null,
    blockId: q.data?.block_id ?? null,
    isLoading: q.isLoading,
  };
}

// Modules without a real write action for students today (Attendance,
// Notices are read-only) only ever expose Read/No Access — there's no
// `edit` key for them, `can()` below just returns `false` for that verb.
export type StudentModule =
  "profile" | "attendance" | "complaints" | "notices" | "finance" | "gate_passes" | "mess";

const STUDENT_VIEW_ONLY_MODULES = new Set<StudentModule>(["attendance", "notices"]);

/**
 * The signed-in student's own effective per-module permission overrides —
 * same shape/defaults as the migration's `has_student_permission_for_user`
 * SQL function (20260821060645_student_module_permissions.sql): an absent
 * key means "allowed" (both view and edit), so an unconfigured student sees
 * no behavior change. Client-side UI gating only, to hide/redirect around
 * views and actions the backend would reject anyway — the real enforcement
 * is the can_student_view_ and can_student_edit_ RLS functions, not this hook.
 */
export function useStudentPermissions() {
  const { data: role } = useResolvedRole();
  const q = useQuery({
    queryKey: ["my-student-permissions", role?.userId, role?.tenantId],
    enabled: !!role?.userId && !!role?.tenantId && role.role === "STUDENT",
    queryFn: async () => {
      const { data } = await supabase
        .from("role_assignments")
        .select("permissions")
        .eq("user_id", role!.userId!)
        .eq("tenant_id", role!.tenantId!)
        .eq("role", "STUDENT")
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  const permissions = (q.data?.permissions ?? {}) as Record<string, boolean>;
  function can(module: StudentModule, verb: "view" | "edit"): boolean {
    if (verb === "edit" && STUDENT_VIEW_ONLY_MODULES.has(module)) return false;
    const key = `student_${module}_${verb}`;
    const override = permissions[key];
    return override !== undefined ? override : true;
  }
  return { can, isLoading: q.isLoading };
}

/**
 * Generic "does the current staff member have this permission key" resolver
 * — HOSTEL_ADMIN is always true (unconditional, matches every RLS checker
 * function); otherwise reads the caller's own `role_assignments.permissions`
 * override, falling back to `defaultValue` when absent. Client-side UI
 * gating only — mirrors whichever can_view/can_create/can_edit/can_delete
 * RLS function actually backs `key`; the real enforcement is that function,
 * not this hook.
 */
export function useMyPermission(key: string, defaultValue: boolean): boolean {
  const { data: role } = useResolvedRole();
  const q = useQuery({
    queryKey: ["my-permission-override", role?.userId, role?.tenantId, role?.role],
    enabled:
      !!role?.userId && !!role?.tenantId && (role.role === "WARDEN" || role.role === "ACCOUNTANT"),
    queryFn: async () => {
      const { data } = await supabase
        .from("role_assignments")
        .select("permissions")
        .eq("user_id", role!.userId!)
        .eq("tenant_id", role!.tenantId!)
        .eq("role", role!.role!)
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
  if (role?.role === "HOSTEL_ADMIN") return true;
  const override = (q.data?.permissions as Record<string, boolean> | undefined)?.[key];
  return override !== undefined ? override : defaultValue;
}
