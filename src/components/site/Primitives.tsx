import type { LucideIcon } from "lucide-react";

export function FeatureCard({
  icon: Icon,
  title,
  desc,
  tone = "teal",
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  tone?: "teal" | "blue" | "green" | "gold";
}) {
  const toneClasses = {
    teal: "bg-[color-mix(in_oklab,var(--soft-teal)_18%,transparent)] text-soft-teal",
    blue: "bg-[color-mix(in_oklab,var(--brand-blue)_20%,transparent)] text-[color:var(--brand-blue)]",
    green: "bg-[color-mix(in_oklab,var(--trust-green)_22%,transparent)] text-[color:var(--trust-green)]",
    gold: "bg-[color-mix(in_oklab,var(--gold)_22%,transparent)] text-gold",
  }[tone];

  return (
    <div className="card-lift group rounded-2xl border border-dark-border bg-card p-6">
      <div className={`mb-4 inline-grid h-12 w-12 place-items-center rounded-xl ${toneClasses}`}>
        <Icon size={22} />
      </div>
      <h3 className="text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-soft-grey">{desc}</p>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  desc,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-dark-border bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gold">
          {eyebrow}
        </div>
      )}
      <h2 className="text-3xl font-extrabold leading-tight text-white md:text-4xl lg:text-5xl">
        {title}
      </h2>
      {desc && <p className="mt-4 text-base leading-relaxed text-soft-grey md:text-lg">{desc}</p>}
    </div>
  );
}
