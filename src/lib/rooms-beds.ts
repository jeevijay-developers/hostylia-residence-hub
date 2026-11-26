import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { sortFloors } from "@/lib/floor-order";

/**
 * Data for a property's Rooms & Beds tab. Plain RLS reads, so a user only
 * ever sees what their policies allow. Rooms and beds are read page by page:
 * PostgREST returns at most 1000 rows per request and a large property can
 * have more beds than that.
 */

const PAGE = 1000;
const MAX_ROWS = 20_000;
export const LIVE_STAY = ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION"];
/** Every allocation state that holds a bed (the beds' unique-allocation index uses the same list). */
export const BED_HOLDING = ["PENDING_AGREEMENT", "PENDING_PAYMENT", ...LIVE_STAY];

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error("We couldn't load this property's rooms. Please try again.");
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export type BedStatusValue = "VACANT" | "OCCUPIED" | "MAINTENANCE" | "BLOCKED";

export interface StructureBlock {
  id: string;
  name: string;
  code: string | null;
}
export interface StructureFloor {
  id: string;
  block_id: string | null;
  name: string;
  display_order: number;
  created_at: string;
}
export interface StructureRoom {
  id: string;
  block_id: string | null;
  floor_id: string;
  room_number: string;
  room_type: string;
  capacity: number;
  base_rent_paise: number | null;
  status: string;
  amenities: unknown;
  created_at: string;
  updated_at: string;
}
export interface StructureBed {
  id: string;
  room_id: string;
  floor_id: string;
  block_id: string | null;
  code: string;
  status: BedStatusValue;
  notes: string | null;
  maintenance_until: string | null;
  updated_at: string;
}

export interface PropertyStructure {
  blocks: StructureBlock[];
  floors: StructureFloor[];
  rooms: StructureRoom[];
  beds: StructureBed[];
}

const asBedStatus = (s: string): BedStatusValue =>
  s === "OCCUPIED" || s === "MAINTENANCE" || s === "BLOCKED" ? s : "VACANT";

export function usePropertyRoomsStructure(propertyId: string | null) {
  return useQuery({
    queryKey: ["rooms-beds", propertyId, "structure"],
    enabled: !!propertyId,
    queryFn: async (): Promise<PropertyStructure> => {
      if (!propertyId) throw new Error("Missing property");
      const [blocksRes, floorsRes, rooms, beds] = await Promise.all([
        supabase
          .from("blocks")
          .select("id, name, code")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("display_order")
          .order("name"),
        supabase
          .from("floors")
          .select("id, block_id, name, display_order, created_at")
          .eq("property_id", propertyId)
          .is("deleted_at", null),
        readAll((from, to) =>
          supabase
            .from("rooms")
            .select(
              "id, block_id, floor_id, room_number, room_type, capacity, base_rent_paise, status, amenities, created_at, updated_at",
            )
            .eq("property_id", propertyId)
            .is("deleted_at", null)
            .order("room_number")
            .order("id")
            .range(from, to),
        ),
        readAll((from, to) =>
          supabase
            .from("beds")
            .select(
              "id, room_id, floor_id, block_id, code, status, notes, maintenance_until, updated_at",
            )
            .eq("property_id", propertyId)
            .is("deleted_at", null)
            .order("code")
            .order("id")
            .range(from, to),
        ),
      ]);
      if (blocksRes.error || floorsRes.error) {
        throw new Error("We couldn't load this property's rooms. Please try again.");
      }
      return {
        blocks: blocksRes.data ?? [],
        floors: sortFloors(floorsRes.data ?? []),
        rooms: rooms.sort((a, b) =>
          a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
        ),
        beds: beds.map((b) => ({ ...b, status: asBedStatus(String(b.status)) })),
      };
    },
  });
}

export interface BedCounts {
  beds: number;
  occupied: number;
  vacant: number;
  maintenance: number;
  blocked: number;
  /** occupied / (occupied + vacant), rounded — the app-wide occupancy rule. */
  occupancyPct: number;
}

export function countBeds(beds: readonly { status: BedStatusValue }[]): BedCounts {
  const c = { beds: beds.length, occupied: 0, vacant: 0, maintenance: 0, blocked: 0 };
  for (const b of beds) {
    if (b.status === "OCCUPIED") c.occupied++;
    else if (b.status === "MAINTENANCE") c.maintenance++;
    else if (b.status === "BLOCKED") c.blocked++;
    else c.vacant++;
  }
  const usable = c.occupied + c.vacant;
  return { ...c, occupancyPct: usable > 0 ? Math.round((c.occupied / usable) * 100) : 0 };
}

export interface RoomStay {
  id: string;
  bed_id: string;
  status: string;
  start_date: string;
  activated_at: string | null;
  notice_given_at: string | null;
  closed_at: string | null;
  actual_end_date: string | null;
  created_at: string;
  updated_at: string;
  student: {
    id: string;
    full_name: string;
    course_name: string | null;
    academic_year: string | null;
  } | null;
}

/** Stays in one room (current and the last few past ones) — occupants and activity. */
export function useRoomStays(roomId: string | null) {
  return useQuery({
    queryKey: ["rooms-beds", "room-stays", roomId],
    enabled: !!roomId,
    queryFn: async (): Promise<RoomStay[]> => {
      if (!roomId) return [];
      const columns =
        "id, bed_id, status, start_date, activated_at, notice_given_at, closed_at, actual_end_date, created_at, updated_at, students(id, full_name, course_name, academic_year)";
      // Current stays are never cut off (at most one per bed, so a dorm's 40 beds
      // all resolve); past stays are only needed for the activity list.
      const [current, past] = await Promise.all([
        supabase
          .from("allocations")
          .select(columns)
          .eq("room_id", roomId)
          .is("deleted_at", null)
          .in("status", BED_HOLDING)
          .limit(500),
        supabase
          .from("allocations")
          .select(columns)
          .eq("room_id", roomId)
          .is("deleted_at", null)
          .eq("status", "CLOSED")
          .order("closed_at", { ascending: false })
          .limit(15),
      ]);
      if (current.error || past.error) {
        throw new Error("We couldn't load who stays in this room. Please try again.");
      }
      return [...(current.data ?? []), ...(past.data ?? [])].map(({ students, ...rest }) => ({
        ...rest,
        student: students ?? null,
      }));
    },
  });
}
