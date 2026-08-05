import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Upload, Search, Eye, Link2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { StudentBulkImportModal } from "@/components/students/StudentBulkImportModal";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { deleteStudent } from "@/lib/student.functions";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/students/")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  component: StudentsListPage,
});

function StudentsListPage() {
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; full_name: string } | null>(null);

  const propertiesQ = useQuery({
    queryKey: ["admin-properties-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, slug")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const [localPropertyId, setLocalPropertyId] = useState<string | null>(null);
  const effectiveProperty = localPropertyId ?? activePropertyId ?? propertiesQ.data?.[0]?.id ?? null;
  const effectivePropertyRow = propertiesQ.data?.find((p) => p.id === effectiveProperty);

  function shareAdmissionLink() {
    if (!effectivePropertyRow?.slug) {
      toast.error("Set up a property first — the admission link needs a property.");
      return;
    }
    const url = `${window.location.origin}/apply/${effectivePropertyRow.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Admission link copied — share it with applicants via WhatsApp/SMS.");
  }

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

  const deleteFn = useServerFn(deleteStudent);
  const deleteMut = useMutation({
    mutationFn: (student_id: string) => deleteFn({ data: { student_id } }),
    onSuccess: () => {
      toast.success("Student deleted");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete student"),
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={shareAdmissionLink}>
              <Link2 className="h-4 w-4" /> Share public form
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Bulk import
            </Button>
            <Button disabled={!effectiveProperty} onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add student
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {propertiesQ.data && propertiesQ.data.length > 1 && (
          <Select value={effectiveProperty ?? ""} onValueChange={(v) => setLocalPropertyId(v)}>
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
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/admin/students/$id" params={{ id: s.id }}>
                          <Eye className="h-4 w-4" /> Open
                        </Link>
                      </Button>
                      {s.status === "ACTIVE" || s.status === "NOTICE_GIVEN" ? (
                        <span
                          className="inline-flex items-center px-2 text-xs text-muted-foreground"
                          title="Move this student out before deleting their record"
                        >
                          <Trash2 className="h-4 w-4 opacity-40" />
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPendingDelete({ id: s.id, full_name: s.full_name })}
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tenantId && effectiveProperty && (
        <>
          <StudentBulkImportModal
            open={importOpen}
            onOpenChange={setImportOpen}
            tenantId={tenantId}
            propertyId={effectiveProperty}
            onDone={() => studentsQ.refetch()}
          />
          <AddStudentDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            tenantId={tenantId}
            propertyId={effectiveProperty}
            onDone={() => studentsQ.refetch()}
          />
        </>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.full_name ?? "this student"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from the students list. Their record is kept for audit purposes
              and can be recovered by support if needed — this isn't a permanent erase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMut.mutate(pendingDelete.id);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
