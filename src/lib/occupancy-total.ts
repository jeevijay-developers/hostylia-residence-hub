/**
 * Property-wide total for the Occupancy accuracy report.
 *
 * Built from the SAME rows the report already shows (v_occupancy_summary: every non-deleted bed of the
 * property, grouped once by block, with block_id = NULL as its own "(no block)" group), so each bed is
 * counted exactly once - including unassigned beds - and the totals match the Allocations page, which
 * counts the same beds (same property, not soft-deleted) by status.
 *
 * Occupancy % uses the view's own formula: occupied / (occupied + vacant) * 100, rounded to 2 decimals,
 * and 0 when there are no occupied or vacant beds (maintenance / blocked beds are not in the denominator).
 */
export interface OccupancyCounts {
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  maintenance_beds: number;
  blocked_beds: number;
  occupancy_pct: number;
}

/** Same as ROUND(occupied * 100.0 / (occupied + vacant), 2) in v_occupancy_summary. */
export function occupancyPct(occupied: number, vacant: number): number {
  const occupiable = occupied + vacant;
  return occupiable === 0 ? 0 : Math.round((occupied * 10000) / occupiable) / 100;
}

export function propertyOccupancyTotal(rows: OccupancyCounts[]): OccupancyCounts {
  const sum = (pick: (r: OccupancyCounts) => number) =>
    rows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);
  const occupied = sum((r) => r.occupied_beds);
  const vacant = sum((r) => r.vacant_beds);
  return {
    total_beds: sum((r) => r.total_beds),
    occupied_beds: occupied,
    vacant_beds: vacant,
    maintenance_beds: sum((r) => r.maintenance_beds),
    blocked_beds: sum((r) => r.blocked_beds),
    occupancy_pct: occupancyPct(occupied, vacant),
  };
}
