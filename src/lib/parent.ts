import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ParentChild {
  guardian_id: string;
  student_id: string;
  student_name: string;
  tenant_id: string;
  property_id: string;
  property_name: string;
  status: string;
  can_view_attendance: boolean;
  can_view_complaints: boolean;
  can_view_gate_events: boolean;
  can_approve_gate_pass: boolean;
  can_pay_fees: boolean;
  can_view_child_profile: boolean;
  can_view_finance: boolean;
  can_view_notices: boolean;
  can_view_room_allocation: boolean;
  can_view_documents: boolean;
  can_create_complaints: boolean;
  can_edit_own_complaints: boolean;
  is_primary: boolean;
  bed_code: string | null;
  floor_name: string | null;
  block_name: string | null;
  allocation_status: string | null;
}

async function fetchLinkedChildren(userId: string): Promise<ParentChild[]> {
  // guardians.profile_id === auth.uid()
  const { data: guardians } = await supabase
    .from("guardians")
    .select("id")
    .eq("profile_id", userId)
    .is("deleted_at", null);
  const guardianIds = (guardians ?? []).map((g) => g.id);
  if (guardianIds.length === 0) return [];

  const { data: links } = await supabase
    .from("student_guardians")
    .select(
      `id, guardian_id, is_primary,
       can_view_attendance, can_view_complaints, can_view_gate_events, can_approve_gate_pass, can_pay_fees,
       can_view_child_profile, can_view_finance, can_view_notices, can_view_room_allocation,
       can_view_documents, can_create_complaints, can_edit_own_complaints,
       students!inner(id, full_name, tenant_id, property_id, status,
         properties!inner(name),
         allocations(status, deleted_at, beds(code, floors(name), blocks(name)))
       )`,
    )
    .in("guardian_id", guardianIds)
    .is("unlinked_at", null);

  return (links ?? []).map((row) => {
    // Pick current active allocation (fallback null)
    const alloc = (row.students.allocations ?? []).find(
      (a: { status: string; deleted_at: string | null }) =>
        a.deleted_at === null &&
        ["ACTIVE", "PENDING_AGREEMENT", "PENDING_PAYMENT", "NOTICE_GIVEN"].includes(a.status),
    ) as
      | {
          status: string;
          beds?: { code: string; floors?: { name: string } | null; blocks?: { name: string } | null } | null;
        }
      | undefined;
    return {
      guardian_id: row.guardian_id,
      student_id: row.students.id,
      student_name: row.students.full_name,
      tenant_id: row.students.tenant_id,
      property_id: row.students.property_id,
      property_name: row.students.properties?.name ?? "",
      status: row.students.status,
      can_view_attendance: row.can_view_attendance,
      can_view_complaints: row.can_view_complaints,
      can_view_gate_events: row.can_view_gate_events,
      can_approve_gate_pass: row.can_approve_gate_pass,
      can_pay_fees: row.can_pay_fees,
      can_view_child_profile: row.can_view_child_profile,
      can_view_finance: row.can_view_finance,
      can_view_notices: row.can_view_notices,
      can_view_room_allocation: row.can_view_room_allocation,
      can_view_documents: row.can_view_documents,
      can_create_complaints: row.can_create_complaints,
      can_edit_own_complaints: row.can_edit_own_complaints,
      is_primary: row.is_primary,
      bed_code: alloc?.beds?.code ?? null,
      floor_name: alloc?.beds?.floors?.name ?? null,
      block_name: alloc?.beds?.blocks?.name ?? null,
      allocation_status: alloc?.status ?? null,
    };
  });
}

export function useLinkedChildren(userId: string | null) {
  return useQuery({
    queryKey: ["parent-children", userId],
    enabled: !!userId,
    queryFn: () => fetchLinkedChildren(userId!),
    staleTime: 60_000,
  });
}
