import { blockCodeKey, blockNameKey, type CsvRow } from "@/schemas/hostel";

export interface ExistingStructure {
  /** Live blocks of the property. */
  blocks: { name: string; code: string | null }[];
  /** Room numbers (of the file's rooms) that already exist in the property. */
  roomNumbers: Set<string>;
}

/**
 * Checks that need more than one row, or the property's existing data, so the
 * import preview can show them as row-level errors before anything is written:
 * repeated / already-existing room numbers and block-code conflicts. These
 * mirror what the database enforces (uniq_rooms_property_number_active, the
 * block code index and fn_import_structure_row's code rule); the database
 * stays the authority.
 *
 * @param rows rows that already passed csvRowSchema, with their 1-based row number
 */
export function crossCheckStructureRows(
  rows: { row: number; data: CsvRow }[],
  existing: ExistingStructure,
): { errors: { row: number; error: string }[]; badRows: Set<number> } {
  const errors: { row: number; error: string }[] = [];
  const badRows = new Set<number>();
  const fail = (row: number, error: string) => {
    errors.push({ row, error });
    badRows.add(row);
  };

  const existingBlocks = new Map<string, string | null>(); // name key -> code key
  const existingCodes = new Map<string, string>(); // code key -> block name
  for (const blk of existing.blocks) {
    const codeKey = blockCodeKey(blk.code);
    existingBlocks.set(blockNameKey(blk.name), codeKey);
    if (codeKey) existingCodes.set(codeKey, blk.name);
  }

  const fileRooms = new Map<string, number>(); // room number -> first row
  const fileBlocks = new Map<string, { code: string | null; row: number }>();
  const fileCodes = new Map<string, string>(); // code key -> block name (new blocks in this file)

  for (const { row, data: r } of rows) {
    const firstRoom = fileRooms.get(r.room_number);
    if (firstRoom !== undefined) {
      fail(row, `room_number: Room ${r.room_number} is repeated (first used on row ${firstRoom})`);
    } else {
      fileRooms.set(r.room_number, row);
      if (existing.roomNumbers.has(r.room_number)) {
        fail(row, `room_number: Room ${r.room_number} already exists in this property`);
      }
    }

    if (r.block_name === "") continue;
    const nameKey = blockNameKey(r.block_name);
    const codeKey = blockCodeKey(r.block_code);
    if (existingBlocks.has(nameKey)) {
      const have = existingBlocks.get(nameKey) ?? null;
      if (codeKey && have && codeKey !== have) {
        fail(row, `block_code: Block "${r.block_name}" already exists with a different code`);
      }
    } else if (fileBlocks.has(nameKey)) {
      const first = fileBlocks.get(nameKey)!;
      if (codeKey && first.code && codeKey !== first.code) {
        fail(row, `block_code: Block "${r.block_name}" has a different code on row ${first.row}`);
      }
    } else if (codeKey && (existingCodes.has(codeKey) || fileCodes.has(codeKey))) {
      // First time this block appears and it does not exist yet: it will be created.
      fail(
        row,
        `block_code: Block Code "${r.block_code}" is already used by block "${existingCodes.get(codeKey) ?? fileCodes.get(codeKey)}"`,
      );
    } else {
      fileBlocks.set(nameKey, { code: codeKey, row });
      if (codeKey) fileCodes.set(codeKey, r.block_name);
    }
  }

  return { errors, badRows };
}
