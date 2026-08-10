import { z } from "zod";

export const billingFrequencyEnum = z.enum([
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "ONE_TIME",
  "CUSTOM",
]);
export const componentTypeEnum = z.enum([
  "RENT",
  "MESS",
  "DEPOSIT",
  "MAINTENANCE",
  "ONE_TIME",
  "LATE_FEE",
  "OTHER",
]);
export const paymentModeEnum = z.enum([
  "UPI",
  "CARD",
  "NETBANKING",
  "CASH",
  "CHEQUE",
  "BANK_TRANSFER",
  "OTHER",
]);
export const refundModeEnum = z.enum(["ORIGINAL_METHOD", "BANK_TRANSFER", "CASH", "OTHER"]);

export const feePlanComponentSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80),
    component_type: componentTypeEnum,
    amount_paise: z.number().int().min(0),
    // Zero-amount components are invalid by default — they're almost always
    // a forgotten amount rather than a deliberate free line item. This flag
    // is the explicit opt-in and is persisted (fee_plan_components.allow_zero_amount)
    // so re-editing a legitimately-zero component doesn't immediately fail
    // validation again.
    allow_zero_amount: z.boolean().default(false),
    is_refundable: z.boolean().default(false),
    is_taxable: z.boolean().default(false),
    tax_rate_basis_points: z.number().int().min(0).max(10000).default(0),
  })
  .refine((c) => c.allow_zero_amount || c.amount_paise > 0, {
    message:
      'Amount must be greater than 0 — enable "Allow zero amount" for an intentional zero-charge component',
    path: ["amount_paise"],
  });

export const feePlanFormSchema = z.object({
  id: z.string().uuid().optional(),
  property_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40),
  billing_frequency: billingFrequencyEnum,
  due_day: z.number().int().min(1).max(28),
  grace_period_days: z.number().int().min(0).max(30).default(0),
  late_fee_type: z.enum(["NONE", "FIXED", "PERCENTAGE"]).default("NONE"),
  late_fee_value: z.number().int().min(0).default(0),
  effective_from: z.string().date(),
  effective_until: z.string().date().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("DRAFT"),
  components: z.array(feePlanComponentSchema).min(1),
});
export type FeePlanFormInput = z.infer<typeof feePlanFormSchema>;

export const recordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  mode: z.enum(["CASH", "CHEQUE", "BANK_TRANSFER", "UPI", "OTHER"]),
  amount_paise: z.number().int().min(1),
  offline_reference: z.string().trim().max(120).optional().or(z.literal("")),
  cheque_date: z.string().date().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const initiateRefundSchema = z.object({
  payment_id: z.string().uuid(),
  amount_paise: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
  mode: refundModeEnum,
});

export const approveRefundSchema = z.object({
  refund_id: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const createRazorpayOrderSchema = z.object({
  invoice_id: z.string().uuid(),
});

export const createInvoiceSchema = z.object({
  allocation_id: z.string().uuid(),
  billing_period_start: z.string().date(),
  billing_period_end: z.string().date(),
  due_date: z.string().date(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// Issued invoices are never silently edited (CLAUDE.md money rules) — only
// due_date/notes are correctable here; amounts require void + reissue.
export const editInvoiceSchema = z.object({
  invoice_id: z.string().uuid(),
  due_date: z.string().date(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type EditInvoiceInput = z.infer<typeof editInvoiceSchema>;
