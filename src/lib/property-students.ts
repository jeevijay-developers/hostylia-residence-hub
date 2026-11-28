import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { BED_HOLDING } from "@/lib/rooms-beds";
import { getStudentForEdit, type StudentEditSnapshot } from "@/lib/student-admin.functions";

/**
 * Data for a property's Students tab. Plain RLS reads; lists are paged in the
 * database and dues are fetched only for the rows on screen. Every tab query
 * lives under ["students-tab", propertyId, ...] so one invalidation refreshes it.
 */

export const STUDENT_FILTERS = [
  "ALL",
  "APPLICANT",
  "VERIFIED",
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVED_OUT",
  "REJECTED",
  "ARCHIVED",
] as const;
export type StudentFilter = (typeof STUDENT_FILTERS)[number];

export const DIRECTORY_PAGE_SIZE = 8;
export const KYC_PAGE_SIZE = 3;
export const MOVE_OUT_PAGE_SIZE = 3;

// A PARTIALLY_REFUNDED invoice can still carry a balance (it is owed), so it counts
// as open when balance_paise > 0 — same rule as the Finance tab and the overdue job.
const OPEN_INVOICE = ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PARTIALLY_REFUNDED"];
const BILLED_INVOICE = [...OPEN_INVOICE, "PAID", "REFUNDED"];

/** PostgREST's or() treats , ( ) as separators — keep them (and wildcards) out of a search term. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\]/g, " ").trim();
}

export interface StudentCounts {
  /** Live (not archived) students, all statuses. */
  total: number;
  applicant: number;
  verified: number;
  active: number;
  noticeGiven: number;
  movedOut: number;
  rejected: number;
  /** Archived = soft-deleted (deleted_at set). */
  archived: number;
}

export function useStudentCounts(propertyId: string) {
  return useQuery({
    queryKey: ["students-tab", propertyId, "counts"],
    enabled: !!propertyId,
    queryFn: async (): Promise<StudentCounts> => {
      const count = (opts: { status?: string; archived?: boolean } = {}) => {
        let q = supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId);
        q = opts.archived ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
        if (opts.status) q = q.eq("status", opts.status);
        return q;
      };
      const res = await Promise.all([
        count(),
        count({ status: "APPLICANT" }),
        count({ status: "VERIFIED" }),
        count({ status: "ACTIVE" }),
        count({ status: "NOTICE_GIVEN" }),
        count({ status: "MOVED_OUT" }),
        count({ status: "REJECTED" }),
        count({ archived: true }),
      ]);
      if (res.some((r) => r.error)) {
        throw new Error("We couldn't load the student counts. Please try again.");
      }
      const [total, applicant, verified, active, noticeGiven, movedOut, rejected, archived] =
        res.map((r) => r.count ?? 0);
      return { total, applicant, verified, active, noticeGiven, movedOut, rejected, archived };
    },
  });
}

export type DuesState =
  { kind: "DUE"; paise: number } | { kind: "PAID" } | { kind: "SETTLED" } | { kind: "NOT_BILLED" };

export interface StudentDirectoryRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  admission_number: string;
  status: string;
  /** Has a portal login (students.profile_id set). */
  isLinked: boolean;
  archivedAt: string | null;
  guardian: { name: string; phone: string; relationship: string | null } | null;
  /** The bed-holding allocation (pending agreement / payment, live stay), if any. */
  stay: { allocationId: string; allocationStatus: string; room: string; bed: string } | null;
  /** Mirrors uidx_allocations_active_student: blocks archiving and a second allocation. */
  hasOpenAllocation: boolean;
  dues: DuesState;
}

export function useStudentsDirectory(
  propertyId: string,
  opts: { q: string; filter: StudentFilter; page: number },
) {
  return useQuery({
    queryKey: ["students-tab", propertyId, "directory", opts.q, opts.filter, opts.page],
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: StudentDirectoryRow[]; total: number }> => {
      const from = opts.page * DIRECTORY_PAGE_SIZE;
      const term = sanitizeSearch(opts.q);
      let query = supabase
        .from("students")
        .select(
          "id, full_name, email, phone, admission_number, status, profile_id, deleted_at, allocations(id, status, deleted_at, rooms(room_number), beds(code)), student_guardians(relationship, is_primary, unlinked_at, guardians(full_name, phone))",
          { count: "exact" },
        )
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + DIRECTORY_PAGE_SIZE - 1);
      if (opts.filter === "ARCHIVED") {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
        if (opts.filter !== "ALL") query = query.eq("status", opts.filter);
      }
      if (term) {
        const digits = term.replace(/\D/g, "");
        query = query.or(
          [
            `full_name.ilike.%${term}%`,
            `admission_number.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : []),
          ].join(","),
        );
      }
      const { data, error, count } = await query;
      if (error) throw new Error("We couldn't load students. Please try again.");
      const students = data ?? [];
      const ids = students.map((s) => s.id);

      const invoicesRes = ids.length
        ? await supabase
            .from("invoices")
            .select("student_id, status, balance_paise")
            .in("student_id", ids)
            .is("deleted_at", null)
            .in("status", BILLED_INVOICE)
            .limit(2000)
        : null;
      const due = new Map<string, number>();
      const billed = new Set<string>();
      for (const inv of invoicesRes?.data ?? []) {
        billed.add(inv.student_id);
        if (OPEN_INVOICE.includes(inv.status) && inv.balance_paise > 0) {
          due.set(inv.student_id, (due.get(inv.student_id) ?? 0) + inv.balance_paise);
        }
      }

      const rows = students.map((s): StudentDirectoryRow => {
        const open = (s.allocations ?? []).find(
          (a) => !a.deleted_at && BED_HOLDING.includes(a.status),
        );
        const links = (s.student_guardians ?? []).filter((g) => !g.unlinked_at && g.guardians);
        const link = links.find((g) => g.is_primary) ?? links[0];
        const owed = due.get(s.id) ?? 0;
        return {
          id: s.id,
          full_name: s.full_name,
          email: s.email,
          phone: s.phone,
          admission_number: s.admission_number,
          status: s.status,
          isLinked: !!s.profile_id,
          archivedAt: s.deleted_at,
          guardian: link?.guardians
            ? {
                name: link.guardians.full_name,
                phone: link.guardians.phone,
                relationship: link.relationship || null,
              }
            : null,
          stay: open
            ? {
                allocationId: open.id,
                allocationStatus: open.status,
                room: open.rooms?.room_number ?? "—",
                bed: open.beds?.code ?? "—",
              }
            : null,
          hasOpenAllocation: !!open,
          dues:
            invoicesRes?.error || !billed.has(s.id)
              ? { kind: "NOT_BILLED" }
              : owed > 0
                ? { kind: "DUE", paise: owed }
                : s.status === "MOVED_OUT"
                  ? { kind: "SETTLED" }
                  : { kind: "PAID" },
        };
      });
      return { rows, total: count ?? 0 };
    },
  });
}

export interface KycQueueRow {
  documentId: string;
  documentType: string;
  fileName: string | null;
  uploadedAt: string;
  student: { id: string; full_name: string; admission_number: string } | null;
}

/**
 * Pending KYC documents for one property, oldest first, one row per document.
 * Keyed under "kyc-pending-queue" so every approve/reject surface refreshes it.
 */
export function usePropertyKycQueue(tenantId: string, propertyId: string, page: number) {
  return useQuery({
    queryKey: ["kyc-pending-queue", tenantId, propertyId, page],
    enabled: !!tenantId && !!propertyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: KycQueueRow[]; total: number }> => {
      const from = page * KYC_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, owner_id, created_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("property_id", propertyId)
        .eq("owner_type", "STUDENT")
        .eq("verification_status", "PENDING")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, from + KYC_PAGE_SIZE - 1);
      if (error) throw new Error("We couldn't load KYC documents. Please try again.");
      const docs = data ?? [];

      // documents.owner_id is polymorphic (no FK), so students can't be embedded.
      const ownerIds = Array.from(new Set(docs.map((d) => d.owner_id)));
      const owners = new Map<string, { id: string; full_name: string; admission_number: string }>();
      if (ownerIds.length) {
        const { data: students, error: studentsError } = await supabase
          .from("students")
          .select("id, full_name, admission_number")
          .in("id", ownerIds);
        if (studentsError) throw new Error("We couldn't load KYC documents. Please try again.");
        for (const s of students ?? []) owners.set(s.id, s);
      }

      return {
        total: count ?? 0,
        rows: docs.map((d) => ({
          documentId: d.id,
          documentType: d.document_type,
          fileName: d.original_filename,
          uploadedAt: d.created_at,
          student: owners.get(d.owner_id) ?? null,
        })),
      };
    },
  });
}

export interface MoveOutNoticeRow {
  allocationId: string;
  studentId: string;
  name: string;
  admission_number: string;
  room: string | null;
  bed: string | null;
  requestedDate: string | null;
  noticeGivenAt: string | null;
  status: string;
}

/** Stays on notice or under move-out inspection, soonest move-out first. */
export function usePropertyMoveOutNotices(tenantId: string, propertyId: string, page: number) {
  return useQuery({
    // Shares the "move-out-notices" prefix so MoveOutWizard's invalidation refreshes it.
    queryKey: ["move-out-notices", tenantId, propertyId, "paged", page],
    enabled: !!tenantId && !!propertyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: MoveOutNoticeRow[]; total: number }> => {
      const from = page * MOVE_OUT_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("allocations")
        .select(
          "id, status, requested_move_out_date, notice_given_at, students(id, full_name, admission_number), rooms(room_number), beds(code)",
          { count: "exact" },
        )
        .eq("tenant_id", tenantId)
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .in("status", ["NOTICE_GIVEN", "MOVE_OUT_INSPECTION"])
        .order("requested_move_out_date", { ascending: true, nullsFirst: false })
        .order("id")
        .range(from, from + MOVE_OUT_PAGE_SIZE - 1);
      if (error) throw new Error("We couldn't load move-out notices. Please try again.");
      return {
        total: count ?? 0,
        rows: (data ?? []).flatMap((a): MoveOutNoticeRow[] =>
          a.students
            ? [
                {
                  allocationId: a.id,
                  studentId: a.students.id,
                  name: a.students.full_name,
                  admission_number: a.students.admission_number,
                  room: a.rooms?.room_number ?? null,
                  bed: a.beds?.code ?? null,
                  requestedDate: a.requested_move_out_date,
                  noticeGivenAt: a.notice_given_at,
                  status: a.status,
                },
              ]
            : [],
        ),
      };
    },
  });
}

export type StudentEventKind = "ADDED" | "ALLOTTED" | "KYC" | "NOTICE" | "MOVED_OUT";

export interface StudentEvent {
  key: string;
  at: string;
  kind: StudentEventKind;
  name: string;
  admission_number: string | null;
  /** Room / bed for stay events; null otherwise. */
  detail: string | null;
}

/**
 * Most recent student events, rebuilt from the students' own records (audit
 * logs are not readable from the browser): students added, beds allotted
 * (stay activated), KYC verified, move-out notices and move-outs.
 */
export function useStudentActivity(propertyId: string, limit = 5) {
  return useQuery({
    queryKey: ["students-tab", propertyId, "activity", limit],
    enabled: !!propertyId,
    queryFn: async (): Promise<StudentEvent[]> => {
      const stay =
        "id, activated_at, notice_given_at, closed_at, students(full_name, admission_number), rooms(room_number), beds(code)";
      const [added, allotted, notices, closed, kyc] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, admission_number, created_at")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("allocations")
          .select(stay)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .not("activated_at", "is", null)
          .order("activated_at", { ascending: false })
          .limit(limit),
        supabase
          .from("allocations")
          .select(stay)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .not("notice_given_at", "is", null)
          .order("notice_given_at", { ascending: false })
          .limit(limit),
        supabase
          .from("allocations")
          .select(stay)
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .eq("status", "CLOSED")
          .not("closed_at", "is", null)
          .order("closed_at", { ascending: false })
          .limit(limit),
        supabase
          .from("documents")
          .select("id, owner_id, verified_at")
          .eq("property_id", propertyId)
          .eq("owner_type", "STUDENT")
          .eq("verification_status", "VERIFIED")
          .is("deleted_at", null)
          .not("verified_at", "is", null)
          .order("verified_at", { ascending: false })
          .limit(limit),
      ]);
      if (added.error || allotted.error || notices.error || closed.error) {
        throw new Error("We couldn't load student activity. Please try again.");
      }

      const events: StudentEvent[] = [];
      for (const s of added.data ?? []) {
        events.push({
          key: `add-${s.id}`,
          at: s.created_at,
          kind: "ADDED",
          name: s.full_name,
          admission_number: s.admission_number,
          detail: null,
        });
      }
      const place = (a: {
        rooms: { room_number: string } | null;
        beds: { code: string } | null;
      }) => (a.rooms ? `${a.rooms.room_number}${a.beds ? ` / ${a.beds.code}` : ""}` : null);
      const stayEvents = (
        rows: typeof allotted.data,
        kind: StudentEventKind,
        prefix: string,
        at: (a: NonNullable<typeof allotted.data>[number]) => string | null,
      ) => {
        for (const a of rows ?? []) {
          const when = at(a);
          if (!when || !a.students) continue;
          events.push({
            key: `${prefix}-${a.id}`,
            at: when,
            kind,
            name: a.students.full_name,
            admission_number: a.students.admission_number,
            detail: place(a),
          });
        }
      };
      stayEvents(allotted.data, "ALLOTTED", "in", (a) => a.activated_at);
      stayEvents(notices.data, "NOTICE", "notice", (a) => a.notice_given_at);
      stayEvents(closed.data, "MOVED_OUT", "out", (a) => a.closed_at);

      // KYC: documents are polymorphic, so look the owners up separately.
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
            admission_number: o.admission_number,
            detail: null,
          });
        }
      }
      return events
        .filter((e) => !Number.isNaN(new Date(e.at).getTime()))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);
    },
  });
}

/** Refreshes everything the Students tab shows (and the caches its mutations affect). */
export function invalidateStudentsTab(qc: QueryClient, propertyId: string) {
  const keys: unknown[][] = [
    ["students-tab", propertyId],
    ["students-tab", "edit"],
    ["students-list"],
    ["property-students", propertyId],
    ["property-overview", propertyId],
    ["kyc-pending-queue"],
    ["move-out-notices"],
    ["allocation-beds"],
    ["rooms-beds"],
  ];
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Edit-dialog snapshot (details, open stay, unpaid invoices) for one student. */
export function useStudentForEdit(studentId: string | null) {
  const fetchSnapshot = useServerFn(getStudentForEdit);
  return useQuery({
    queryKey: ["students-tab", "edit", studentId],
    enabled: !!studentId,
    queryFn: (): Promise<StudentEditSnapshot> => {
      if (!studentId) throw new Error("No student selected");
      return fetchSnapshot({ data: { student_id: studentId } });
    },
  });
}
