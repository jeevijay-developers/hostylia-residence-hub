import { z } from "zod";

import { INDIAN_STATES, isValidTimeZone } from "@/lib/locations";

export const propertyTypeEnum = z.enum(["HOSTEL", "PG", "DORMITORY", "COACHING_HOSTEL"]);
export const genderPolicyEnum = z.enum(["MALE", "FEMALE", "COED", "CUSTOM"]);
export const propertyStatusEnum = z.enum(["DRAFT", "ACTIVE", "INACTIVE", "SUSPENDED"]);
export const roomTypeEnum = z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORM", "CUSTOM"]);
export const roomStatusEnum = z.enum(["ACTIVE", "BLOCKED", "MAINTENANCE", "INACTIVE"]);
export const bedStatusEnum = z.enum(["VACANT", "OCCUPIED", "BLOCKED", "MAINTENANCE"]);
export const blockStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);

/** Optional free text: blank is allowed, only the length is limited. */
const optionalText = (max: number, tooLong: string) =>
  z.string().trim().max(max, tooLong).optional().default("");

/**
 * Property details form (Add property wizard + Setup). Every message is written
 * for the person filling the form. The slug is not here: the server generates
 * it (createProperty) and it never changes afterwards, because the public
 * admission link is built from it. Branding (logo/colours) is not collected.
 * Rules that depend on more than one field (PIN format and state list for
 * India) live in propertyCrossFieldIssues so they show up even while other
 * fields are still empty.
 */
export const propertyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the property name")
    .min(2, "Property name must be at least 2 characters")
    .max(120, "Property name can be at most 120 characters")
    .regex(/\p{L}/u, "Property name must include letters, not just numbers"),
  property_type: z.enum(propertyTypeEnum.options, {
    errorMap: () => ({ message: "Choose the type of property" }),
  }),
  gender_policy: z.enum(genderPolicyEnum.options, {
    errorMap: () => ({ message: "Choose who can stay at this property" }),
  }),
  address_line_1: z
    .string()
    .trim()
    .min(1, "Enter the building and street address")
    .min(3, "The street address looks too short")
    .max(200, "Address line 1 can be at most 200 characters"),
  address_line_2: optionalText(200, "Address line 2 can be at most 200 characters"),
  landmark: optionalText(200, "Landmark can be at most 200 characters"),
  city: z
    .string()
    .trim()
    .min(1, "Enter the city")
    .min(2, "The city name looks too short")
    .max(100, "City can be at most 100 characters"),
  state: z
    .string()
    .trim()
    .min(1, "Choose the state")
    .min(2, "The state name looks too short")
    .max(100, "State can be at most 100 characters"),
  postal_code: z
    .string()
    .trim()
    .min(1, "Enter the PIN / postal code")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/, "Enter a valid PIN / postal code"),
  country_code: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Choose the country"),
  timezone: z
    .string()
    .trim()
    .min(1, "Choose the time zone")
    .refine(isValidTimeZone, "Choose a time zone from the list"),
  phone: z
    .string()
    .trim()
    .min(1, "Enter the property's phone number")
    .max(20, "Phone number is too long")
    .regex(/^\+?\d[\d\s-]{6,18}$/, "Enter a valid phone number, e.g. 98765 43210"),
  email: optionalText(255, "Email address is too long").refine(
    (v) => v === "" || z.string().email().safeParse(v).success,
    "Enter a valid email address, e.g. office@yourhostel.com",
  ),
});
export type PropertyFormInput = z.infer<typeof propertyFormSchema>;
export type PropertyFormField = keyof PropertyFormInput;

/** India-specific rules that need the country to decide. */
export function propertyCrossFieldIssues(
  v: Partial<Record<PropertyFormField, unknown>>,
): { path: PropertyFormField; message: string }[] {
  const issues: { path: PropertyFormField; message: string }[] = [];
  if (v.country_code !== "IN") return issues;
  const pin = typeof v.postal_code === "string" ? v.postal_code.trim() : "";
  if (pin && !/^[1-9]\d{5}$/.test(pin)) {
    issues.push({ path: "postal_code", message: "Enter a valid 6-digit PIN code, e.g. 324005" });
  }
  const state = typeof v.state === "string" ? v.state.trim() : "";
  if (state && !(INDIAN_STATES as readonly string[]).includes(state)) {
    issues.push({ path: "state", message: "Choose the state from the list" });
  }
  // Indian numbers: 10 digits, optionally written with +91 / 91 / a leading 0.
  const phone = typeof v.phone === "string" ? v.phone.trim() : "";
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const national =
      digits.length === 12 && digits.startsWith("91")
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith("0")
          ? digits.slice(1)
          : digits;
    if (national.length !== 10) {
      issues.push({
        path: "phone",
        message: "Enter a 10-digit phone number, e.g. 98765 43210",
      });
    }
  }
  return issues;
}

/** Server-side create input: the form plus the tenant it belongs to. */
export const propertyCreateSchema = propertyFormSchema
  .extend({ tenant_id: z.string().uuid("Your organization could not be identified") })
  .superRefine((v, ctx) => {
    for (const issue of propertyCrossFieldIssues(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
    }
  });
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

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
