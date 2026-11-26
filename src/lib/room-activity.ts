import {
  Ban,
  Bell,
  BedDouble,
  DoorOpen,
  Pencil,
  Plus,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { RoomStay, StructureBed, StructureRoom } from "@/lib/rooms-beds";

export interface ActivityItem {
  key: string;
  at: string;
  icon: LucideIcon;
  text: string;
}

/**
 * The room's recent history, rebuilt from its own records (audit logs are not
 * readable from the browser): stays starting, notices, move-outs, beds put
 * under maintenance or blocked, and when the room was added or edited.
 */
export function buildRoomActivity(
  room: StructureRoom,
  beds: StructureBed[],
  stays: RoomStay[],
): ActivityItem[] {
  const code = new Map(beds.map((b) => [b.id, b.code]));
  const items: ActivityItem[] = [];
  for (const s of stays) {
    const who = s.student?.full_name ?? "A student";
    const bed = code.get(s.bed_id) ?? "a bed";
    const started = s.activated_at ?? s.created_at;
    items.push({
      key: `${s.id}-in`,
      at: started,
      icon: BedDouble,
      text: `Bed ${bed} allocated to ${who}`,
    });
    if (s.notice_given_at) {
      items.push({
        key: `${s.id}-notice`,
        at: s.notice_given_at,
        icon: Bell,
        text: `${who} gave notice (${bed})`,
      });
    }
    if (s.status === "CLOSED" && s.closed_at) {
      items.push({
        key: `${s.id}-out`,
        at: s.closed_at,
        icon: DoorOpen,
        text: `${who} moved out of ${bed}`,
      });
    }
  }
  for (const b of beds) {
    if (b.status === "MAINTENANCE") {
      items.push({
        key: `${b.id}-m`,
        at: b.updated_at,
        icon: Wrench,
        text: `Bed ${b.code} marked for maintenance`,
      });
    } else if (b.status === "BLOCKED") {
      items.push({ key: `${b.id}-b`, at: b.updated_at, icon: Ban, text: `Bed ${b.code} blocked` });
    }
  }
  items.push({
    key: "room-created",
    at: room.created_at,
    icon: Plus,
    text: `Room ${room.room_number} added`,
  });
  if (new Date(room.updated_at).getTime() - new Date(room.created_at).getTime() > 60_000) {
    items.push({
      key: "room-updated",
      at: room.updated_at,
      icon: Pencil,
      text: `Room ${room.room_number} details updated`,
    });
  }
  return items
    .filter((i) => !Number.isNaN(new Date(i.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
