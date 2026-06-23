import type { ReactNode } from "react";
import {
  BedDouble, IndianRupee, Wifi, Utensils, ShieldCheck, Check, Clock,
  ArrowUpRight, ArrowDownRight, Bell, Search, Wallet, Sparkles, Users,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Frames                                                              */
/* ------------------------------------------------------------------ */

export function BrowserFrame({ children, url = "app.hostylia.com" }: { children: ReactNode; url?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-dark-border bg-[color:var(--indigo-deep)] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-dark-border bg-[color:var(--navy)]/80 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <div className="ml-3 flex flex-1 items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-md border border-dark-border bg-white/5 px-3 py-1 text-[11px] font-medium text-soft-grey">
            <span className="h-1.5 w-1.5 rounded-full bg-soft-teal" />
            {url}
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-[color:var(--indigo-deep)] via-[#0c1530] to-[color:var(--navy)] p-5">
        {children}
      </div>
    </div>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-[280px] rounded-[2.5rem] border border-dark-border bg-[color:var(--navy)] p-2 shadow-2xl">
      <div className="overflow-hidden rounded-[2rem] border border-dark-border bg-gradient-to-br from-[color:var(--indigo-deep)] to-[color:var(--navy)]">
        <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[10px] font-semibold text-white">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-white" />
            <span className="h-1 w-1 rounded-full bg-white" />
            <span className="h-1 w-1 rounded-full bg-white/50" />
          </span>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock UIs                                                            */
/* ------------------------------------------------------------------ */

export function MockOccupancyDashboard() {
  return (
    <BrowserFrame url="app.hostylia.com/occupancy">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gold">Live Occupancy</div>
          <div className="mt-1 text-lg font-extrabold text-white">Block A — Floor 3</div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-dark-border bg-white/5 px-2.5 py-1.5 text-[10px] text-soft-grey">
          <Search size={11} /> Search beds
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { v: "184", l: "Total Beds", t: "white" },
          { v: "171", l: "Occupied", t: "teal" },
          { v: "13", l: "Vacant", t: "gold" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-dark-border bg-white/5 p-3">
            <div className={`text-xl font-extrabold ${s.t === "teal" ? "text-soft-teal" : s.t === "gold" ? "text-gold" : "text-white"}`}>{s.v}</div>
            <div className="mt-0.5 text-[10px] text-soft-grey">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-6 gap-1.5">
        {Array.from({ length: 24 }).map((_, i) => {
          const status = i % 7 === 0 ? "vacant" : i % 11 === 0 ? "notice" : "occupied";
          const color =
            status === "occupied"
              ? "bg-soft-teal/80 border-soft-teal"
              : status === "notice"
              ? "bg-gold/70 border-gold"
              : "bg-white/5 border-dark-border";
          return (
            <div key={i} className={`flex h-10 items-center justify-center rounded-lg border text-[10px] font-bold text-white ${color}`}>
              {i + 301}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-soft-grey">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-soft-teal" /> Occupied</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gold" /> On notice</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-dark-border" /> Vacant</span>
      </div>
    </BrowserFrame>
  );
}

export function MockFinanceDashboard() {
  const months = [60, 72, 55, 80, 92, 88, 96, 84, 78, 90, 86, 95];
  return (
    <BrowserFrame url="app.hostylia.com/finance">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gold">Fee Collection</div>
          <div className="mt-1 text-lg font-extrabold text-white">₹ 48,72,300 collected</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-soft-teal">
            <ArrowUpRight size={11} /> 18.4% vs last month
          </div>
        </div>
        <div className="rounded-lg border border-dark-border bg-white/5 px-2.5 py-1.5 text-[10px] text-soft-grey">FY 25-26</div>
      </div>
      <div className="mt-4 flex h-28 items-end gap-1.5">
        {months.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-[color:var(--brand-blue)] to-soft-teal" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        {[
          { l: "Paid", v: "1,612", c: "text-soft-teal" },
          { l: "Pending", v: "184", c: "text-gold" },
          { l: "Overdue", v: "27", c: "text-[#E55353]" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-dark-border bg-white/5 px-3 py-2">
            <div className={`text-base font-extrabold ${s.c}`}>{s.v}</div>
            <div className="text-[10px] text-soft-grey">{s.l}</div>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function MockComplaintBoard() {
  const items = [
    { t: "Leaking tap — Room 214", s: "Resolved", c: "text-soft-teal", b: "border-soft-teal/40 bg-soft-teal/10" },
    { t: "Wi-Fi slow — Block B", s: "In Progress", c: "text-gold", b: "border-gold/40 bg-gold/10" },
    { t: "AC service — Room 408", s: "Assigned", c: "text-[color:var(--brand-blue)]", b: "border-[color:var(--brand-blue)]/40 bg-[color:var(--brand-blue)]/10" },
    { t: "Mess feedback — Dinner", s: "Open", c: "text-white", b: "border-dark-border bg-white/5" },
  ];
  return (
    <BrowserFrame url="app.hostylia.com/complaints">
      <div className="flex items-center justify-between">
        <div className="text-lg font-extrabold text-white">Complaint Board</div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-soft-teal/15 px-2.5 py-1 text-[10px] font-semibold text-soft-teal">
          <Sparkles size={11} /> AI Triage
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((i) => (
          <div key={i.t} className="flex items-center justify-between rounded-xl border border-dark-border bg-white/5 px-3 py-2.5">
            <div className="text-xs font-semibold text-white">{i.t}</div>
            <div className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${i.b} ${i.c}`}>{i.s}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-dark-border bg-[color:var(--brand-blue)]/15 px-3 py-2">
        <div className="text-[11px] font-semibold text-white">Avg resolution time</div>
        <div className="text-sm font-extrabold text-soft-teal">3h 12m</div>
      </div>
    </BrowserFrame>
  );
}

export function MockRoomBooking() {
  return (
    <PhoneFrame>
      <div className="rounded-xl bg-gradient-to-br from-[color:var(--brand-blue)] to-soft-teal p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Featured Stay</div>
        <div className="mt-1 text-base font-extrabold text-white">Hostylia House — Pune</div>
        <div className="mt-0.5 text-[10px] text-white/80">Twin Sharing · AC · Meals</div>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
          <ShieldCheck size={10} /> Verified Property
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {[
          { i: BedDouble, t: "Single Room", p: "₹14,500/mo" },
          { i: BedDouble, t: "Twin Sharing", p: "₹9,800/mo" },
          { i: BedDouble, t: "Triple Sharing", p: "₹7,200/mo" },
        ].map((r) => (
          <div key={r.t} className="flex items-center justify-between rounded-lg border border-dark-border bg-white/5 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-soft-teal/15 text-soft-teal"><r.i size={14} /></span>
              <div>
                <div className="text-[11px] font-bold text-white">{r.t}</div>
                <div className="text-[9px] text-soft-grey">Includes Wi-Fi · Laundry</div>
              </div>
            </div>
            <div className="text-[11px] font-extrabold text-gold">{r.p}</div>
          </div>
        ))}
      </div>
      <button className="mt-3 w-full rounded-lg bg-gold py-2 text-[11px] font-extrabold text-navy">
        Book a Visit
      </button>
    </PhoneFrame>
  );
}

export function MockFeeReceipt() {
  return (
    <PhoneFrame>
      <div className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-soft-teal/20 text-soft-teal">
          <Check size={22} />
        </div>
        <div className="mt-2 text-sm font-extrabold text-white">Payment Successful</div>
        <div className="text-[10px] text-soft-grey">Receipt #HST-24081</div>
      </div>
      <div className="mt-3 rounded-xl border border-dark-border bg-white/5 p-3">
        {[
          { l: "Tuition Fee", v: "₹ 22,000" },
          { l: "Hostel Rent", v: "₹ 9,800" },
          { l: "Mess", v: "₹ 4,200" },
        ].map((r) => (
          <div key={r.l} className="flex items-center justify-between border-b border-dark-border py-1.5 last:border-0 text-[11px] text-white">
            <span className="text-soft-grey">{r.l}</span>
            <span className="font-semibold">{r.v}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between border-t border-dark-border pt-2 text-xs font-extrabold text-white">
          <span>Total Paid</span><span className="text-soft-teal">₹ 36,000</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-gold/15 px-3 py-2 text-[10px] font-semibold text-gold">
        <span className="flex items-center gap-1"><Wallet size={11} /> Paid via UPI</span>
        <span>Today · 10:24 AM</span>
      </div>
    </PhoneFrame>
  );
}

export function MockParentApp() {
  return (
    <PhoneFrame>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-soft-grey">Welcome back,</div>
          <div className="text-sm font-extrabold text-white">Mrs. Sharma</div>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white"><Bell size={14} /></div>
      </div>
      <div className="mt-3 rounded-xl border border-dark-border bg-gradient-to-br from-[color:var(--brand-blue)]/30 to-soft-teal/20 p-3">
        <div className="text-[10px] uppercase tracking-widest text-soft-teal">Aarav · Room 214</div>
        <div className="mt-1 flex items-center gap-2 text-xs font-bold text-white">
          <Check size={12} className="text-soft-teal" /> Checked in at 9:42 PM
        </div>
        <div className="mt-0.5 text-[10px] text-soft-grey">On time · 18 min early</div>
      </div>
      <div className="mt-3 space-y-2">
        {[
          { i: Utensils, t: "Dinner served", d: "Veg Thali · 8:00 PM" },
          { i: Wifi, t: "Study hour", d: "Block A · 9:00 PM" },
          { i: Clock, t: "Lights off", d: "Quiet hours active" },
        ].map((it) => (
          <div key={it.t} className="flex items-center gap-3 rounded-lg border border-dark-border bg-white/5 px-3 py-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-soft-teal/15 text-soft-teal"><it.i size={14} /></span>
            <div>
              <div className="text-[11px] font-bold text-white">{it.t}</div>
              <div className="text-[10px] text-soft-grey">{it.d}</div>
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

export function MockAiInsights() {
  return (
    <BrowserFrame url="app.hostylia.com/ai">
      <div className="flex items-center justify-between">
        <div className="text-lg font-extrabold text-white">AI Insights</div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-bold text-gold">
          <Sparkles size={11} /> Today
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { t: "Late-fee risk", v: "12 students", d: "Send AI nudge", c: "text-gold" },
          { t: "Vacancy forecast", v: "21 beds in 30d", d: "Open allocation plan", c: "text-soft-teal" },
          { t: "Complaint spike", v: "Block C · Plumbing", d: "Assign vendor", c: "text-[#E55353]" },
          { t: "Top performing block", v: "Block A · 98%", d: "Replicate playbook", c: "text-soft-teal" },
        ].map((i) => (
          <div key={i.t} className="rounded-xl border border-dark-border bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-widest text-soft-grey">{i.t}</div>
            <div className={`mt-1 text-base font-extrabold ${i.c}`}>{i.v}</div>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-white">{i.d} <ArrowUpRight size={11} /></div>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function MockSecurityLog() {
  const rows = [
    { n: "Aarav S.", t: "Entry · Main Gate", a: "9:42 PM", s: "ok" },
    { n: "Visitor · Mr. Khan", t: "For Riya P.", a: "8:15 PM", s: "visitor" },
    { n: "Diya M.", t: "Outpass · 6h", a: "5:30 PM", s: "ok" },
    { n: "Karan R.", t: "Late entry alert", a: "11:12 PM", s: "alert" },
  ];
  return (
    <BrowserFrame url="app.hostylia.com/security">
      <div className="flex items-center justify-between">
        <div className="text-lg font-extrabold text-white">Gate Activity</div>
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-soft-teal/15 px-2.5 py-1 text-[10px] font-bold text-soft-teal">
          <ShieldCheck size={11} /> Live
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-dark-border">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between border-b border-dark-border bg-white/5 px-3 py-2 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ${
                r.s === "alert" ? "bg-[#E55353]/20 text-[#E55353]" :
                r.s === "visitor" ? "bg-gold/20 text-gold" : "bg-soft-teal/20 text-soft-teal"
              }`}><Users size={12} /></span>
              <div>
                <div className="text-[11px] font-bold text-white">{r.n}</div>
                <div className="text-[10px] text-soft-grey">{r.t}</div>
              </div>
            </div>
            <div className="text-[10px] font-semibold text-soft-grey">{r.a}</div>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Marketing primitives                                                */
/* ------------------------------------------------------------------ */

export function StatBand({ stats }: { stats: { v: string; l: string }[] }) {
  return (
    <div className="rounded-3xl border border-dark-border bg-[color:var(--indigo-deep)]/60 p-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="text-center">
            <div className="text-3xl font-extrabold text-soft-teal md:text-4xl">{s.v}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-soft-grey">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BenefitList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5 text-sm text-soft-grey">
          <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-soft-teal/20 text-soft-teal">
            <Check size={12} />
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function TestimonialCard({ quote, name, role }: { quote: string; name: string; role: string }) {
  return (
    <figure className="card-lift rounded-2xl border border-dark-border bg-card p-6">
      <div className="flex gap-0.5 text-gold">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i}>★</span>
        ))}
      </div>
      <blockquote className="mt-3 text-sm leading-relaxed text-white">"{quote}"</blockquote>
      <figcaption className="mt-4 flex items-center gap-3 border-t border-dark-border pt-4">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[color:var(--brand-blue)] to-soft-teal text-sm font-extrabold text-white">
          {name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
        </div>
        <div>
          <div className="text-sm font-bold text-white">{name}</div>
          <div className="text-xs text-soft-grey">{role}</div>
        </div>
      </figcaption>
    </figure>
  );
}

export function IndustryBadge({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-dark-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-white">
      <Icon size={14} className="text-soft-teal" />
      {label}
    </div>
  );
}

export function IndianRupeeBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-soft-teal/15 px-2 py-0.5 text-xs font-semibold text-soft-teal">
      <IndianRupee size={11} /> INR ready
    </span>
  );
}
