import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { leaveRequestRowSchema, type LeaveRequestRow, type LeaveStatus } from "@/schemas/leave";

const COLUMNS =
  "id, student_id, start_date, end_date, reason, remarks, status, reviewed_at, rejection_reason, created_at";

// leave_requests is not in the generated Database types until types.ts is
// regenerated after 20261102100000 is applied, so the builder is typed by hand
// and every row is validated with Zod at this boundary.
interface LeaveResult {
  data: unknown;
  error: { message: string } | null;
}
interface LeaveQuery extends PromiseLike<LeaveResult> {
  select(columns: string): LeaveQuery;
  eq(column: string, value: string): LeaveQuery;
  lte(column: string, value: string): LeaveQuery;
  gte(column: string, value: string): LeaveQuery;
  order(column: string, opts: { ascending: boolean }): LeaveQuery;
  limit(n: number): LeaveQuery;
}

function leaveTable(): LeaveQuery {
  return supabase.from("leave_requests" as never) as unknown as LeaveQuery;
}

async function fetchLeaveRows(query: LeaveQuery): Promise<LeaveRequestRow[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return z.array(leaveRequestRowSchema).parse(data ?? []);
}

/** The signed-in student's own requests, newest first (RLS: owning student). */
export function useMyLeaveRequests(studentId: string | null | undefined) {
  return useQuery({
    queryKey: ["leave-requests", "mine", studentId],
    enabled: !!studentId,
    queryFn: () =>
      fetchLeaveRows(
        leaveTable()
          .select(COLUMNS)
          .eq("student_id", studentId ?? "")
          .order("created_at", { ascending: false })
          .limit(50),
      ),
  });
}

/** Requests in a property for staff review (RLS: can_view_attendance scope). */
export function usePropertyLeaveRequests(propertyId: string | null, status: LeaveStatus) {
  return useQuery({
    queryKey: ["leave-requests", "property", propertyId, status],
    enabled: !!propertyId,
    queryFn: () =>
      fetchLeaveRows(
        leaveTable()
          .select(`${COLUMNS}, students(full_name, admission_number)`)
          .eq("property_id", propertyId ?? "")
          .eq("status", status)
          .order("created_at", { ascending: true })
          .limit(100),
      ),
  });
}

/**
 * Student ids with APPROVED leave covering `date` in this property. Attendance
 * for these students is locked: the DB trigger is the real guard, this only
 * lets the roster show "On Leave" and disable the radios / selects.
 */
export function useStudentsOnApprovedLeave(propertyId: string | null, date: string) {
  return useQuery({
    queryKey: ["leave-requests", "on-leave", propertyId, date],
    enabled: !!propertyId,
    queryFn: async () => {
      const rows = await fetchLeaveRows(
        leaveTable()
          .select(COLUMNS)
          .eq("property_id", propertyId ?? "")
          .eq("status", "APPROVED")
          .lte("start_date", date)
          .gte("end_date", date),
      );
      return new Set(rows.map((r) => r.student_id));
    },
  });
}
