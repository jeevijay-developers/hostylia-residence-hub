import { z } from "zod";

export const publicLeadSchema = z
  .object({
    kind: z.enum(["contact", "demo"]),
    captchaToken: z.string().trim().min(1).max(2048),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    propertyName: z.string().trim().max(160).optional().or(z.literal("")),
    beds: z.string().trim().max(40).optional().or(z.literal("")),
    message: z.string().trim().max(4000).optional().or(z.literal("")),
    city: z.string().trim().max(80).optional().or(z.literal("")),
    propertyType: z.string().trim().max(80).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "contact" && !value.message) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "Message is required",
      });
    }
    if (value.kind === "demo" && !value.propertyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["propertyName"],
        message: "Property name is required",
      });
    }
  });

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;
