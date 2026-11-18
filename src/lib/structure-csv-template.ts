import { toCsv, type CsvColumn } from "@/lib/csv";

/**
 * Sample file for the Property Structure CSV import. The columns are exactly
 * what the importer reads (csvRowSchema), in the documented order; the rows
 * import as-is into an empty property (each room number is unique, every
 * relationship Block → Floor → Room is shown, and capacity follows the
 * SINGLE=1 / DOUBLE=2 / TRIPLE=3 rule, left blank where it is derived).
 */
export interface StructureCsvSampleRow extends Record<string, unknown> {
  block_name: string;
  block_code: string;
  floor_name: string;
  floor_number: string;
  room_number: string;
  room_type: string;
  capacity: string;
  base_rent: string;
}

export const STRUCTURE_CSV_COLUMNS: CsvColumn<StructureCsvSampleRow>[] = [
  { key: "block_name", label: "block_name" },
  { key: "block_code", label: "block_code" },
  { key: "floor_name", label: "floor_name" },
  { key: "floor_number", label: "floor_number" },
  { key: "room_number", label: "room_number" },
  { key: "room_type", label: "room_type" },
  { key: "capacity", label: "capacity" },
  { key: "base_rent", label: "base_rent" },
];

export const STRUCTURE_CSV_SAMPLE_ROWS: StructureCsvSampleRow[] = [
  // A block whose name contains a comma: the cell is quoted in the file.
  {
    block_name: "Block A, North Wing",
    block_code: "A",
    floor_name: "Ground Floor",
    floor_number: "0",
    room_number: "A-101",
    room_type: "SINGLE",
    capacity: "",
    base_rent: "9000",
  },
  // Same block + floor: reused, not duplicated.
  {
    block_name: "Block A, North Wing",
    block_code: "A",
    floor_name: "Ground Floor",
    floor_number: "0",
    room_number: "A-102",
    room_type: "DOUBLE",
    capacity: "",
    base_rent: "7500",
  },
  {
    block_name: "Block A, North Wing",
    block_code: "A",
    floor_name: "First Floor",
    floor_number: "1",
    room_number: "A-201",
    room_type: "TRIPLE",
    capacity: "",
    base_rent: "6000",
  },
  // Quotes inside a name are doubled; DORM / CUSTOM need an explicit capacity.
  {
    block_name: 'Block "B" (Girls)',
    block_code: "B",
    floor_name: "Ground Floor",
    floor_number: "0",
    room_number: "B-101",
    room_type: "DORM",
    capacity: "6",
    base_rent: "4500",
  },
  {
    block_name: 'Block "B" (Girls)',
    block_code: "B",
    floor_name: "Ground Floor",
    floor_number: "0",
    room_number: "B-102",
    room_type: "CUSTOM",
    capacity: "4",
    base_rent: "",
  },
  // No block: the floor sits directly on the property. Capacity may match the type.
  {
    block_name: "",
    block_code: "",
    floor_name: "Terrace",
    floor_number: "",
    room_number: "T-1",
    room_type: "DOUBLE",
    capacity: "2",
    base_rent: "6500",
  },
];

export const STRUCTURE_CSV_FILENAME = "property-structure-import-template.csv";

export function buildStructureTemplateCsv(): string {
  return toCsv(STRUCTURE_CSV_SAMPLE_ROWS, STRUCTURE_CSV_COLUMNS) + "\n";
}
