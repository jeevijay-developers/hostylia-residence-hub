import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { csvRowSchema, type CsvRow } from "@/schemas/hostel";
import { subscriptionCancellationSchema } from "@/schemas/subscription";

/**
 * Bulk-import a Block→Floor→Room→Bed tree from CSV rows.
 * Server re-validates every row against the same rules as manual creation —
 * client-side parsing is not trusted.
 *
 * On success: creates/reuses blocks + floors by (property, name), then
 * inserts rooms with unique room_number and auto-generates `capacity` beds
 * per room (codes B1..Bn).
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
    const { tenant_id, property_id, rows } = data;

    // Group by block/floor for dedup
    const blockCache = new Map<string, string | null>(); // name -> id (or "" -> null)
    const floorCache = new Map<string, string>(); // `${blockId}|${floorName}` -> floor id
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const blockName = (row.block_name ?? "").trim();
        let blockId: string | null = null;
        if (blockName) {
          if (blockCache.has(blockName)) {
            blockId = blockCache.get(blockName)!;
          } else {
            const { data: existing } = await supabase
              .from("blocks")
              .select("id")
              .eq("property_id", property_id)
              .eq("name", blockName)
              .is("deleted_at", null)
              .maybeSingle();
            if (existing) {
              blockId = existing.id;
            } else {
              const { data: ins, error: bErr } = await supabase
                .from("blocks")
                .insert({ tenant_id, property_id, name: blockName })
                .select("id")
                .single();
              if (bErr) throw new Error(`block: ${bErr.message}`);
              blockId = ins.id;
            }
            blockCache.set(blockName, blockId);
          }
        }

        const floorKey = `${blockId ?? ""}|${row.floor_name}`;
        let floorId = floorCache.get(floorKey);
        if (!floorId) {
          const { data: existingF } = await supabase
            .from("floors")
            .select("id")
            .eq("property_id", property_id)
            .eq("name", row.floor_name)
            .is("deleted_at", null)
            .is("block_id", blockId as never)
            .maybeSingle();
          if (existingF) {
            floorId = existingF.id;
          } else {
            const { data: fIns, error: fErr } = await supabase
              .from("floors")
              .insert({
                tenant_id,
                property_id,
                block_id: blockId,
                name: row.floor_name,
                floor_number: row.floor_number ?? null,
              })
              .select("id")
              .single();
            if (fErr) throw new Error(`floor: ${fErr.message}`);
            floorId = fIns.id;
          }
          floorCache.set(floorKey, floorId);
        }

        const basePaise = row.base_rent != null ? Math.round(row.base_rent * 100) : null;
        const { data: room, error: rErr } = await supabase
          .from("rooms")
          .insert({
            tenant_id,
            property_id,
            block_id: blockId,
            floor_id: floorId,
            room_number: row.room_number,
            room_type: row.room_type,
            capacity: row.capacity,
            base_rent_paise: basePaise,
          })
          .select("id")
          .single();
        if (rErr) throw new Error(`room: ${rErr.message}`);

        const beds = Array.from({ length: row.capacity }, (_, k) => ({
          tenant_id,
          property_id,
          block_id: blockId,
          floor_id: floorId!,
          room_id: room.id,
          code: `B${k + 1}`,
        }));
        const { error: bedErr } = await supabase.from("beds").insert(beds);
        if (bedErr) throw new Error(`beds: ${bedErr.message}`);
      } catch (e) {
        errors.push({
          row: i + 1,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    return {
      inserted: rows.length - errors.length,
      failed: errors.length,
      errors,
    };
  });

/** Pre-flight validation only — surfaces errors before the user commits. */
export const validateCsvRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ rows: z.array(z.unknown()) }).parse(data))
  .handler(async ({ data }) => {
    const errors: { row: number; error: string }[] = [];
    const valid: CsvRow[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const parsed = csvRowSchema.safeParse(data.rows[i]);
      if (parsed.success) {
        valid.push(parsed.data);
      } else {
        errors.push({
          row: i + 1,
          error: parsed.error.issues.map((x) => x.message).join("; "),
        });
      }
    }
    return { valid, errors };
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
