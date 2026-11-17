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

export const RESOLUTION_SUMMARY_MIN_LENGTH = 3;
export const RESOLUTION_SUMMARY_MAX_LENGTH = 2000;
export const RESOLUTION_SUMMARY_ERROR =
  "Please enter at least 3 characters for the resolution summary.";

// Length is counted in characters (code points), exactly like the database check, so an emoji is
// one character on both sides.
function summaryLength(value: string): number {
  return Array.from(value.trim()).length;
}

/** True when the trimmed summary is long enough to resolve a complaint (whitespace never counts). */
export function isValidResolutionSummary(value: string): boolean {
  return summaryLength(value) >= RESOLUTION_SUMMARY_MIN_LENGTH;
}

export const resolutionSchema = z.object({
  resolution_summary: z
    .string()
    .trim()
    .max(
      RESOLUTION_SUMMARY_MAX_LENGTH,
      `The resolution summary is too long (maximum ${RESOLUTION_SUMMARY_MAX_LENGTH} characters).`,
    )
    // refine() must come last: it returns a ZodEffects, which has no .max()
    .refine((v) => Array.from(v).length >= RESOLUTION_SUMMARY_MIN_LENGTH, RESOLUTION_SUMMARY_ERROR),
});

/** First user-friendly validation message for a summary, or null when it is valid. Never raw Zod/JSON. */
export function resolutionSummaryError(value: string): string | null {
  const parsed = resolutionSchema.safeParse({ resolution_summary: value });
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? RESOLUTION_SUMMARY_ERROR);
}

export const REOPEN_OVERRIDE_REASON_MIN_LENGTH = 10;
export const REOPEN_OVERRIDE_REASON_MAX_LENGTH = 1000;
export const REOPEN_OVERRIDE_REASON_ERROR = `Please enter at least ${REOPEN_OVERRIDE_REASON_MIN_LENGTH} characters explaining why this complaint is being reopened.`;

/** Mandatory reason for an Admin reopen override (the database enforces the same rule). */
export const reopenOverrideSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(
      REOPEN_OVERRIDE_REASON_MAX_LENGTH,
      `The reason is too long (maximum ${REOPEN_OVERRIDE_REASON_MAX_LENGTH} characters).`,
    )
    // refine() must come last: it returns a ZodEffects, which has no .max()
    .refine(
      (v) => Array.from(v).length >= REOPEN_OVERRIDE_REASON_MIN_LENGTH,
      REOPEN_OVERRIDE_REASON_ERROR,
    ),
});

/** First user-friendly validation message for an override reason, or null when it is valid. */
export function reopenOverrideReasonError(value: string): string | null {
  const parsed = reopenOverrideSchema.safeParse({ reason: value });
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? REOPEN_OVERRIDE_REASON_ERROR);
}

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
  CANCELLED: [],
  CLOSED: [],
};

/** Statuses with no supported workflow: hidden from status dropdowns (rows/values are kept). */
export const UNSUPPORTED_COMPLAINT_STATUSES = ["WAITING_FOR_STUDENT", "CANCELLED"] as const;

/** Manual status targets a Warden may pick from the details dialog (assign/reopen/close have their own paths). */
export const wardenStatusOptions = ["IN_PROGRESS", "RESOLVED"] as const;
