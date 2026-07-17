
-- mess_menu_items: scope SELECT to tenant staff via parent menu
DROP POLICY IF EXISTS mmi_scoped ON public.mess_menu_items;
CREATE POLICY mmi_scoped ON public.mess_menu_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mess_menus m
    WHERE m.id = mess_menu_items.mess_menu_id
      AND (
        public.is_hostel_admin(auth.uid(), m.tenant_id, m.property_id)
        OR public.warden_can_read_property(auth.uid(), m.tenant_id, m.property_id)
        OR EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.property_id = m.property_id AND s.profile_id = auth.uid()
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mess_menus m
    WHERE m.id = mess_menu_items.mess_menu_id
      AND public.is_hostel_admin(auth.uid(), m.tenant_id, m.property_id)
  ));

-- can_access_conversation: require non-parent participants to be tenant staff
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT id, tenant_id, student_id FROM public.conversations WHERE id = _conversation_id
  ), p AS (
    SELECT participant_role
      FROM public.conversation_participants
     WHERE conversation_id = _conversation_id
       AND user_id = _user_id
       AND left_at IS NULL
     LIMIT 1
  )
  SELECT EXISTS (SELECT 1 FROM p)
    AND (
      -- Parent participants: must be linked, active guardian for the conversation's student
      ((SELECT participant_role FROM p) = 'PARENT'
        AND EXISTS (
          SELECT 1
            FROM public.student_guardians sg
            JOIN public.guardians g ON g.id = sg.guardian_id
           WHERE sg.student_id = (SELECT student_id FROM c)
             AND sg.unlinked_at IS NULL
             AND g.deleted_at IS NULL
             AND g.profile_id = _user_id
        ))
      OR
      -- Student participants: must own the student on the conversation
      ((SELECT participant_role FROM p) = 'STUDENT'
        AND EXISTS (
          SELECT 1 FROM public.students s
           WHERE s.id = (SELECT student_id FROM c) AND s.profile_id = _user_id
        ))
      OR
      -- Any other role: must be active staff of the conversation's tenant
      ((SELECT participant_role FROM p) NOT IN ('PARENT','STUDENT')
        AND public.has_any_tenant_role(_user_id, (SELECT tenant_id FROM c)))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_conversation(uuid, uuid) FROM PUBLIC, anon;
