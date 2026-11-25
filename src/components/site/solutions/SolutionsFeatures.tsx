import {
  BedDouble,
  CalendarCheck,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  UserRound,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";

const features: FeatureItem[] = [
  {
    title: "Room & Bed Management",
    desc: "Manage rooms, bed allotment and occupancy in real time.",
    icon: BedDouble,
  },
  {
    title: "Resident Management",
    desc: "Complete resident profiles, documents and stay history.",
    icon: Users,
  },
  {
    title: "Fees & Finance",
    desc: "Automate fee collection, invoicing and payment tracking.",
    icon: Wallet,
  },
  {
    title: "Attendance",
    desc: "Track in-time, out-time and daily attendance digitally.",
    icon: CalendarCheck,
  },
  {
    title: "Mess & Meals",
    desc: "Plan menus, manage meals and track consumption.",
    icon: Utensils,
  },
  {
    title: "Complaints & Requests",
    desc: "Raise, assign and resolve issues with complete tracking.",
    icon: MessageCircle,
  },
  {
    title: "Notices & Communication",
    desc: "Share updates, circulars and important announcements.",
    icon: Megaphone,
  },
  {
    title: "Staff Management",
    desc: "Add and manage hostel staff, roles and permissions.",
    icon: UserRound,
  },
];

export function SolutionsFeatures() {
  return (
    <FeatureGrid
      chip="Core features"
      chipIcon={LayoutGrid}
      title="Everything You Need to Run Residential Properties"
      desc="From daily operations to financials, everything in one place."
      items={features}
      columns={4}
      isPanel
    />
  );
}
