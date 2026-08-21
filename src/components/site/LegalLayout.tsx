import type { ReactNode } from "react";
import { Mail, MapPin, Phone, Building2 } from "lucide-react";

export function LegalCompanyCard() {
  return (
    <div className="glass-panel mt-6 rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-soft-teal/15 text-soft-teal">
          <Building2 size={18} />
        </span>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-gold">Operator</div>
          <div className="text-base font-extrabold text-foreground">
            Jeevijay Technologies Private Limited
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="flex items-start gap-2 text-sm text-soft-grey">
          <MapPin size={14} className="mt-0.5 text-soft-teal" />
          <span>
            H No 1, Sai Extension Colony,
            <br />
            Bengaluru, India
          </span>
        </div>
        <div className="flex items-start gap-2 text-sm text-soft-grey">
          <Mail size={14} className="mt-0.5 text-soft-teal" />
          <a href="mailto:team@hostylia.com" className="hover:text-foreground">
            team@hostylia.com
          </a>
        </div>
        <div className="flex items-start gap-2 text-sm text-soft-grey">
          <Phone size={14} className="mt-0.5 text-soft-teal" />
          <a href="tel:+918619483010" className="hover:text-foreground">
            +91 86194 83010
          </a>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-dark-border py-8 first:border-0 first:pt-0"
    >
      <h2 className="text-xl font-extrabold text-foreground md:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-soft-grey md:text-[15px]">
        {children}
      </div>
    </section>
  );
}

export function LegalTocNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className="sticky top-24 hidden rounded-2xl border border-dark-border bg-card p-5 lg:block">
      <div className="text-xs font-bold uppercase tracking-widest text-gold">On this page</div>
      <ol className="mt-4 space-y-2 text-sm">
        {items.map((i, idx) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className="flex items-baseline gap-2 text-soft-grey transition-colors hover:text-foreground"
            >
              <span className="w-6 text-[10px] font-bold text-soft-teal">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span>{i.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
