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

export const blockFormSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(20).optional().or(z.literal("")),
  gender_policy: genderPolicyEnum.optional(),
  status: blockStatusEnum.default("ACTIVE"),
  display_order: z.number().int().min(0).default(0),
});

export const floorFormSchema = z.object({
  block_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  floor_number: z.number().int().optional(),
  display_order: z.number().int().min(0).default(0),
});

export const roomFormSchema = z.object({
  floor_id: z.string().uuid(),
  block_id: z.string().uuid().nullable(),
  room_number: z.string().trim().min(1).max(40),
  room_type: roomTypeEnum,
  capacity: z.number().int().min(1).max(50),
  base_rent_paise: z.number().int().min(0).nullable(),
  status: roomStatusEnum.default("ACTIVE"),
});

/** CSV row for the bulk importer — Block→Floor→Room→Bed tree */
export const csvRowSchema = z.object({
  block_name: z.string().trim().max(80).optional().or(z.literal("")),
  floor_name: z.string().trim().min(1).max(80),
  floor_number: z.coerce.number().int().optional(),
  room_number: z.string().trim().min(1).max(40),
  room_type: roomTypeEnum,
  capacity: z.coerce.number().int().min(1).max(50),
  base_rent: z.coerce.number().min(0).optional(),
});
export type CsvRow = z.infer<typeof csvRowSchema>;
