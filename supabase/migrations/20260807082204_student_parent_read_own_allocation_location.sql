-- Students/parents already have SELECT on their own `allocations` rows (which
-- carry bed_id/room_id/floor_id/block_id), but there was never a matching
-- SELECT policy on beds/rooms/floors/blocks themselves for those two roles —
-- only admin_all and warden_read/write existed. Any client-side nested-select
-- embed (bed:beds(...room:rooms(...)...)) from a student or parent session
-- silently came back null for the embedded resource because RLS denied it,
-- even though the allocation row itself was visible. Add narrowly-scoped read
-- policies so a student/parent can see the location of a bed/room/floor/block
-- that one of their own (student's) allocations actually references.

CREATE POLICY "beds student self read"
  ON public.beds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.students s ON s.id = a.student_id
    WHERE a.bed_id = beds.id AND s.profile_id = auth.uid()
  ));

CREATE POLICY "beds parent read"
  ON public.beds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.bed_id = beds.id
      AND g.profile_id = auth.uid()
      AND sg.unlinked_at IS NULL
      AND g.deleted_at IS NULL
  ));

CREATE POLICY "rooms student self read"
  ON public.rooms FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.students s ON s.id = a.student_id
    WHERE a.room_id = rooms.id AND s.profile_id = auth.uid()
  ));

CREATE POLICY "rooms parent read"
  ON public.rooms FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.room_id = rooms.id
      AND g.profile_id = auth.uid()
      AND sg.unlinked_at IS NULL
      AND g.deleted_at IS NULL
  ));

CREATE POLICY "floors student self read"
  ON public.floors FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.students s ON s.id = a.student_id
    WHERE a.floor_id = floors.id AND s.profile_id = auth.uid()
  ));

CREATE POLICY "floors parent read"
  ON public.floors FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.floor_id = floors.id
      AND g.profile_id = auth.uid()
      AND sg.unlinked_at IS NULL
      AND g.deleted_at IS NULL
  ));

CREATE POLICY "blocks student self read"
  ON public.blocks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.students s ON s.id = a.student_id
    WHERE a.block_id = blocks.id AND s.profile_id = auth.uid()
  ));

CREATE POLICY "blocks parent read"
  ON public.blocks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.allocations a
    JOIN public.student_guardians sg ON sg.student_id = a.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE a.block_id = blocks.id
      AND g.profile_id = auth.uid()
      AND sg.unlinked_at IS NULL
      AND g.deleted_at IS NULL
  ));
