import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Wallet,
  MessageSquareWarning,
  UserCog,
  FileBarChart,
  Settings,
  FileText,
  CreditCard,
  LifeBuoy,
  Boxes,
  ClipboardList,
  CalendarCheck,
  DoorOpen,
  Utensils,
  Home,
  Receipt,
  Ticket,
  User,
  Activity,
  BellRing,
} from "lucide-react";

import type { AppRole } from "./user-role";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /**
   * The permission key this item is gated on — for STUDENT, a `StudentModule`
   * (staff-scope.ts); for WARDEN/ACCOUNTANT, a `PermissionKey` from
   * admin.staff.tsx's custom-permission matrix (e.g. "attendance_view").
   * Omitted for items with no No-Access-able module (overview pages like
   * Home/Brief/Dashboard, and Students — every role already has Students
   * view by default, so there's no permission gap to gate on).
   */
  module?: string;
  /**
   * Rendered as a visible-but-disabled entry (lock icon). Clicking it shows
   * the lock message instead of navigating. Student KYC gate only — set by
   * student.tsx, never in the static nav config below.
   */
  locked?: boolean;
}

/**
 * Role-aware navigation config. Extend here in later phases —
 * shells read this map and never hardcode items.
 */
export const SIDEBAR_NAV: Partial<Record<NonNullable<AppRole>, NavItem[]>> = {
  SUPER_ADMIN: [
    { label: "Dashboard", to: "/super-admin/dashboard", icon: LayoutDashboard },
    { label: "Tenants", to: "/super-admin/tenants", icon: Boxes },
    { label: "Plans", to: "/super-admin/plans", icon: ClipboardList },
    { label: "Billing", to: "/super-admin/billing", icon: CreditCard },
    { label: "Feature Flags", to: "/super-admin/feature-flags", icon: Activity },
    { label: "Support Tickets", to: "/super-admin/support-tickets", icon: Ticket },
    { label: "Impersonation", to: "/super-admin/impersonation", icon: LifeBuoy },
  ],
  HOSTEL_ADMIN: [
    { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Properties", to: "/admin/properties", icon: Building2 },
    { label: "Students", to: "/admin/students", icon: Users },
    { label: "Allocations", to: "/admin/allocations", icon: CalendarCheck },
    { label: "Attendance", to: "/admin/attendance", icon: CalendarCheck },
    { label: "Finance", to: "/admin/finance", icon: Wallet },
    { label: "Complaints", to: "/admin/complaints", icon: MessageSquareWarning },
    { label: "Support", to: "/admin/support", icon: LifeBuoy },
    { label: "Notices", to: "/admin/notices", icon: BellRing },
    { label: "Staff", to: "/admin/staff", icon: UserCog },
    { label: "Reports", to: "/admin/reports", icon: FileBarChart },
    { label: "Settings", to: "/admin/settings", icon: Settings },
  ],
  ACCOUNTANT: [
    { label: "Dashboard", to: "/accountant/dashboard", icon: LayoutDashboard },
    { label: "Students", to: "/accountant/students", icon: Users },
    {
      label: "Fee Plans",
      to: "/accountant/fee-plans",
      icon: ClipboardList,
      module: "fee_plans_view",
    },
    { label: "Invoices", to: "/accountant/invoices", icon: FileText, module: "invoices_view" },
    { label: "Payments", to: "/accountant/payments", icon: CreditCard, module: "payments_view" },
    { label: "Refunds", to: "/accountant/refunds", icon: Receipt, module: "refunds" },
    { label: "Deposit Ledger", to: "/accountant/deposit-ledger", icon: Wallet },
    {
      label: "Attendance",
      to: "/accountant/attendance",
      icon: CalendarCheck,
      module: "attendance_view",
    },
    {
      label: "Complaints",
      to: "/accountant/complaints",
      icon: MessageSquareWarning,
      module: "complaints",
    },
    { label: "Gate", to: "/accountant/gate", icon: DoorOpen, module: "gate_any" },
    { label: "Notices", to: "/accountant/notices", icon: BellRing, module: "notices" },
    { label: "Mess", to: "/accountant/mess", icon: Utensils, module: "mess_menus" },
    { label: "Reports", to: "/accountant/reports", icon: FileBarChart, module: "reports_view" },
  ],
  WARDEN: [
    { label: "Brief", to: "/warden/daily-brief", icon: ClipboardList },
    { label: "Students", to: "/warden/students", icon: Users },
    {
      label: "Attendance",
      to: "/warden/attendance",
      icon: CalendarCheck,
      module: "attendance_view",
    },
    {
      label: "Complaints",
      to: "/warden/complaints",
      icon: MessageSquareWarning,
      module: "complaints",
    },
    { label: "Gate", to: "/warden/gate", icon: DoorOpen, module: "gate_passes_view" },
    // Previously desktop-sidebar-invisible regardless of grant (only ever
    // reachable via the mobile "More" sheet, which stays suppressed for
    // Warden — see warden.tsx) — same existing /warden/* routes, now a real
    // sidebar entry gated on the same permission key the route itself
    // already enforces.
    {
      label: "Allocations",
      to: "/warden/allocations",
      icon: Boxes,
      module: "allocations_create",
    },
    // One Finance entry (matches the Admin sidebar's single "Finance" item,
    // which also fans out to a landing page) instead of four flat items —
    // shown if any one of the Finance keys below is granted; the landing
    // page (/warden/finance) then shows only the specific cards that key's
    // own permission allows. "finance_any" is a synthetic key handled only
    // in this file's WARDEN moduleFilter (see warden.tsx), not a real
    // `role_assignments.permissions` entry. A Warden has none of the
    // underlying keys by default (see WARDEN_FINANCE_KEYS in staff-scope.ts).
    { label: "Finance", to: "/warden/finance", icon: Wallet, module: "finance_any" },
    { label: "Notices", to: "/warden/notices", icon: BellRing, module: "notices" },
    { label: "Reports", to: "/warden/reports", icon: FileBarChart, module: "reports_view" },
  ],
  STUDENT: [
    { label: "Home", to: "/student/home", icon: Home },
    { label: "Fees", to: "/student/fees", icon: Receipt, module: "finance" },
    { label: "Gate Pass", to: "/student/gate-pass", icon: Ticket, module: "gate_passes" },
    { label: "Mess", to: "/student/mess", icon: Utensils, module: "mess" },
    {
      label: "Complaints",
      to: "/student/complaints",
      icon: MessageSquareWarning,
      module: "complaints",
    },
  ],
  PARENT: [
    { label: "Home", to: "/parent/overview", icon: Home },
    { label: "Attendance", to: "/parent/attendance", icon: CalendarCheck },
    { label: "Gate Pass", to: "/parent/gate-pass", icon: Ticket },
    { label: "Payments", to: "/parent/payments", icon: Receipt },
    { label: "Complaints", to: "/parent/complaints", icon: MessageSquareWarning },
  ],
};

export const BOTTOM_NAV: Partial<Record<NonNullable<AppRole>, NavItem[]>> = {
  ACCOUNTANT: [
    { label: "Dashboard", to: "/accountant/dashboard", icon: LayoutDashboard },
    { label: "Students", to: "/accountant/students", icon: Users },
    { label: "Invoices", to: "/accountant/invoices", icon: FileText, module: "invoices_view" },
    { label: "Refunds", to: "/accountant/refunds", icon: Receipt, module: "refunds" },
  ],
  WARDEN: [
    { label: "Brief", to: "/warden/daily-brief", icon: ClipboardList },
    { label: "Students", to: "/warden/students", icon: Users },
    {
      label: "Complaints",
      to: "/warden/complaints",
      icon: MessageSquareWarning,
      module: "complaints",
    },
    { label: "Gate", to: "/warden/gate", icon: DoorOpen, module: "gate_passes_view" },
  ],
  STUDENT: [
    { label: "Home", to: "/student/home", icon: Home },
    { label: "Fees", to: "/student/fees", icon: Receipt, module: "finance" },
    { label: "Mess", to: "/student/mess", icon: Utensils, module: "mess" },
    {
      label: "Complaints",
      to: "/student/complaints",
      icon: MessageSquareWarning,
      module: "complaints",
    },
  ],
  PARENT: [
    { label: "Home", to: "/parent/overview", icon: Home },
    { label: "Gate Pass", to: "/parent/gate-pass", icon: Ticket },
    { label: "Payments", to: "/parent/payments", icon: Receipt },
    { label: "Complaints", to: "/parent/complaints", icon: MessageSquareWarning },
  ],
};

/**
 * Secondary features surfaced inside the mobile "More" sheet — routes that
 * exist and are role-accessible but don't fit in the 5-item bottom bar.
 * Used by ACCOUNTANT, STUDENT and WARDEN today.
 */
export const MORE_NAV: Partial<Record<NonNullable<AppRole>, NavItem[]>> = {
  ACCOUNTANT: [
    {
      label: "Fee Plans",
      to: "/accountant/fee-plans",
      icon: ClipboardList,
      module: "fee_plans_view",
    },
    { label: "Refunds", to: "/accountant/refunds", icon: Receipt, module: "refunds" },
    { label: "Deposit Ledger", to: "/accountant/deposit-ledger", icon: Wallet },
    {
      label: "Attendance",
      to: "/accountant/attendance",
      icon: CalendarCheck,
      module: "attendance_view",
    },
    {
      label: "Complaints",
      to: "/accountant/complaints",
      icon: MessageSquareWarning,
      module: "complaints",
    },
    { label: "Gate", to: "/accountant/gate", icon: DoorOpen, module: "gate_any" },
    { label: "Notices", to: "/accountant/notices", icon: BellRing, module: "notices" },
    { label: "Mess", to: "/accountant/mess", icon: Utensils, module: "mess_menus" },
    { label: "Reports", to: "/accountant/reports", icon: FileBarChart, module: "reports_view" },
  ],
  WARDEN: [
    { label: "Gate", to: "/warden/gate", icon: DoorOpen, module: "gate_passes_view" },
    { label: "Mess", to: "/warden/mess", icon: Utensils, module: "mess_menus" },
    { label: "Notices", to: "/warden/notices", icon: BellRing, module: "notices" },
    {
      label: "Allocations",
      to: "/warden/allocations",
      icon: CalendarCheck,
      module: "allocations_create",
    },
    { label: "Reports", to: "/warden/reports", icon: FileBarChart, module: "reports_view" },
  ],
  STUDENT: [
    { label: "Attendance", to: "/student/attendance", icon: CalendarCheck, module: "attendance" },
    { label: "Notices", to: "/student/notices", icon: BellRing, module: "notices" },
  ],
};

/**
 * The single center-action item for Student's floating bottom-nav button.
 * Module-filtering is applied the same way as BOTTOM_NAV items in student.tsx.
 */
export const CENTER_NAV: Partial<Record<NonNullable<AppRole>, NavItem>> = {
  ACCOUNTANT: {
    label: "Payments",
    to: "/accountant/payments",
    icon: CreditCard,
    module: "payments_view",
  },
  WARDEN: {
    label: "Attendance",
    to: "/warden/attendance",
    icon: CalendarCheck,
    module: "attendance_view",
  },
  STUDENT: { label: "Gate Pass", to: "/student/gate-pass", icon: Ticket, module: "gate_passes" },
  PARENT: { label: "Attendance", to: "/parent/attendance", icon: CalendarCheck },
};

export const NOTIFICATION_ICON = BellRing;
