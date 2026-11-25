import {
  BarChart3,
  BedDouble,
  Building2,
  CalendarCheck,
  CreditCard,
  LayoutGrid,
  MessageSquareText,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";

const features: FeatureItem[] = [
  {
    title: "Property Management",
    desc: "Manage properties, blocks, floors and room hierarchy.",
    icon: Building2,
  },
  {
    title: "Student Management",
    desc: "Maintain student profiles, KYC and stay details.",
    icon: Users,
  },
  {
    title: "Room & Bed Allocation",
    desc: "Allocate, reallocate and track bed occupancy.",
    icon: BedDouble,
  },
  {
    title: "Warden Management",
    desc: "Assign wardens, set duties and track responsibilities.",
    icon: UserRound,
  },
  {
    title: "Fee & Billing",
    desc: "Collect fees, generate invoices and track dues.",
    icon: CreditCard,
  },
  {
    title: "Complaint Tracking",
    desc: "Log, assign and resolve complaints with full tracking.",
    icon: MessageSquareText,
  },
  {
    title: "Parent Communication",
    desc: "Keep parents informed with updates, alerts and notices.",
    icon: UsersRound,
  },
  {
    title: "Security & Gate Pass",
    desc: "Manage visitor entry, gate passes and residence security.",
    icon: ShieldCheck,
  },
  {
    title: "Attendance & Activity",
    desc: "Track in/out, leaves and daily residence activity.",
    icon: CalendarCheck,
  },
  {
    title: "Reports & Analytics",
    desc: "Get operational insights and performance reports.",
    icon: BarChart3,
  },
];

export function CoreFeatures() {
  return (
    <FeatureGrid
      chip="Everything you need"
      chipIcon={LayoutGrid}
      title="Core platform features"
      desc="Everything you need to run a safe, efficient and student-friendly residential operation."
      items={features}
      columns={5}
      layout="inline"
      linkTo="/features"
      sectionClassName="bg-linear-to-b from-mint/40 to-background"
    />
  );
}
