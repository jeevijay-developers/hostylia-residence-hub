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

/** The 4 manual status targets a Warden can pick from the complaint details dialog. */
export const wardenStatusOptions = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
