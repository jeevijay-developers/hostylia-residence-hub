/**
 * Small formatting helpers for finance UI.
 */
export function formatInr(paise: number | null | undefined): string {
  const n = typeof paise === "number" ? paise : 0;
  const rupees = n / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function agingBucket(
  dueDate: string,
  today = new Date(),
): "current" | "0-30" | "31-60" | "60+" {
  const due = new Date(dueDate);
  const days = Math.floor((today.getTime() - due.getTime()) / (86400 * 1000));
  if (days <= 0) return "current";
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  return "60+";
}

export type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "VOID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

/**
 * Invoice status filter shown in the staff invoice lists. `value` IS the stored status — only the
 * label is friendlier — so choosing a filter always queries `invoices.status = value`. DRAFT is
 * deliberately not offered. (ALL = no status filter.)
 */
export const INVOICE_FILTER_OPTIONS = [
  { value: "ALL", label: "All Invoices" },
  { value: "ISSUED", label: "Payment Pending" },
  { value: "VOID", label: "Cancelled" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PARTIALLY_REFUNDED", label: "Partially Refunded" },
  { value: "REFUNDED", label: "Refunded" },
] as const;

export type InvoiceQueryFilter =
  { kind: "all" } | { kind: "outstanding" } | { kind: "status"; status: string };

/**
 * Maps a filter value onto the invoice query. Every dropdown value is a literal stored status.
 * "OUTSTANDING" (not in the dropdown) is kept only for the dashboard's Total Outstanding link: any
 * invoice still carrying a balance, regardless of status.
 */
export function resolveInvoiceFilter(value: string | undefined | null): InvoiceQueryFilter {
  if (!value || value === "ALL") return { kind: "all" };
  if (value === "OUTSTANDING") return { kind: "outstanding" };
  return { kind: "status", status: value };
}

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ISSUED: "bg-info/10 text-info",
  PARTIALLY_PAID: "bg-warning/10 text-warning",
  PAID: "bg-success/10 text-success",
  OVERDUE: "bg-destructive/10 text-destructive",
  VOID: "bg-muted text-muted-foreground line-through",
  PARTIALLY_REFUNDED: "bg-warning/10 text-warning",
  REFUNDED: "bg-muted text-muted-foreground",
};

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CANCELLED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

/** Friendly payment status labels (stored values are unchanged). */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  CREATED: "Created",
  PENDING: "Pending",
  AUTHORIZED: "Authorized",
  CAPTURED: "Successful",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
};

/** Money actually received: ONLY CAPTURED payments count. Failed/pending/cancelled never do. */
export function sumReceivedPaise(
  payments: ReadonlyArray<{ status: string; amount_paise: number }>,
) {
  return payments.reduce((sum, p) => (p.status === "CAPTURED" ? sum + p.amount_paise : sum), 0);
}

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  CREATED: "bg-muted text-muted-foreground",
  PENDING: "bg-warning/10 text-warning",
  AUTHORIZED: "bg-info/10 text-info",
  CAPTURED: "bg-success/10 text-success",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
  PARTIALLY_REFUNDED: "bg-warning/10 text-warning",
  REFUNDED: "bg-muted text-muted-foreground",
};
