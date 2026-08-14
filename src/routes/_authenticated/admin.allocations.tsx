import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BedSingle, Check, ChevronsUpDown, DoorOpen, LayoutGrid, User } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { BedGrid, type BedTile } from "@/components/hostel/BedGrid";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createAllocation } from "@/lib/student.functions";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  head: () => ({ meta: [{ title: "Allocations — Hostylia" }] }),
  component: AllocationBoard,
});

function AllocationBoard() {
  const effectiveProp = usePropertyStore((s) => s.activePropertyId);
  const qc = useQueryClient();

  const bedsQ = useQuery({
    queryKey: ["allocation-beds", effectiveProp],
    enabled: !!effectiveProp,
    queryFn: async (): Promise<BedTile[]> => {
      const { data: beds } = await supabase
        .from("beds")
        .select("id, code, status")
        .eq("property_id", effectiveProp!)
        .is("deleted_at", null)
        .order("code");

      const { data: occupied } = await supabase
        .from("allocations")
        .select("bed_id, students(full_name)")
        .eq("property_id", effectiveProp!)
        .in("status", ["ACTIVE", "NOTICE_GIVEN"]);
      const occupantByBed = new Map<string, string>();
      (occupied ?? []).forEach((a) => {
        const name = (a.students as { full_name: string } | null)?.full_name;
        if (name) occupantByBed.set(a.bed_id, name);
      });

      return (beds ?? []).map((b) => ({
        ...b,
        status: b.status as BedTile["status"],
        occupantName: occupantByBed.get(b.id) ?? null,
      }));
    },
  });

  const studentsQ = useQuery({
    queryKey: ["allocation-eligible-students", effectiveProp],
    enabled: !!effectiveProp,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, admission_number, status")
        .eq("property_id", effectiveProp!)
        .in("status", ["APPLICANT", "VERIFIED"])
        .is("deleted_at", null)
        .order("full_name");
      return data ?? [];
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
        .in("status", ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION", "PENDING_PAYMENT", "PENDING_AGREEMENT"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const feePlansQ = useQuery({
    queryKey: ["allocation-fee-plans", effectiveProp],
    enabled: !!effectiveProp,
    queryFn: async () => {
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
  const [studentId, setStudentId] = useState("");
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allocations"
        description="Tap a vacant bed to assign an applicant. Bed status flips automatically."
        actions={
          effectiveProp ? (
            <Button asChild variant="outline">
              <Link to="/admin/properties/$id/structure" params={{ id: effectiveProp }}>
                <LayoutGrid className="h-4 w-4" /> Manage rooms & beds
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!effectiveProp ? (
        <p className="text-sm text-muted-foreground">
          Choose a property from the sidebar first.
        </p>
      ) : bedsQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <BedGrid
          beds={bedsQ.data ?? []}
          onSelect={(b) => {
            if (b.status === "VACANT") {
              setSelectedBed(b);
              return;
            }
            setViewBed(b);
          }}
        />
      )}

      <Dialog open={!!selectedBed} onOpenChange={(v) => !v && setSelectedBed(null)}>
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
                          const selected = (studentsQ.data ?? []).find((s) => s.id === studentId);
                          return selected
                            ? `${selected.full_name} • ${selected.admission_number}`
                            : "Select applicant";
                        })()
                      : "Select applicant"}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                  <Command>
                    <CommandInput placeholder="Search by name or admission no…" />
                    <CommandList>
                      <CommandEmpty>No applicant found.</CommandEmpty>
                      <CommandGroup>
                        {(studentsQ.data ?? []).map((s) => (
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
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
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
                <Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="rent">Rent (₹)</Label>
                <Input id="rent" type="number" value={rent / 100} onChange={(e) => setRent(Math.round(+e.target.value * 100))} />
              </div>
              <div>
                <Label htmlFor="dep">Deposit (₹)</Label>
                <Input id="dep" type="number" value={deposit / 100} onChange={(e) => setDeposit(Math.round(+e.target.value * 100))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedBed(null)}>Cancel</Button>
            <Button
              disabled={!studentId || !feePlanId || create.isPending}
              onClick={() => create.mutate()}
            >
              <BedSingle className="h-4 w-4" /> Allocate
            </Button>
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
              This bed is currently <span className="font-medium">{viewBed?.status.toLowerCase()}</span>.
              Manage its status from Manage rooms & beds.
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
                <Info label="Rent" value={`₹ ${(bedDetailQ.data.rent_snapshot_paise / 100).toFixed(2)}`} />
                <Info label="Deposit" value={`₹ ${(bedDetailQ.data.deposit_snapshot_paise / 100).toFixed(2)}`} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewBed(null)}>Close</Button>
            {viewBed?.status === "OCCUPIED" && bedDetailQ.data?.student_id && (
              <>
                <Button asChild variant="outline">
                  <Link to="/admin/students/$id" params={{ id: bedDetailQ.data.student_id }}>
                    <User className="h-4 w-4" /> View student
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/admin/students/$id/move-out" params={{ id: bedDetailQ.data.student_id }}>
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
