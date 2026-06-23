import { createFileRoute } from "@tanstack/react-router";
import {
  IndianRupee, ReceiptText, CreditCard, Banknote, BellRing, FileBarChart,
  UserPlus, GraduationCap, BedDouble, Users, FileText, Smartphone,
  ClipboardCheck, MessageSquareWarning, Wrench, Megaphone, Utensils, Star,
  ScanLine, LogIn, UserCheck, Clock, ShieldAlert,
  BarChart3, PieChart, Activity, ShieldCheck, Briefcase,
} from "lucide-react";
import { PageHero, CTAStrip } from "@/components/site/PageHero";
import { FeatureCard, SectionHeading } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import tenantAgreement from "@/assets/illustrations/tenant-agreement.jpg";
import servicesPanel from "@/assets/illustrations/services-panel.jpg";
import attendanceOutpass from "@/assets/illustrations/attendance-outpass.jpg";
import duesLock from "@/assets/illustrations/dues-lock.jpg";
import collectionChart from "@/assets/illustrations/collection-chart.jpg";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Hostylia" },
      { name: "description", content: "Finance, student, operations, security and analytics features in one residential platform." },
      { property: "og:title", content: "Features — Hostylia" },
      { property: "og:description", content: "Every feature your residential operations need, in one platform." },
      { property: "og:url", content: "/features" },
    ],
    links: [{ rel: "canonical", href: "/features" }],
  }),
  component: FeaturesPage,
});

const groups = [
  { title: "Finance", desc: "Collect, reconcile and report on fees across every channel.", items: [
    { icon: IndianRupee, title: "Fee Collection" }, { icon: ReceiptText, title: "Auto Receipts" },
    { icon: CreditCard, title: "UPI Payments" }, { icon: Banknote, title: "Cash Entry" },
    { icon: BellRing, title: "Due Reminders" }, { icon: FileBarChart, title: "Reports" },
  ]},
  { title: "Student", desc: "Lifecycle from admission to alumni — beautifully managed.", items: [
    { icon: UserPlus, title: "Admission" }, { icon: GraduationCap, title: "Student Profiles" },
    { icon: BedDouble, title: "Room Allocation" }, { icon: Users, title: "Parent Details" },
    { icon: FileText, title: "Documents" }, { icon: Smartphone, title: "Student App" },
  ]},
  { title: "Operations", desc: "Day-to-day workflows for wardens, managers and staff.", items: [
    { icon: ClipboardCheck, title: "Attendance" }, { icon: MessageSquareWarning, title: "Complaints" },
    { icon: Wrench, title: "Maintenance" }, { icon: Megaphone, title: "Notice Board" },
    { icon: Utensils, title: "Mess Menu" }, { icon: Star, title: "Feedback" },
  ]},
  { title: "Security", desc: "Gate, visitor and emergency workflows that keep parents informed.", items: [
    { icon: ScanLine, title: "Gate Pass" }, { icon: LogIn, title: "Entry Exit Logs" },
    { icon: BellRing, title: "Parent Notifications" }, { icon: UserCheck, title: "Visitor Management" },
    { icon: Clock, title: "Late Entry Alerts" }, { icon: ShieldAlert, title: "Emergency Alerts" },
  ]},
  { title: "Analytics", desc: "Real-time visibility for owners, managers and accountants.", items: [
    { icon: BarChart3, title: "Occupancy Reports" }, { icon: PieChart, title: "Fee Reports" },
    { icon: Activity, title: "Complaint Reports" }, { icon: ClipboardCheck, title: "Attendance Reports" },
    { icon: ShieldCheck, title: "Warden Reports" }, { icon: Briefcase, title: "Owner Dashboard" },
  ]},
];

function FeaturesPage() {
  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Features"
        title="A complete operating system for residential properties"
        desc="Five feature pillars covering every workflow your residence relies on."
      />
      {groups.map((g, gi) => {
        const illus: Record<number, { src: string; alt: string }> = {
          0: { src: collectionChart, alt: "Finance collection chart with pending and received amounts" },
          1: { src: tenantAgreement, alt: "Resident agreement document with signature and verified badge" },
          2: { src: servicesPanel, alt: "Operations services panel with meals, wifi and housekeeping icons" },
          3: { src: duesLock, alt: "Secure dues view with rent and maintenance line items" },
          4: { src: attendanceOutpass, alt: "Attendance and outpass approval card with check-in and check-out dates" },
        };
        const card = illus[gi];
        return (
          <section key={g.title} className="border-b border-dark-border py-20">
            <div className="mx-auto max-w-7xl px-4 md:px-6">
              <SectionHeading eyebrow={g.title} title={`${g.title} features`} desc={g.desc} />
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => <FeatureCard key={it.title} icon={it.icon} title={it.title} desc="Configurable workflows with role-based access and audit trails." tone="teal" />)}
              </div>
              {card && (
                <div className={`mt-14 grid items-center gap-10 lg:grid-cols-2 ${gi % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                  <IllustrationCard src={card.src} alt={card.alt} />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gold">{g.title} in action</div>
                    <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Built for real residential operations</h3>
                    <p className="mt-3 text-base leading-relaxed text-soft-grey">
                      Every {g.title.toLowerCase()} workflow ships with role-based access, audit
                      trails and Hostylia's elegant operator experience.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
      <CTAStrip />
    </div>
  );
}
