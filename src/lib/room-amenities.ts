import {
  AirVent,
  Bath,
  CircleDot,
  Fan,
  Flame,
  Lamp,
  Shirt,
  Sun,
  Wifi,
  type LucideIcon,
} from "lucide-react";

/** Amenities offered on a room — stored as these keys in rooms.amenities (jsonb array). */
export const ROOM_AMENITIES = [
  { key: "WIFI", label: "Wi-Fi", icon: Wifi },
  { key: "AC", label: "AC", icon: AirVent },
  { key: "COOLER", label: "Cooler", icon: Fan },
  { key: "WARDROBE", label: "Wardrobe", icon: Shirt },
  { key: "STUDY_TABLE", label: "Study table", icon: Lamp },
  { key: "ATTACHED_BATHROOM", label: "Attached bathroom", icon: Bath },
  { key: "GEYSER", label: "Geyser", icon: Flame },
  { key: "BALCONY", label: "Balcony", icon: Sun },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

export type RoomAmenityKey = (typeof ROOM_AMENITIES)[number]["key"];

/** Reads rooms.amenities (unknown JSON) into display items; unknown strings are shown as-is. */
export function readRoomAmenities(
  value: unknown,
): { key: string; label: string; icon: LucideIcon }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => {
      const known = ROOM_AMENITIES.find((a) => a.key === v.toUpperCase());
      return known ? { ...known } : { key: v, label: v, icon: CircleDot };
    });
}
