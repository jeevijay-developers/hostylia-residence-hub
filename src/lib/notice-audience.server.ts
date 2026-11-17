/**
 * Custom-audience helpers for notices: who may target whom, which students are eligible, and how
 * individually selected students and whole blocks become one de-duplicated recipient list.
 *
 * Server-only (`*.server.ts`). Every function takes its Supabase clients as arguments and re-validates
 * every id against the tenant + property, so nothing the browser sends is trusted. Messages thrown as
 * `AudienceError` are safe to show to the user (no ids, no internals).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MAX_CUSTOM_BLOCKS, MAX_CUSTOM_STUDENTS } from "@/lib/notice-audience.constants";

type Client = SupabaseClient<Database>;

/** Eligible = a current resident: matches the notice_recipients validation trigger. */
export const ELIGIBLE_STUDENT_STATUSES = ["ACTIVE", "NOTICE_GIVEN"];
/** A student belongs to a block through their open, residing allocation. */
export const RESIDENT_ALLOCATION_STATUSES = ["ACTIVE", "NOTICE_GIVEN", "MOVE_OUT_INSPECTION"];

const CHUNK = 150;

export class AudienceError extends Error {}

export interface AudienceStudent {
  id: string;
  full_name: string;
  admission_number: string;
  profile_id: string | null;
  phone: string | null;
  email: string | null;
  block_id: string | null;
  block_name: string | null;
}

export interface ResolvedAudience {
  /** Unique students, individually selected and block-expanded together. */
  students: AudienceStudent[];
  individual: number;
  fromBlocks: number;
  /** Students that were selected both individually and through a block. */
  duplicates: number;
}

const STUDENT_COLUMNS = "id, full_name, admission_number, profile_id, phone, email";

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Who may compose a notice for this property: exactly the people the notices INSERT policy allows
 * (can_manage_notices). The property must also really belong to the tenant, because both ids come from
 * the browser and recipients are looked up by property.
 */
export async function assertPropertyInTenant(
  admin: Client,
  tenantId: string,
  propertyId: string,
): Promise<void> {
  const { data: prop, error } = await admin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!prop) throw new AudienceError("Property not found for this account");
}

export async function assertNoticeAudienceAccess(
  userClient: Client,
  admin: Client,
  userId: string,
  tenantId: string,
  propertyId: string,
): Promise<void> {
  await assertPropertyInTenant(admin, tenantId, propertyId);

  const { data: allowed, error } = await userClient.rpc("can_manage_notices", {
    _user_id: userId,
    _tenant_id: tenantId,
    _property_id: propertyId,
  });
  if (error) throw new Error(error.message);
  if (!allowed)
    throw new AudienceError("You do not have permission to send notices for this property");
}

/**
 * Block names of this tenant + property. With `selectableOnly` (used to validate a selection) a block
 * must also be active and not deleted - the same blocks the picker offers.
 */
async function fetchBlockNames(
  admin: Client,
  tenantId: string,
  propertyId: string,
  blockIds: string[],
  selectableOnly = false,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const part of chunks(blockIds)) {
    let query = admin
      .from("blocks")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("property_id", propertyId)
      .in("id", part);
    if (selectableOnly) query = query.is("deleted_at", null).eq("status", "ACTIVE");
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    for (const b of data ?? []) names.set(b.id, b.name);
  }
  return names;
}

/** Eligible students of this tenant + property, by id. Ineligible / foreign / unknown ids are simply absent. */
async function fetchEligibleStudents(
  admin: Client,
  tenantId: string,
  propertyId: string,
  ids: string[],
): Promise<Map<string, Omit<AudienceStudent, "block_id" | "block_name">>> {
  const found = new Map<string, Omit<AudienceStudent, "block_id" | "block_name">>();
  for (const part of chunks(ids)) {
    const { data, error } = await admin
      .from("students")
      .select(STUDENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("property_id", propertyId)
      .is("deleted_at", null)
      .in("status", ELIGIBLE_STUDENT_STATUSES)
      .in("id", part);
    if (error) throw new Error(error.message);
    for (const s of data ?? []) found.set(s.id, s);
  }
  return found;
}

async function fetchStudentBlocks(
  admin: Client,
  tenantId: string,
  propertyId: string,
  studentIds: string[],
): Promise<Map<string, string | null>> {
  const byStudent = new Map<string, string | null>();
  for (const part of chunks(studentIds)) {
    const { data, error } = await admin
      .from("allocations")
      .select("student_id, block_id")
      .eq("tenant_id", tenantId)
      .eq("property_id", propertyId)
      .is("deleted_at", null)
      .in("status", RESIDENT_ALLOCATION_STATUSES)
      .in("student_id", part);
    if (error) throw new Error(error.message);
    for (const a of data ?? []) byStudent.set(a.student_id, a.block_id);
  }
  return byStudent;
}

async function fetchStudentIdsInBlocks(
  admin: Client,
  tenantId: string,
  propertyId: string,
  blockIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const part of chunks(blockIds)) {
    const { data, error } = await admin
      .from("allocations")
      .select("student_id")
      .eq("tenant_id", tenantId)
      .eq("property_id", propertyId)
      .is("deleted_at", null)
      .in("status", RESIDENT_ALLOCATION_STATUSES)
      .in("block_id", part);
    if (error) throw new Error(error.message);
    for (const a of data ?? []) ids.add(a.student_id);
  }
  return [...ids];
}

/**
 * Validates and resolves a custom selection. STRICT: any individually selected student that is unknown,
 * from another tenant/property, deleted or no longer a current resident - and any block that is not an
 * active block of this property - rejects the whole request instead of being dropped silently. Blocks
 * expand to their eligible residents; the final list is de-duplicated by student id.
 */
export async function resolveCustomAudience(
  admin: Client,
  args: { tenantId: string; propertyId: string; studentIds: string[]; blockIds: string[] },
): Promise<ResolvedAudience> {
  const { tenantId, propertyId } = args;
  const studentIds = [...new Set(args.studentIds)];
  const blockIds = [...new Set(args.blockIds)];
  if (studentIds.length === 0 && blockIds.length === 0) {
    throw new AudienceError("Select at least one student or block");
  }
  if (studentIds.length > MAX_CUSTOM_STUDENTS || blockIds.length > MAX_CUSTOM_BLOCKS) {
    throw new AudienceError(
      `Too many recipients selected (maximum ${MAX_CUSTOM_STUDENTS} students and ${MAX_CUSTOM_BLOCKS} blocks)`,
    );
  }

  // Blocks: all must exist in this property.
  const blockNames = await fetchBlockNames(admin, tenantId, propertyId, blockIds, true);
  if (blockNames.size !== blockIds.length) {
    throw new AudienceError("One or more selected blocks are invalid or outside this property");
  }

  // Individually selected students: all must be eligible students of this property.
  const individual = await fetchEligibleStudents(admin, tenantId, propertyId, studentIds);
  if (individual.size !== studentIds.length) {
    throw new AudienceError(
      "One or more selected students are invalid, no longer eligible, or outside this property",
    );
  }

  // Blocks -> residents -> eligible students.
  const blockStudentIds = await fetchStudentIdsInBlocks(admin, tenantId, propertyId, blockIds);
  const fromBlocks = await fetchEligibleStudents(admin, tenantId, propertyId, blockStudentIds);

  const merged = new Map(individual);
  let duplicates = 0;
  for (const [id, s] of fromBlocks) {
    if (merged.has(id)) {
      if (individual.has(id)) duplicates++;
    } else merged.set(id, s);
  }

  const blockOf = await fetchStudentBlocks(admin, tenantId, propertyId, [...merged.keys()]);
  const missingNames = [...new Set([...blockOf.values()].filter((b): b is string => !!b))].filter(
    (b) => !blockNames.has(b),
  );
  if (missingNames.length > 0) {
    for (const [id, name] of await fetchBlockNames(admin, tenantId, propertyId, missingNames)) {
      blockNames.set(id, name);
    }
  }

  const students: AudienceStudent[] = [...merged.values()].map((s) => {
    const blockId = blockOf.get(s.id) ?? null;
    return {
      ...s,
      block_id: blockId,
      block_name: blockId ? (blockNames.get(blockId) ?? null) : null,
    };
  });
  return { students, individual: individual.size, fromBlocks: fromBlocks.size, duplicates };
}

/** Eligible students matching a search text (name or admission number) for the picker. */
export async function searchEligibleStudents(
  admin: Client,
  args: { tenantId: string; propertyId: string; q: string; limit: number },
): Promise<AudienceStudent[]> {
  // The text goes into a PostgREST filter: drop characters that have meaning there.
  const clean = args.q
    .replace(/[,()%*\\"]/g, " ")
    .trim()
    .slice(0, 60);
  let query = admin
    .from("students")
    .select(STUDENT_COLUMNS)
    .eq("tenant_id", args.tenantId)
    .eq("property_id", args.propertyId)
    .is("deleted_at", null)
    .in("status", ELIGIBLE_STUDENT_STATUSES);
  if (clean) query = query.or(`full_name.ilike.%${clean}%,admission_number.ilike.%${clean}%`);
  const { data, error } = await query.order("full_name", { ascending: true }).limit(args.limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const blockOf = await fetchStudentBlocks(
    admin,
    args.tenantId,
    args.propertyId,
    rows.map((r) => r.id),
  );
  const blockIds = [...new Set([...blockOf.values()].filter((b): b is string => !!b))];
  const names = await fetchBlockNames(admin, args.tenantId, args.propertyId, blockIds);
  return rows.map((s) => {
    const blockId = blockOf.get(s.id) ?? null;
    return { ...s, block_id: blockId, block_name: blockId ? (names.get(blockId) ?? null) : null };
  });
}

export interface AudienceBlock {
  id: string;
  name: string;
  /** Eligible residents currently in the block. */
  student_count: number;
}

/** Active blocks of the property with their eligible resident counts. */
export async function listAudienceBlocks(
  admin: Client,
  args: { tenantId: string; propertyId: string },
): Promise<AudienceBlock[]> {
  const { data: blocks, error } = await admin
    .from("blocks")
    .select("id, name")
    .eq("tenant_id", args.tenantId)
    .eq("property_id", args.propertyId)
    .is("deleted_at", null)
    .eq("status", "ACTIVE")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  const list = blocks ?? [];
  const counts = new Map<string, number>();
  if (list.length > 0) {
    const { data: allocs, error: aErr } = await admin
      .from("allocations")
      .select("student_id, block_id")
      .eq("tenant_id", args.tenantId)
      .eq("property_id", args.propertyId)
      .is("deleted_at", null)
      .in("status", RESIDENT_ALLOCATION_STATUSES)
      .in(
        "block_id",
        list.map((b) => b.id),
      );
    if (aErr) throw new Error(aErr.message);
    const rows = allocs ?? [];
    const eligible = await fetchEligibleStudents(admin, args.tenantId, args.propertyId, [
      ...new Set(rows.map((a) => a.student_id)),
    ]);
    for (const a of rows) {
      if (a.block_id && eligible.has(a.student_id)) {
        counts.set(a.block_id, (counts.get(a.block_id) ?? 0) + 1);
      }
    }
  }
  return list.map((b) => ({ id: b.id, name: b.name, student_count: counts.get(b.id) ?? 0 }));
}
