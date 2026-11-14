-- Duplicate student prevention (admin bulk import + public admission).
--
-- Identity rule, per tenant, among live (non-archived) students:
--   phone  = public.normalize_phone(phone)       (digits only, last 10 — the same
--            function the login/profile guard from 20261021090000 uses)
--   email  = lower(btrim(email))                 (blank = none)
-- Only the STUDENT's own phone/email count. Guardian contact numbers live in
-- `guardians` and are never compared, so one parent can still have many
-- students. Archived students (deleted_at set) don't hold a number or email.
--
-- Why a guard trigger and not a UNIQUE index: the live data already contains
-- duplicate students (7 phone groups, 6 email groups at the time of writing),
-- and nothing is merged, renamed or deleted here. A unique index would fail on
-- them. The guard only fires on INSERT and when phone / email actually change
-- (or an archived student is restored), so legacy duplicates are grandfathered
-- until someone resolves them by hand, while every NEW duplicate is refused —
-- under an advisory lock so two concurrent submissions of the same number
-- cannot both pass. To list the existing conflicts (read-only):
--
--   SELECT tenant_id, public.normalize_phone(phone) AS phone_key, count(*), array_agg(id)
--     FROM public.students WHERE deleted_at IS NULL AND public.normalize_phone(phone) IS NOT NULL
--    GROUP BY 1, 2 HAVING count(*) > 1;
--   SELECT tenant_id, lower(btrim(email::text)) AS email_key, count(*), array_agg(id)
--     FROM public.students WHERE deleted_at IS NULL AND btrim(email::text) <> ''
--    GROUP BY 1, 2 HAVING count(*) > 1;

CREATE INDEX IF NOT EXISTS idx_students_tenant_phone_key
  ON public.students (tenant_id, (public.normalize_phone(phone)))
  WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_tenant_email_key
  ON public.students (tenant_id, (lower(btrim(email::text))))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_students_identity_unique_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text := public.normalize_phone(NEW.phone);
  v_email text := NULLIF(lower(btrim(NEW.email::text)), '');
  v_check_phone boolean := true;
  v_check_email boolean := true;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL THEN
    v_check_phone := v_phone IS DISTINCT FROM public.normalize_phone(OLD.phone);
    v_check_email := v_email IS DISTINCT FROM NULLIF(lower(btrim(OLD.email::text)), '');
  END IF;

  -- Fixed order (phone, then email) so concurrent writers can't deadlock.
  -- Transaction-scoped: released at commit/rollback, so the loser re-reads
  -- after the winner has committed and sees its row.
  IF v_check_phone AND v_phone IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('student-phone:' || NEW.tenant_id || ':' || v_phone, 0));
    IF EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.tenant_id = NEW.tenant_id AND s.id <> NEW.id AND s.deleted_at IS NULL
        AND public.normalize_phone(s.phone) = v_phone
    ) THEN
      RAISE EXCEPTION 'Student already registered with this phone number.'
        USING ERRCODE = '23505', CONSTRAINT = 'students_tenant_phone_unique';
    END IF;
  END IF;

  IF v_check_email AND v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('student-email:' || NEW.tenant_id || ':' || v_email, 0));
    IF EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.tenant_id = NEW.tenant_id AND s.id <> NEW.id AND s.deleted_at IS NULL
        AND lower(btrim(s.email::text)) = v_email
    ) THEN
      RAISE EXCEPTION 'Student already registered with this email address.'
        USING ERRCODE = '23505', CONSTRAINT = 'students_tenant_email_unique';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_students_identity_unique_guard ON public.students;
CREATE TRIGGER trg_students_identity_unique_guard
  BEFORE INSERT OR UPDATE OF phone, email, deleted_at ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.fn_students_identity_unique_guard();

-- ---------------------------------------------------------------------------
-- Pre-flight lookups (existence only — they never return student details)
-- ---------------------------------------------------------------------------
-- Staff (bulk import preview): which of these phones / emails already belong to
-- a live student of the tenant. SECURITY DEFINER so a property-scoped Warden
-- still sees tenant-wide duplicates (the trigger above enforces tenant-wide).
CREATE OR REPLACE FUNCTION public.fn_existing_student_identity_keys(
  p_tenant_id uuid, p_property_id uuid, p_phones text[], p_emails text[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_tenant_role(auth.uid(), p_tenant_id, 'HOSTEL_ADMIN')
             OR public.can_create_students(auth.uid(), p_tenant_id, p_property_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'phones', coalesce((
      SELECT jsonb_agg(DISTINCT k) FROM (
        SELECT public.normalize_phone(s.phone) AS k FROM public.students s
        WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
          AND public.normalize_phone(s.phone) = ANY (SELECT public.normalize_phone(x) FROM unnest(p_phones) x)
      ) q), '[]'::jsonb),
    'emails', coalesce((
      SELECT jsonb_agg(DISTINCT k) FROM (
        SELECT lower(btrim(s.email::text)) AS k FROM public.students s
        WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
          AND lower(btrim(s.email::text)) = ANY (SELECT lower(btrim(x)) FROM unnest(p_emails) x)
      ) q), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_existing_student_identity_keys(uuid, uuid, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_existing_student_identity_keys(uuid, uuid, text[], text[]) TO authenticated;

-- Public admission pre-check (called by the server with the service role only).
CREATE OR REPLACE FUNCTION public.fn_student_identity_taken(p_tenant_id uuid, p_phone text, p_email text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'phone_taken', public.normalize_phone(p_phone) IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND public.normalize_phone(s.phone) = public.normalize_phone(p_phone)),
    'email_taken', NULLIF(lower(btrim(p_email)), '') IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND lower(btrim(s.email::text)) = lower(btrim(p_email)))
  );
$$;
REVOKE ALL ON FUNCTION public.fn_student_identity_taken(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_student_identity_taken(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Student + guardian + link as ONE transaction
-- ---------------------------------------------------------------------------
-- Used by bulk import, manual Add Student and public admission, so a failure in
-- the guardian step can no longer leave a half-registered student behind (which
-- would now also block the applicant's retry as a "duplicate"). SECURITY
-- INVOKER: the caller's own RLS applies (service role for the public form).
-- Guardians are matched by (tenant, phone) exactly as before and are never
-- modified — one parent phone can link many students.
CREATE OR REPLACE FUNCTION public.fn_register_student(
  p_tenant_id uuid, p_property_id uuid, p_admission_number text, p_full_name text,
  p_phone text, p_email text, p_date_of_birth date, p_gender text,
  p_academic_institute text, p_course_name text, p_academic_year text,
  p_is_minor boolean, p_metadata jsonb,
  p_guardian_name text, p_guardian_phone text, p_guardian_relationship text, p_guardian_is_emergency boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_student_id uuid;
  v_guardian_id uuid;
BEGIN
  INSERT INTO public.students (
    tenant_id, property_id, admission_number, full_name, phone, email, date_of_birth, gender,
    academic_institute, course_name, academic_year, is_minor, status, metadata
  ) VALUES (
    p_tenant_id, p_property_id, p_admission_number, p_full_name, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_email), ''),
    p_date_of_birth, NULLIF(btrim(p_gender), ''), NULLIF(btrim(p_academic_institute), ''), NULLIF(btrim(p_course_name), ''),
    NULLIF(btrim(p_academic_year), ''), coalesce(p_is_minor, false), 'APPLICANT', coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_student_id;

  IF NULLIF(btrim(p_guardian_phone), '') IS NOT NULL AND NULLIF(btrim(p_guardian_name), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('guardian:' || p_tenant_id || ':' || p_guardian_phone, 0));
    SELECT id INTO v_guardian_id FROM public.guardians
     WHERE tenant_id = p_tenant_id AND phone = p_guardian_phone ORDER BY created_at LIMIT 1;
    IF v_guardian_id IS NULL THEN
      INSERT INTO public.guardians (tenant_id, full_name, phone)
      VALUES (p_tenant_id, p_guardian_name, p_guardian_phone) RETURNING id INTO v_guardian_id;
    END IF;
    INSERT INTO public.student_guardians (tenant_id, student_id, guardian_id, relationship, is_primary, is_emergency_contact)
    VALUES (p_tenant_id, v_student_id, v_guardian_id, coalesce(p_guardian_relationship, 'GUARDIAN'), true, coalesce(p_guardian_is_emergency, false));
  END IF;

  RETURN jsonb_build_object('id', v_student_id, 'admission_number', p_admission_number);
END $$;
REVOKE ALL ON FUNCTION public.fn_register_student(uuid, uuid, text, text, text, text, date, text, text, text, text, boolean, jsonb, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_student(uuid, uuid, text, text, text, text, date, text, text, text, text, boolean, jsonb, text, text, text, boolean) TO authenticated, service_role;
