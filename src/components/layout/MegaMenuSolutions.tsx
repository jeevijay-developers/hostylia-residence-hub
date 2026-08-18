import {
  Building2,
  Home,
  Users,
  School,
  GraduationCap,
  BookOpen,
  Hospital,
  BriefcaseBusiness,
  Network,
  Stethoscope,
  Church,
  Building,
  ArrowRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

const columns = [
  {
    title: "Residential",
    items: [
      { label: "Student Hostels", icon: Building2, desc: "PG-style hostel operations" },
      { label: "PG Accommodation", icon: Home, desc: "Paying-guest property suite" },
      { label: "Co-Living Spaces", icon: Users, desc: "Modern shared living" },
      { label: "Rental Homes", icon: Building, desc: "Long-term rental tracking" },
      { label: "Staff Accommodation", icon: BriefcaseBusiness, desc: "Employer-managed stays" },
    ],
  },
  {
    title: "Campus",
    items: [
      { label: "Boarding Schools", icon: School, desc: "K-12 boarding operations" },
      { label: "University Dormitories", icon: GraduationCap, desc: "Multi-block dorm control" },
      { label: "Coaching Hostels", icon: BookOpen, desc: "Test-prep residences" },
      { label: "College Accommodation", icon: Building2, desc: "Affiliated college hostels" },
      { label: "Residential Campuses", icon: Network, desc: "Integrated campus living" },
    ],
  },
  {
    title: "Institutional",
    items: [
      { label: "Medical Hostels", icon: Hospital, desc: "MBBS & nursing housing" },
      { label: "Nursing Hostels", icon: Stethoscope, desc: "Hospital-attached blocks" },
      { label: "Religious Hostels", icon: Church, desc: "Trust-run residences" },
      { label: "Corporate Hostels", icon: BriefcaseBusiness, desc: "Workforce accommodation" },
      { label: "Multi-Property Owners", icon: Network, desc: "Portfolio-wide control" },
    ],
  },
];

export function MegaMenuSolutions({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="glass-panel rounded-2xl p-6 shadow-2xl animate-fade-in">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {columns.map((col) => (
          <div key={col.title}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold">
              {col.title}
            </div>
            <ul className="space-y-1">
              {col.items.map((item) => (
                <li key={item.label}>
                  <Link
                    to="/solutions"
                    onClick={onNavigate}
                    className="group flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-white/5"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand-blue)_22%,transparent)] text-soft-teal">
                      <item.icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white group-hover:text-soft-teal">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-soft-grey">{item.desc}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between rounded-xl border border-dark-border bg-[color-mix(in_oklab,var(--indigo-deep)_70%,transparent)] p-4">
        <div>
          <div className="text-sm font-semibold text-white">
            One platform for every residential property type
          </div>
          <div className="text-xs text-soft-grey">
            Unify operations across blocks, floors, rooms and beds.
          </div>
        </div>
        <Link
          to="/solutions"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-xs font-bold text-navy hover:opacity-90"
        >
          Explore Solutions <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
