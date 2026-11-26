import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { BED_HOLDING } from "@/lib/rooms-beds";

/**
 * Data for a property's Residents tab. Plain RLS reads; the directory is paged
 * in the database (8 rows) and dues / attendance are fetched only for the rows
 * on screen.
 */

export const RESIDENT_FILTERS = [
  "ALL",
  "ACTIVE",
  "APPLICANT",
  "NOTICE_GIVEN",
  "MOVED_OUT",
] as const;
export type ResidentFilter = (typeof RESIDENT_FILTERS)[number];

/** Students' status values each filter covers ("Applicant" includes verified applicants). */
const FILTER_STATUSES: Record<Exclude<ResidentFilter, "ALL">, string[]> = {
  ACTIVE: ["ACTIVE"],
  APPLICANT: ["APPLICANT", "VERIFIED"],
  NOTICE_GIVEN: ["NOTICE_GIVEN"],
  MOVED_OUT: ["MOVED_OUT"],
};

export const DIRECTORY_PAGE = 8;

export interface ResidentCounts {
  total: number;
  active: number;
  applicants: number;
  noticeGiven: number;
  movedOut: number;
}

export function useResidentCounts(propertyId: string) {
  return useQuery({
    queryKey: ["property-residents", propertyId, "counts"],
    queryFn: async (): Promise<ResidentCounts> => {
      const count = (statuses?: string[]) => {
        let q = supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .is("deleted_at", null);
        if (statuses) q = q.in("status", statuses);
        return q;
      };
      const res = await Promise.all([
        count(),
        count(FILTER_STATUSES.ACTIVE),
        count(FILTER_STATUSES.APPLICANT),
        count(FILTER_STATUSES.NOTICE_GIVEN),
        count(FILTER_STATUSES.MOVED_OUT),
      ]);
      if (res.some((r) => r.error)) {
        throw new Error("We couldn't load the resident counts. Please try again.");
      }
      const [total, active, applicants, noticeGiven, movedOut] = res.map((r) => r.count ?? 0);
      return { total, active, applicants, noticeGiven, movedOut };
    },
  });
}

export type DuesState =
  { kind: "DUE"; paise: number } | { kind: "PAID" } | { kind: "SETTLED" } | { kind: "NOT_BILLED" };

export interface ResidentRow {
  id: string;
  full_name: string;
  admission_number: string;
  phone: string | null;
  status: string;
  stay: { room: string; bed: string } | null;
  dues: DuesState;
  /** (Present + Late) / (Present + Late + Absent) over the last 30 days; null when nothing was marked. */
  attendancePct: number | null;
}

const OPEN_INVOICE = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];
const BILLED_INVOICE = [...OPEN_INVOICE, "PAID", "PARTIALLY_REFUNDED", "REFUNDED"];

export function useResidentsDirectory(
  propertyId: string,
  opts: { q: string; filter: ResidentFilter; page: number },
) {
  return useQuery({
    queryKey: ["property-residents", propertyId, "directory", opts.q, opts.filter, opts.page],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: ResidentRow[]; total: number }> => {
      const from = opts.page * DIRECTORY_PAGE;
      // PostgREST's or() treats , ( ) as separators — keep them out of the term.
      const term = opts.q.replace(/[,()*%\\]/g, " ").trim();
      let query = supabase
        .from("students")
        .select(
          "id, full_name, admission_number, phone, status, allocations(status, deleted_at, rooms(room_number), beds(code))",
          { count: "exact" },
        )
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, from + DIRECTORY_PAGE - 1);
      if (opts.filter !== "ALL") query = query.in("status", FILTER_STATUSES[opts.filter]);
      if (term) {
        const digits = term.replace(/\D/g, "");
        query = query.or(
          [
            `full_name.ilike.%${term}%`,
            `admission_number.ilike.%${term}%`,
            ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : []),
          ].join(","),
        );
      }
      const { data, error, count } = await query;
      if (error) throw new Error("We couldn't load residents. Please try again.");
      const students = data ?? [];
      const ids = students.map((s) => s.id);

      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const [invoicesRes, attendanceRes] = ids.length
        ? await Promise.all([
            supabase
              .from("invoices")
              .select("student_id, status, balance_paise")
              .in("student_id", ids)
              .is("deleted_at", null)
              .in("status", BILLED_INVOICE)
              .limit(2000),
            supabase
              .from("attendance")
              .select("student_id, status")
              .in("student_id", ids)
              .gte("attendance_date", since)
              .in("status", ["PRESENT", "LATE", "ABSENT"])
              .limit(5000),
          ])
        : [null, null];

      const due = new Map<string, number>();
      const billed = new Set<string>();
      for (const inv of invoicesRes?.data ?? []) {
        billed.add(inv.student_id);
        if (OPEN_INVOICE.includes(inv.status) && inv.balance_paise > 0) {
          due.set(inv.student_id, (due.get(inv.student_id) ?? 0) + inv.balance_paise);
        }
      }
      const att = new Map<string, { attended: number; absent: number }>();
      for (const a of attendanceRes?.data ?? []) {
        const c = att.get(a.student_id) ?? { attended: 0, absent: 0 };
        if (a.status === "ABSENT") c.absent++;
        else c.attended++;
        att.set(a.student_id, c);
      }

      const rows = students.map((s): ResidentRow => {
        const live = (s.allocations ?? []).find(
          (a) => !a.deleted_at && BED_HOLDING.includes(a.status),
        );
        const owed = due.get(s.id) ?? 0;
        const a = att.get(s.id);
        return {
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number,
          phone: s.phone,
          status: s.status,
          stay: live ? { room: live.rooms?.room_number ?? "—", bed: live.beds?.code ?? "—" } : null,
          dues:
            invoicesRes?.error || !billed.has(s.id)
              ? { kind: "NOT_BILLED" }
              : owed > 0
                ? { kind: "DUE", paise: owed }
                : s.status === "MOVED_OUT"
                  ? { kind: "SETTLED" }
                  : { kind: "PAID" },
          attendancePct:
            !attendanceRes?.error && a && a.attended + a.absent > 0
              ? Math.round((a.attended / (a.attended + a.absent)) * 100)
              : null,
        };
      });
      return { rows, total: count ?? 0 };
    },
  });
}

export interface MoveOutNotice {
  id: string;
  studentId: string;
  name: string;
  room: string | null;
  date: string | null;
}

/** Residents who gave notice, soonest move-out first. */
export function useMoveOutNotices(propertyId: string) {
  return useQuery({
    queryKey: ["property-residents", propertyId, "move-out-notices"],
    queryFn: async (): Promise<{ items: MoveOutNotice[]; total: number }> => {
      const { data, error, count } = await supabase
        .from("allocations")
        .select("id, requested_move_out_date, students(id, full_name), rooms(room_number)", {
          count: "exact",
        })
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .in("status", ["NOTICE_GIVEN", "MOVE_OUT_INSPECTION"])
        .order("requested_move_out_date", { ascending: true, nullsFirst: false })
        .limit(5);
      if (error) throw new Error("We couldn't load move-out notices. Please try again.");
      return {
        total: count ?? 0,
        items: (data ?? []).flatMap((a) =>
          a.students
            ? [
                {
                  id: a.id,
                  studentId: a.students.id,
                  name: a.students.full_name,
                  room: a.rooms?.room_number ?? null,
                  date: a.requested_move_out_date,
                },
              ]
            : [],
        ),
      };
    },
  });
}

export type ResidentEventKind = "ADDED" | "ALLOTTED" | "KYC" | "NOTICE" | "MOVED_OUT";

export interface ResidentEvent {
  key: string;
  at: string;
  kind: ResidentEventKind;
  name: string;
  detail: string | null;
}

/**
 * Recent resident activity, rebuilt from the residents' own records (audit
 * logs are not readable from the browser): residents added, beds allotted,
 * KYC documents verified, move-out notices and move-outs.
 */
export function useResidentActivity(propertyId: string) {
  return useQuery({
    queryKey: ["property-residents", propertyId, "activity"],
    queryFn: async (): Promise<ResidentEvent[]> => {
      const LIMIT = 12;
      const stay =
        "id, activated_at, notice_given_at, closed_at, students(full_name), rooms(room_number), beds(code)";
      const [added, allotted, notices, closed, kyc] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, admission_number, created_at")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("allocations")
          .select(stay)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .not("activated_at", "is", null)
          .order("activated_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("allocations")
          .select(stay)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .not("notice_given_at", "is", null)
          .order("notice_given_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("allocations")
          .select(stay)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .eq("status", "CLOSED")
          .not("closed_at", "is", null)
          .order("closed_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("documents")
          .select("id, owner_id, verified_at")
          .eq("property_id", propertyId)
          .eq("owner_type", "STUDENT")
          .eq("verification_status", "VERIFIED")
          .is("deleted_at", null)
          .not("verified_at", "is", null)
          .order("verified_at", { ascending: false })
          .limit(LIMIT),
      ]);
      if (added.error || allotted.error || notices.error || closed.error) {
        throw new Error("We couldn't load resident activity. Please try again.");
      }

      const events: ResidentEvent[] = [];
      for (const s of added.data ?? []) {
        events.push({
          key: `add-${s.id}`,
          at: s.created_at,
          kind: "ADDED",
          name: s.full_name,
          detail: s.admission_number,
        });
      }
      const place = (a: {
        rooms: { room_number: string } | null;
        beds: { code: string } | null;
      }) => (a.rooms ? `${a.rooms.room_number}${a.beds ? ` / ${a.beds.code}` : ""}` : null);
      for (const a of allotted.data ?? []) {
        if (a.activated_at && a.students) {
          events.push({
            key: `in-${a.id}`,
            at: a.activated_at,
            kind: "ALLOTTED",
            name: a.students.full_name,
            detail: place(a),
          });
        }
      }
      for (const a of notices.data ?? []) {
        if (a.notice_given_at && a.students) {
          events.push({
            key: `notice-${a.id}`,
            at: a.notice_given_at,
            kind: "NOTICE",
            name: a.students.full_name,
            detail: a.rooms?.room_number ?? null,
          });
        }
      }
      for (const a of closed.data ?? []) {
        if (a.closed_at && a.students) {
          events.push({
            key: `out-${a.id}`,
            at: a.closed_at,
            kind: "MOVED_OUT",
            name: a.students.full_name,
            detail: a.rooms?.room_number ?? null,
          });
        }
      }
      // KYC: documents are polymorphic, so look the owners' names up separately.
      // A failure here just leaves KYC events out.
      const docs = kyc.error ? [] : (kyc.data ?? []);
      if (docs.length) {
        const ownerIds = Array.from(new Set(docs.map((d) => d.owner_id)));
        const { data: owners } = await supabase
          .from("students")
          .select("id, full_name, admission_number")
          .in("id", ownerIds);
        const byId = new Map((owners ?? []).map((o) => [o.id, o]));
        const seen = new Set<string>();
        for (const d of docs) {
          const o = byId.get(d.owner_id);
          // One "KYC approved" per student, at their latest verification.
          if (!o || !d.verified_at || seen.has(o.id)) continue;
          seen.add(o.id);
          events.push({
            key: `kyc-${d.id}`,
            at: d.verified_at,
            kind: "KYC",
            name: o.full_name,
            detail: o.admission_number,
          });
        }
      }
      return events
        .filter((e) => !Number.isNaN(new Date(e.at).getTime()))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 20);
    },
  });
}
