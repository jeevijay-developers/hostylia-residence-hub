import { z } from "zod";

export const leaveStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type LeaveStatus = z.infer<typeof leaveStatusEnum>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

// Mirrors request_leave() in 20261102100000_student_leave_management.sql — the
// RPC re-validates everything (ownership, past dates, overlap) server-side.
export const leaveRequestSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    reason: z.string().trim().min(3, "Reason is required (at least 3 characters)").max(500),
    remarks: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date cannot be before the start date",
    path: ["end_date"],
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const leaveReviewSchema = z
  .object({
    request_id: z.string().uuid(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    rejection_reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => v.decision !== "REJECTED" || (v.rejection_reason ?? "").length >= 3, {
    message: "A rejection reason is required (at least 3 characters)",
    path: ["rejection_reason"],
  });
export type LeaveReviewInput = z.infer<typeof leaveReviewSchema>;

export const leaveRequestRowSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  start_date: isoDate,
  end_date: isoDate,
  reason: z.string(),
  remarks: z.string().nullable(),
  status: leaveStatusEnum,
  reviewed_at: z.string().nullable(),
  rejection_reason: z.string().nullable(),
  created_at: z.string(),
  students: z.object({ full_name: z.string(), admission_number: z.string() }).nullable().optional(),
});
export type LeaveRequestRow = z.infer<typeof leaveRequestRowSchema>;
