import {
  Bed,
  IndianRupee,
  MessageSquareWarning,
  ClipboardCheck,
  BellRing,
  TrendingUp,
} from "lucide-react";

const rooms = [
  { n: "101", s: "occupied" },
  { n: "102", s: "occupied" },
  { n: "103", s: "vacant" },
  { n: "104", s: "maintenance" },
  { n: "105", s: "occupied" },
  { n: "106", s: "alert" },
  { n: "107", s: "occupied" },
  { n: "108", s: "vacant" },
  { n: "109", s: "occupied" },
  { n: "110", s: "occupied" },
  { n: "111", s: "vacant" },
  { n: "112", s: "occupied" },
] as const;

const statusStyle: Record<string, string> = {
  vacant:
    "bg-[color-mix(in_oklab,var(--trust-green)_25%,transparent)] text-[color:var(--trust-green)] border-[color-mix(in_oklab,var(--trust-green)_40%,transparent)]",
  occupied:
    "bg-[color-mix(in_oklab,var(--brand-blue)_28%,transparent)] text-white border-[color-mix(in_oklab,var(--brand-blue)_55%,transparent)]",
  maintenance:
    "bg-[color-mix(in_oklab,var(--gold)_28%,transparent)] text-gold border-[color-mix(in_oklab,var(--gold)_55%,transparent)]",
  alert: "bg-[color-mix(in_oklab,#E55353_28%,transparent)] text-[#FF8B8B] border-[#7a3030]",
};

export function HeroDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_oklab,var(--soft-teal)_25%,transparent),transparent_70%)] blur-2xl" />
      <div className="glass-panel rounded-3xl p-5 shadow-2xl">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={TrendingUp} label="Occupancy" value="92%" tone="teal" />
          <Stat icon={IndianRupee} label="Fee Collected" value="84%" tone="green" />
          <Stat icon={MessageSquareWarning} label="Open Tickets" value="07" tone="gold" />
          <Stat icon={ClipboardCheck} label="Attendance" value="96%" tone="blue" />
        </div>

        {/* Room grid */}
        <div className="mt-5 rounded-2xl border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-soft-grey">
                Block A · Floor 1
              </div>
              <div className="text-sm font-bold text-white">Room Status</div>
            </div>
            <div className="flex gap-3 text-[10px] font-semibold text-soft-grey">
              <Legend color="bg-[color:var(--trust-green)]" label="Vacant" />
              <Legend color="bg-[color:var(--brand-blue)]" label="Occupied" />
              <Legend color="bg-[color:var(--gold)]" label="Maint." />
              <Legend color="bg-[#E55353]" label="Alert" />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {rooms.map((r) => (
              <div
                key={r.n}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 ${statusStyle[r.s]}`}
              >
                <Bed size={14} />
                <span className="text-[10px] font-bold">{r.n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notification */}
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-dark-border bg-[color-mix(in_oklab,var(--indigo-deep)_60%,transparent)] p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--soft-teal)_25%,transparent)] text-soft-teal">
            <BellRing size={16} />
          </span>
          <div className="min-w-0 text-xs">
            <div className="font-semibold text-white">Parent alert sent</div>
            <div className="truncate text-soft-grey">
              Rahul S. exited campus at 6:42 PM · Gate Pass #2148
            </div>
          </div>
          <span className="ml-auto rounded-full bg-[color-mix(in_oklab,var(--trust-green)_25%,transparent)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--trust-green)]">
            Delivered
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: "teal" | "green" | "blue" | "gold";
}) {
  const colors = {
    teal: "text-soft-teal",
    green: "text-[color:var(--trust-green)]",
    blue: "text-[color:var(--brand-blue)]",
    gold: "text-gold",
  }[tone];
  return (
    <div className="rounded-xl border border-dark-border bg-[color-mix(in_oklab,var(--navy)_70%,transparent)] p-3">
      <div
        className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest ${colors}`}
      >
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 text-xl font-extrabold text-white">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} /> {label}
    </span>
  );
}
