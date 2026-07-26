import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BedSingle } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { BedGrid, type BedTile } from "@/components/hostel/BedGrid";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { createAllocation } from "@/lib/student.functions";

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  head: () => ({ meta: [{ title: "Allocations — Hostylia" }] }),
  component: AllocationBoard,
});

function AllocationBoard() {
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;
  const qc = useQueryClient();

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
  const effectiveProp = propertyId ?? propertiesQ.data?.[0]?.id ?? null;

  const bedsQ = useQuery({
    queryKey: ["allocation-beds", effectiveProp],
    enabled: !!effectiveProp,
    queryFn: async (): Promise<BedTile[]> => {
      const { data } = await supabase
        .from("beds")
        .select("id, code, status")
        .eq("property_id", effectiveProp!)
        .is("deleted_at", null)
        .order("code");
      return (data ?? []) as BedTile[];
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

  const [selectedBed, setSelectedBed] = useState<BedTile | null>(null);
  const [studentId, setStudentId] = useState("");
  const [rent, setRent] = useState<number>(500000);
  const [deposit, setDeposit] = useState<number>(1000000);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const createFn = useServerFn(createAllocation);
  const create = useMutation({
    mutationFn: async () => {
      if (!selectedBed || !studentId) throw new Error("Pick bed + student");
      return createFn({
        data: {
          student_id: studentId,
          bed_id: selectedBed.id,
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
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allocations"
        description="Tap a vacant bed to assign an applicant. Bed status flips automatically."
      />

      {propertiesQ.data && propertiesQ.data.length > 1 && (
        <Select value={effectiveProp ?? ""} onValueChange={setPropertyId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>
            {propertiesQ.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {bedsQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <BedGrid
          beds={bedsQ.data ?? []}
          onSelect={(b) => {
            if (b.status !== "VACANT") {
              toast.info(`Bed ${b.code} is ${b.status.toLowerCase()}`);
              return;
            }
            setSelectedBed(b);
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
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select applicant" /></SelectTrigger>
                <SelectContent>
                  {(studentsQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} • {s.admission_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <Button disabled={!studentId || create.isPending} onClick={() => create.mutate()}>
              <BedSingle className="h-4 w-4" /> Allocate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
