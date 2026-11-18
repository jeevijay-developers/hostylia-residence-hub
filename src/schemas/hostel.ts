import { z } from "zod";

export const propertyTypeEnum = z.enum(["HOSTEL", "PG", "DORMITORY", "COACHING_HOSTEL"]);
export const genderPolicyEnum = z.enum(["MALE", "FEMALE", "COED", "CUSTOM"]);
export const propertyStatusEnum = z.enum(["DRAFT", "ACTIVE", "INACTIVE", "SUSPENDED"]);
export const roomTypeEnum = z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORM", "CUSTOM"]);
export const roomStatusEnum = z.enum(["ACTIVE", "BLOCKED", "MAINTENANCE", "INACTIVE"]);
export const bedStatusEnum = z.enum(["VACANT", "OCCUPIED", "BLOCKED", "MAINTENANCE"]);
export const blockStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);

export const propertyFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and dashes only"),
  property_type: propertyTypeEnum,
  gender_policy: genderPolicyEnum,
  address_line_1: z.string().trim().min(2).max(200),
  address_line_2: z.string().trim().max(200).optional().or(z.literal("")),
  landmark: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(3).max(20),
  country_code: z.string().trim().length(2).default("IN"),
  timezone: z.string().trim().min(2).max(64).default("Asia/Kolkata"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  logo_path: z.string().max(500).optional().or(z.literal("")),
});
export type PropertyFormInput = z.infer<typeof propertyFormSchema>;

// Normalization mirrors uniq_blocks_property_name_norm_active /
// uniq_blocks_property_code_norm_active (20261102120000): the database is the
// authority, these only give instant, field-level feedback and consistent CSV
// matching.
/** Trim and collapse runs of whitespace to one space (stored form). */
export function normalizeBlockName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
/** Case-insensitive, whitespace-normalized key for comparing block names. */
export function blockNameKey(name: string): string {
  return normalizeBlockName(name).toLowerCase();
}
/** Case-insensitive key for a block code; blank means "no code". */
export function blockCodeKey(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toLowerCase();
  return c === "" ? null : c;
}

// Field rules shared by the manual Add Block / Floor / Room forms and the CSV
// importer, so both paths accept and reject exactly the same values.
export const blockNameField = z
  .string()
  .trim()
  .min(1, "Block Name is required")
  .max(80, "Block Name can be at most 80 characters");
export const blockCodeField = z.string().trim().max(20, "Block Code can be at most 20 characters");
export const floorNameField = z
  .string()
  .trim()
  .min(1, "Floor Name is required")
  .max(80, "Floor Name can be at most 80 characters");
export const roomNumberField = z
  .string()
  .trim()
  .min(1, "Room Number is required")
  .max(40, "Room Number can be at most 40 characters");
/** CSV cells and number inputs arrive as strings; a blank one means "not supplied". */
const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);
/** Rent is typed in rupees everywhere (form + CSV) and stored as paise. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export const blockFormSchema = z.object({
  name: blockNameField,
  code: blockCodeField.optional().or(z.literal("")),
  gender_policy: genderPolicyEnum.optional(),
  status: blockStatusEnum.default("ACTIVE"),
  display_order: z.number().int().min(0).default(0),
});

export const floorFormSchema = z.object({
  block_id: z.string().uuid().nullable(),
  name: floorNameField,
  floor_number: z.number().int().optional(),
  display_order: z.number().int().min(0).default(0),
});

export type RoomType = z.infer<typeof roomTypeEnum>;

/** Room types whose capacity is fixed by the type itself. DORM/CUSTOM are entered manually. */
export const FIXED_ROOM_CAPACITY: Partial<Record<RoomType, number>> = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
};
export const MAX_ROOM_CAPACITY = 50;

export function fixedCapacityForType(type: RoomType): number | null {
  return FIXED_ROOM_CAPACITY[type] ?? null;
}

/**
 * Single source of truth for room type → capacity. Standard types derive
 * their capacity and reject a conflicting supplied value; DORM/CUSTOM require
 * an explicit positive whole-number capacity (never defaulted).
 */
export function resolveRoomCapacity(
  type: RoomType,
  supplied: number | null | undefined,
): { ok: true; capacity: number } | { ok: false; error: string } {
  const fixed = fixedCapacityForType(type);
  if (fixed !== null) {
    if (supplied != null && supplied !== fixed) {
      return {
        ok: false,
        error: `${type} rooms always have capacity ${fixed} (got ${supplied}). Leave capacity blank or use ${fixed}, or choose DORM/CUSTOM for a different capacity.`,
      };
    }
    return { ok: true, capacity: fixed };
  }
  if (supplied == null || !Number.isFinite(supplied)) {
    return { ok: false, error: `Capacity is required for ${type} rooms.` };
  }
  if (!Number.isInteger(supplied) || supplied < 1 || supplied > MAX_ROOM_CAPACITY) {
    return {
      ok: false,
      error: `Capacity for ${type} rooms must be a whole number from 1 to ${MAX_ROOM_CAPACITY}.`,
    };
  }
  return { ok: true, capacity: supplied };
}

/**
 * Guard for editing an existing room's type/capacity. Beds are never
 * created or deleted automatically for existing rooms, so the resulting
 * capacity must match the beds the room already has.
 */
export function checkRoomCapacityChange(input: {
  newType: RoomType;
  newCapacity: number | null | undefined;
  existingBedCount: number;
  occupiedBedCount: number;
}): { ok: true; capacity: number } | { ok: false; error: string } {
  const resolved = resolveRoomCapacity(input.newType, input.newCapacity);
  if (!resolved.ok) return resolved;
  if (resolved.capacity !== input.existingBedCount) {
    const occupied =
      input.occupiedBedCount > 0 ? ` (${input.occupiedBedCount} currently occupied)` : "";
    return {
      ok: false,
      error: `This room has ${input.existingBedCount} bed(s)${occupied}, so it cannot become ${input.newType} with capacity ${resolved.capacity}. Existing beds and allocations are not changed automatically.`,
    };
  }
  return resolved;
}

export const roomFormSchema = z
  .object({
    floor_id: z.string().uuid(),
    block_id: z.string().uuid().nullable(),
    room_number: roomNumberField,
    room_type: roomTypeEnum,
    capacity: z.number().int().min(1).max(MAX_ROOM_CAPACITY).nullable().optional(),
    base_rent_paise: z.number().int().min(0).nullable(),
    status: roomStatusEnum.default("ACTIVE"),
  })
  .superRefine((room, ctx) => {
    const r = resolveRoomCapacity(room.room_type, room.capacity);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacity"], message: r.error });
  });

/**
 * Manual Add Room. The block is not part of the input: it is the floor's block
 * (same as the CSV importer, which resolves block → floor → room).
 */
export const roomCreateSchema = z
  .object({
    floor_id: z.string().uuid(),
    room_number: roomNumberField,
    room_type: roomTypeEnum,
    capacity: z.number().int().min(1).max(MAX_ROOM_CAPACITY).nullable().optional(),
    base_rent_paise: z.number().int().min(0).nullable().optional(),
  })
  .superRefine((room, ctx) => {
    const r = resolveRoomCapacity(room.room_type, room.capacity);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacity"], message: r.error });
  });
export type RoomCreateInput = z.infer<typeof roomCreateSchema>;

/**
 * CSV row for the bulk importer — Block→Floor→Room→Bed tree. Same field rules
 * as the manual forms (see the shared fields above). A blank block_name means
 * "floor directly on the property"; block_code is optional but needs a block.
 */
export const csvRowSchema = z
  .object({
    block_name: z.string().optional(),
    block_code: blockCodeField.optional(),
    floor_name: floorNameField,
    floor_number: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ invalid_type_error: "Floor Number must be a number" })
        .int("Floor Number must be a whole number")
        .optional(),
    ),
    room_number: roomNumberField,
    room_type: roomTypeEnum,
    // Blank cell = not supplied (derived for SINGLE/DOUBLE/TRIPLE).
    capacity: z.preprocess(
      blankToUndefined,
      z.coerce.number({ invalid_type_error: "Capacity must be a number" }).optional(),
    ),
    base_rent: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ invalid_type_error: "Base Rent must be a number" })
        .min(0, "Base Rent cannot be negative")
        .optional(),
    ),
  })
  .superRefine((row, ctx) => {
    const blockName = normalizeBlockName(row.block_name ?? "");
    if (blockName.length > 80) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["block_name"],
        message: "Block Name can be at most 80 characters",
      });
    }
    if (blockName === "" && blockCodeKey(row.block_code) !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["block_code"],
        message: "Block Code needs a Block Name (leave both blank for floors without a block)",
      });
    }
    const r = resolveRoomCapacity(row.room_type, row.capacity);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacity"], message: r.error });
  })
  // Output carries the normalized block name/code and the validated capacity
  // that bed creation follows.
  .transform((row) => {
    const r = resolveRoomCapacity(row.room_type, row.capacity);
    return {
      ...row,
      block_name: normalizeBlockName(row.block_name ?? ""),
      block_code: blockCodeKey(row.block_code) === null ? "" : (row.block_code ?? "").trim(),
      capacity: r.ok ? r.capacity : 0,
    };
  });
export type CsvRow = z.infer<typeof csvRowSchema>;

/** Statuses an Admin / authorized Warden may set by hand. OCCUPIED is allocation-controlled. */
export const manualBedStatusEnum = z.enum(["VACANT", "MAINTENANCE", "BLOCKED"]);
export type ManualBedStatus = z.infer<typeof manualBedStatusEnum>;

/** Input for the manual bed status change (mirrors fn_set_bed_status's rules). */
export const bedStatusChangeSchema = z
  .object({
    bed_id: z.string().uuid(),
    new_status: manualBedStatusEnum,
    reason: z.string().trim().max(500).optional().or(z.literal("")),
    // YYYY-MM-DD from <input type="date">
    maintenance_until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.new_status === "VACANT") return;
    if (!v.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: `A reason is required to mark a bed ${v.new_status.toLowerCase()}.`,
      });
    }
    if (v.new_status === "MAINTENANCE" && !v.maintenance_until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maintenance_until"],
        message: "An expected completion date is required for maintenance.",
      });
    }
  });
export type BedStatusChangeInput = z.infer<typeof bedStatusChangeSchema>;
