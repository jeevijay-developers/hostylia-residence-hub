import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  BedSingle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  DoorOpen,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  User,
} from "lucide-react";

import { useResolvedRole } from "@/lib/user-role";
import { useWardenPermissions } from "@/lib/staff-scope";
import { BedGrid, type BedTile } from "@/components/hostel/BedGrid";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createAllocation, swapAllocationBed } from "@/lib/student.functions";
import { listActiveFeePlansForAllocation } from "@/lib/finance.functions";
import { usePropertyStore } from "@/stores/property-store";

// Matches uidx_allocations_active_student (see student.functions.ts) — the
// statuses that count as a student's current, not-yet-closed stay. A student
// picked in the Allocate Bed dialog who already sits in one of these gets
// routed to Swap instead of a second allocation.
const OPEN_ALLOCATION_STATUSES = [
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
];

const BEDS_PAGE_SIZE = 48;
const ALLOCATION_STUDENTS_PAGE_SIZE = 20;

function ilikeToken(value: string): string {
  return value.replace(/[%_,.()]/g, "").trim();
}

/**
 * Lives outside src/routes so it can be imported from both
 * admin.allocations.tsx and warden.allocations.tsx without either route
 * file re-exporting a non-Route symbol (TanStack Router route files must
 * only export `Route` for proper code-splitting — an extra named export
 * pulls the whole route's code into the importer's bundle instead).
 * All optional props default to the original Admin-only behavior
 * (activePropertyId from the property switcher, no pre-selected student,
 * full allocate/swap access) — Admin's own call site passes none of them.
 */
export function AllocationBoard({
  initialStudentId,
  propertyIdOverride,
  canCreate = true,
  canEdit = true,
}: {
  initialStudentId?: string;
  propertyIdOverride?: string | null;
  /** Gates the "Allocate" action (new allocation into an empty bed) — matches the
   * `allocations_create` permission key. */
  canCreate?: boolean;
  /** Gates the "Swap" action (move an existing allocation to another bed) —
   * matches the `allocations_edit` permission key. */
  canEdit?: boolean;
} = {}) {
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const effectiveProp = propertyIdOverride !== undefined ? propertyIdOverride : activePropertyId;
  const qc = useQueryClient();
  const [bedPage, setBedPage] = useState(0);
  const [bedSearch, setBedSearch] = useState("");
  const [debouncedBedSearch, setDebouncedBedSearch] = useState("");
  const [studentPage, setStudentPage] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");

  useEffect(() => {
    if (bedSearch === debouncedBedSearch) return;
    const timer = window.setTimeout(() => {
      setDebouncedBedSearch(bedSearch);
      setBedPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bedSearch, debouncedBedSearch]);

  useEffect(() => {
    if (studentSearch === debouncedStudentSearch) return;
    const timer = window.setTimeout(() => {
      setDebouncedStudentSearch(studentSearch);
      setStudentPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [studentSearch, debouncedStudentSearch]);

  // Admin always has the Rooms/Beds page (its own route is HOSTEL_ADMIN-only
  // regardless of permissions); a Warden needs the `rooms_beds_view`
  // permission and is routed to their own copy of the same board
  // (/warden/rooms-beds, sharing RoomsBedsBoard with the Admin route) since
  // /admin/* stays locked to HOSTEL_ADMIN. Checked here, before navigating,
  // so an ungranted Warden sees an inline Access Denied message instead of
  // bouncing through /403.
  const { data: resolvedRole } = useResolvedRole();
  const { can: canWarden } = useWardenPermissions();
  const isAdmin = resolvedRole?.role === "HOSTEL_ADMIN";
  const canManageStructure = isAdmin || canWarden("rooms_beds_view");
  const structureTo = isAdmin ? "/admin/properties/$id/structure" : "/warden/rooms-beds";

  const bedsQ = useQuery({
    queryKey: ["allocation-beds", effectiveProp, bedPage, debouncedBedSearch],
    enabled: !!effectiveProp,
    queryFn: async () => {
      const emptyCounts: Record<BedTile["status"], number> = {
        VACANT: 0,
        OCCUPIED: 0,
        MAINTENANCE: 0,
        BLOCKED: 0,
      };
      if (!effectiveProp) return { beds: [] as BedTile[], total: 0, counts: emptyCounts };
      const statuses = ["VACANT", "OCCUPIED", "MAINTENANCE", "BLOCKED"] as const;
      const countResults = await Promise.all(
        statuses.map((status) =>
          supabase
            .from("beds")
            .select("id", { count: "exact", head: true })
            .eq("property_id", effectiveProp)
            .eq("status", status)
            .is("deleted_at", null),
        ),
      );
      const counts = { ...emptyCounts };
      statuses.forEach((status, i) => {
        const result = countResults[i];
        if (!result || result.error) throw result?.error ?? new Error("Could not count beds");
        counts[status] = result.count ?? 0;
      });

      let bedQuery = supabase
        .from("beds")
        .select("id, code, status, rooms(room_number)", { count: "exact" })
        .eq("property_id", effectiveProp)
        .is("deleted_at", null)
        .order("code")
        .range(bedPage * BEDS_PAGE_SIZE, bedPage * BEDS_PAGE_SIZE + BEDS_PAGE_SIZE - 1);
      const token = ilikeToken(debouncedBedSearch);
      if (!token) {
        bedQuery = bedQuery.eq("status", "VACANT");
      } else {
        const [roomRes, nameRes] = await Promise.all([
          supabase
            .from("rooms")
            .select("id")
            .eq("property_id", effectiveProp)
            .ilike("room_number", `%${token}%`)
            .limit(100),
          supabase
            .from("students")
            .select("id")
            .eq("property_id", effectiveProp)
            .ilike("full_name", `%${token}%`)
            .is("deleted_at", null)
            .limit(50),
        ]);
        if (roomRes.error) throw roomRes.error;
        if (nameRes.error) throw nameRes.error;
        const roomIds = (roomRes.data ?? []).map((room) => room.id);
        const studentIds = (nameRes.data ?? []).map((student) => student.id);
        let occupantBedIds: string[] = [];
        if (studentIds.length) {
          const { data: allocs, error: allocErr } = await supabase
            .from("allocations")
            .select("bed_id")
            .eq("property_id", effectiveProp)
            .in("student_id", studentIds)
            .in("status", ["ACTIVE", "NOTICE_GIVEN"]);
          if (allocErr) throw allocErr;
          occupantBedIds = (allocs ?? []).map((row) => row.bed_id);
        }
        const parts = [`code.ilike.%${token}%`];
        if (roomIds.length) parts.push(`room_id.in.(${roomIds.join(",")})`);
        if (occupantBedIds.length) parts.push(`id.in.(${occupantBedIds.join(",")})`);
        bedQuery = bedQuery.or(parts.join(","));
      }
      const { data: beds, error, count } = await bedQuery;
      if (error) throw error;

      const bedIds = (beds ?? []).map((bed) => bed.id);
      const occupantByBed = new Map<string, string>();
      if (bedIds.length) {
        const { data: occupied, error: occErr } = await supabase
          .from("allocations")
          .select("bed_id, students(full_name)")
          .eq("property_id", effectiveProp)
          .in("bed_id", bedIds)
          .in("status", ["ACTIVE", "NOTICE_GIVEN"]);
        if (occErr) throw occErr;
        (occupied ?? []).forEach((a) => {
          const name = (a.students as { full_name: string } | null)?.full_name;
          if (name) occupantByBed.set(a.bed_id, name);
        });
      }

      return {
        beds: (beds ?? []).map((b) => ({
          id: b.id,
          code: b.code,
          status: b.status as BedTile["status"],
          occupantName: occupantByBed.get(b.id) ?? null,
          roomNumber: (b.rooms as { room_number: string } | null)?.room_number ?? null,
        })),
        total: count ?? 0,
        counts,
      };
    },
  });

  // Eligible = every student in this property who could plausibly need a
  // bed: not-yet-allocated applicants/verified students, plus already
  // allocated ACTIVE/NOTICE_GIVEN students (picking one of those routes to
  // the Swap flow below instead of a second allocation). Excludes
  // MOVED_OUT/ARCHIVED/REJECTED, which need re-admission, not allocation.
  const studentsQ = useQuery({
    queryKey: ["allocation-eligible-students", effectiveProp, studentPage, debouncedStudentSearch],
    enabled: !!effectiveProp,
    queryFn: async () => {
      if (!effectiveProp) return { rows: [], total: 0 };
      let query = supabase
        .from("students")
        .select("id, full_name, admission_number, status", { count: "exact" })
        .eq("property_id", effectiveProp)
        .in("status", ["APPLICANT", "VERIFIED", "ACTIVE", "NOTICE_GIVEN"])
        .is("deleted_at", null)
        .order("full_name")
        .range(
          studentPage * ALLOCATION_STUDENTS_PAGE_SIZE,
          studentPage * ALLOCATION_STUDENTS_PAGE_SIZE + ALLOCATION_STUDENTS_PAGE_SIZE - 1,
        );
      const token = ilikeToken(debouncedStudentSearch);
      if (token) {
        query = query.or(`full_name.ilike.%${token}%,admission_number.ilike.%${token}%`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const [viewBed, setViewBed] = useState<BedTile | null>(null);
  const bedDetailQ = useQuery({
    queryKey: ["bed-allocation-detail", viewBed?.id],
    enabled: !!viewBed && viewBed.status === "OCCUPIED",
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select(
          "id, status, start_date, rent_snapshot_paise, deposit_snapshot_paise, student_id, students(id, full_name, admission_number, phone)",
        )
        .eq("bed_id", viewBed!.id)
        .in("status", [
          "ACTIVE",
          "NOTICE_GIVEN",
          "MOVE_OUT_INSPECTION",
          "PENDING_PAYMENT",
          "PENDING_AGREEMENT",
        ])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Admin's own route (propertyIdOverride unset) keeps the original direct
  // client query, unchanged. The Warden reuse path (propertyIdOverride set)
  // goes through listActiveFeePlansForAllocation instead — same filters/
  // shape, just not gated on the fee_plans_view finance permission Warden
  // doesn't have by default (see that function's own comment).
  const listFeePlansFn = useServerFn(listActiveFeePlansForAllocation);
  const feePlansQ = useQuery({
    queryKey: ["allocation-fee-plans", effectiveProp],
    enabled: !!effectiveProp,
    queryFn: async () => {
      if (propertyIdOverride !== undefined) {
        return listFeePlansFn({ data: { property_id: effectiveProp! } });
      }
      const { data } = await supabase
        .from("fee_plans")
        .select("id, name, code")
        .eq("property_id", effectiveProp!)
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const [selectedBed, setSelectedBed] = useState<BedTile | null>(null);
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const selectedOnPage = (studentsQ.data?.rows ?? []).some((s) => s.id === studentId);
  const selectedStudentQ = useQuery({
    queryKey: ["allocation-selected-student", studentId],
    enabled: !!studentId && !selectedOnPage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, status")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [feePlanId, setFeePlanId] = useState("");
  const [rent, setRent] = useState<number>(500000);
  const [deposit, setDeposit] = useState<number>(1000000);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const createFn = useServerFn(createAllocation);
  const create = useMutation({
    mutationFn: async () => {
      if (!selectedBed || !studentId) throw new Error("Pick bed + student");
      if (!feePlanId) throw new Error("Pick a fee plan — required to auto-generate invoices");
      return createFn({
        data: {
          student_id: studentId,
          bed_id: selectedBed.id,
          fee_plan_id: feePlanId,
          start_date: startDate,
          rent_snapshot_paise: rent,
          deposit_snapshot_paise: deposit,
          billing_cycle_day: 1,
          notice_period_days: 30,
        },
      });
    },
    onSuccess: () => {
      toast.success("Bed allocated — agreement sent to student");
      qc.invalidateQueries({ queryKey: ["allocation-beds"] });
      qc.invalidateQueries({ queryKey: ["allocation-eligible-students"] });
      setSelectedBed(null);
      setStudentId("");
      setFeePlanId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Looked up whenever a student is picked in the Allocate Bed dialog: if
  // they already have an open allocation, the dialog switches from "create a
  // new allocation" to "swap their existing bed for this one" — the DB's
  // uidx_allocations_active_student would reject a second allocation anyway,
  // so this check keeps the UI from ever attempting one.
  const openAllocationQ = useQuery({
    queryKey: ["student-open-allocation", studentId],
    enabled: !!selectedBed && !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("allocations")
        .select(
          "id, status, start_date, rent_snapshot_paise, deposit_snapshot_paise, bed_id, beds(code, rooms(room_number))",
        )
        .eq("student_id", studentId)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const swapFn = useServerFn(swapAllocationBed);
  const swap = useMutation({
    mutationFn: async () => {
      if (!selectedBed || !openAllocationQ.data) throw new Error("Pick bed + student");
      return swapFn({
        data: { allocation_id: openAllocationQ.data.id, new_bed_id: selectedBed.id },
      });
    },
    onSuccess: () => {
      toast.success(`Student moved to bed ${selectedBed?.code}`);
      qc.invalidateQueries({ queryKey: ["allocation-beds"] });
      qc.invalidateQueries({ queryKey: ["allocation-eligible-students"] });
      qc.invalidateQueries({ queryKey: ["student-open-allocation"] });
      setSelectedBed(null);
      setStudentId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Swap failed"),
  });

  function closeAllocateDialog() {
    setSelectedBed(null);
    setStudentId("");
    setFeePlanId("");
  }

  return (
    <div className="space-y-6">
      {effectiveProp &&
        (canManageStructure ? (
          <Link
            to={structureTo}
            params={isAdmin ? { id: effectiveProp } : undefined}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md sm:gap-6 sm:p-6"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-14 sm:w-14">
              <LayoutGrid className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-foreground sm:text-xl">
                Manage rooms & beds
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                View and manage all rooms and beds in your property
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            <BedSingle
              className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-primary/5"
              aria-hidden="true"
            />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() =>
              toast.error("Access denied — you don't have permission to manage rooms & beds.")
            }
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-destructive/40 hover:shadow-md sm:gap-6 sm:p-6"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-14 sm:w-14">
              <LayoutGrid className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-foreground sm:text-xl">
                Manage rooms & beds
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                View and manage all rooms and beds in your property
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-destructive" />
            <BedSingle
              className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-primary/5"
              aria-hidden="true"
            />
          </button>
        ))}

      {!effectiveProp ? (
        <p className="text-sm text-muted-foreground">Choose a property from the sidebar first.</p>
      ) : bedsQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <BedGrid
            variant="expanded"
            beds={bedsQ.data?.beds ?? []}
            statusCounts={bedsQ.data?.counts}
            queryValue={bedSearch}
            onQueryChange={setBedSearch}
            serverFiltered
            onSelect={(b) => {
              if (b.status === "VACANT") {
                setSelectedBed(b);
                return;
              }
              setViewBed(b);
            }}
          />
          {(bedsQ.data?.total ?? 0) > 0 && (
            <PaginationBar
              page={bedPage}
              pageSize={BEDS_PAGE_SIZE}
              total={bedsQ.data?.total ?? 0}
              onPageChange={setBedPage}
            />
          )}

          <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-info/10 text-info">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Tip: Click on any room to view detailed information
                </p>
                <p className="text-xs text-muted-foreground">
                  Occupancy status is updated in real-time
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link to="/admin/support">
                <HelpCircle className="h-4 w-4" /> Need help?
              </Link>
            </Button>
          </div>
        </>
      )}

      <Dialog open={!!selectedBed} onOpenChange={(v) => !v && closeAllocateDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate bed {selectedBed?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Student</Label>
              <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={studentPickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {studentId
                      ? (() => {
                          const selected =
                            (studentsQ.data?.rows ?? []).find((s) => s.id === studentId) ??
                            selectedStudentQ.data ??
                            null;
                          return selected
                            ? `${selected.full_name} • ${selected.admission_number}`
                            : "Selected student";
                        })()
                      : "Select applicant"}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name or admission no…"
                      value={studentSearch}
                      onValueChange={setStudentSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {studentsQ.isLoading ? "Loading…" : "No applicant found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {(studentsQ.data?.rows ?? []).map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.full_name} ${s.admission_number}`}
                            onSelect={() => {
                              setStudentId(s.id);
                              setStudentPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "h-4 w-4",
                                studentId === s.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {s.full_name} • {s.admission_number}
                            {s.status !== "APPLICANT" && s.status !== "VERIFIED" && (
                              <Badge variant="outline" className="ml-auto rounded-full text-xs">
                                {s.status}
                              </Badge>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    {(studentsQ.data?.total ?? 0) > ALLOCATION_STUDENTS_PAGE_SIZE && (
                      <PaginationBar
                        page={studentPage}
                        pageSize={ALLOCATION_STUDENTS_PAGE_SIZE}
                        total={studentsQ.data?.total ?? 0}
                        onPageChange={setStudentPage}
                      />
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {openAllocationQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : openAllocationQ.data ? (
              <div className="space-y-3 rounded-2xl border border-warning/30 bg-warning/5 p-4">
                <p className="text-sm font-medium text-foreground">
                  This student already has an active allocation
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info
                    label="Current bed"
                    value={
                      (
                        openAllocationQ.data.beds as {
                          code: string;
                          rooms: { room_number: string } | null;
                        } | null
                      )?.code ?? "—"
                    }
                  />
                  <Info
                    label="Room"
                    value={
                      (
                        openAllocationQ.data.beds as {
                          code: string;
                          rooms: { room_number: string } | null;
                        } | null
                      )?.rooms?.room_number ?? "—"
                    }
                  />
                  <Info label="Status" value={openAllocationQ.data.status} />
                  <Info label="Since" value={openAllocationQ.data.start_date ?? "—"} />
                  <Info
                    label="Rent"
                    value={`₹ ${(openAllocationQ.data.rent_snapshot_paise / 100).toFixed(2)}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  To move them to bed {selectedBed?.code}, use Swap — this keeps their existing
                  agreement, invoices, and payment history intact.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="fee-plan">Fee plan</Label>
                  <Select value={feePlanId} onValueChange={setFeePlanId}>
                    <SelectTrigger id="fee-plan">
                      <SelectValue placeholder="Select a fee plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {(feePlansQ.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {feePlansQ.data && feePlansQ.data.length === 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      No active fee plan for this property — create one first, or this allocation
                      won't be billable.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sd">Start date</Label>
                    <Input
                      id="sd"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rent">Rent (₹)</Label>
                    <Input
                      id="rent"
                      type="number"
                      value={rent / 100}
                      onChange={(e) => setRent(Math.round(+e.target.value * 100))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dep">Deposit (₹)</Label>
                    <Input
                      id="dep"
                      type="number"
                      value={deposit / 100}
                      onChange={(e) => setDeposit(Math.round(+e.target.value * 100))}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAllocateDialog}>
              Cancel
            </Button>
            {openAllocationQ.data ? (
              canEdit ? (
                <Button disabled={swap.isPending} onClick={() => swap.mutate()}>
                  <ArrowRightLeft className="h-4 w-4" /> Swap
                </Button>
              ) : (
                <p className="text-sm text-destructive">
                  Access denied — you don't have permission to swap allocations.
                </p>
              )
            ) : canCreate ? (
              <Button
                disabled={!studentId || !feePlanId || create.isPending}
                onClick={() => create.mutate()}
              >
                <BedSingle className="h-4 w-4" /> Allocate
              </Button>
            ) : (
              <p className="text-sm text-destructive">
                Access denied — you don't have permission to allocate beds.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewBed} onOpenChange={(v) => !v && setViewBed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bed {viewBed?.code}</DialogTitle>
          </DialogHeader>
          {viewBed?.status !== "OCCUPIED" ? (
            <p className="text-sm text-muted-foreground">
              This bed is currently{" "}
              <span className="font-medium">{viewBed?.status.toLowerCase()}</span>. Manage its
              status from Manage rooms & beds.
            </p>
          ) : bedDetailQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !bedDetailQ.data ? (
            <p className="text-sm text-muted-foreground">
              Marked occupied but no active allocation record was found.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-border p-3">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{bedDetailQ.data.students?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {bedDetailQ.data.students?.admission_number}
                    {bedDetailQ.data.students?.phone ? ` • ${bedDetailQ.data.students.phone}` : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Since" value={bedDetailQ.data.start_date ?? "—"} />
                <Info label="Status" value={bedDetailQ.data.status} />
                <Info
                  label="Rent"
                  value={`₹ ${(bedDetailQ.data.rent_snapshot_paise / 100).toFixed(2)}`}
                />
                <Info
                  label="Deposit"
                  value={`₹ ${(bedDetailQ.data.deposit_snapshot_paise / 100).toFixed(2)}`}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewBed(null)}>
              Close
            </Button>
            {viewBed?.status === "OCCUPIED" && bedDetailQ.data?.student_id && (
              <>
                <Button asChild variant="outline">
                  <Link to="/admin/students/$id" params={{ id: bedDetailQ.data.student_id }}>
                    <User className="h-4 w-4" /> View student
                  </Link>
                </Button>
                <Button asChild>
                  <Link
                    to="/admin/students/$id/move-out"
                    params={{ id: bedDetailQ.data.student_id }}
                  >
                    <DoorOpen className="h-4 w-4" /> Deallocate / move out
                  </Link>
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
