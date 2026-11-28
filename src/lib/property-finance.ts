import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { IST_TIME_ZONE } from "@/lib/ist";

/**
 * Data for a property's Finance tab. Plain RLS reads (the caller's own
 * session — RLS is the boundary), every query scoped by `property_id`.
 * Aggregates read their rows in 1000-row pages so PostgREST's row cap never
 * silently truncates a total; lists are paged in the database.
 *
 * Months and "today" are Indian Standard Time, whatever the browser's zone.
 *
 * "Collected" = CAPTURED payments that are not simulated test payments — the
 * rule the dashboard/reports use. Manual payments carry provider = NULL, so
 * the filter is written as `provider IS NULL OR provider <> 'simulated'`
 * (the SQL reports' `IS DISTINCT FROM 'simulated'`); a bare `neq` would drop
 * every cash/UPI/cheque payment recorded by staff.
 */

const STALE = 60_000;
const PAGE = 1000;
const NOT_SIMULATED = "provider.is.null,provider.neq.simulated";

/**
 * Invoice statuses that can still carry a balance. A partial refund re-opens
 * the balance (fn_recompute_invoice: total - (paid - refunded)), and the
 * invoice stays PARTIALLY_REFUNDED until it falls overdue, so it counts too —
 * the same definition of "pending" the collection reports use.
 */
const OPEN_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "OVERDUE"];
/** Refund requests that are live or done; rejected / cancelled / failed / drafts are not counted. */
const COUNTED_REFUND_STATUSES = [
  "PENDING_VERIFICATION",
  "PENDING_APPROVAL",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
];
const AWAITING_REFUND_STATUSES = ["PENDING_VERIFICATION", "PENDING_APPROVAL"];

/* ------------------------------------------------------------------ IST dates */

const istDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** IST calendar date of an instant, "YYYY-MM-DD". */
function istDate(d: Date = new Date()): string {
  return istDateFmt.format(d);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First instant of an IST month, `offset` months from the current IST month. */
function istMonthStart(offset: number, now: Date) {
  const [y, m] = istDate(now).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  return {
    year,
    month,
    start: new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`),
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

function monthKey(now = new Date()) {
  return istDate(now).slice(0, 7);
}

const dayLabelFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** "5 Jan" for an ISO date. */
function shortDate(iso: string) {
  return dayLabelFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/* ------------------------------------------------------------------ collections */

export type FinanceRange = "this-month" | "last-month";

export interface TrendPoint {
  label: string;
  dailyPaise: number;
  cumulativePaise: number;
}

export interface BreakdownSlice {
  key: string;
  label: string;
  paise: number;
}

export interface FinanceCollections {
  totalPaise: number;
  /**
   * Same elapsed span one month earlier (month to date vs the same days last
   * month). Only computed for "this-month"; 0 for "last-month".
   */
  previousPaise: number;
  /**
   * Rounded % change vs `previousPaise`; null when last month had nothing to
   * compare with, and always null for "last-month".
   */
  deltaPct: number | null;
  points: TrendPoint[];
  /** Collected amounts grouped by the paid invoice's fee plan, largest first. */
  breakdown: BreakdownSlice[];
  paymentCount: number;
}

interface CollectedRow {
  id: string;
  amount_paise: number;
  paid_at: string | null;
  invoice_id: string | null;
  invoices: { fee_plan_id: string | null; fee_plans: { name: string } | null } | null;
}

async function fetchCollected(propertyId: string, from: Date, to: Date) {
  const rows: CollectedRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("payments")
      .select("id, amount_paise, paid_at, invoice_id, invoices(fee_plan_id, fee_plans(name))")
      .eq("property_id", propertyId)
      .eq("status", "CAPTURED")
      .or(NOT_SIMULATED)
      .gte("paid_at", from.toISOString())
      .lt("paid_at", to.toISOString())
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error("We couldn't load collections. Please try again.");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Captured collections for this or last IST month: total, delta, a running
 * total per day and the fee-plan breakdown. Collections only — no expense
 * data exists, so none of this is P&L.
 */
export function usePropertyCollections(propertyId: string, range: FinanceRange) {
  return useQuery({
    queryKey: ["property-finance", propertyId, "collections", range, monthKey()],
    staleTime: STALE,
    // No placeholder data: the trend card's wording follows `range` at once,
    // so it must show a skeleton — not the other month's figures — while loading.
    queryFn: async (): Promise<FinanceCollections> => {
      const now = new Date();
      const isCurrent = range === "this-month";
      const cur = istMonthStart(isCurrent ? 0 : -1, now);
      const next = istMonthStart(isCurrent ? 1 : 0, now);
      const curEnd = isCurrent ? now : next.start;

      // The month-to-date comparison only feeds the MTD KPI delta, so it is
      // read for the current month only.
      const comparePrev = async (): Promise<CollectedRow[]> => {
        if (!isCurrent) return [];
        const prev = istMonthStart(-1, now);
        const prevEnd = new Date(
          Math.min(
            prev.start.getTime() + (now.getTime() - cur.start.getTime()),
            cur.start.getTime(),
          ),
        );
        return fetchCollected(propertyId, prev.start, prevEnd);
      };

      const [curRows, prevRows] = await Promise.all([
        fetchCollected(propertyId, cur.start, curEnd),
        comparePrev(),
      ]);

      const byDay = new Map<string, number>();
      const groups = new Map<string, BreakdownSlice>();
      for (const r of curRows) {
        if (r.paid_at) {
          const key = istDate(new Date(r.paid_at));
          byDay.set(key, (byDay.get(key) ?? 0) + r.amount_paise);
        }
        const plan = r.invoices?.fee_plans?.name?.trim();
        const g = !r.invoice_id
          ? { key: "unlinked", label: "Not linked to an invoice" }
          : plan && r.invoices?.fee_plan_id
            ? { key: `plan-${r.invoices.fee_plan_id}`, label: plan }
            : { key: "manual", label: "Manual invoices" };
        const slot = groups.get(g.key) ?? { ...g, paise: 0 };
        slot.paise += r.amount_paise;
        groups.set(g.key, slot);
      }

      const mm = String(cur.month).padStart(2, "0");
      const lastDay = isCurrent ? Number(istDate(now).slice(8, 10)) : cur.days;
      const points: TrendPoint[] = [];
      let running = 0;
      for (let d = 1; d <= lastDay; d++) {
        const date = `${cur.year}-${mm}-${String(d).padStart(2, "0")}`;
        const daily = byDay.get(date) ?? 0;
        running += daily;
        points.push({ label: shortDate(date), dailyPaise: daily, cumulativePaise: running });
      }

      const totalPaise = curRows.reduce((s, r) => s + r.amount_paise, 0);
      const previousPaise = prevRows.reduce((s, r) => s + r.amount_paise, 0);
      return {
        totalPaise,
        previousPaise,
        deltaPct:
          previousPaise > 0
            ? Math.round(((totalPaise - previousPaise) / previousPaise) * 100)
            : null,
        points,
        breakdown: [...groups.values()].sort((a, b) => b.paise - a.paise),
        paymentCount: curRows.length,
      };
    },
  });
}

/* ------------------------------------------------------------------ dues */

export interface DuesSummary {
  /** Sum of balance_paise over open invoices. */
  pendingPaise: number;
  pendingResidents: number;
  openInvoices: number;
  /** Open invoices due today … today + 6 (IST). Already-overdue ones are not included. */
  weekPaise: number;
  weekResidents: number;
  weekEnd: string;
  /** Open invoices whose due date has passed. */
  overduePaise: number;
}

/** Outstanding balances on open (issued / partially paid / partially refunded / overdue) invoices. */
export function usePropertyDuesSummary(propertyId: string) {
  const today = istDate();
  return useQuery({
    queryKey: ["property-finance", propertyId, "dues-summary", today],
    staleTime: STALE,
    queryFn: async (): Promise<DuesSummary> => {
      const rows: { id: string; student_id: string; balance_paise: number; due_date: string }[] =
        [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from("invoices")
          .select("id, student_id, balance_paise, due_date")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .in("status", OPEN_INVOICE_STATUSES)
          .gt("balance_paise", 0)
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error("We couldn't load outstanding dues. Please try again.");
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      const weekEnd = addDays(today, 6);
      const all = new Set<string>();
      const week = new Set<string>();
      let pendingPaise = 0;
      let weekPaise = 0;
      let overduePaise = 0;
      for (const r of rows) {
        pendingPaise += r.balance_paise;
        all.add(r.student_id);
        const due = r.due_date.slice(0, 10);
        if (due < today) {
          overduePaise += r.balance_paise;
        } else if (due <= weekEnd) {
          weekPaise += r.balance_paise;
          week.add(r.student_id);
        }
      }
      return {
        pendingPaise,
        pendingResidents: all.size,
        openInvoices: rows.length,
        weekPaise,
        weekResidents: week.size,
        weekEnd,
        overduePaise,
      };
    },
  });
}

export const DUES_PAGE = 5;

export interface DueRow {
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  name: string;
  room: string | null;
  balancePaise: number;
  dueDate: string;
}

/** Open invoices with a balance, oldest due date first — paged in the database. */
export function usePropertyDuesList(propertyId: string, page: number) {
  return useQuery({
    queryKey: ["property-finance", propertyId, "dues-list", page],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: DueRow[]; total: number }> => {
      const from = page * DUES_PAGE;
      const { data, error, count } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, student_id, balance_paise, due_date, students(full_name), allocations(rooms(room_number))",
          { count: "exact" },
        )
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .in("status", OPEN_INVOICE_STATUSES)
        .gt("balance_paise", 0)
        .order("due_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + DUES_PAGE - 1);
      if (error) throw new Error("We couldn't load outstanding dues. Please try again.");
      return {
        total: count ?? 0,
        rows: (data ?? []).map((r) => ({
          invoiceId: r.id,
          invoiceNumber: r.invoice_number,
          studentId: r.student_id,
          name: r.students?.full_name ?? "Unknown resident",
          room: r.allocations?.rooms?.room_number ?? null,
          balancePaise: r.balance_paise,
          dueDate: r.due_date.slice(0, 10),
        })),
      };
    },
  });
}

/* ------------------------------------------------------------------ refunds */

export interface RefundsSummary {
  /** Refund requests raised this IST month that are pending, approved, processing or completed. */
  paise: number;
  requests: number;
  completed: number;
  awaitingApproval: number;
}

export function usePropertyRefundsSummary(propertyId: string) {
  return useQuery({
    queryKey: ["property-finance", propertyId, "refunds-summary", monthKey()],
    staleTime: STALE,
    queryFn: async (): Promise<RefundsSummary> => {
      const start = istMonthStart(0, new Date()).start;
      const rows: { amount_paise: number; status: string }[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from("refunds")
          .select("id, amount_paise, status")
          .eq("property_id", propertyId)
          .in("status", COUNTED_REFUND_STATUSES)
          .gte("initiated_at", start.toISOString())
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error("We couldn't load refunds. Please try again.");
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return {
        paise: rows.reduce((s, r) => s + r.amount_paise, 0),
        requests: rows.length,
        completed: rows.filter((r) => r.status === "COMPLETED").length,
        awaitingApproval: rows.filter((r) => AWAITING_REFUND_STATUSES.includes(r.status)).length,
      };
    },
  });
}

/* ------------------------------------------------------------------ transactions */

export interface FinanceTransaction {
  key: string;
  kind: "PAYMENT" | "REFUND";
  number: string;
  studentId: string;
  name: string;
  /** Fee plan name, "Manual invoice", "Payment" or "Refund". */
  type: string;
  /** How it was paid / refunded, e.g. "UPI", "Cash". */
  method: string | null;
  amountPaise: number;
  at: string;
  status: string;
}

const TRANSACTIONS_LIMIT = 6;

/** "BANK_TRANSFER" → "Bank transfer". */
export function humanize(value: string) {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The latest payments (test payments excluded) and refund requests, newest first. */
export function usePropertyTransactions(propertyId: string) {
  return useQuery({
    queryKey: ["property-finance", propertyId, "transactions"],
    staleTime: STALE,
    queryFn: async (): Promise<FinanceTransaction[]> => {
      const [payments, refunds] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, payment_number, amount_paise, status, mode, paid_at, created_at, student_id, invoice_id, students(full_name), invoices(fee_plans(name))",
          )
          .eq("property_id", propertyId)
          .or(NOT_SIMULATED)
          .order("created_at", { ascending: false })
          .limit(TRANSACTIONS_LIMIT),
        supabase
          .from("refunds")
          .select(
            "id, refund_number, amount_paise, status, mode, initiated_at, completed_at, student_id, students(full_name)",
          )
          .eq("property_id", propertyId)
          .neq("status", "DRAFT")
          .order("initiated_at", { ascending: false })
          .limit(TRANSACTIONS_LIMIT),
      ]);
      if (payments.error || refunds.error) {
        throw new Error("We couldn't load recent transactions. Please try again.");
      }
      const items: FinanceTransaction[] = [];
      for (const p of payments.data ?? []) {
        items.push({
          key: `pay-${p.id}`,
          kind: "PAYMENT",
          number: p.payment_number || "—",
          studentId: p.student_id,
          name: p.students?.full_name ?? "Unknown resident",
          type: p.invoices?.fee_plans?.name ?? (p.invoice_id ? "Manual invoice" : "Payment"),
          method: p.mode ? humanize(p.mode) : null,
          amountPaise: p.amount_paise,
          at: p.paid_at ?? p.created_at,
          status: p.status,
        });
      }
      for (const r of refunds.data ?? []) {
        items.push({
          key: `ref-${r.id}`,
          kind: "REFUND",
          number: r.refund_number || "—",
          studentId: r.student_id,
          name: r.students?.full_name ?? "Unknown resident",
          type: "Refund",
          method: r.mode ? humanize(r.mode) : null,
          amountPaise: r.amount_paise,
          at: r.initiated_at,
          status: r.status,
        });
      }
      return items
        .filter((t) => !Number.isNaN(new Date(t.at).getTime()))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, TRANSACTIONS_LIMIT);
    },
  });
}

/* ------------------------------------------------------------------ display helpers */

const AVATAR_TONES = [
  "bg-chart-cat-1/15 text-chart-cat-1",
  "bg-chart-cat-2/15 text-chart-cat-2",
  "bg-chart-cat-3/15 text-chart-cat-3",
  "bg-primary/10 text-primary",
];

/** Stable avatar tint for an id (same scheme as the Residents directory). */
export function avatarTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** "96%", or "0.7%" for shares under 1% so small groups don't read as 0. */
export function sharePct(value: number, total: number) {
  if (total <= 0) return "0%";
  const p = (value / total) * 100;
  return p > 0 && p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** Whole days from IST today to `iso` (negative when it has passed). */
export function daysFromToday(iso: string) {
  const a = Date.parse(`${istDate()}T00:00:00Z`);
  const b = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "27 Nov 2026" for an ISO date or timestamp, on the IST calendar. */
export function fullDate(value: string) {
  const iso = value.length > 10 ? istDate(new Date(value)) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}
