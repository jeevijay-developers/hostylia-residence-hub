-- Room-wise eligible-student counts for the Admin / Warden attendance room selector.
--
-- SECURITY INVOKER on purpose: every table it reads (rooms, allocations,
-- students) is filtered by the CALLER'S own RLS, so tenant and property scope
-- and each staff role's read permissions apply exactly as they do for the
-- attendance roster. Nothing is bypassed or widened.
--
-- "Eligible" matches the roster (useStudentsInProperty): the student is ACTIVE
-- and not soft-deleted, and holds an ACTIVE, non-deleted allocation in this
-- property. Distinct students are counted, so a data oddity can never double
-- count. Rooms with no eligible student are simply absent from the result.
--
-- Known, intentional consequence: a caller whose RLS hides `rooms`
-- (e.g. a Warden with rooms_beds_view = false) gets no rows — the selector then
-- shows only "All Rooms (N)". Room numbers are never exposed to someone who may
-- not read rooms, and rooms RLS is deliberately NOT widened here because that
-- would also expose rent columns (RLS cannot filter columns).
CREATE OR REPLACE FUNCTION public.attendance_room_counts(p_property_id uuid)
RETURNS TABLE (room_id uuid, room_number text, student_count integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT r.id, r.room_number, count(DISTINCT s.id)::integer
  FROM public.allocations a
  JOIN public.students s ON s.id = a.student_id
  JOIN public.rooms r ON r.id = a.room_id
  WHERE a.property_id = p_property_id
    AND a.status = 'ACTIVE'
    AND a.deleted_at IS NULL
    AND s.property_id = p_property_id
    AND s.status = 'ACTIVE'
    AND s.deleted_at IS NULL
    AND r.deleted_at IS NULL
  GROUP BY r.id, r.room_number
  ORDER BY r.room_number;
$$;

REVOKE ALL ON FUNCTION public.attendance_room_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_room_counts(uuid) TO authenticated;
