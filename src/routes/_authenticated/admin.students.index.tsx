import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Upload, Search, Eye } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { StudentBulkImportModal } from "@/components/students/StudentBulkImportModal";

export const Route = createFileRoute("/_authenticated/admin/students/")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  component: StudentsListPage,
});

function StudentsListPage() {
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const propertiesQ = useQuery({
    queryKey: ["admin-properties-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const effectiveProperty = propertyId ?? propertiesQ.data?.[0]?.id ?? null;

  const studentsQ = useQuery({
    queryKey: ["admin-students", tenantId, effectiveProperty, statusFilter, q],
    enabled: !!tenantId && !!effectiveProperty,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, full_name, admission_number, phone, email, status, created_at")
        .eq("tenant_id", tenantId!)
        .eq("property_id", effectiveProperty!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "ALL") query = query.eq("status", statusFilter);
      if (q.trim()) query = query.ilike("full_name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const s = { total: 0, active: 0, applicants: 0 };
    (studentsQ.data ?? []).forEach((r) => {
      s.total += 1;
      if (r.status === "ACTIVE") s.active += 1;
      if (r.status === "APPLICANT") s.applicants += 1;
    });
    return s;
  }, [studentsQ.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Applicants, active residents and alumni."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Bulk import
            </Button>
            <Button asChild>
              <a href={`/apply/${propertiesQ.data?.[0] ? "" : ""}`} onClick={(e) => e.preventDefault()}>
                <UserPlus className="h-4 w-4" /> Share public form
              </a>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {propertiesQ.data && propertiesQ.data.length > 1 && (
          <Select value={effectiveProperty ?? ""} onValueChange={(v) => setPropertyId(v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Property" /></SelectTrigger>
            <SelectContent>
              {propertiesQ.data.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="APPLICANT">Applicant</SelectItem>
            <SelectItem value="VERIFIED">Verified</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="NOTICE_GIVEN">Notice given</SelectItem>
            <SelectItem value="MOVED_OUT">Moved out</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-64 pl-8"
            placeholder="Search by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {stats.total} total • {stats.active} active • {stats.applicants} applicants
        </div>
      </div>

      {studentsQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (studentsQ.data ?? []).length === 0 ? (
        <EmptyState
          title="No students yet"
          description="Share your public admission link or bulk import to start onboarding."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Admission #</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(studentsQ.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.admission_number}</TableCell>
                  <TableCell>{s.phone ?? "—"}</TableCell>
                  <TableCell><StudentStatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/students/$id" params={{ id: s.id }}>
                        <Eye className="h-4 w-4" /> Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tenantId && effectiveProperty && (
        <StudentBulkImportModal
          open={importOpen}
          onOpenChange={setImportOpen}
          tenantId={tenantId}
          propertyId={effectiveProperty}
          onDone={() => studentsQ.refetch()}
        />
      )}
    </div>
  );
}
