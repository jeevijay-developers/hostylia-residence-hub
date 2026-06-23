import {
  IndianRupee, ReceiptText, CreditCard, Banknote, BellRing, FileBarChart,
  UserPlus, GraduationCap, BedDouble, Users, FileText, Smartphone,
  ClipboardCheck, MessageSquareWarning, Wrench, Megaphone, Utensils, Star,
  ScanLine, LogIn, UserCheck, Clock, ShieldAlert,
  BarChart3, PieChart, Activity, ShieldCheck, Briefcase,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

const columns = [
  {
    title: "Finance", items: [
      { label: "Fee Collection", icon: IndianRupee },
      { label: "Auto Receipts", icon: ReceiptText },
      { label: "UPI Payments", icon: CreditCard },
      { label: "Cash Entry", icon: Banknote },
      { label: "Due Reminders", icon: BellRing },
      { label: "Reports", icon: FileBarChart },
    ],
  },
  {
    title: "Student", items: [
      { label: "Admission", icon: UserPlus },
      { label: "Student Profiles", icon: GraduationCap },
      { label: "Room Allocation", icon: BedDouble },
      { label: "Parent Details", icon: Users },
      { label: "Documents", icon: FileText },
      { label: "Student App", icon: Smartphone },
    ],
  },
  {
    title: "Operations", items: [
      { label: "Attendance", icon: ClipboardCheck },
      { label: "Complaints", icon: MessageSquareWarning },
      { label: "Maintenance", icon: Wrench },
      { label: "Notice Board", icon: Megaphone },
      { label: "Mess Menu", icon: Utensils },
      { label: "Feedback", icon: Star },
    ],
  },
  {
    title: "Security", items: [
      { label: "Gate Pass", icon: ScanLine },
      { label: "Entry Exit Logs", icon: LogIn },
      { label: "Parent Notifications", icon: BellRing },
      { label: "Visitor Management", icon: UserCheck },
      { label: "Late Entry Alerts", icon: Clock },
      { label: "Emergency Alerts", icon: ShieldAlert },
    ],
  },
  {
    title: "Analytics", items: [
      { label: "Occupancy Reports", icon: BarChart3 },
      { label: "Fee Reports", icon: PieChart },
      { label: "Complaint Reports", icon: Activity },
      { label: "Attendance Reports", icon: ClipboardCheck },
      { label: "Warden Reports", icon: ShieldCheck },
      { label: "Owner Dashboard", icon: Briefcase },
    ],
  },
];

export function MegaMenuFeatures({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="glass-panel rounded-2xl p-6 shadow-2xl animate-fade-in">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-5 md:gap-6">
        {columns.map((col) => (
          <div key={col.title}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold">{col.title}</div>
            <ul className="space-y-1">
              {col.items.map((item) => (
                <li key={item.label}>
                  <Link
                    to="/features"
                    onClick={onNavigate}
                    className="group flex items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-white/5"
                  >
                    <item.icon size={16} className="shrink-0 text-soft-teal" />
                    <span className="truncate text-sm text-white group-hover:text-soft-teal">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
