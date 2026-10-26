import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UserPlus,
  Upload,
  Search,
  Eye,
  Link2,
  Loader2,
  Trash2,
  Building2,
  Filter,
  Users,
  UserCheck,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { StudentBulkImportModal } from "@/components/students/StudentBulkImportModal";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { deleteStudent } from "@/lib/student.functions";

const AVATAR_COLOR_PAIRS = [
  {
    bg: "bg-indigo-100 dark:bg-indigo-950/90",
    text: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-300 dark:border-indigo-800/60",
  },
  {
    bg: "bg-emerald-100 dark:bg-emerald-950/90",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-300 dark:border-emerald-800/60",
  },
  {
    bg: "bg-purple-100 dark:bg-purple-950/90",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-300 dark:border-purple-800/60",
  },
  {
    bg: "bg-teal-100 dark:bg-teal-950/90",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-teal-300 dark:border-teal-800/60",
  },
  {
    bg: "bg-amber-100 dark:bg-amber-950/90",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-300 dark:border-amber-800/60",
  },
  {
    bg: "bg-blue-100 dark:bg-blue-950/90",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-300 dark:border-blue-800/60",
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLOR_PAIRS[Math.abs(hash) % AVATAR_COLOR_PAIRS.length];
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

interface PropertyOption {
  id: string;
  name: string;
  slug: string;
}

export interface StudentsListPageProps {
  tenantId: string;
  /** Route prefix for the View action and Add/Import dialogs' student links. */
  viewBasePath: "/admin/students" | "/warden/students";
  /** Properties available to switch between. Length <= 1 hides the switcher
   * (a single-property Warden never sees it — same condition Admin's own
   * page already used). */
  properties: PropertyOption[];
  effectiveProperty: string | null;
  onPropertyChange?: (propertyId: string) => void;
  /** Gates Share admission link / Bulk import / Add student — all three are
   * "bring a new student in" actions. */
  canCreate: boolean;
  /** Gates the per-row Delete action. View is always available once this
   * page is reachable at all (list read access is enforced upstream). */
  canDelete: boolean;
  /** Preselects the status filter (e.g. deep-linking from a dashboard KPI
   * card) — defaults to "ALL" (today's unchanged behavior) when omitted. */
  initialStatusFilter?: string;
}

/**
 * The exact Admin → Students UI/logic (filters, search, KPI cards, table,
 * pagination, bulk import, add student, delete) — extracted so Warden's
 * Students page can reuse it verbatim instead of a parallel implementation.
 * Admin's own route passes canCreate/canDelete as always-true (unconditional
 * role), so its behavior is unchanged; Warden's route passes its real,
 * per-staff-member granted permissions.
 */
export function StudentsListPage({
  tenantId,
  viewBasePath,
  properties,
  effectiveProperty,
  onPropertyChange,
  canCreate,
  canDelete,
  initialStatusFilter,
}: StudentsListPageProps) {
  // Scopes the mobile status+search row-merge below to Warden only (its
  // property switcher never renders, so that grid cell sits empty) — Admin's
  // multi-property mobile row is untouched.
  const isWarden = viewBasePath === "/warden/students";
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter ?? "ALL");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; full_name: string } | null>(
    null,
  );

  const effectivePropertyRow = properties.find((p) => p.id === effectiveProperty);

  function shareAdmissionLink() {
    if (!effectivePropertyRow?.slug) {
      toast.error("Set up a property first — the admission link needs a property.");
      return;
    }
    const url = `${window.location.origin}/apply/${effectivePropertyRow.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Admission link copied — share it with applicants via WhatsApp/SMS.");
  }

  useEffect(() => {
    if (q === debouncedQ) return;
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q, debouncedQ]);

  const studentsQ = useQuery({
    queryKey: [
      "students-list",
      tenantId,
      effectiveProperty,
      statusFilter,
      debouncedQ,
      page,
      pageSize,
    ],
    enabled: !!tenantId && !!effectiveProperty,
    queryFn: async () => {
      if (!effectiveProperty) return { rows: [], total: 0 };
      let query = supabase
        .from("students")
        .select("id, full_name, admission_number, phone, email, status, created_at", {
          count: "exact",
        })
        .eq("tenant_id", tenantId)
        .eq("property_id", effectiveProperty)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (statusFilter !== "ALL") query = query.eq("status", statusFilter);
      if (debouncedQ.trim()) query = query.ilike("full_name", `%${debouncedQ.trim()}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const statsQ = useQuery({
    queryKey: ["students-list", "stats", tenantId, effectiveProperty, statusFilter, debouncedQ],
    enabled: !!tenantId && !!effectiveProperty,
    queryFn: async () => {
      if (!effectiveProperty) return { total: 0, active: 0, applicants: 0 };
      const countStatus = async (status?: string) => {
        let query = supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("property_id", effectiveProperty)
          .is("deleted_at", null);
        if (status) query = query.eq("status", status);
        if (debouncedQ.trim()) query = query.ilike("full_name", `%${debouncedQ.trim()}%`);
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      };
      if (statusFilter !== "ALL") {
        const total = await countStatus(statusFilter);
        return {
          total,
          active: statusFilter === "ACTIVE" ? total : 0,
          applicants: statusFilter === "APPLICANT" ? total : 0,
        };
      }
      const [total, active, applicants] = await Promise.all([
        countStatus(),
        countStatus("ACTIVE"),
        countStatus("APPLICANT"),
      ]);
      return { total, active, applicants };
    },
  });

  const deleteFn = useServerFn(deleteStudent);
  const deleteMut = useMutation({
    mutationFn: (student_id: string) => deleteFn({ data: { student_id } }),
    onSuccess: () => {
      toast.success("Student deleted");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["students-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete student"),
  });

  const stats = statsQ.data ?? { total: 0, active: 0, applicants: 0 };
  const totalRows = studentsQ.data?.total ?? 0;
  const pagedStudents = studentsQ.data?.rows ?? [];

  useEffect(() => {
    if (totalRows === 0) return;
    const lastPage = Math.max(0, Math.ceil(totalRows / pageSize) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [totalRows, page, pageSize]);

  const searchBox = (
    <div className="relative w-full lg:order-6 lg:w-64">
      <Search className="pointer-events-none absolute left-3 sm:left-3.5 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="bg-card border-border text-foreground rounded-xl h-9 pl-9 text-xs sm:h-11 sm:pl-10 sm:text-sm font-medium placeholder:text-muted-foreground"
        placeholder="Search by name..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl pb-10 overflow-x-hidden">
      {/* Toolbar: property/status/search + create actions — one row on
          desktop (lg:), unchanged stacked/grouped layout below that. */}
      <div className="space-y-4 sm:space-y-6 lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:gap-3 lg:space-y-0">
        {/* Top Action Buttons Section */}
        {canCreate && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-center sm:justify-start lg:contents">
            <Button
              variant="outline"
              onClick={shareAdmissionLink}
              className="border-border bg-card hover:bg-accent text-foreground rounded-xl h-9 px-3 text-xs sm:h-11 sm:px-4 sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-all lg:order-2"
            >
              <Link2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-700 dark:text-amber-400" />
              <span>Share public form</span>
            </Button>

            <div className="flex gap-2 sm:contents">
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="flex-1 sm:flex-initial border-border bg-card hover:bg-accent text-foreground rounded-xl h-9 px-3 text-xs sm:h-11 sm:px-4 sm:text-sm font-semibold flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer transition-all lg:order-3"
              >
                <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-700 dark:text-amber-400" />
                <span>Bulk import</span>
              </Button>

              <Button
                disabled={!effectiveProperty}
                onClick={() => setAddOpen(true)}
                className="flex-1 sm:flex-initial bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-linear-to-r dark:from-amber-500 dark:via-amber-500 dark:to-amber-600 dark:hover:from-amber-400 dark:hover:to-amber-500 dark:text-slate-950 font-bold rounded-xl h-9 px-4 text-xs sm:h-11 sm:px-6 sm:text-sm shadow-lg shadow-primary/20 dark:shadow-amber-500/20 border border-primary/30 dark:border-amber-300/40 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer transition-all lg:order-4"
              >
                <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground dark:text-slate-950 stroke-[2.5]" />
                <span>Add student</span>
              </Button>
            </div>
          </div>
        )}

        {/* Filters & Search Section */}
        <div className="space-y-2 sm:space-y-3 lg:contents">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:contents">
            {properties.length > 1 && (
              <Select
                value={effectiveProperty ?? ""}
                onValueChange={(v) => {
                  onPropertyChange?.(v);
                  setPage(0);
                }}
              >
                <SelectTrigger className="bg-card border-border text-foreground rounded-xl h-9 text-xs sm:h-11 sm:text-sm font-medium lg:order-1 lg:w-52">
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                    <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Property" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="bg-card border-border text-foreground rounded-xl h-9 text-xs sm:h-11 sm:text-sm font-medium lg:order-5 lg:w-48">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                  <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="VERIFIED">Verified</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="NOTICE_GIVEN">Notice given</SelectItem>
                <SelectItem value="MOVED_OUT">Moved out</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>

            {/* Warden has no property switcher, so this grid cell is
                otherwise empty on mobile/tablet — pairs Search with Status
                in that same row instead of it wrapping to its own row
                below. Admin (property switcher present) is unaffected. */}
            {isWarden && searchBox}
          </div>

          {!isWarden && searchBox}
        </div>
      </div>

      {/* Dashboard Stats KPI Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-xl sm:rounded-2xl border border-border/80 bg-card p-2.5 sm:p-5 flex items-center gap-2 sm:gap-4 shadow-xl min-w-0">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-sm shadow-purple-500/10">
            <Users className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-3xl font-bold text-foreground truncate">
              {stats.total}
            </div>
            <div className="text-[10px] sm:text-sm font-medium text-muted-foreground truncate">
              Total
            </div>
          </div>
        </div>

        <div className="rounded-xl sm:rounded-2xl border border-border/80 bg-card p-2.5 sm:p-5 flex items-center gap-2 sm:gap-4 shadow-xl min-w-0">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/10">
            <UserCheck className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-3xl font-bold text-foreground truncate">
              {stats.active}
            </div>
            <div className="text-[10px] sm:text-sm font-medium text-muted-foreground truncate">
              Active
            </div>
          </div>
        </div>

        <div className="rounded-xl sm:rounded-2xl border border-border/80 bg-card p-2.5 sm:p-5 flex items-center gap-2 sm:gap-4 shadow-xl min-w-0">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/10">
            <ClipboardList className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-lg sm:text-3xl font-bold text-foreground truncate">
              {stats.applicants}
            </div>
            <div className="text-[10px] sm:text-sm font-medium text-muted-foreground truncate">
              Applicants
            </div>
          </div>
        </div>
      </div>

      {/* Data Table Section */}
      {studentsQ.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : studentsQ.isError ? (
        <p className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {studentsQ.error instanceof Error ? studentsQ.error.message : "Could not load students."}
        </p>
      ) : pagedStudents.length === 0 ? (
        <EmptyState
          title="No students yet"
          description={
            canCreate
              ? "Share your public admission link or bulk import to start onboarding."
              : "No students match the current filters."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl sm:rounded-2xl border border-border/80 bg-card shadow-2xl">
          <div className="overflow-x-auto">
            <Table className="min-w-160">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border/80 bg-card">
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    NAME
                  </TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ADMISSION #
                  </TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    PHONE
                  </TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    STATUS
                  </TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    ACTIONS
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {pagedStudents.map((s) => {
                  const parts = s.full_name.trim().split(/\s+/);
                  const firstName = parts[0] ?? "";
                  const lastName = parts.slice(1).join(" ");
                  const avatarStyle = getAvatarStyle(s.full_name);
                  const initialStr = (firstName[0] || "") + (lastName[0] || "");
                  return (
                    <TableRow key={s.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border ${avatarStyle.border} ${avatarStyle.bg} ${avatarStyle.text} flex items-center justify-center font-bold text-[10px] sm:text-xs shrink-0 shadow-sm`}
                          >
                            {initialStr.toUpperCase() || initials(s.full_name)}
                          </div>
                          <div>
                            <div className="text-foreground font-semibold text-xs sm:text-sm">
                              {firstName}
                            </div>
                            {lastName && (
                              <div className="text-muted-foreground text-[10px] sm:text-xs">
                                {lastName}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap font-mono text-[10px] sm:text-xs text-muted-foreground">
                        {s.admission_number}
                      </TableCell>
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-foreground">
                        {s.phone ?? "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                        <StudentStatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-border/80 bg-background/80 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all"
                          >
                            <Link
                              to={`${viewBasePath}/$id`}
                              params={{ id: s.id }}
                              aria-label={`Open ${s.full_name}`}
                            >
                              <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </Link>
                          </Button>
                          {canDelete &&
                            (s.status === "ACTIVE" || s.status === "NOTICE_GIVEN" ? (
                              <span
                                className="inline-flex h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-border/40 bg-background/40 items-center justify-center text-muted-foreground opacity-40 cursor-not-allowed"
                                title="Move this student out before deleting their record"
                              >
                                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </span>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Delete ${s.full_name}`}
                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-border/80 bg-background/80 text-rose-600 dark:text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all"
                                onClick={() =>
                                  setPendingDelete({ id: s.id, full_name: s.full_name })
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </Button>
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Footer */}
          {!studentsQ.isLoading && totalRows > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 px-3 py-3 sm:px-6 sm:py-4 bg-card border-t border-border/80">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-32 sm:w-36 bg-card border-border text-foreground rounded-xl h-9 sm:h-10 text-[11px] sm:text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <PaginationBar
                page={page}
                pageSize={pageSize}
                total={totalRows}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}

      {canCreate && tenantId && effectiveProperty && (
        <>
          <StudentBulkImportModal
            open={importOpen}
            onOpenChange={setImportOpen}
            tenantId={tenantId}
            propertyId={effectiveProperty}
            onDone={() => qc.invalidateQueries({ queryKey: ["students-list"] })}
          />
          <AddStudentDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            tenantId={tenantId}
            propertyId={effectiveProperty}
            onDone={() => qc.invalidateQueries({ queryKey: ["students-list"] })}
          />
        </>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete {pendingDelete?.full_name ?? "this student"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This removes them from the students list. Their record is kept for audit purposes and
              can be recovered by support if needed — this isn't a permanent erase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMut.mutate(pendingDelete.id);
              }}
              disabled={deleteMut.isPending}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
