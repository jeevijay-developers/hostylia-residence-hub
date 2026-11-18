-- Student archive + guarded permanent delete (Admin -> Students).
--
-- ARCHIVE = the existing soft-delete (students.deleted_at / deleted_by). Every
-- student query already filters `deleted_at IS NULL`, so an archived student
-- disappears from every normal list while ALL of their rows (allocations,
-- invoices, payments, attendance, ...) stay untouched. Nothing is converted or
-- rewritten: the 30 students soft-deleted before this migration simply show up
-- under the new "Archived" filter.
--
-- PERMANENT DELETE only ever applies to an already-archived student with NO
-- protected history. It is blocked (and the reasons reported) while the student
-- has any row in: allocations, agreements, invoices, payments, payment_orders,
-- refunds, deposit_ledger_entries, complaints, attendance, leave_requests,
-- gate_passes, gate_events, visitors (as host), feedback_responses,
-- mess_feedback or conversations. Financial records, audit history and shared
-- guardian data are never cascaded:
--   * audit_logs are never touched (an audit entry is added);
--   * guardians are never deleted — only the student<->guardian link rows go;
--   * the student's own KYC documents (rows here, files via the app) go with
--     them, and that is called out in the confirmation.
-- The login (auth user / profile) is only removed by the app when
-- `delete_auth_user` is returned true: the profile belongs to this student alone
-- (no other student, guardian, staff/other role, other tenant or platform role,
-- and no refund / support / complaint reference).
--
-- All three entry points are SECURITY DEFINER (so the dependency check sees
-- every row regardless of the caller's RLS) and authorize the caller as
-- HOSTEL_ADMIN of the student's tenant themselves.

-- ---------------------------------------------------------------------------
-- Internal: what depends on this student (no authorization — not callable by clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_student_dependency_report(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blockers jsonb := '[]'::jsonb;
  v_n bigint;
  r record;
  v_profile uuid;
  v_tenant uuid;
  v_safe boolean := false;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('allocations',            'Allocations (bed / stay history)', 'allocations',            'student_id'),
      ('agreements',             'Agreements',                       'agreements',             'student_id'),
      ('invoices',               'Invoices',                         'invoices',               'student_id'),
      ('payments',               'Payments',                         'payments',               'student_id'),
      ('payment_orders',         'Payment orders',                   'payment_orders',         'student_id'),
      ('refunds',                'Refunds',                          'refunds',                'student_id'),
      ('deposit_ledger_entries', 'Deposit ledger entries',           'deposit_ledger_entries', 'student_id'),
      ('complaints',             'Complaints',                       'complaints',             'student_id'),
      ('attendance',             'Attendance records',               'attendance',             'student_id'),
      ('leave_requests',         'Leave requests',                   'leave_requests',         'student_id'),
      ('gate_passes',            'Gate passes',                      'gate_passes',            'student_id'),
      ('gate_events',            'Gate events',                      'gate_events',            'student_id'),
      ('visitors',               'Visitor records',                  'visitors',               'host_student_id'),
      ('feedback_responses',     'Feedback responses',               'feedback_responses',     'student_id'),
      ('mess_feedback',          'Mess feedback',                    'mess_feedback',          'student_id'),
      ('conversations',          'Message conversations',            'conversations',          'student_id')
    ) AS t(key, label, tbl, col)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col) INTO v_n USING p_student_id;
    IF v_n > 0 THEN
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object('key', r.key, 'label', r.label, 'count', v_n));
    END IF;
  END LOOP;

  SELECT profile_id, tenant_id INTO v_profile, v_tenant FROM public.students WHERE id = p_student_id;
  IF v_profile IS NOT NULL THEN
    v_safe :=
      NOT EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = v_profile AND s.id <> p_student_id)
      AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.profile_id = v_profile)
      AND NOT EXISTS (SELECT 1 FROM public.role_assignments ra WHERE ra.user_id = v_profile AND ra.role::text <> 'STUDENT')
      AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.user_id = v_profile AND tm.tenant_id <> v_tenant)
      AND NOT EXISTS (SELECT 1 FROM public.platform_role_assignments pr WHERE pr.user_id = v_profile)
      AND NOT EXISTS (SELECT 1 FROM public.refunds rf WHERE v_profile IN (rf.processed_by, rf.processing_started_by, rf.verified_by))
      AND NOT EXISTS (SELECT 1 FROM public.complaints c WHERE v_profile IN (c.assigned_to, c.resolved_by))
      AND NOT EXISTS (SELECT 1 FROM public.support_tickets st WHERE v_profile IN (st.created_by, st.assigned_to, st.resolved_by))
      AND NOT EXISTS (SELECT 1 FROM public.support_ticket_messages sm WHERE sm.author_id = v_profile)
      AND NOT EXISTS (SELECT 1 FROM public.subscription_cancellations sc WHERE sc.cancelled_by = v_profile);
  END IF;

  RETURN jsonb_build_object(
    'blockers', v_blockers,
    'guardian_links', (SELECT count(*) FROM public.student_guardians WHERE student_id = p_student_id),
    'documents', (SELECT count(*) FROM public.documents WHERE owner_type = 'STUDENT' AND owner_id = p_student_id),
    'has_login', v_profile IS NOT NULL,
    'delete_auth_user', v_safe
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_student_dependency_report(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Archive (soft-delete) with server-side eligibility rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_archive_student(p_student_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.students%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.students WHERE id = p_student_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_tenant_role(auth.uid(), v_s.tenant_id, 'HOSTEL_ADMIN') THEN
    RAISE EXCEPTION 'Only a Hostel Admin can archive a student' USING ERRCODE = '42501';
  END IF;
  IF v_s.status IN ('ACTIVE', 'NOTICE_GIVEN') THEN
    RAISE EXCEPTION 'Move this student out before archiving their record' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.allocations a
    WHERE a.student_id = p_student_id AND a.deleted_at IS NULL
      AND a.status IN ('PENDING_AGREEMENT', 'PENDING_PAYMENT', 'ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION')
  ) THEN
    RAISE EXCEPTION 'This student has an open allocation. Cancel or move out the allocation before archiving.' USING ERRCODE = '55000';
  END IF;

  UPDATE public.students SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_student_id;

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data)
  VALUES (v_s.tenant_id, v_s.property_id, auth.uid(), 'STUDENT_ARCHIVED', 'students', v_s.id,
          jsonb_build_object('status', v_s.status, 'admission_number', v_s.admission_number));
END $$;
REVOKE ALL ON FUNCTION public.fn_archive_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_archive_student(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Preview for the confirmation dialog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_student_delete_check(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.students%ROWTYPE;
  v_rep jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_tenant_role(auth.uid(), v_s.tenant_id, 'HOSTEL_ADMIN') THEN
    RAISE EXCEPTION 'Only a Hostel Admin can delete a student record' USING ERRCODE = '42501';
  END IF;
  v_rep := public.fn_student_dependency_report(p_student_id);
  RETURN v_rep || jsonb_build_object(
    'full_name', v_s.full_name,
    'admission_number', v_s.admission_number,
    'archived', v_s.deleted_at IS NOT NULL
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_student_delete_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_student_delete_check(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Permanent delete (one transaction)
-- ---------------------------------------------------------------------------
-- Returns what the app must clean up AFTER the commit (storage files, login).
CREATE OR REPLACE FUNCTION public.fn_permanently_delete_student(p_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.students%ROWTYPE;
  v_rep jsonb;
  v_docs jsonb;
  v_labels text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.students WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_tenant_role(auth.uid(), v_s.tenant_id, 'HOSTEL_ADMIN') THEN
    RAISE EXCEPTION 'Only a Hostel Admin can delete a student record' USING ERRCODE = '42501';
  END IF;
  IF v_s.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Archive the student first — only archived students can be permanently deleted' USING ERRCODE = '55000';
  END IF;

  v_rep := public.fn_student_dependency_report(p_student_id);
  IF jsonb_array_length(v_rep -> 'blockers') > 0 THEN
    SELECT string_agg((b ->> 'label') || ' (' || (b ->> 'count') || ')', ', ')
      INTO v_labels FROM jsonb_array_elements(v_rep -> 'blockers') b;
    RAISE EXCEPTION 'Cannot permanently delete: this student still has protected records — %', v_labels
      USING ERRCODE = '55000';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path)), '[]'::jsonb)
    INTO v_docs
    FROM public.documents WHERE owner_type = 'STUDENT' AND owner_id = p_student_id;

  BEGIN
    DELETE FROM public.documents WHERE owner_type = 'STUDENT' AND owner_id = p_student_id;
    DELETE FROM public.student_guardians WHERE student_id = p_student_id;
    DELETE FROM public.students WHERE id = p_student_id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot permanently delete: this student is still referenced by other records (%)', SQLERRM
      USING ERRCODE = '55000';
  END;

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data)
  VALUES (v_s.tenant_id, v_s.property_id, auth.uid(), 'STUDENT_PERMANENTLY_DELETED', 'students', v_s.id,
          jsonb_build_object('full_name', v_s.full_name, 'admission_number', v_s.admission_number, 'status', v_s.status,
                             'documents_removed', jsonb_array_length(v_docs),
                             'guardian_links_removed', v_rep -> 'guardian_links'));

  RETURN jsonb_build_object(
    'documents', v_docs,
    'photo_path', v_s.photo_path,
    'profile_id', v_s.profile_id,
    'delete_auth_user', coalesce((v_rep ->> 'delete_auth_user')::boolean, false)
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_permanently_delete_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_permanently_delete_student(uuid) TO authenticated;
