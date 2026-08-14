-- gate_passes had SELECT access for linked parents (gp_parent_read) plus a
-- trigger (fn_validate_parent_approval) that already validates parent_approved_by
-- is a linked guardian with can_approve_gate_pass — but no UPDATE policy ever
-- granted parents write access, so decideGatePass's PARENT branch could never
-- actually apply (RLS blocks the row match, update affects 0 rows). This adds
-- the missing policy, scoped to the same PENDING_PARENT -> PENDING_WARDEN /
-- REJECTED transition decideGatePass performs.
CREATE POLICY gp_parent_approve ON public.gate_passes FOR UPDATE TO authenticated
  USING (
    status = 'PENDING_PARENT'
    AND EXISTS (
      SELECT 1 FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = gate_passes.student_id AND sg.unlinked_at IS NULL
        AND g.profile_id = auth.uid() AND sg.can_approve_gate_pass = true
    )
  )
  WITH CHECK (
    status IN ('PENDING_WARDEN', 'REJECTED')
    AND EXISTS (
      SELECT 1 FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = gate_passes.student_id AND sg.unlinked_at IS NULL
        AND g.profile_id = auth.uid() AND sg.can_approve_gate_pass = true
    )
  );
