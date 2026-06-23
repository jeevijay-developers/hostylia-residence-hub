import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Building2, School, GraduationCap, Network,
  LayoutGrid, Users, BedDouble, ShieldCheck, IndianRupee, MessageSquareWarning, BellRing, ScanLine,
  Briefcase, Wallet, UserCog, Calculator, User, UserCheck,
  Brain, Sparkles, BarChart3, FileBarChart, Bot, Languages,
  LogIn, Clock, ShieldAlert, ListChecks, Check,
} from "lucide-react";
import { HeroDashboard } from "@/components/site/HeroDashboard";
import { FeatureCard, SectionHeading } from "@/components/site/Primitives";
import { IllustrationCard } from "@/components/site/IllustrationCard";
import vikasPhoto from "@/assets/vikas-patel.jpeg.asset.json";
import buildingHero from "@/assets/illustrations/building-hero.jpg";
import inventoryStatus from "@/assets/illustrations/inventory-status.jpg";
import duesLock from "@/assets/illustrations/dues-lock.jpg";
import collectionChart from "@/assets/illustrations/collection-chart.jpg";
import aiInsights from "@/assets/illustrations/ai-insights.jpg";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hostylia — Smart Residential Management Platform" },
      { name: "description", content: "One intelligent operating system for hostels, boarding schools, student housing, PGs and co-living. Rooms, fees, attendance, complaints and security in one platform." },
      { property: "og:title", content: "Hostylia — Smart Residential Management Platform" },
      { property: "og:description", content: "Rooms, students, wardens, parents, fees, attendance, complaints and security — unified." },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="bg-section-dark">
      <Hero />
      <TrustedFor />
      <PropertyHierarchy />
      <FeatureSystem />
      <SecuritySystem />
      <ComplaintFlow />
      <FeeManagement />
      <RoleDashboards />
      <AISuite />
      <FounderSection />
      <PricingPreview />
      <FinalCTA />
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-hero-gradient relative overflow-hidden">
      {/* Building silhouette */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full opacity-[0.08]" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden>
        <path fill="#FFFFFF" d="M0 200V120h60V90h40v30h40V60h60v60h50V90h60v30h40V40h70v80h40V70h60v50h50V20h80v100h50V80h60v40h40V50h60v70h40V90h60v30h60V60h70v60h40V100h60v20h60V70h60v50h50V80h60v40h40V20h60v100h50V100h60v20h40V60h70v60h50V90h60v30h60V40h70v80h40V100h60V200Z"/>
      </svg>

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-2">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-dark-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-soft-grey">
            <Sparkles size={12} className="text-gold" />
            Smart Residential Operating System
          </div>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-5xl lg:text-6xl">
            Smart Residential Management for{" "}
            <span className="text-gradient-teal">Hostels, Boarding Schools</span>{" "}
            and Student Housing
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-soft-grey md:text-lg">
            Hostylia brings rooms, students, wardens, parents, fees, attendance, complaints and
            security into one powerful residential operating system.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/book-demo" className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy hover:opacity-90">
              Book a Demo <ArrowRight size={16} />
            </Link>
            <Link to="/platform" className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
              Explore Platform
            </Link>
          </div>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-dark-border pt-6">
            {[
              { v: "10k+", l: "Beds Managed" },
              { v: "98%", l: "On-time Collection" },
              { v: "24x7", l: "Parent Alerts" },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl font-extrabold text-white">{s.v}</div>
                <div className="text-xs text-soft-grey">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="animate-fade-up relative">
          <div className="absolute inset-0 -z-0 overflow-hidden rounded-3xl opacity-40">
            <img src={buildingHero} alt="" aria-hidden className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--navy)] via-[color:var(--navy)]/70 to-transparent" />
          </div>
          <div className="relative z-10">
            <HeroDashboard />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustedFor() {
  const items = [
    { icon: Building2, title: "Built for Hostels", desc: "PG and student hostel operations, from check-in to checkout." },
    { icon: School, title: "Built for Boarding Schools", desc: "K-12 boarding with warden, parent and academic linkage." },
    { icon: GraduationCap, title: "Built for Student Housing", desc: "Universities, dorms and coaching residences at scale." },
    { icon: Network, title: "Built for Multi-Property Owners", desc: "Portfolio-wide visibility across blocks and cities." },
  ];
  return (
    <section className="border-y border-dark-border bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Who Hostylia is for" title="A trusted residential operations platform" desc="Designed for every type of residential property, from a single hostel to a national portfolio." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => <FeatureCard key={it.title} {...it} />)}
        </div>
      </div>
    </section>
  );
}

function PropertyHierarchy() {
  const levels = [
    { label: "Property", desc: "Hostel · School · PG", icon: Building2 },
    { label: "Block", desc: "Wing or building", icon: LayoutGrid },
    { label: "Floor", desc: "Per-floor view", icon: Network },
    { label: "Room", desc: "Configurable layout", icon: BedDouble },
    { label: "Bed", desc: "Individual occupancy", icon: User },
  ];
  const rooms = ["vacant","occupied","occupied","maintenance","occupied","alert","vacant","occupied","occupied","occupied","vacant","occupied"];
  const styleMap: Record<string, string> = {
    vacant: "bg-[color-mix(in_oklab,var(--trust-green)_18%,transparent)] border-[color-mix(in_oklab,var(--trust-green)_40%,transparent)] text-[color:var(--trust-green)]",
    occupied: "bg-[color-mix(in_oklab,var(--brand-blue)_22%,transparent)] border-[color-mix(in_oklab,var(--brand-blue)_50%,transparent)] text-white",
    maintenance: "bg-[color-mix(in_oklab,var(--gold)_22%,transparent)] border-[color-mix(in_oklab,var(--gold)_50%,transparent)] text-gold",
    alert: "bg-[color-mix(in_oklab,#E55353_22%,transparent)] border-[#7a3030] text-[#FF8B8B]",
  };

  return (
    <section className="bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Property Hierarchy" title="From property down to a single bed" desc="Every level mapped, every room tracked, every status visible at a glance." />

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {levels.map((l, i) => (
            <div key={l.label} className="card-lift relative rounded-2xl border border-dark-border bg-card p-5 text-center">
              <div className="mx-auto mb-3 inline-grid h-11 w-11 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand-blue)_22%,transparent)] text-soft-teal">
                <l.icon size={20} />
              </div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gold">Level {i + 1}</div>
              <div className="mt-1 text-base font-bold text-white">{l.label}</div>
              <div className="text-xs text-soft-grey">{l.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 rounded-3xl border border-dark-border bg-card p-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-soft-grey">Live preview · Block B · Floor 2</div>
            <div className="text-xl font-bold text-white">Room Grid</div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {rooms.map((s, i) => (
                <div key={i} className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-3 ${styleMap[s]}`}>
                  <BedDouble size={16} />
                  <span className="text-[10px] font-bold">{201 + i}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {[
              { c: "bg-[color:var(--trust-green)]", l: "Vacant", d: "Ready for allocation" },
              { c: "bg-[color:var(--brand-blue)]", l: "Occupied", d: "Active student in bed" },
              { c: "bg-[color:var(--gold)]", l: "Maintenance", d: "Temporarily out of service" },
              { c: "bg-[#E55353]", l: "Alert", d: "Requires immediate attention" },
            ].map((x) => (
              <div key={x.l} className="flex items-start gap-3 rounded-xl border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] p-3">
                <span className={`mt-1.5 h-3 w-3 rounded-full ${x.c}`} />
                <div>
                  <div className="text-sm font-bold text-white">{x.l}</div>
                  <div className="text-xs text-soft-grey">{x.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <IllustrationCard src={inventoryStatus} alt="Inventory status — vacant, on hold, occupied and on notice rooms" />
          <div className="flex flex-col justify-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Live Inventory</div>
            <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Every bed, every status — at a glance</h3>
            <p className="mt-3 text-base leading-relaxed text-soft-grey">
              Filter by block or floor, see vacant, on-hold, occupied and on-notice beds in one
              colored grid, and assign tenants in a tap. Hostylia turns your inventory into a
              live, visual control room.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureSystem() {
  const items = [
    { icon: Building2, title: "Property Management", desc: "Multi-property, blocks, floors, rooms and beds in one tree." },
    { icon: GraduationCap, title: "Student Management", desc: "Admission, profile, documents and parent linkage." },
    { icon: BedDouble, title: "Room & Bed Allocation", desc: "Drag-friendly allocation with occupancy rules." },
    { icon: UserCog, title: "Warden Management", desc: "Role-based controls for wardens and supervisors." },
    { icon: IndianRupee, title: "Fee & Billing", desc: "Invoices, receipts, UPI links and dues automation." },
    { icon: MessageSquareWarning, title: "Complaint Tracking", desc: "Raise, assign, resolve with full audit trail." },
    { icon: BellRing, title: "Parent Communication", desc: "Alerts on attendance, fees, gate-pass and notices." },
    { icon: ShieldCheck, title: "Security & Gate Pass", desc: "Entry, exit, visitor and emergency workflows." },
  ];
  return (
    <section className="border-y border-dark-border bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Complete Feature System" title="Everything you need to run residential operations" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <FeatureCard key={it.title} {...it} tone={(["teal","blue","green","gold"] as const)[i % 4]} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SecuritySystem() {
  const items = [
    { icon: LogIn, title: "Entry / Exit Logs", desc: "Every gate movement recorded with timestamp and pass ID." },
    { icon: ScanLine, title: "Gate Pass Approval", desc: "Multi-level approvals with parent consent flows." },
    { icon: BellRing, title: "Parent Alerts", desc: "Instant SMS, WhatsApp and in-app notifications." },
    { icon: UserCheck, title: "Visitor Management", desc: "Pre-registered visits, check-in with photo capture." },
    { icon: Clock, title: "Late Entry Tracking", desc: "Configurable curfew and exception handling." },
    { icon: ShieldAlert, title: "Emergency Escalation", desc: "One-tap escalation to wardens and management." },
  ];
  return (
    <section className="bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Security Workflows"
          title="Safety workflows that keep parents informed"
          desc="When a student leaves or enters the property, records are maintained and parents can receive alerts based on property rules."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => <FeatureCard key={it.title} {...it} tone="teal" />)}
        </div>
      </div>
    </section>
  );
}

function ComplaintFlow() {
  const steps = [
    { icon: User, title: "Student Raises", chip: "New" },
    { icon: UserCog, title: "Warden Receives", chip: "Assigned" },
    { icon: Briefcase, title: "Manager Tracks", chip: "In Progress" },
    { icon: UserCheck, title: "Owner Monitors", chip: "Visibility" },
    { icon: ListChecks, title: "Resolution Updated", chip: "Resolved" },
    { icon: Check, title: "Student Feedback", chip: "Closed" },
  ];
  return (
    <section className="border-y border-dark-border bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Complaint Management" title="A transparent flow from raise to resolution" />
        <div className="relative mt-12">
          <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-soft-teal/40 to-transparent lg:block" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
            {steps.map((s, i) => (
              <div key={s.title} className="card-lift relative rounded-2xl border border-dark-border bg-card p-5 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-soft-teal/40 bg-[color-mix(in_oklab,var(--soft-teal)_15%,transparent)] text-soft-teal">
                  <s.icon size={18} />
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-widest text-gold">Step {i + 1}</div>
                <div className="mt-1 text-sm font-bold text-white">{s.title}</div>
                <span className="mt-3 inline-block rounded-full bg-[color-mix(in_oklab,var(--brand-blue)_25%,transparent)] px-2 py-0.5 text-[10px] font-bold text-white">{s.chip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeeManagement() {
  const features = [
    "UPI, card, cash and cheque collection",
    "Auto receipts on every payment",
    "Invoice generation with GST options",
    "Smart due reminders to students and parents",
    "Shareable parent payment links",
    "Live collection reports by block or course",
  ];
  return (
    <section className="bg-section-dark py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="Fee Management" title="Collect, reconcile and report — automatically" align="left" />
          <ul className="mt-6 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-soft-grey">
                <span className="mt-0.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--trust-green)_25%,transparent)] text-[color:var(--trust-green)]">
                  <Check size={12} />
                </span>
                <span className="text-white/90">{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/features" className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy hover:opacity-90">
              View Finance Features <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="glass-panel rounded-3xl p-5">
          <div className="flex items-center justify-between border-b border-dark-border pb-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-soft-grey">June 2026</div>
              <div className="text-lg font-bold text-white">Fee Dashboard</div>
            </div>
            <span className="rounded-full bg-[color-mix(in_oklab,var(--trust-green)_25%,transparent)] px-3 py-1 text-[11px] font-bold text-[color:var(--trust-green)]">Live</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { l: "Collected", v: "₹18.4L", t: "text-[color:var(--trust-green)]" },
              { l: "Pending", v: "₹3.2L", t: "text-gold" },
              { l: "Overdue", v: "₹0.6L", t: "text-[#FF8B8B]" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] p-3">
                <div className="text-[10px] uppercase tracking-widest text-soft-grey">{s.l}</div>
                <div className={`mt-1 text-xl font-extrabold ${s.t}`}>{s.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {[
              { name: "Rahul Sharma", room: "A-201", amt: "₹12,500", st: "Paid", c: "text-[color:var(--trust-green)] bg-[color-mix(in_oklab,var(--trust-green)_18%,transparent)]" },
              { name: "Priya Verma", room: "B-104", amt: "₹14,200", st: "Pending", c: "text-gold bg-[color-mix(in_oklab,var(--gold)_18%,transparent)]" },
              { name: "Aman Khan", room: "C-307", amt: "₹11,800", st: "Overdue", c: "text-[#FF8B8B] bg-[color-mix(in_oklab,#E55353_18%,transparent)]" },
              { name: "Sneha Patel", room: "A-118", amt: "₹13,000", st: "Paid", c: "text-[color:var(--trust-green)] bg-[color-mix(in_oklab,var(--trust-green)_18%,transparent)]" },
            ].map((r) => (
              <div key={r.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-dark-border bg-[color-mix(in_oklab,var(--navy)_60%,transparent)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{r.name}</div>
                  <div className="text-xs text-soft-grey">Room {r.room}</div>
                </div>
                <div className="font-bold text-white">{r.amt}</div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.c}`}>{r.st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-16 grid max-w-7xl gap-6 px-4 md:px-6 lg:grid-cols-2">
        <IllustrationCard src={collectionChart} alt="Collection report chart with pending and received amounts" />
        <IllustrationCard src={duesLock} alt="Secure resident dues card with rent and maintenance line items" />
      </div>
    </section>
  );
}

function RoleDashboards() {
  const items = [
    { icon: Briefcase, title: "Owner Dashboard", desc: "Portfolio occupancy, revenue and risk." },
    { icon: UserCog, title: "Property Manager Dashboard", desc: "Day-to-day operations across blocks." },
    { icon: ShieldCheck, title: "Warden Dashboard", desc: "Rooms, attendance, complaints, gate pass." },
    { icon: Calculator, title: "Accountant Dashboard", desc: "Collections, ledgers and reconciliations." },
    { icon: User, title: "Student Portal", desc: "Fees, attendance, complaints and notices." },
    { icon: Users, title: "Parent Portal", desc: "Real-time visibility into their child's stay." },
  ];
  return (
    <section className="border-y border-dark-border bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Role-Based Dashboards" title="A focused view for every team" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => <FeatureCard key={it.title} {...it} tone={(["blue","teal","green","gold","teal","blue"] as const)[i]} />)}
        </div>
      </div>
    </section>
  );
}

function AISuite() {
  const items = [
    { icon: Brain, title: "AI Complaint Classification", desc: "Auto-tag, prioritize and route to the right team." },
    { icon: Wallet, title: "AI Fee Reminder Assistant", desc: "Personalized nudges across SMS, WhatsApp and email." },
    { icon: BarChart3, title: "AI Occupancy Insights", desc: "Predict turnover and optimize bed allocation." },
    { icon: Languages, title: "AI Parent Support", desc: "24x7 multilingual answers about their child's stay." },
    { icon: Bot, title: "AI Warden Assistant", desc: "Daily briefings and exception summaries." },
    { icon: FileBarChart, title: "AI Report Generator", desc: "Natural-language queries become beautiful reports." },
  ];
  return (
    <section className="bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Hostylia AI Suite" title="AI-powered residential intelligence" desc="Models tuned for residential operations, from complaint triage to fee recovery." />
        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
          <IllustrationCard src={aiInsights} alt="AI residential intelligence dashboard with occupancy gauge and predictive insights" />
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((it) => <FeatureCard key={it.title} {...it} tone="teal" />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function FounderSection() {
  return (
    <section className="bg-section-dark py-20">
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="glass-panel relative overflow-hidden rounded-3xl p-8 md:p-12">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--soft-teal)_30%,transparent),transparent_70%)] blur-2xl" />
          <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
            <img
              src={vikasPhoto.url}
              alt="Vikas Patel, Founder & CEO of Hostylia"
              className="h-32 w-32 rounded-2xl object-cover ring-2 ring-[color:var(--soft-teal)]/40 shadow-xl"
            />

            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-gold">Founder</div>
              <h3 className="mt-2 text-2xl font-extrabold text-white md:text-3xl">Vikas Patel</h3>
              <div className="text-sm text-soft-grey">Founder & CEO, Hostylia · Powered by Jeevijay Technologies Private Limited</div>
              <p className="mt-4 text-base leading-relaxed text-white/90">
                "Hostylia was created to simplify the way residential businesses manage students,
                parents, staff, rooms, fees and daily operations through one intelligent platform."
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingPreview() {
  const plans = [
    { name: "Starter", price: "₹29", desc: "For single hostels getting started.", features: ["Up to 100 beds", "Core operations", "Email support"] },
    { name: "Professional", price: "₹49", desc: "For growing properties and small chains.", features: ["Unlimited beds", "AI Suite included", "Priority support"], featured: true },
    { name: "Enterprise", price: "Custom", desc: "For multi-property owners and institutions.", features: ["Multi-property roll-up", "SSO and SLAs", "Dedicated success manager"] },
  ];
  return (
    <section className="border-y border-dark-border bg-section-dark py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading eyebrow="Pricing" title="Per student, per month" desc="Transparent pricing that scales with your residence." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className={`card-lift rounded-2xl border p-6 ${p.featured ? "border-gold/60 bg-gradient-to-b from-[color-mix(in_oklab,var(--indigo-deep)_85%,transparent)] to-card" : "border-dark-border bg-card"}`}>
              {p.featured && <div className="mb-3 inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-navy">MOST POPULAR</div>}
              <div className="text-sm font-semibold text-soft-grey">{p.name}</div>
              <div className="mt-2 text-4xl font-extrabold text-white">{p.price}<span className="text-base font-medium text-soft-grey"> /student/mo</span></div>
              <div className="mt-2 text-sm text-soft-grey">{p.desc}</div>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white/90">
                    <Check size={14} className="text-[color:var(--trust-green)]" /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/book-demo" className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${p.featured ? "bg-gold text-navy" : "border border-dark-border bg-white/5 text-white hover:bg-white/10"}`}>
                Book Demo for Pricing
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-section-dark py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-dark-border bg-gradient-to-br from-[color:var(--indigo-deep)] via-[#0b1330] to-[color:var(--navy)] p-10 md:p-14">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand-blue)_35%,transparent),transparent_70%)] blur-2xl" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-extrabold text-white md:text-4xl">Ready to digitize your residential business?</h2>
            <p className="mt-3 text-base text-soft-grey">
              Book a demo and see how Hostylia can simplify your hostel, boarding or student housing operations.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/book-demo" className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-bold text-navy hover:opacity-90">
                Book Demo <ArrowRight size={16} />
              </Link>
              <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg border border-dark-border bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
