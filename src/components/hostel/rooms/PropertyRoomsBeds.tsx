import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, BedDouble, DoorClosed, Settings2, Users, Wrench } from "lucide-react";

import { BedStatusDialog } from "@/components/hostel/BedStatusDialog";
import { KpiTile, SharePill } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import {
  OccupancyTowersCard,
  type TowerBlock,
} from "@/components/hostel/rooms/OccupancyTowersCard";
import { RoomActivityCard } from "@/components/hostel/rooms/RoomActivityCard";
import { buildRoomActivity } from "@/lib/room-activity";
import { RoomBedsCard, type BedOccupant } from "@/components/hostel/rooms/RoomBedsCard";
import { RoomDetailCard } from "@/components/hostel/rooms/RoomDetailCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { floorShortLabel } from "@/lib/floor-order";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import {
  BED_HOLDING,
  countBeds,
  usePropertyRoomsStructure,
  useRoomStays,
  type StructureBed,
} from "@/lib/rooms-beds";

/**
 * A property's Rooms & Beds tab: bed KPIs, blocks drawn as buildings filled by
 * occupancy (three at a time), the selected floor's rooms one by one with
 * photo and details, that room's beds, and its recent activity. Building the
 * structure itself (blocks, floors, rooms) stays on the Setup page.
 */
export function PropertyRoomsBeds({ property }: { property: OverviewProperty }) {
  const qc = useQueryClient();
  const structureQ = usePropertyRoomsStructure(property.id);
  const statsQ = usePropertyOverviewStats(property.id);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [manageBed, setManageBed] = useState<StructureBed | null>(null);

  const data = structureQ.data;

  const towers = useMemo<TowerBlock[]>(() => {
    if (!data) return [];
    const bedsByFloor = new Map<string, StructureBed[]>();
    for (const b of data.beds) {
      const list = bedsByFloor.get(b.floor_id) ?? [];
      list.push(b);
      bedsByFloor.set(b.floor_id, list);
    }
    const roomsByFloor = new Map<string, number>();
    for (const r of data.rooms)
      roomsByFloor.set(r.floor_id, (roomsByFloor.get(r.floor_id) ?? 0) + 1);

    const build = (id: string, name: string, blockKey: string | null): TowerBlock => {
      const floors = data.floors
        .filter((f) => f.block_id === blockKey)
        .map((f) => ({
          id: f.id,
          name: f.name,
          label: floorShortLabel(f.name),
          rooms: roomsByFloor.get(f.id) ?? 0,
          counts: countBeds(bedsByFloor.get(f.id) ?? []),
        }));
      return {
        id,
        name,
        floors,
        counts: countBeds(floors.flatMap((f) => bedsByFloor.get(f.id) ?? [])),
      };
    };
    const list = data.blocks.map((b) => build(b.id, b.name, b.id));
    if (data.floors.some((f) => !f.block_id)) {
      list.push(build("none", list.length ? "No block" : "Main building", null));
    }
    return list;
  }, [data]);

  const block = towers.find((b) => b.id === blockId) ?? towers[0] ?? null;
  const floor =
    block?.floors.find((f) => f.id === floorId) ??
    block?.floors.find((f) => f.rooms > 0) ??
    block?.floors[0] ??
    null;
  const floorRooms = useMemo(
    () => (data && floor ? data.rooms.filter((r) => r.floor_id === floor.id) : []),
    [data, floor],
  );
  const roomIndex = Math.max(
    0,
    floorRooms.findIndex((r) => r.id === roomId),
  );
  const room = floorRooms[roomIndex] ?? null;
  const roomBeds = useMemo(
    () => (data && room ? data.beds.filter((b) => b.room_id === room.id) : []),
    [data, room],
  );
  const staysQ = useRoomStays(room?.id ?? null);

  const occupants = useMemo(() => {
    const map = new Map<string, BedOccupant>();
    for (const s of staysQ.data ?? []) {
      if (!BED_HOLDING.includes(s.status) || !s.student || map.has(s.bed_id)) continue;
      const detail = s.status.startsWith("PENDING_")
        ? s.status === "PENDING_PAYMENT"
          ? "Allocation pending payment"
          : "Allocation pending agreement"
        : [s.student.course_name, s.student.academic_year].filter(Boolean).join(", ");
      map.set(s.bed_id, {
        studentId: s.student.id,
        name: s.student.full_name,
        detail: detail || null,
      });
    }
    return map;
  }, [staysQ.data]);

  const activity = useMemo(
    () => (room ? buildRoomActivity(room, roomBeds, staysQ.data ?? []) : []),
    [room, roomBeds, staysQ.data],
  );

  const totals = countBeds(data?.beds ?? []);
  const realBlocks = data?.blocks.length ?? 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rooms-beds"] });
    qc.invalidateQueries({ queryKey: ["structure", property.id] });
    qc.invalidateQueries({ queryKey: ["allocation-beds"] });
    qc.invalidateQueries({ queryKey: ["property-overview", property.id] });
  };

  const hero = (
    <>
      <PropertyHero
        property={property}
        blocks={data ? realBlocks : statsQ.data?.blocksCount}
        beds={data ? totals.beds : statsQ.data?.beds.total}
        residents={statsQ.data?.residents}
        isLoadingCounts={statsQ.isLoading && !data}
      />
      <PropertyTabs slug={property.slug} />
    </>
  );

  if (structureQ.isLoading) {
    return (
      <div className="w-full space-y-4 sm:space-y-5">
        {hero}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (structureQ.isError || !data) {
    return (
      <div className="w-full space-y-4 sm:space-y-5">
        {hero}
        <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            We couldn't load this property's rooms and beds. Please try again.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => structureQ.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (data.floors.length === 0) {
    return (
      <div className="w-full space-y-4 sm:space-y-5">
        {hero}
        <div className="flex flex-col items-center rounded-2xl border border-border/80 bg-card px-6 py-12 text-center shadow-card-ambient">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <DoorClosed className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-3 font-medium text-foreground">No rooms yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add blocks, floors and rooms in Setup (or import them from a CSV). They'll show up here
            with their occupancy.
          </p>
          <Button asChild className="mt-4 rounded-xl">
            <Link to="/admin/properties/$slug/structure" params={{ slug: property.slug }}>
              <Settings2 className="h-4 w-4" /> Set up rooms &amp; beds
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {hero}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <KpiTile
          icon={DoorClosed}
          label="Total rooms"
          value={data.rooms.length}
          caption={`${towers.length} ${towers.length === 1 ? "block" : "blocks"}, ${data.floors.length} ${data.floors.length === 1 ? "floor" : "floors"}`}
          aside={
            <ul className="space-y-1.5">
              <li className="flex items-center gap-1.5" title="Beds under maintenance">
                <Wrench className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                Maintenance:{" "}
                <span className="font-semibold text-foreground">{totals.maintenance}</span>
              </li>
              <li className="flex items-center gap-1.5" title="Blocked beds">
                <Ban className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                Blocked: <span className="font-semibold text-foreground">{totals.blocked}</span>
              </li>
            </ul>
          }
        />
        <KpiTile
          icon={BedDouble}
          label="Total beds"
          value={totals.beds}
          caption="Across every room"
        />
        <KpiTile
          icon={Users}
          label="Occupied beds"
          value={totals.occupied}
          caption="With a resident"
          badge={<SharePill value={totals.occupancyPct} description="of usable beds occupied" />}
        />
        <KpiTile
          icon={BedDouble}
          label="Vacant beds"
          value={totals.vacant}
          caption="Ready to allot"
          badge={
            <SharePill
              value={totals.occupied + totals.vacant > 0 ? 100 - totals.occupancyPct : 0}
              description="of usable beds vacant"
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <OccupancyTowersCard
          blocks={towers}
          selectedBlockId={block?.id ?? null}
          selectedFloorId={floor?.id ?? null}
          onSelectBlock={(id) => {
            setBlockId(id);
            setFloorId(null);
            setRoomId(null);
          }}
          onSelectFloor={(id) => {
            setFloorId(id);
            setRoomId(null);
          }}
          structureSlug={property.slug}
        />
        <RoomDetailCard
          room={room}
          counts={room ? countBeds(roomBeds) : null}
          position={roomIndex}
          total={floorRooms.length}
          onPrev={() => setRoomId(floorRooms[roomIndex - 1]?.id ?? null)}
          onNext={() => setRoomId(floorRooms[roomIndex + 1]?.id ?? null)}
          tenantId={property.tenant_id}
          propertyId={property.id}
          canEditPhotos
        />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <RoomBedsCard
          roomNumber={room?.room_number ?? null}
          beds={roomBeds}
          occupants={occupants}
          isLoadingOccupants={staysQ.isLoading}
          onManageBed={setManageBed}
        />
        <RoomActivityCard
          items={activity}
          isLoading={!!room && staysQ.isLoading}
          isError={staysQ.isError}
        />
      </div>

      <BedStatusDialog
        bed={
          manageBed
            ? {
                id: manageBed.id,
                code: manageBed.code,
                status: manageBed.status,
                roomNumber: room?.room_number ?? null,
                notes: manageBed.notes,
                maintenanceUntil: manageBed.maintenance_until,
              }
            : null
        }
        open={!!manageBed}
        onOpenChange={(v) => !v && setManageBed(null)}
        onDone={() => {
          setManageBed(null);
          refresh();
        }}
      />
    </div>
  );
}
