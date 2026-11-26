import { z } from "zod";

// URL search-param schemas for the staff pages that the Warden and Accountant
// routes share. They live outside src/routes/ on purpose: a route file that
// imports `validateSearch` from another route file pulls that whole page (and
// everything it imports) into the eagerly loaded main bundle, defeating
// TanStack Router's per-route code splitting for every visitor.

/** Lets the Daily Brief's Present/Absent cards open the attendance page pre-filtered. */
export const attendanceSearchSchema = z.object({
  status: z.enum(["PRESENT", "ABSENT", "LATE", "ON_LEAVE", "OUT_PASS"]).optional(),
});

/** `complaintId` lets a notification open that complaint's details directly. */
export const complaintsSearchSchema = z.object({
  status: z.literal("PENDING").optional(),
  complaintId: z.string().uuid().optional(),
});

/** Lets the Daily Brief's Visitors Today card open the visitors tab scoped to today. */
export const gateSearchSchema = z.object({ view: z.literal("visitors-today").optional() });
