import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  bedStatusChangeSchema,
  csvRowSchema,
  resolveRoomCapacity,
  rupeesToPaise,
  roomCreateSchema,
  type CsvRow,
} from "@/schemas/hostel";
import { crossCheckStructureRows } from "@/lib/structure-csv-validate";
import { subscriptionCancellationSchema } from "@/schemas/subscription";

/**
 * Calls a database function that is not in the generated Supabase types yet
 * (src/integrations/supabase/types.ts is regenerated from the live schema after
 * migrations are applied; once it includes these functions the cast here can
 * be dropped in favour of a plain `supabase.rpc(...)`).
 */
async function callRpc(
  supabase: object,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  return await client.rpc(fn, args);
}

/**
 * Bulk-import a Block→Floor→Room→Bed tree from CSV rows.
 * Server re-validates every row against the same rules as manual creation —
 * client-side parsing is not trusted.
 *
 * Each row is ONE call to `fn_import_structure_row`, i.e. one database
 * transaction: it creates/reuses the block and floor, inserts the room and
 * generates its `capacity` beds (B1..Bn) — or, if any step fails, rolls back
 * everything that row did and nothing else. Rows are independent: a failed row
 * never undoes earlier rows (including blocks/floors they created and later
 * rows reuse). The tenant is derived from the property inside the function, so
 * the client-supplied `tenant_id` is not trusted or used.
 */
const importInputSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  rows: z.array(csvRowSchema).min(1).max(2000),
});

export const bulkImportStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => importInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { property_id, rows } = data;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { error } = await callRpc(supabase, "fn_import_structure_row", {
        p_property_id: property_id,
        p_block_name: row.block_name,
        p_block_code: row.block_code,
        p_floor_name: row.floor_name,
        p_floor_number: row.floor_number ?? null,
        p_room_number: row.room_number,
        p_room_type: row.room_type,
        p_capacity: row.capacity,
        p_base_rent_paise: row.base_rent != null ? rupeesToPaise(row.base_rent) : null,
      });
      if (error) errors.push({ row: i + 1, error: error.message });
    }

    return {
      inserted: rows.length - errors.length,
      failed: errors.length,
      errors,
    };
  });

/**
 * Pre-flight validation only — surfaces errors before the user commits. Runs
 * the same schema as the import plus the cross-row / existing-data checks the
 * database would reject later (duplicate rooms, block code clashes), so the
 * preview shows them as row-level errors. The database remains the authority.
 */
export const validateCsvRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ rows: z.array(z.unknown()), property_id: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const errors: { row: number; error: string }[] = [];
    const parsedRows: { row: number; data: CsvRow }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const parsed = csvRowSchema.safeParse(data.rows[i]);
      if (parsed.success) {
        parsedRows.push({ row: i + 1, data: parsed.data });
      } else {
        errors.push({
          row: i + 1,
          error: parsed.error.issues
            .map((x) => (x.path.length ? `${x.path.join(".")}: ${x.message}` : x.message))
            .join("; "),
        });
      }
    }

    // Existing data in the property (RLS-scoped to what the caller can see).
    const existingBlocks: { name: string; code: string | null }[] = [];
    const existingRoomNumbers = new Set<string>();
    if (data.property_id && parsedRows.length > 0) {
      const { supabase } = context;
      const { data: blocks } = await supabase
        .from("blocks")
        .select("name, code")
        .eq("property_id", data.property_id)
        .is("deleted_at", null);
      existingBlocks.push(...(blocks ?? []));
      const numbers = [...new Set(parsedRows.map((r) => r.data.room_number))];
      for (let i = 0; i < numbers.length; i += 200) {
        const { data: rooms } = await supabase
          .from("rooms")
          .select("room_number")
          .eq("property_id", data.property_id)
          .is("deleted_at", null)
          .in("room_number", numbers.slice(i, i + 200));
        for (const room of rooms ?? []) existingRoomNumbers.add(room.room_number);
      }
    }

    const cross = crossCheckStructureRows(parsedRows, {
      blocks: existingBlocks,
      roomNumbers: existingRoomNumbers,
    });
    errors.push(...cross.errors);
    errors.sort((x, y) => x.row - y.row);
    return {
      valid: parsedRows.filter((r) => !cross.badRows.has(r.row)).map((r) => r.data),
      errors,
    };
  });

// -------- Manual Add Room (same rules + same DB function as CSV import) --------

/**
 * Creates a room and its B1..Bn beds in one transaction via
 * fn_create_room_with_beds — the function the CSV importer also uses — so a
 * manually added room is identical to an imported one.
 */
export const createRoomWithBeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => roomCreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Standard types derive their capacity; DORM/CUSTOM were validated as required.
    const resolved = resolveRoomCapacity(data.room_type, data.capacity);
    if (!resolved.ok) throw new Error(resolved.error);
    const { data: out, error } = await callRpc(context.supabase, "fn_create_room_with_beds", {
      p_floor_id: data.floor_id,
      p_room_number: data.room_number,
      p_room_type: data.room_type,
      p_capacity: resolved.capacity,
      p_base_rent_paise: data.base_rent_paise ?? null,
    });
    if (error) throw new Error(error.message);
    return out as { room_id: string; beds: number };
  });

// -------- Hostel Admin self-service subscription cancellation --------

/**
 * Cancels the calling Hostel Admin's own tenant's ACTIVE subscription and
 * persists their cancellation feedback. All authorization and the actual
 * writes happen inside `fn_cancel_own_subscription` (a SECURITY DEFINER
 * Postgres function, not a raw client mutation) — this server function is a
 * thin, Zod-validated wrapper, same shape as `assignHostelAdmin` calling
 * `fn_assign_hostel_admin`.
 */
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => subscriptionCancellationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("fn_cancel_own_subscription", {
      p_tenant_id: data.tenant_id,
      p_cancellation_reason: data.cancellation_reason,
      p_cancellation_reason_other: data.cancellation_reason_other || undefined,
      p_continue_in_future: data.continue_in_future,
      p_additional_feedback: data.additional_feedback || undefined,
    });
    if (error) throw new Error(error.message);
    return out as { subscription_id: string; cancelled_at: string };
  });

// -------- Bed status management (Admin / Warden with rooms_beds_edit) --------

/**
 * VACANT <-> MAINTENANCE / BLOCKED. All authorization, locking and rules
 * (no open allocation, reason + date required, valid transitions) live in
 * fn_set_bed_status and the bed-status trigger — this is only a Zod-validated
 * wrapper, same shape as cancelMySubscription above.
 */
export const setBedStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => bedStatusChangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await callRpc(context.supabase, "fn_set_bed_status", {
      p_bed_id: data.bed_id,
      p_new_status: data.new_status,
      p_reason: data.reason?.trim() || null,
      p_maintenance_until:
        data.new_status === "MAINTENANCE" ? data.maintenance_until || null : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
