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
import {
  MockFinanceDashboard, MockComplaintBoard, MockSecurityLog, MockParentApp,
  MockAiInsights, MockFeeReceipt, StatBand, TestimonialCard, BenefitList,
} from "@/components/site/HtmlMockups";

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

const benefits: Record<string, string[]> = {
  Finance: [
    "UPI, card, netbanking, cash and cheque — one ledger.",
    "Auto-receipts, GST invoices and parent statements.",
    "Smart reminders that recover 92% of dues in 7 days.",
    "Owner P&L, block-wise collection and aging reports.",
  ],
  Student: [
    "Digital admissions with KYC and document vault.",
    "Room and bed allocation with one-tap swap.",
    "Lock-in, notice and exit flow tracked end to end.",
    "Branded student and parent apps for every property.",
  ],
  Operations: [
    "Wardens close attendance in under 3 minutes a day.",
    "Mess menu, headcount and food waste analytics.",
    "Notice board reaches 100% of parents — proven.",
    "Maintenance SLAs with vendor accountability built in.",
  ],
  Security: [
    "Face / QR gate pass with anti-tailgating alerts.",
    "Live visitor log with host approval.",
    "Late entry, missing student and emergency triggers.",
    "Instant parent SMS for every gate event.",
  ],
  Analytics: [
    "Owner dashboard with portfolio-wide roll-ups.",
    "Occupancy, revenue, complaints — all real-time.",
    "Exportable to Excel, PDF and your existing BI tool.",
    "Drill from property to block to bed in one click.",
  ],
};

function FeaturesPage() {
  const mocks: Record<number, JSX.Element> = {
    0: <MockFinanceDashboard />,
    1: <MockFeeReceipt />,
    2: <MockComplaintBoard />,
    3: <MockSecurityLog />,
    4: <MockAiInsights />,
  };

  return (
    <div className="bg-section-dark">
      <PageHero
        eyebrow="Features"
        title="A complete operating system for residential properties"
        desc="Five feature pillars — Finance, Student, Operations, Security and Analytics — covering every workflow your residence relies on."
      />

      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <StatBand stats={[
            { v: "92%", l: "On-time collection" },
            { v: "3 min", l: "Daily attendance" },
            { v: "100%", l: "Parent reach" },
            { v: "10k+", l: "Beds managed" },
          ]} />
        </div>
      </section>

      {groups.map((g, gi) => {
        const illus: Record<number, { src: string; alt: string }> = {
          0: { src: collectionChart, alt: "Finance collection chart" },
          1: { src: tenantAgreement, alt: "Resident agreement document" },
          2: { src: servicesPanel, alt: "Operations services panel" },
          3: { src: duesLock, alt: "Secure dues view" },
          4: { src: attendanceOutpass, alt: "Attendance and outpass approval" },
        };
        const card = illus[gi];
        const mock = mocks[gi];
        const reversed = gi % 2 === 1;
        return (
          <section key={g.title} className="border-b border-dark-border py-20">
            <div className="mx-auto max-w-7xl px-4 md:px-6">
              <SectionHeading eyebrow={g.title} title={`${g.title} features`} desc={g.desc} />
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => <FeatureCard key={it.title} icon={it.icon} title={it.title} desc="Configurable workflows with role-based access and audit trails." tone="teal" />)}
              </div>

              {mock && (
                <div className={`mt-16 grid items-center gap-10 lg:grid-cols-2 ${reversed ? "lg:[&>*:first-child]:order-2" : ""}`}>
                  <div>{mock}</div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gold">{g.title} · live mockup</div>
                    <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">What {g.title.toLowerCase()} looks like inside Hostylia</h3>
                    <p className="mt-3 text-base leading-relaxed text-soft-grey">
                      A real screen from the product — not a marketing render. Built for the operator
                      who runs your residence every single day.
                    </p>
                    <BenefitList items={benefits[g.title] ?? []} />
                  </div>
                </div>
              )}

              {card && (
                <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
                  <IllustrationCard src={card.src} alt={card.alt} />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gold">{g.title} in action</div>
                    <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Built for real residential operations</h3>
                    <p className="mt-3 text-base leading-relaxed text-soft-grey">
                      Every {g.title.toLowerCase()} workflow ships with role-based access, audit
                      trails and Hostylia's elegant operator experience — designed with wardens,
                      not for them.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}

      <section className="border-b border-dark-border py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Loved by operators" title="Properties that switched, never looked back" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <TestimonialCard
              quote="We replaced four tools with Hostylia. Our collection went from 78% to 96% in the first quarter."
              name="Anjali Mehta"
              role="Owner · 4-property PG chain, Pune"
            />
            <TestimonialCard
              quote="Wardens now close attendance in 3 minutes. Parents stopped calling — they trust the app."
              name="Father Joseph K."
              role="Boarding School Principal, Kerala"
            />
            <TestimonialCard
              quote="The AI complaint triage alone saves us 12 hours a week. The reporting is genuinely beautiful."
              name="Rohit Bansal"
              role="Operations Head · 1,200-bed dormitory"
            />
          </div>
        </div>
      </section>

      <CTAStrip />
    </div>
  );
}
