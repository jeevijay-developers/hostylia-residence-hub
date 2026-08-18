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
