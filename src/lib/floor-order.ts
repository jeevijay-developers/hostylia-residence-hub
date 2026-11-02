/**
 * Logical floor ordering for the Property Structure.
 *
 * Floors are sorted by what their NAME means, not by creation order or the
 * stored `floor_number` (which is optional and, in real data, inconsistent —
 * e.g. "2" stored as 20, "first floor" stored as 2). Order:
 *
 *   Basement / Lower Ground  <  Ground  <  1st, 2nd, 3rd … (numbered)
 *   <  custom / unrecognised names  <  Terrace / Roof
 *
 * Unrecognised names keep a stable fallback order: `display_order`, then name
 * (natural order), then creation time, then id. Nothing is written back — this
 * is a display-time sort only.
 */
export interface SortableFloor {
  id: string;
  name: string;
  display_order: number;
  created_at?: string | null;
}

const GROUP = { BASEMENT: 0, GROUND: 1, NUMBERED: 2, OTHER: 3, TERRACE: 4 } as const;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
};

const CARDINAL_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export interface FloorRank {
  group: number;
  /** Position inside the group (deeper basements are lower; numbered floors by number). */
  n: number;
}

function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classify a floor name. Anything not clearly a standard floor is OTHER. */
export function floorRank(rawName: string): FloorRank {
  const name = clean(rawName);

  if (/\b(terrace|rooftop|roof top|roof)\b/.test(name)) {
    return { group: GROUP.TERRACE, n: 0 };
  }

  if (
    /\b(basement|cellar|sub basement|lower ground)\b/.test(name) ||
    /^b ?\d$/.test(name) ||
    name === "lg"
  ) {
    const depth = name.match(/\d+/);
    return { group: GROUP.BASEMENT, n: -(depth ? Number(depth[0]) : 1) };
  }

  if (/^(the )?ground( floor| fl)?$/.test(name) || /^(g|gf|g floor|zero|0)$/.test(name)) {
    return { group: GROUP.GROUND, n: 0 };
  }

  // Numbered floors: only when the WHOLE name reads as a floor ("1", "1st",
  // "1 st", "Floor 1", "1st Floor", "first floor", "Level 2", "Floor two"),
  // so "Block 2 wing" or "Room 1" are not mistaken for floors.
  const numeric = name.match(
    /^(?:floor |level |fl |l )?(\d{1,3}) ?(?:st|nd|rd|th)?(?: floor| fl)?$/,
  );
  if (numeric) {
    const n = Number(numeric[1]);
    return n === 0 ? { group: GROUP.GROUND, n: 0 } : { group: GROUP.NUMBERED, n };
  }
  const ordinal = name.match(/^(?:the )?([a-z]+)(?: floor| fl)?$/);
  if (ordinal && ORDINAL_WORDS[ordinal[1]] !== undefined) {
    return { group: GROUP.NUMBERED, n: ORDINAL_WORDS[ordinal[1]] };
  }
  const cardinal = name.match(/^(?:floor|level) ([a-z]+)$/);
  if (cardinal && CARDINAL_WORDS[cardinal[1]] !== undefined) {
    return { group: GROUP.NUMBERED, n: CARDINAL_WORDS[cardinal[1]] };
  }

  return { group: GROUP.OTHER, n: 0 };
}

export function compareFloors(a: SortableFloor, b: SortableFloor): number {
  const ra = floorRank(a.name);
  const rb = floorRank(b.name);
  if (ra.group !== rb.group) return ra.group - rb.group;
  if (ra.n !== rb.n) return ra.n - rb.n;
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  if (byName !== 0) return byName;
  const byCreated = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

/** New array in logical floor order; the input and the stored rows are untouched. */
export function sortFloors<T extends SortableFloor>(floors: readonly T[]): T[] {
  return [...floors].sort(compareFloors);
}
