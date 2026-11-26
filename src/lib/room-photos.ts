import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Room photos live in the private `property-media` bucket at the tenant-scoped
 * path {tenant_id}/{property_id}/rooms/{room_id}/{file_id}.{ext} (see
 * migration 20261202090000_property_media_room_photos.sql). There is no table
 * column: a room's photos are simply the files in its folder. Storage RLS lets
 * tenant members read them and only the tenant's Hostel Admin add or remove.
 */
export const ROOM_PHOTO_BUCKET = "property-media";
export const ROOM_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const ROOM_PHOTO_MAX_FILES = 5;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const ROOM_PHOTO_ACCEPT = Object.keys(ALLOWED).join(",");

export interface RoomRef {
  tenantId: string;
  propertyId: string;
  roomId: string;
}

const folderOf = ({ tenantId, propertyId, roomId }: RoomRef) =>
  `${tenantId}/${propertyId}/rooms/${roomId}`;

/** A user-facing reason the file can't be used, or null when it's fine. */
export function roomPhotoProblem(file: File): string | null {
  if (!ALLOWED[file.type]) return `"${file.name}" isn't a JPG, PNG or WebP image.`;
  if (file.size > ROOM_PHOTO_MAX_BYTES) return `"${file.name}" is larger than 5 MB.`;
  return null;
}

function friendlyUploadError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("bucket not found")) {
    return "Room photos aren't switched on yet — the latest database update needs to be applied.";
  }
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403")) {
    return "Only a Hostel Admin can add room photos.";
  }
  if (m.includes("payload too large") || m.includes("exceeded")) {
    return "That photo is larger than 5 MB.";
  }
  return "We couldn't upload the photo. Please try again.";
}

/** Uploads photos for one room. Throws a user-friendly Error on the first failure. */
export async function uploadRoomPhotos(room: RoomRef, files: File[]) {
  for (const file of files) {
    const problem = roomPhotoProblem(file);
    if (problem) throw new Error(problem);
    const path = `${folderOf(room)}/${crypto.randomUUID()}.${ALLOWED[file.type]}`;
    const { error } = await supabase.storage
      .from(ROOM_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(friendlyUploadError(error.message));
  }
}

export async function removeRoomPhoto(path: string) {
  const { error } = await supabase.storage.from(ROOM_PHOTO_BUCKET).remove([path]);
  if (error) throw new Error("We couldn't remove the photo. Please try again.");
}

export interface RoomPhoto {
  path: string;
  url: string;
}

/**
 * The room's photos (oldest first, so the first one uploaded is the cover),
 * as short-lived signed URLs. Resolves to [] when there are none, or when the
 * bucket isn't set up yet, so the page falls back to the default picture.
 */
export function useRoomPhotos(room: RoomRef | null) {
  return useQuery({
    queryKey: ["room-photos", room?.roomId],
    enabled: !!room,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<RoomPhoto[]> => {
      if (!room) return [];
      const folder = folderOf(room);
      const bucket = supabase.storage.from(ROOM_PHOTO_BUCKET);
      const { data, error } = await bucket.list(folder, {
        limit: 20,
        sortBy: { column: "created_at", order: "asc" },
      });
      if (error || !data?.length) return [];
      const paths = data.filter((f) => f.name && f.id).map((f) => `${folder}/${f.name}`);
      if (!paths.length) return [];
      const { data: signed, error: signErr } = await bucket.createSignedUrls(paths, 60 * 60);
      if (signErr || !signed) return [];
      return signed.flatMap((s) =>
        s.signedUrl && s.path ? [{ path: s.path, url: s.signedUrl }] : [],
      );
    },
  });
}
