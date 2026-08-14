import { z } from "zod";

export const supportTicketCategorySchema = z.enum([
  "TECHNICAL_ISSUE",
  "LOGIN_AUTH",
  "FINANCE_BILLING",
  "GATE_PASS",
  "ATTENDANCE",
  "COMPLAINTS",
  "REPORTS",
  "STUDENT_MANAGEMENT",
  "OTHER",
]);
export type SupportTicketCategory = z.infer<typeof supportTicketCategorySchema>;

export const SUPPORT_TICKET_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  TECHNICAL_ISSUE: "Technical Issue",
  LOGIN_AUTH: "Login/Authentication",
  FINANCE_BILLING: "Finance/Billing",
  GATE_PASS: "Gate Pass",
  ATTENDANCE: "Attendance",
  COMPLAINTS: "Complaints",
  REPORTS: "Reports",
  STUDENT_MANAGEMENT: "Student Management",
  OTHER: "Other",
};

export const supportTicketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export type SupportTicketPriority = z.infer<typeof supportTicketPrioritySchema>;

export const supportTicketStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_ADMIN",
  "RESOLVED",
  "CLOSED",
]);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

export const SUPPORT_TICKET_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_ADMIN: "Waiting for Admin",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Hostel Admin's "raise a Hostylia Support ticket" form. */
export const createSupportTicketSchema = z.object({
  tenant_id: z.string().uuid(),
  subject: z.string().trim().min(3, "Enter a subject").max(200),
  category: supportTicketCategorySchema,
  priority: supportTicketPrioritySchema.default("MEDIUM"),
  description: z.string().trim().min(10, "Describe the issue (min 10 characters)").max(5000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const addSupportTicketMessageSchema = z.object({
  ticket_id: z.string().uuid(),
  message: z.string().trim().min(1).max(5000),
  is_internal_note: z.boolean().default(false),
});
export type AddSupportTicketMessageInput = z.infer<typeof addSupportTicketMessageSchema>;
