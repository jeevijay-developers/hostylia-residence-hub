import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BedDouble, ChevronRight, Plus, Upload, Building2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn, getErrorMessage } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BedGrid, type BedStatus, type BedTile } from "@/components/hostel/BedGrid";
import { BedStatusDialog } from "@/components/hostel/BedStatusDialog";
import { CsvImportModal } from "@/components/hostel/CsvImportModal";
import { sortFloors } from "@/lib/floor-order";
import {
  blockCodeKey,
  blockFormSchema,
  blockNameKey,
  floorFormSchema,
  fixedCapacityForType,
  normalizeBlockName,
  resolveRoomCapacity,
  roomCreateSchema,
  roomTypeEnum,
  rupeesToPaise,
  type RoomType,
} from "@/schemas/hostel";
import { useServerFn } from "@tanstack/react-start";
import { createRoomWithBeds } from "@/lib/hostel.functions";

/**
 * Lives outside src/routes so it can be imported from both
 * admin.properties.$id.structure.tsx and warden.rooms-beds.tsx without
 * either route file re-exporting a non-Route symbol (see AllocationBoard.tsx
 * for the same reasoning). `canCreate` defaults to `true` so the existing
 * Admin call site (which passes none of these) keeps its unconditional
 * Add Block/Floor/Room + CSV import access exactly as before — only the
 * Warden rooms/beds route passes an explicit, permission-derived value.
 * `canManageBedStatus` (default `true`, Admin) gates the bed "Manage status"
 * action; the Warden route passes its `rooms_beds_edit` permission. The
 * database enforces the same rule, this only hides the affordance. There's no
 * room edit/delete action here, so `rooms_beds_delete` still has nothing to gate.
 */
export function RoomsBedsBoard({
  propertyId,
  canCreate = true,
  canManageBedStatus = true,
}: {
  propertyId: string;
  canCreate?: boolean;
  canManageBedStatus?: boolean;
}) {
  const qc = useQueryClient();
  const [statusBed, setStatusBed] = useState<BedTile | null>(null);
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
        supabase
          .from("blocks")
          .select("*")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("display_order"),
        supabase
          .from("floors")
          .select("*")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("display_order"),
        supabase
          .from("rooms")
          .select("*")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("room_number"),
        supabase
          .from("beds")
          .select("id, room_id, code, status, notes, maintenance_until")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("code"),
      ]);
      if (blocks.error) throw blocks.error;
      if (floors.error) throw floors.error;
      if (rooms.error) throw rooms.error;
      if (beds.error) throw beds.error;
      return {
        blocks: blocks.data,
        // Logical order (Basement, Ground, First … Terrace) — display only.
        floors: sortFloors(floors.data),
        rooms: rooms.data,
        beds: beds.data,
      };
    },
  });

  function refetch() {
    qc.invalidateQueries({ queryKey: ["structure", propertyId] });
    // Allocations page shows this property's bed list + status summary.
    qc.invalidateQueries({ queryKey: ["allocation-beds"] });
  }

  if (propertyQ.isError || treeQ.isError) {
    const err = propertyQ.error ?? treeQ.error;
    return (
      <div className="space-y-4">
        <PageHeader title="Structure" />
        <Card>
          <CardContent className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">
              {err instanceof Error ? err.message : "This property's structure couldn't be loaded."}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                propertyQ.refetch();
                treeQ.refetch();
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (propertyQ.isLoading || treeQ.isLoading || !tenantId || !treeQ.data) {
    return <Skeleton className="h-96 w-full" />;
  }

  const { blocks, floors, rooms, beds } = treeQ.data!;
  const noBlockFloors = floors.filter((f) => !f.block_id);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={`Structure — ${propertyQ.data?.name ?? ""}`}
        description="Manage blocks, floors and rooms"
        actions={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-xl border-border bg-card font-semibold shadow-sm"
                onClick={() => setCsvOpen(true)}
              >
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button
                className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-linear-to-r dark:from-amber-500 dark:via-amber-500 dark:to-amber-600 font-bold dark:text-slate-950 shadow-lg shadow-primary/20 dark:shadow-amber-500/20 dark:hover:from-amber-400 dark:hover:to-amber-500"
                onClick={() => setAddBlockOpen(true)}
              >
                <Plus className="h-4 w-4" /> Block
              </Button>
            </div>
          ) : undefined
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
            canCreate={canCreate}
            onSelectBed={canManageBedStatus ? setStatusBed : undefined}
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
          <Card className="rounded-2xl border-border/80 bg-card shadow-xl">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex min-w-0 items-center gap-2.5 text-sm font-semibold sm:text-base">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="truncate">No block (floors direct on property)</span>
              </CardTitle>
              {canCreate && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300"
                  onClick={() => {
                    setFloorParentBlock(null);
                    setAddFloorOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Floor
                </Button>
              )}
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
                    canCreate={canCreate}
                    onSelectBed={canManageBedStatus ? setStatusBed : undefined}
                    onAddRoom={() => {
                      setRoomParentFloor(f.id);
                      setRoomParentBlock(null);
                      setAddRoomOpen(true);
                    }}
                  />
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {canManageBedStatus && (
        <BedStatusDialog
          bed={statusBed}
          open={!!statusBed}
          onOpenChange={(v) => !v && setStatusBed(null)}
          onDone={refetch}
        />
      )}

      {canCreate && (
        <>
          <AddBlockDialog
            open={addBlockOpen}
            onOpenChange={setAddBlockOpen}
            tenantId={tenantId}
            propertyId={propertyId}
            existingBlocks={blocks}
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
            floorId={roomParentFloor}
            floorName={floors.find((f) => f.id === roomParentFloor)?.name ?? ""}
            blockName={blocks.find((b) => b.id === roomParentBlock)?.name ?? null}
            onDone={refetch}
          />
          <CsvImportModal
            open={csvOpen}
            onOpenChange={setCsvOpen}
            tenantId={tenantId}
            propertyId={propertyId}
            onDone={refetch}
          />
        </>
      )}
    </div>
  );
}

interface Block {
  id: string;
  name: string;
  code: string | null;
  status: string;
}
interface Floor {
  id: string;
  name: string;
  block_id: string | null;
  floor_number: number | null;
}
interface Room {
  id: string;
  floor_id: string;
  block_id: string | null;
  room_number: string;
  room_type: string;
  capacity: number;
  status: string;
}
interface Bed {
  id: string;
  room_id: string;
  code: string;
  status: string;
  notes: string | null;
  maintenance_until: string | null;
}

const ROOM_STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-success/15 text-success border-success/30",
  MAINTENANCE: "bg-warning/15 text-warning border-warning/30",
  BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
  INACTIVE: "bg-muted text-muted-foreground border-border",
};

function RoomStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide",
        ROOM_STATUS_TONE[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}

function RoomTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="shrink-0 rounded-full border-border bg-card font-semibold">
      {type}
    </Badge>
  );
}

function BlockCard({
  block,
  floors,
  rooms,
  beds,
  canCreate,
  onSelectBed,
  onAddFloor,
  onAddRoom,
}: {
  block: Block;
  floors: Floor[];
  rooms: Room[];
  beds: Bed[];
  canCreate: boolean;
  onSelectBed?: (bed: BedTile) => void;
  onAddFloor: () => void;
  onAddRoom: (floorId: string) => void;
}) {
  return (
    <Card className="rounded-2xl border-border/80 bg-card shadow-xl">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex min-w-0 items-center gap-2.5 text-sm font-semibold sm:text-base">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="truncate">{block.name}</span>
          {block.code && (
            <Badge variant="secondary" className="shrink-0 rounded-full">
              {block.code}
            </Badge>
          )}
        </CardTitle>
        {canCreate && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300"
            onClick={onAddFloor}
          >
            <Plus className="h-4 w-4" /> Floor
          </Button>
        )}
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
              canCreate={canCreate}
              onSelectBed={onSelectBed}
              onAddRoom={() => onAddRoom(f.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FloorRow({
  floor,
  rooms,
  beds,
  canCreate,
  onSelectBed,
  onAddRoom,
}: {
  floor: Floor;
  rooms: Room[];
  beds: Bed[];
  canCreate: boolean;
  onSelectBed?: (bed: BedTile) => void;
  onAddRoom: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border/80 bg-background/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <CollapsibleTrigger className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-semibold text-foreground">{floor.name}</span>
          {floor.floor_number != null && (
            <span className="shrink-0 font-medium text-indigo-600 dark:text-indigo-400">
              · L{floor.floor_number}
            </span>
          )}
          <Badge variant="outline" className="ml-1 shrink-0 rounded-full border-border bg-card">
            {rooms.length} rooms
          </Badge>
        </CollapsibleTrigger>
        {canCreate && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300"
            onClick={onAddRoom}
          >
            <Plus className="h-4 w-4" /> Room
          </Button>
        )}
      </div>
      <CollapsibleContent className="space-y-3 border-t border-border/80 px-3 py-3">
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms yet.</p>
        ) : (
          rooms.map((r) => {
            const rBeds = beds
              .filter((b) => b.room_id === r.id)
              .map((b) => ({
                ...b,
                status: b.status as BedStatus,
                roomNumber: r.room_number,
                notes: b.notes,
                maintenanceUntil: b.maintenance_until,
              }));
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border/80 bg-card p-3.5 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-foreground">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <BedDouble className="h-4 w-4" />
                    </span>
                    <span className="truncate">
                      Room {r.room_number}{" "}
                      <span className="font-normal text-muted-foreground">
                        · Capacity {r.capacity}
                      </span>
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <RoomTypeBadge type={r.room_type} />
                    <RoomStatusBadge status={r.status} />
                  </div>
                </div>
                <BedGrid beds={rBeds} onSelect={onSelectBed} />
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
  open,
  onOpenChange,
  tenantId,
  propertyId,
  existingBlocks,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  existingBlocks: { name: string; code: string | null }[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});

  // The unique indexes (uniq_blocks_property_name_norm_active /
  // uniq_blocks_property_code_norm_active) are the real guard; this only turns
  // their violation — or an obvious clash with the list on screen — into a
  // message on the right field instead of a generic database error.
  function duplicateErrors(): { name?: string; code?: string } {
    const found: { name?: string; code?: string } = {};
    const nameKey = blockNameKey(name);
    const codeKey = blockCodeKey(code);
    if (existingBlocks.some((b) => blockNameKey(b.name) === nameKey)) {
      found.name = "A block with this name already exists in this property.";
    }
    if (codeKey && existingBlocks.some((b) => blockCodeKey(b.code) === codeKey)) {
      found.code = "A block with this code already exists in this property.";
    }
    return found;
  }

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("blocks").insert({
        tenant_id: tenantId,
        property_id: propertyId,
        name: normalizeBlockName(name),
        code: blockCodeKey(code) === null ? null : code.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Block added");
      onDone();
      onOpenChange(false);
      setName("");
      setCode("");
      setErrors({});
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string; details?: string };
      const text = `${err.message ?? ""} ${err.details ?? ""}`;
      if (err.code === "23505" || text.includes("duplicate key")) {
        if (text.includes("uniq_blocks_property_code_norm_active")) {
          setErrors({ code: "A block with this code already exists in this property." });
        } else {
          setErrors({ name: "A block with this name already exists in this property." });
        }
        return;
      }
      toast.error(getErrorMessage(e, "Couldn't add the block"));
    },
  });

  function submit() {
    const parsed = blockFormSchema.safeParse({ name: normalizeBlockName(name), code: code.trim() });
    if (!parsed.success) {
      const next: { name?: string; code?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "name") next.name ??= issue.message;
        if (issue.path[0] === "code") next.code ??= issue.message;
      }
      setErrors(next);
      return;
    }
    const dupes = duplicateErrors();
    setErrors(dupes);
    if (dupes.name || dupes.code) return;
    mut.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setErrors({});
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add block</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="block-name">Block Name</Label>
            <Input
              id="block-name"
              value={name}
              placeholder="Block A, Block-1, Girls Block"
              aria-invalid={!!errors.name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
            />
            {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="block-code">Block Code (Optional)</Label>
            <Input
              id="block-code"
              value={code}
              placeholder="A, B1, G1"
              aria-invalid={!!errors.code}
              onChange={(e) => {
                setCode(e.target.value);
                if (errors.code) setErrors({ ...errors, code: undefined });
              }}
            />
            {errors.code && <p className="mt-1 text-sm text-destructive">{errors.code}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || mut.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFloorDialog({
  open,
  onOpenChange,
  tenantId,
  propertyId,
  blockId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  blockId: string | null;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Only the name is collected. floor_number stays an optional legacy column
  // (still written by CSV import and read by student pages) and is left null
  // here; floor order comes from the name (see lib/floor-order.ts).
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("floors").insert({
        tenant_id: tenantId,
        property_id: propertyId,
        block_id: blockId,
        name: name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Floor added");
      onDone();
      onOpenChange(false);
      setName("");
      setError(null);
    },
    onError: (e) =>
      setError(
        getErrorMessage(e, "Couldn't add the floor", "A floor with this name already exists here."),
      ),
  });

  function submit() {
    const parsed = floorFormSchema.shape.name.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Floor Name is required");
      return;
    }
    setError(null);
    mut.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setError(null);
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add floor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="floor-name">Floor Name</Label>
            <Input
              id="floor-name"
              value={name}
              placeholder="Ground Floor, First Floor, Second Floor, Basement, Terrace"
              aria-invalid={!!error}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
            />
            {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || mut.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Same fields and rules as one CSV row (Block → Floor → Room Number, Type,
 * Capacity, Base Rent): the shared roomCreateSchema validates here and on the
 * server, and the room + its beds are created by fn_create_room_with_beds, the
 * same database function the CSV import uses. Block and Floor are fixed by the
 * floor this dialog was opened from.
 */
function AddRoomDialog({
  open,
  onOpenChange,
  floorId,
  floorName,
  blockName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  floorId: string | null;
  floorName: string;
  blockName: string | null;
  onDone: () => void;
}) {
  const createFn = useServerFn(createRoomWithBeds);
  const [number, setNumber] = useState("");
  const [type, setType] = useState<RoomType>("DOUBLE");
  // Only used for DORM/CUSTOM; SINGLE/DOUBLE/TRIPLE derive capacity from the type.
  const [capacity, setCapacity] = useState("");
  const [rent, setRent] = useState("");
  const [errors, setErrors] = useState<{ number?: string; capacity?: string; rent?: string }>({});
  const fixedCapacity = fixedCapacityForType(type);

  function reset() {
    setNumber("");
    setCapacity("");
    setRent("");
    setErrors({});
  }

  const mut = useMutation({
    mutationFn: async (input: {
      floor_id: string;
      room_number: string;
      room_type: RoomType;
      capacity: number | null;
      base_rent_paise: number | null;
    }) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("Room + beds added");
      onDone();
      onOpenChange(false);
      reset();
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Couldn't add the room";
      if (/already exists/i.test(message)) setErrors({ number: message });
      else toast.error(message);
    },
  });

  function submit() {
    if (!floorId) return;
    const rentNum = rent.trim() === "" ? null : Number(rent);
    const parsed = roomCreateSchema.safeParse({
      floor_id: floorId,
      room_number: number,
      room_type: type,
      capacity: fixedCapacity !== null || capacity.trim() === "" ? null : Number(capacity),
      base_rent_paise:
        rentNum !== null && Number.isFinite(rentNum) && rentNum >= 0
          ? rupeesToPaise(rentNum)
          : null,
    });
    const next: { number?: string; capacity?: string; rent?: string } = {};
    if (rentNum !== null && (!Number.isFinite(rentNum) || rentNum < 0)) {
      next.rent = "Base Rent must be 0 or more";
    }
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "room_number") next.number ??= issue.message;
        if (issue.path[0] === "capacity") next.capacity ??= issue.message;
      }
    }
    setErrors(next);
    if (!parsed.success || next.rent) return;
    const resolved = resolveRoomCapacity(parsed.data.room_type, parsed.data.capacity);
    if (!resolved.ok) {
      setErrors({ capacity: resolved.error });
      return;
    }
    mut.mutate({
      floor_id: parsed.data.floor_id,
      room_number: parsed.data.room_number,
      room_type: parsed.data.room_type,
      capacity: resolved.capacity,
      base_rent_paise: parsed.data.base_rent_paise ?? null,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setErrors({});
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add room</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="room-block">Block</Label>
              <Input id="room-block" value={blockName ?? "No block"} readOnly disabled />
            </div>
            <div>
              <Label htmlFor="room-floor">Floor</Label>
              <Input id="room-floor" value={floorName} readOnly disabled />
            </div>
          </div>
          <div>
            <Label htmlFor="room-number">Room Number</Label>
            <Input
              id="room-number"
              value={number}
              aria-invalid={!!errors.number}
              onChange={(e) => {
                setNumber(e.target.value);
                setErrors((p) => ({ ...p, number: undefined }));
              }}
            />
            {errors.number && <p className="mt-1 text-sm text-destructive">{errors.number}</p>}
          </div>
          <div>
            <Label>Room Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as RoomType);
                setErrors((p) => ({ ...p, capacity: undefined }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roomTypeEnum.options.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="room-capacity">Capacity</Label>
              <Input
                id="room-capacity"
                type="number"
                min={1}
                max={50}
                value={fixedCapacity !== null ? String(fixedCapacity) : capacity}
                readOnly={fixedCapacity !== null}
                disabled={fixedCapacity !== null}
                placeholder={fixedCapacity !== null ? undefined : "Number of beds"}
                aria-invalid={!!errors.capacity}
                onChange={(e) => {
                  setCapacity(e.target.value);
                  setErrors((p) => ({ ...p, capacity: undefined }));
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {fixedCapacity !== null
                  ? `${type} rooms always have capacity ${fixedCapacity}.`
                  : `Required for ${type} rooms (1–50).`}
              </p>
              {errors.capacity && (
                <p className="mt-1 text-sm text-destructive">{errors.capacity}</p>
              )}
            </div>
            <div>
              <Label htmlFor="room-rent">Base Rent (₹)</Label>
              <Input
                id="room-rent"
                type="number"
                min={0}
                value={rent}
                aria-invalid={!!errors.rent}
                onChange={(e) => {
                  setRent(e.target.value);
                  setErrors((p) => ({ ...p, rent: undefined }));
                }}
              />
              {errors.rent && <p className="mt-1 text-sm text-destructive">{errors.rent}</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!number.trim() || !floorId || mut.isPending}>
            <Plus className="h-4 w-4" /> Add room + beds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
