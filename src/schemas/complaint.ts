import { z } from "zod";

export const complaintPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const complaintStatusEnum = z.enum([
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_STUDENT",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
]);

export type ComplaintPriority = z.infer<typeof complaintPriorityEnum>;
export type ComplaintStatus = z.infer<typeof complaintStatusEnum>;

export const complaintFormSchema = z.object({
  category_id: z.string().uuid("Choose a category"),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(4000),
  priority: complaintPriorityEnum.optional(),
  is_anonymous: z.boolean().optional().default(false),
});
export type ComplaintFormInput = z.infer<typeof complaintFormSchema>;

export const resolutionSchema = z.object({
  resolution_summary: z.string().trim().min(3).max(2000),
});

export const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  rating_comment: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const complaintCommentSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(2000),
});
export type ComplaintCommentInput = z.infer<typeof complaintCommentSchema>;

/**
 * UX mirror of fn_complaint_validate_status_transition (the database trigger is the authority).
 * WAITING_FOR_STUDENT / CANCELLED have no workflow that enters them, so they only appear as
 * legacy sources; CLOSED is terminal and is reached only by the auto-close job.
 */
export const COMPLAINT_STATUS_TRANSITIONS: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "RESOLVED"],
  ASSIGNED: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  REOPENED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED"],
  WAITING_FOR_STUDENT: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["REOPENED", "CLOSED"],
  CANCELLED: ["REOPENED"],
  CLOSED: [],
};

/** Statuses with no supported workflow: hidden from status dropdowns (rows/values are kept). */
export const UNSUPPORTED_COMPLAINT_STATUSES = ["WAITING_FOR_STUDENT", "CANCELLED"] as const;

/** Manual status targets a Warden may pick from the details dialog (assign/reopen/close have their own paths). */
export const wardenStatusOptions = ["IN_PROGRESS", "RESOLVED"] as const;
