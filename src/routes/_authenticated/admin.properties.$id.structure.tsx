import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Plus, Upload, Building2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BedGrid, type BedStatus } from "@/components/hostel/BedGrid";
import { CsvImportModal } from "@/components/hostel/CsvImportModal";

export const Route = createFileRoute("/_authenticated/admin/properties/$id/structure")({
  head: () => ({ meta: [{ title: "Property structure — Hostylia" }] }),
  component: StructurePage,
});

function StructurePage() {
  const { id: propertyId } = Route.useParams();
  const qc = useQueryClient();
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [addFloorOpen, setAddFloorOpen] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [floorParentBlock, setFloorParentBlock] = useState<string | null>(null);
  const [roomParentFloor, setRoomParentFloor] = useState<string | null>(null);
  const [roomParentBlock, setRoomParentBlock] = useState<string | null>(null);

  const propertyQ = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, tenant_id")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const tenantId = propertyQ.data?.tenant_id ?? null;

  const treeQ = useQuery({
    queryKey: ["structure", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const [blocks, floors, rooms, beds] = await Promise.all([
        supabase.from("blocks").select("*").eq("property_id", propertyId).is("deleted_at", null).order("display_order"),
        supabase.from("floors").select("*").eq("property_id", propertyId).is("deleted_at", null).order("display_order"),
        supabase.from("rooms").select("*").eq("property_id", propertyId).is("deleted_at", null).order("room_number"),
        supabase.from("beds").select("id, room_id, code, status").eq("property_id", propertyId).is("deleted_at", null).order("code"),
      ]);
      if (blocks.error) throw blocks.error;
      if (floors.error) throw floors.error;
      if (rooms.error) throw rooms.error;
      if (beds.error) throw beds.error;
      return {
        blocks: blocks.data,
        floors: floors.data,
        rooms: rooms.data,
        beds: beds.data,
      };
    },
  });

  function refetch() {
    qc.invalidateQueries({ queryKey: ["structure", propertyId] });
  }

  if (propertyQ.isLoading || treeQ.isLoading || !tenantId) {
    return <Skeleton className="h-96 w-full" />;
  }

  const { blocks, floors, rooms, beds } = treeQ.data!;
  const noBlockFloors = floors.filter((f) => !f.block_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Structure — ${propertyQ.data?.name ?? ""}`}
        description="Manage blocks, floors, rooms and beds. Add rows manually or import a CSV."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={() => setAddBlockOpen(true)}>
              <Plus className="h-4 w-4" /> Block
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {blocks.map((b) => (
          <BlockCard
            key={b.id}
            block={b}
            floors={floors.filter((f) => f.block_id === b.id)}
            rooms={rooms}
            beds={beds}
            onAddFloor={() => {
              setFloorParentBlock(b.id);
              setAddFloorOpen(true);
            }}
            onAddRoom={(fId) => {
              setRoomParentFloor(fId);
              setRoomParentBlock(b.id);
              setAddRoomOpen(true);
            }}
          />
        ))}

        {(noBlockFloors.length > 0 || blocks.length === 0) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                No block (floors direct on property)
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => { setFloorParentBlock(null); setAddFloorOpen(true); }}>
                <Plus className="h-4 w-4" /> Floor
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {noBlockFloors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No floors yet.</p>
              ) : (
                noBlockFloors.map((f) => (
                  <FloorRow
                    key={f.id}
                    floor={f}
                    rooms={rooms.filter((r) => r.floor_id === f.id)}
                    beds={beds}
                    onAddRoom={() => { setRoomParentFloor(f.id); setRoomParentBlock(null); setAddRoomOpen(true); }}
                  />
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AddBlockDialog
        open={addBlockOpen}
        onOpenChange={setAddBlockOpen}
        tenantId={tenantId}
        propertyId={propertyId}
        onDone={refetch}
      />
      <AddFloorDialog
        open={addFloorOpen}
        onOpenChange={setAddFloorOpen}
        tenantId={tenantId}
        propertyId={propertyId}
        blockId={floorParentBlock}
        onDone={refetch}
      />
      <AddRoomDialog
        open={addRoomOpen}
        onOpenChange={setAddRoomOpen}
        tenantId={tenantId}
        propertyId={propertyId}
        floorId={roomParentFloor}
        blockId={roomParentBlock}
        onDone={refetch}
      />
      <CsvImportModal
        open={csvOpen}
        onOpenChange={setCsvOpen}
        tenantId={tenantId}
        propertyId={propertyId}
        onDone={refetch}
      />
    </div>
  );
}

interface Block { id: string; name: string; code: string | null; status: string }
interface Floor { id: string; name: string; block_id: string | null; floor_number: number | null }
interface Room { id: string; floor_id: string; block_id: string | null; room_number: string; capacity: number; status: string }
interface Bed { id: string; room_id: string; code: string; status: string }

function BlockCard({
  block, floors, rooms, beds, onAddFloor, onAddRoom,
}: {
  block: Block;
  floors: Floor[];
  rooms: Room[];
  beds: Bed[];
  onAddFloor: () => void;
  onAddRoom: (floorId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          {block.name}
          {block.code && <Badge variant="secondary">{block.code}</Badge>}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={onAddFloor}>
          <Plus className="h-4 w-4" /> Floor
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {floors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No floors yet.</p>
        ) : (
          floors.map((f) => (
            <FloorRow
              key={f.id}
              floor={f}
              rooms={rooms.filter((r) => r.floor_id === f.id)}
              beds={beds}
              onAddRoom={() => onAddRoom(f.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FloorRow({
  floor, rooms, beds, onAddRoom,
}: {
  floor: Floor;
  rooms: Room[];
  beds: Bed[];
  onAddRoom: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
          <ChevronRight className={cn("h-4 w-4 transition", open && "rotate-90")} />
          {floor.name}
          {floor.floor_number != null && <span className="text-muted-foreground">· L{floor.floor_number}</span>}
          <Badge variant="outline" className="ml-2">{rooms.length} rooms</Badge>
        </CollapsibleTrigger>
        <Button size="sm" variant="ghost" onClick={onAddRoom}>
          <Plus className="h-4 w-4" /> Room
        </Button>
      </div>
      <CollapsibleContent className="space-y-3 border-t border-border px-3 py-3">
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms yet.</p>
        ) : (
          rooms.map((r) => {
            const rBeds = beds
              .filter((b) => b.room_id === r.id)
              .map((b) => ({ ...b, status: b.status as BedStatus }));
            return (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Room {r.room_number} <span className="text-muted-foreground">· capacity {r.capacity}</span>
                  </span>
                  <Badge variant="secondary">{r.status}</Badge>
                </div>
                <BedGrid beds={rBeds} />
              </div>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ============ Add dialogs ============ */

function AddBlockDialog({
  open, onOpenChange, tenantId, propertyId, onDone,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  tenantId: string; propertyId: string; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("blocks").insert({
        tenant_id: tenantId, property_id: propertyId, name: name.trim(), code: code.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Block added"); onDone(); onOpenChange(false); setName(""); setCode(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add block</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Code (optional)</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFloorDialog({
  open, onOpenChange, tenantId, propertyId, blockId, onDone,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  tenantId: string; propertyId: string; blockId: string | null; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("floors").insert({
        tenant_id: tenantId, property_id: propertyId, block_id: blockId,
        name: name.trim(), floor_number: num ? Number(num) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Floor added"); onDone(); onOpenChange(false); setName(""); setNum(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add floor</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ground / First / …" /></div>
          <div><Label>Floor number (optional)</Label><Input type="number" value={num} onChange={(e) => setNum(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!name.trim() || mut.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddRoomDialog({
  open, onOpenChange, tenantId, propertyId, floorId, blockId, onDone,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  tenantId: string; propertyId: string;
  floorId: string | null; blockId: string | null; onDone: () => void;
}) {
  const [number, setNumber] = useState("");
  const [type, setType] = useState("DOUBLE");
  const [capacity, setCapacity] = useState("2");
  const [rent, setRent] = useState("");
  const mut = useMutation({
    mutationFn: async () => {
      if (!floorId) throw new Error("No floor selected");
      const capN = Math.max(1, Number(capacity));
      const { data: room, error } = await supabase.from("rooms").insert({
        tenant_id: tenantId, property_id: propertyId, block_id: blockId, floor_id: floorId,
        room_number: number.trim(), room_type: type, capacity: capN,
        base_rent_paise: rent ? Math.round(Number(rent) * 100) : null,
      }).select("id").single();
      if (error) throw error;
      // Auto-generate beds B1..BN
      const beds = Array.from({ length: capN }, (_, k) => ({
        tenant_id: tenantId, property_id: propertyId, block_id: blockId,
        floor_id: floorId, room_id: room.id, code: `B${k + 1}`,
      }));
      const { error: bErr } = await supabase.from("beds").insert(beds);
      if (bErr) throw bErr;
    },
    onSuccess: () => {
      toast.success("Room + beds added");
      onDone(); onOpenChange(false);
      setNumber(""); setCapacity("2"); setRent("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add room</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Room number</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["SINGLE","DOUBLE","TRIPLE","DORM","CUSTOM"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Capacity</Label><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            <div><Label>Base rent (₹)</Label><Input type="number" min={0} value={rent} onChange={(e) => setRent(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!number.trim() || mut.isPending}>
            <Plus className="h-4 w-4" /> Add room + beds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
