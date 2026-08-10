import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-4">
      <PageHeader title="Students" description="Students in your assigned property." />

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or admission number"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {(studentsQ.isLoading || propQ.isLoading) && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      )}

      {!studentsQ.isLoading && !propQ.isLoading && students.length === 0 && (
        <EmptyState
          title={search.trim() ? "No students match your search" : "No students assigned yet"}
        />
      )}

      {!studentsQ.isLoading &&
        !propQ.isLoading &&
        students.map((s) => (
          <Link key={s.id} to="/warden/students/$id" params={{ id: s.id }}>
            <Card className="transition hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground">Admission #{s.admission_number}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
    </div>
  );
}
