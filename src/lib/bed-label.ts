/**
 * Display-only bed label. Bed codes (B1, B2…) repeat across rooms, so UI that
 * shows a bed outside its room context prefixes the room: "Room 101 - B1".
 * Never use this for storage, lookups or uniqueness — the stored `code` and
 * the bed id are unchanged.
 */
export function formatBedLabel(roomNumber: string | null | undefined, code: string): string {
  const room = roomNumber?.trim();
  return room ? `Room ${room} - ${code}` : code;
}

/** "12 Nov 2026" for a bed's maintenance_until (stored as IST midnight). */
export function formatBedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Short remark for a MAINTENANCE / BLOCKED bed, e.g. "Leaking tap · until 12 Nov 2026". */
export function describeBedRestriction(bed: {
  status: string;
  notes?: string | null;
  maintenanceUntil?: string | null;
}): string | null {
  if (bed.status !== "MAINTENANCE" && bed.status !== "BLOCKED") return null;
  const until = bed.status === "MAINTENANCE" ? formatBedDate(bed.maintenanceUntil) : null;
  const parts = [bed.notes?.trim() || null, until ? `until ${until}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
