import {
  IndianRupee,
  LayoutGrid,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { FeatureGrid, type FeatureItem } from "@/components/site/marketing/FeatureGrid";

const reasons: FeatureItem[] = [
  {
    title: "Built for Indian residences",
    desc: "INR billing, GST-ready invoices, online fee payments and English + Hindi support.",
    icon: IndianRupee,
  },
  {
    title: "Parents stay in the loop",
    desc: "Verified parent access with attendance, gate-pass and fee updates for their child.",
    icon: UsersRound,
  },
  {
    title: "Secure by design",
    desc: "Role-based access, property-level data isolation and a full audit trail.",
    icon: ShieldCheck,
  },
  {
    title: "One platform, every role",
    desc: "Admins, wardens, accountants, students and parents work from the same live data.",
    icon: LayoutGrid,
  },
  {
    title: "Works on any device",
    desc: "A fast, responsive web app for phones, tablets and laptops — nothing to install.",
    icon: Smartphone,
  },
  {
    title: "Live in days, not months",
    desc: "Guided onboarding to set up properties, rooms and beds and import residents.",
    icon: Rocket,
  },
];

export function WhyChooseHostylia() {
  return (
    <FeatureGrid
      chip="Why Hostylia"
      chipIcon={Sparkles}
      title="Why Choose Hostylia"
      desc="Purpose-built for how Indian hostels, PGs and residential schools actually run."
      items={reasons}
      columns={3}
      layout="inline"
      sectionClassName="bg-linear-to-b from-background to-mint/40"
    />
  );
}
