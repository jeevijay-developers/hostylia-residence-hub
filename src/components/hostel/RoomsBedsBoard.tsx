import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Bed,
  BedDouble,
  Building2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  DoorClosed,
  Download,
  ImagePlus,
  Layers,
  MoreHorizontal,
  PieChart,
  Plus,
  Users,
  Wrench,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getErrorMessage } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { BedStatus, BedTile } from "@/components/hostel/BedGrid";
import { BedStatusDialog } from "@/components/hostel/BedStatusDialog";
import { CsvImportModal } from "@/components/hostel/CsvImportModal";
import { describeBedRestriction } from "@/lib/bed-label";
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
import { ROOM_AMENITIES } from "@/lib/room-amenities";
import {
  ROOM_PHOTO_ACCEPT,
  ROOM_PHOTO_MAX_FILES,
  roomPhotoProblem,
  uploadRoomPhotos,
} from "@/lib/room-photos";

/**
 * Property structure: blocks → floors → rooms → beds, with Add Block / Floor /
 * Room, CSV import and per-bed status management.
 *
 * Lives outside src/routes so it can be imported from both
 * admin.properties.$slug.structure.tsx and warden.rooms-beds.tsx. `canCreate`
 * defaults to `true` (Admin) — only the Warden route passes an explicit,
 * permission-derived value. `canManageBedStatus` (default `true`, Admin) gates
 * clicking a bed to change its status; the Warden route passes its
 * `rooms_beds_edit` permission. The database enforces the same rules, this
 * only hides the affordances.
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
    queryKey: ["structure-property", propertyId],
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
    // Properties list / dashboard totals.
    qc.invalidateQueries({ queryKey: ["admin-properties"] });
    qc.invalidateQueries({ queryKey: ["admin-kpis"] });
  }

  if (propertyQ.isError || treeQ.isError) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
        <p className="text-sm text-foreground">
          We couldn't load this property's blocks and rooms. Please try again.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            propertyQ.refetch();
            treeQ.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (propertyQ.isLoading || treeQ.isLoading || !tenantId || !treeQ.data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-80" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const { blocks, floors, rooms, beds } = treeQ.data;
  const noBlockFloors = floors.filter((f) => !f.block_id);
  const totals = summarize(floors, rooms, beds);
  const isEmpty = blocks.length === 0 && floors.length === 0;
  // Big properties start collapsed past the first block so the page stays scannable.
  const expandFirstOnly = blocks.length > 3;

  const openAddRoom = (floorId: string, blockId: string | null) => {
    setRoomParentFloor(floorId);
    setRoomParentBlock(blockId);
    setAddRoomOpen(true);
  };
  const openAddFloor = (blockId: string | null) => {
    setFloorParentBlock(blockId);
    setAddFloorOpen(true);
  };

  return (
    <div className="w-full space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            Structure — {propertyQ.data?.name ?? ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage blocks, floors, rooms and bed allocation
          </p>
        </div>
        {canCreate ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setCsvOpen(true)}>
              <Download className="h-4 w-4" /> Import CSV
            </Button>
            <Button className="h-10 rounded-xl" onClick={() => setAddBlockOpen(true)}>
              <Plus className="h-4 w-4" /> Add Block
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={Building2} value={blocks.length} label={plural(blocks.length, "Block")} />
        <StatTile icon={Layers} value={floors.length} label={plural(floors.length, "Floor")} />
        <StatTile icon={DoorClosed} value={rooms.length} label={plural(rooms.length, "Room")} />
        <StatTile icon={BedDouble} value={beds.length} label={plural(beds.length, "Bed")} />
        <StatTile icon={PieChart} value={`${totals.occupancyPct}%`} label="Occupancy" />
      </div>

      {isEmpty ? (
        <EmptyState
          title="No blocks yet"
          description="Start by adding a block (or import a CSV), then add its floors, rooms and beds."
          action={
            canCreate ? { label: "Add Block", onClick: () => setAddBlockOpen(true) } : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {blocks.map((b, i) => (
            <BlockSection
              key={b.id}
              title={b.name}
              code={b.code}
              defaultOpen={!expandFirstOnly || i === 0}
              floors={floors.filter((f) => f.block_id === b.id)}
              rooms={rooms}
              beds={beds}
              canCreate={canCreate}
              onSelectBed={canManageBedStatus ? setStatusBed : undefined}
              onAddFloor={() => openAddFloor(b.id)}
              onAddRoom={(fId) => openAddRoom(fId, b.id)}
            />
          ))}
          {noBlockFloors.length > 0 || (blocks.length === 0 && floors.length > 0) ? (
            <BlockSection
              title="Floors without a block"
              code={null}
              defaultOpen
              floors={noBlockFloors}
              rooms={rooms}
              beds={beds}
              canCreate={canCreate}
              onSelectBed={canManageBedStatus ? setStatusBed : undefined}
              onAddFloor={() => openAddFloor(null)}
              onAddRoom={(fId) => openAddRoom(fId, null)}
            />
          ) : null}
        </div>
      )}

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
            tenantId={tenantId}
            propertyId={propertyId}
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

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** Counts for a set of floors; occupancy = occupied / (occupied + vacant), as everywhere else. */
function summarize(floors: Floor[], rooms: Room[], beds: Bed[]) {
  const floorIds = new Set(floors.map((f) => f.id));
  const roomList = rooms.filter((r) => floorIds.has(r.floor_id));
  const roomIds = new Set(roomList.map((r) => r.id));
  const bedList = beds.filter((b) => roomIds.has(b.room_id));
  const occupied = bedList.filter((b) => b.status === "OCCUPIED").length;
  const vacant = bedList.filter((b) => b.status === "VACANT").length;
  return {
    rooms: roomList.length,
    beds: bedList.length,
    occupancyPct: occupied + vacant > 0 ? Math.round((occupied / (occupied + vacant)) * 100) : 0,
  };
}

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <p className="mt-3 font-display text-2xl font-semibold leading-tight text-foreground tabular-nums">
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function MetaChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function BlockSection({
  title,
  code,
  defaultOpen,
  floors,
  rooms,
  beds,
  canCreate,
  onSelectBed,
  onAddFloor,
  onAddRoom,
}: {
  title: string;
  code: string | null;
  defaultOpen: boolean;
  floors: Floor[];
  rooms: Room[];
  beds: Bed[];
  canCreate: boolean;
  onSelectBed?: (bed: BedTile) => void;
  onAddFloor: () => void;
  onAddRoom: (floorId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Floors start open when there are only a few, otherwise just the first one.
  const [openFloors, setOpenFloors] = useState<Set<string>>(
    () =>
      new Set(floors.length <= 3 ? floors.map((f) => f.id) : floors.slice(0, 1).map((f) => f.id)),
  );
  const stats = summarize(floors, rooms, beds);
  const bodyId = `block-${title.replace(/\W+/g, "-")}-body`;

  const toggleFloor = (id: string) =>
    setOpenFloors((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-3 shadow-card-ambient sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate font-display text-lg font-semibold text-foreground">
            {title}
          </span>
          {code && code !== title ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {code}
            </span>
          ) : null}
        </button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <MetaChip icon={Layers}>
            {floors.length} {plural(floors.length, "Floor")}
          </MetaChip>
          <MetaChip icon={DoorClosed}>
            {stats.rooms} {plural(stats.rooms, "Room")}
          </MetaChip>
          <MetaChip icon={BedDouble}>
            {stats.beds} {plural(stats.beds, "Bed")}
          </MetaChip>
          {stats.beds > 0 ? (
            <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              {stats.occupancyPct}% Occupied
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {canCreate ? (
            <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={onAddFloor}>
              <Plus className="h-3.5 w-3.5" /> Floor
            </Button>
          ) : null}
          {floors.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  aria-label={`More actions for ${title}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setOpen(true);
                    setOpenFloors(new Set(floors.map((f) => f.id)));
                  }}
                >
                  <ChevronsUpDown className="mr-2 h-4 w-4" /> Expand all floors
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpenFloors(new Set())}>
                  <ChevronsDownUp className="mr-2 h-4 w-4" /> Collapse all floors
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {open ? (
        <div id={bodyId} className="mt-3 space-y-3 sm:mt-4">
          {floors.length === 0 ? (
            <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              No floors yet.{canCreate ? " Use “+ Floor” to add one." : ""}
            </p>
          ) : (
            floors.map((f) => (
              <FloorSection
                key={f.id}
                floor={f}
                rooms={rooms.filter((r) => r.floor_id === f.id)}
                beds={beds}
                open={openFloors.has(f.id)}
                onToggle={() => toggleFloor(f.id)}
                canCreate={canCreate}
                onSelectBed={onSelectBed}
                onAddRoom={() => onAddRoom(f.id)}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function FloorSection({
  floor,
  rooms,
  beds,
  open,
  onToggle,
  canCreate,
  onSelectBed,
  onAddRoom,
}: {
  floor: Floor;
  rooms: Room[];
  beds: Bed[];
  open: boolean;
  onToggle: () => void;
  canCreate: boolean;
  onSelectBed?: (bed: BedTile) => void;
  onAddRoom: () => void;
}) {
  const roomIds = new Set(rooms.map((r) => r.id));
  const bedCount = beds.filter((b) => roomIds.has(b.room_id)).length;
  const bodyId = `floor-${floor.id}-body`;
  return (
    <div className="rounded-xl bg-muted/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-semibold text-foreground">{floor.name}</span>
        <CountPill>
          {rooms.length} {plural(rooms.length, "Room")}
        </CountPill>
        <CountPill>
          {bedCount} {plural(bedCount, "Bed")}
        </CountPill>
        <div className="ml-auto flex items-center gap-1.5">
          {canCreate ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg bg-card"
              onClick={onAddRoom}
            >
              <Plus className="h-3.5 w-3.5" /> Room
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? "Collapse" : "Expand"} ${floor.name}`}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>
      {open ? (
        <div id={bodyId} className="@container px-3 pb-3 sm:px-4 sm:pb-4">
          {rooms.length === 0 ? (
            <p className="rounded-lg bg-card px-4 py-3 text-sm text-muted-foreground">
              No rooms on this floor yet.
            </p>
          ) : (
            // Columns follow the floor panel width (container query), not the window,
            // so cards fit with or without the sidebar.
            <div className="grid gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
              {rooms.map((r) => (
                <RoomCard
                  key={r.id}
                  room={r}
                  beds={beds.filter((b) => b.room_id === r.id)}
                  onSelectBed={onSelectBed}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const ROOM_TYPE_LABEL: Record<string, string> = {
  SINGLE: "Single",
  DOUBLE: "Double",
  TRIPLE: "Triple",
  DORM: "Dorm",
  CUSTOM: "Custom",
};

/** Room-level state: an explicit room status wins, otherwise it follows its beds. */
function roomState(room: Room, beds: Bed[]): { label: string; className: string; dot: string } {
  if (room.status === "MAINTENANCE")
    return { label: "Maintenance", className: "bg-warning/10 text-warning", dot: "bg-warning" };
  if (room.status === "BLOCKED")
    return {
      label: "Blocked",
      className: "bg-destructive/10 text-destructive",
      dot: "bg-destructive",
    };
  if (room.status === "INACTIVE")
    return {
      label: "Inactive",
      className: "bg-muted text-muted-foreground",
      dot: "bg-muted-foreground",
    };
  const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
  if (beds.length > 0 && occupied === beds.length)
    return { label: "Occupied", className: "bg-success/10 text-success", dot: "bg-success" };
  if (occupied > 0)
    return {
      label: `${occupied}/${beds.length} occupied`,
      className: "bg-success/10 text-success",
      dot: "bg-success",
    };
  return {
    label: "Vacant",
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  };
}

const BED_CHIP: Record<BedStatus, { label: string; className: string; Icon: LucideIcon }> = {
  OCCUPIED: {
    label: "Occupied",
    className: "border-bed-occupied/30 bg-bed-occupied/10 text-bed-occupied",
    Icon: BedDouble,
  },
  VACANT: {
    label: "Vacant",
    className: "border-border bg-card text-muted-foreground",
    Icon: Bed,
  },
  MAINTENANCE: {
    label: "Maintenance",
    className: "border-bed-maintenance/30 bg-bed-maintenance/10 text-bed-maintenance",
    Icon: Wrench,
  },
  BLOCKED: {
    label: "Blocked",
    className: "border-bed-blocked/30 bg-bed-blocked/10 text-bed-blocked",
    Icon: Ban,
  },
};

function RoomCard({
  room,
  beds,
  onSelectBed,
}: {
  room: Room;
  beds: Bed[];
  onSelectBed?: (bed: BedTile) => void;
}) {
  const state = roomState(room, beds);
  return (
    <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
          <DoorClosed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">Room {room.room_number}</span>
        </p>
        <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {ROOM_TYPE_LABEL[room.room_type] ?? room.room_type}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> Capacity: {room.capacity}
      </p>
      <span
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
          state.className,
        )}
      >
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", state.dot)} />
        {state.label}
      </span>
      {beds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {beds.map((b) => {
            const status = (b.status as BedStatus) in BED_CHIP ? (b.status as BedStatus) : "VACANT";
            const meta = BED_CHIP[status];
            const tile: BedTile = {
              id: b.id,
              code: b.code,
              status,
              roomNumber: room.room_number,
              notes: b.notes,
              maintenanceUntil: b.maintenance_until,
            };
            const restriction = describeBedRestriction(tile);
            const label = `${room.room_number}-${b.code}`;
            const description = `Bed ${label}: ${meta.label}${restriction ? ` — ${restriction}` : ""}`;
            const chipClass = cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums",
              meta.className,
            );
            return onSelectBed ? (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBed(tile)}
                title={`${description}. Click to manage status.`}
                aria-label={`${description}. Manage status`}
                className={cn(
                  chipClass,
                  "transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ) : (
              <span key={b.id} title={description} aria-label={description} className={chipClass}>
                <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No beds in this room.</p>
      )}
    </div>
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
  tenantId,
  propertyId,
  floorId,
  floorName,
  blockName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  propertyId: string;
  floorId: string | null;
  floorName: string;
  blockName: string | null;
  onDone: () => void;
}) {
  const createFn = useServerFn(createRoomWithBeds);
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [type, setType] = useState<RoomType>("DOUBLE");
  // Only used for DORM/CUSTOM; SINGLE/DOUBLE/TRIPLE derive capacity from the type.
  const [capacity, setCapacity] = useState("");
  const [rent, setRent] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ number?: string; capacity?: string; rent?: string }>({});
  const fixedCapacity = fixedCapacityForType(type);

  function reset() {
    setNumber("");
    setCapacity("");
    setRent("");
    setAmenities([]);
    setPhotos([]);
    setPhotoError(null);
    setErrors({});
  }

  function addPhotos(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const bad = picked.map(roomPhotoProblem).find(Boolean);
    const good = picked.filter((f) => !roomPhotoProblem(f));
    const next = [...photos, ...good].slice(0, ROOM_PHOTO_MAX_FILES);
    setPhotos(next);
    setPhotoError(
      bad ??
        (photos.length + good.length > ROOM_PHOTO_MAX_FILES
          ? `You can add up to ${ROOM_PHOTO_MAX_FILES} photos.`
          : null),
    );
  }

  const mut = useMutation({
    mutationFn: async (input: {
      floor_id: string;
      room_number: string;
      room_type: RoomType;
      capacity: number | null;
      base_rent_paise: number | null;
    }) => {
      const created = await createFn({ data: input });
      // The room exists from here on; amenities and photos are best-effort extras.
      const problems: string[] = [];
      if (amenities.length) {
        const { error } = await supabase
          .from("rooms")
          .update({ amenities })
          .eq("id", created.room_id);
        if (error) problems.push("the amenities couldn't be saved");
      }
      if (photos.length && tenantId) {
        try {
          await uploadRoomPhotos({ tenantId, propertyId, roomId: created.room_id }, photos);
        } catch (e) {
          problems.push(e instanceof Error ? e.message : "the photos couldn't be uploaded");
        }
      }
      return { created, problems };
    },
    onSuccess: ({ problems }) => {
      if (problems.length) {
        toast.warning(`Room + beds added, but ${problems.join("; ")}`);
      } else {
        toast.success("Room + beds added");
      }
      qc.invalidateQueries({ queryKey: ["room-photos"] });
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
      <DialogContent className="max-h-[92vh] overflow-y-auto">
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
          <fieldset>
            <legend className="text-sm font-medium leading-none">Amenities</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROOM_AMENITIES.map(({ key, label, icon: Icon }) => {
                const on = amenities.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setAmenities((list) => (on ? list.filter((k) => k !== key) : [...list, key]))
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="room-photos">Photos</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional · up to {ROOM_PHOTO_MAX_FILES} JPG, PNG or WebP images, 5 MB each. The first
              one is shown on the room card.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((file, i) => (
                <RoomPhotoThumb
                  key={`${file.name}-${file.size}-${i}`}
                  file={file}
                  isCover={i === 0}
                  onRemove={() => {
                    setPhotos((list) => list.filter((_, j) => j !== i));
                    setPhotoError(null);
                  }}
                />
              ))}
              {photos.length < ROOM_PHOTO_MAX_FILES ? (
                <label
                  htmlFor="room-photos"
                  className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden="true" />
                  Add photo
                  <input
                    id="room-photos"
                    type="file"
                    accept={ROOM_PHOTO_ACCEPT}
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : null}
            </div>
            {photoError ? <p className="mt-1 text-sm text-destructive">{photoError}</p> : null}
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

/** Local preview of a picked room photo, with remove. */
function RoomPhotoThumb({
  file,
  isCover,
  onRemove,
}: {
  file: File;
  isCover: boolean;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="relative h-20 w-24 overflow-hidden rounded-lg border border-border bg-muted">
      {url ? <img src={url} alt={file.name} className="h-full w-full object-cover" /> : null}
      {isCover ? (
        <span className="absolute bottom-1 left-1 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
          Cover
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-card/90 text-foreground shadow-sm hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
