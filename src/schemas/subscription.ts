import { z } from "zod";

export const cancellationReasonSchema = z.enum([
  "TOO_EXPENSIVE",
  "MISSING_FEATURES",
  "DIFFICULT_TO_USE",
  "PERFORMANCE_ISSUE",
  "SWITCHING_SOLUTION",
  "BUSINESS_CLOSED",
  "TEMPORARY_REQUIREMENT",
  "OTHER",
]);

export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  TOO_EXPENSIVE: "Too expensive",
  MISSING_FEATURES: "Missing required features",
  DIFFICULT_TO_USE: "Difficult to use",
  PERFORMANCE_ISSUE: "Performance issue",
  SWITCHING_SOLUTION: "Switching to another solution",
  BUSINESS_CLOSED: "Hostel/business closed",
  TEMPORARY_REQUIREMENT: "Temporary requirement",
  OTHER: "Other",
};

/**
 * Hostel Admin's "cancel subscription" feedback form — reused by the client
 * form and the `cancelMySubscription` server function's validator.
 */
export const subscriptionCancellationSchema = z
  .object({
    tenant_id: z.string().uuid(),
    cancellation_reason: cancellationReasonSchema,
    cancellation_reason_other: z.string().trim().max(500).optional(),
    continue_in_future: z.boolean(),
    additional_feedback: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.cancellation_reason !== "OTHER" || !!d.cancellation_reason_other?.length, {
    message: "Please describe your reason",
    path: ["cancellation_reason_other"],
  });

export type SubscriptionCancellationInput = z.infer<typeof subscriptionCancellationSchema>;
