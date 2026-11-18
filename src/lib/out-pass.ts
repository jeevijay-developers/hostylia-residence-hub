import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

/**
 * Out-Pass for attendance, derived from the existing gate records
 * (fn_students_on_out_pass / fn_overdue_out_passes, migration 20261108090000):
 * a student is Out-Pass while an approved pass has an actual OUT gate event and
 * no IN event. Nothing here writes attendance rows or gate events.
 *
 * The functions are not in the generated types until types.ts is regenerated, and
 * both hooks fail soft (empty result) so attendance keeps working — just without
 * the Out-Pass layer — if the migration has not been applied yet.
 */

const outPassRowSchema = z.object({
  student_id: z.string().uuid(),
  gate_pass_id: z.string().uuid(),
  pass_number: z.string(),
  out_at: z.string(),
  expected_in_at: z.string(),
  is_overdue: z.boolean(),
  tz: z.string(),
});
export type OutPassRow = z.infer<typeof outPassRowSchema>;

const overdueRowSchema = z.object({
  gate_pass_id: z.string().uuid(),
  student_id: z.string().uuid(),
  full_name: z.string(),
  admission_number: z.string(),
  pass_number: z.string(),
  room_number: z.string().nullable(),
  bed_code: z.string().nullable(),
  out_at: z.string(),
  expected_in_at: z.string(),
  overdue_minutes: z.number(),
  tz: z.string(),
});
export type OverdueOutPass = z.infer<typeof overdueRowSchema>;

type RpcResult = { data: unknown; error: { message: string } | null };
function callRpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult> {
  const client = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  };
  return client.rpc(fn, args);
}

/** Students who are Out-Pass on `date` (property-local day), keyed by student id. */
export function useStudentsOnOutPass(propertyId: string | null, date: string) {
  return useQuery({
    queryKey: ["out-pass", "on-out-pass", propertyId, date],
    enabled: !!propertyId,
    // Departures / returns happen at the gate while this page is open.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await callRpc("fn_students_on_out_pass", {
        p_property_id: propertyId,
        p_date: date,
      });
      if (error) {
        console.warn("[out-pass] unavailable", error.message);
        return new Map<string, OutPassRow>();
      }
      const rows = z.array(outPassRowSchema).parse(data ?? []);
      return new Map(rows.map((r) => [r.student_id, r]));
    },
  });
}

/** Departed students whose expected return has passed with no return scan, oldest first. */
export function useOverdueOutPasses(propertyId: string | null) {
  return useQuery({
    queryKey: ["out-pass", "overdue", propertyId],
    enabled: !!propertyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await callRpc("fn_overdue_out_passes", { p_property_id: propertyId });
      if (error) {
        console.warn("[out-pass] overdue list unavailable", error.message);
        return [] as OverdueOutPass[];
      }
      return z.array(overdueRowSchema).parse(data ?? []);
    },
  });
}

/** "14 Nov, 06:30 pm" in the property's own timezone. */
export function formatGateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "2h 05m" / "45m" */
export function formatOverdue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
