import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { leaveRequestSchema, leaveReviewSchema } from "@/schemas/leave";

// request_leave / review_leave_request are SECURITY DEFINER RPCs that do the
// real checks (ownership, scope, overlap, attendance reconciliation). They are
// not in the generated Database types until types.ts is regenerated after the
// migration is applied, hence the `as never` casts on name/args.

/** Student submits a full-day leave request for their own active stay. */
export const requestLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => leaveRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc(
      "request_leave" as never,
      {
        p_start_date: data.start_date,
        p_end_date: data.end_date,
        p_reason: data.reason,
        p_remarks: data.remarks || null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Authorized Warden/Admin approves or rejects a pending request. */
export const reviewLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => leaveReviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc(
      "review_leave_request" as never,
      {
        p_request_id: data.request_id,
        p_decision: data.decision,
        p_rejection_reason: data.rejection_reason || null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
