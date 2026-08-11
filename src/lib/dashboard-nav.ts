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
}

/**
 * Role-aware navigation config. Extend here in later phases —
 * shells read this map and never hardcode items.
 */
export const SIDEBAR_NAV: Partial<Record<NonNullable<AppRole>, NavItem[]>> = {
  SUPER_ADMIN: [
    { label: "Dashboard", to: "/super-admin/dashboard", icon: LayoutDashboard },
    { label: "Tenants", to: "/super-admin/tenants", icon: Boxes },
    { label: "Billing", to: "/super-admin/billing", icon: CreditCard },
    { label: "Feature Flags", to: "/super-admin/feature-flags", icon: Activity },
    { label: "Impersonation", to: "/super-admin/impersonation", icon: LifeBuoy },
  ],
  HOSTEL_ADMIN: [
    { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Properties", to: "/admin/properties", icon: Building2 },
    { label: "Students", to: "/admin/students", icon: Users },
    { label: "Allocations", to: "/admin/allocations", icon: CalendarCheck },
    { label: "Finance", to: "/admin/finance", icon: Wallet },
    { label: "Complaints", to: "/admin/complaints", icon: MessageSquareWarning },
    { label: "Notices", to: "/admin/notices", icon: BellRing },
    { label: "Staff", to: "/admin/staff", icon: UserCog },
    { label: "Reports", to: "/admin/reports", icon: FileBarChart },
    { label: "Settings", to: "/admin/settings", icon: Settings },
  ],
  ACCOUNTANT: [
    { label: "Dashboard", to: "/accountant/dashboard", icon: LayoutDashboard },
    { label: "Students", to: "/accountant/students", icon: Users },
    { label: "Fee Plans", to: "/accountant/fee-plans", icon: ClipboardList },
    { label: "Invoices", to: "/accountant/invoices", icon: FileText },
    { label: "Payments", to: "/accountant/payments", icon: CreditCard },
    { label: "Refunds", to: "/accountant/refunds", icon: Receipt },
    { label: "Deposit Ledger", to: "/accountant/deposit-ledger", icon: Wallet },
    { label: "Reports", to: "/accountant/reports", icon: FileBarChart },
  ],
};

export const BOTTOM_NAV: Partial<Record<NonNullable<AppRole>, NavItem[]>> = {
  WARDEN: [
    { label: "Brief", to: "/warden/daily-brief", icon: ClipboardList },
    { label: "Attendance", to: "/warden/attendance", icon: CalendarCheck },
    { label: "Complaints", to: "/warden/complaints", icon: MessageSquareWarning },
    { label: "Gate", to: "/warden/gate", icon: DoorOpen },
    { label: "Mess", to: "/warden/mess", icon: Utensils },
  ],
  STUDENT: [
    { label: "Home", to: "/student/home", icon: Home },
    { label: "Fees", to: "/student/fees", icon: Receipt },
    { label: "Gate Pass", to: "/student/gate-pass", icon: Ticket },
    { label: "Mess", to: "/student/mess", icon: Utensils },
    { label: "Complaints", to: "/student/complaints", icon: MessageSquareWarning },
    { label: "Profile", to: "/student/profile", icon: User },
  ],
  PARENT: [
    { label: "Home", to: "/parent/overview", icon: Home },
    { label: "Attendance", to: "/parent/attendance", icon: CalendarCheck },
    { label: "Payments", to: "/parent/payments", icon: Receipt },
    { label: "Complaints", to: "/parent/complaints", icon: MessageSquareWarning },
    { label: "Messages", to: "/parent/messages", icon: BellRing },
  ],
};

export const NOTIFICATION_ICON = BellRing;
