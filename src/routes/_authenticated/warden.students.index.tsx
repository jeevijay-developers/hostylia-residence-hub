import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Info, Search, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useStudentsInProperty } from "@/lib/ops";

export const Route = createFileRoute("/_authenticated/warden/students/")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  component: WardenStudentsPage,
});

function WardenStudentsPage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const studentsQ = useStudentsInProperty(propertyId);
  const [search, setSearch] = useState("");

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = studentsQ.data ?? [];
    if (!q) return list;
    return list.filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.admission_number.toLowerCase().includes(q),
    );
  }, [studentsQ.data, search]);

  return (
    <div className="space-y-5">
      <PageHeader title="Students" description="Students in your assigned property." />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or admission number"
          className="h-11 rounded-xl border-border bg-card pl-10 shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-primary/30"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {(studentsQ.isLoading || propQ.isLoading) && (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {!studentsQ.isLoading && !propQ.isLoading && students.length === 0 && (
        <EmptyState
          title={search.trim() ? "No students match your search" : "No students assigned yet"}
        />
      )}

      {!studentsQ.isLoading && !propQ.isLoading && students.length > 0 && (
        <section aria-label="Student directory">
          <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {search.trim()
                ? `${students.length} match${students.length === 1 ? "" : "es"}`
                : `${students.length} students`}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Select a student to view details
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {students.map((s, i) => (
              <Link
                key={s.id}
                to="/warden/students/$id"
                params={{ id: s.id }}
                className="group flex min-h-[76px] items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-accent"
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-semibold ${avatarTone(i)}`}
                >
                  {initials(s.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {s.full_name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    Admission #{s.admission_number}
                  </span>
                </span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="sr-only">View {s.full_name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-accent/15 text-accent",
  "bg-primary/15 text-primary",
];

function avatarTone(index: number) {
  return AVATAR_TONES[index % AVATAR_TONES.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
