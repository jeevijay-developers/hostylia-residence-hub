-- Automatic account linking for public-form admission applicants.
--
-- A student applies on /apply/<slug> (students row, status APPLICANT, no login),
-- then signs up at /signup with the same email or phone. After the contact is
-- VERIFIED (auth.users.email_confirmed_at / phone_confirmed_at), the server calls
-- fn_link_public_applicant(user_id) which links students.profile_id when — and only
-- when — exactly one live student record matches. Linking is NOT approval: students.status
-- is never touched (stays APPLICANT until the existing admission/KYC/allocation flow).
--
-- Eligibility: status = 'APPLICANT', profile_id IS NULL, deleted_at IS NULL and
-- metadata->>'origin' = 'apply_form' (set only by the public /apply form).
--
-- Not applied automatically: review and push with `supabase db push`.

CREATE OR REPLACE FUNCTION public.fn_link_public_applicant(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email   text;
  v_phone   text;
  v_meta    jsonb;
  v_match   public.students%ROWTYPE;
  v_count   int;
  v_now     timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'no_user');
  END IF;

  -- One linker per user at a time; a second concurrent call waits, then sees the link.
  PERFORM pg_advisory_xact_lock(hashtextextended('link-applicant-user:' || p_user_id, 0));

  -- Verified contact only, read from auth.users (never from caller input).
  SELECT CASE WHEN u.email_confirmed_at IS NOT NULL THEN NULLIF(lower(btrim(u.email)), '') END,
         CASE WHEN u.phone_confirmed_at IS NOT NULL THEN public.normalize_phone(u.phone) END,
         coalesce(u.raw_user_meta_data, '{}'::jsonb)
    INTO v_email, v_phone, v_meta
    FROM auth.users u WHERE u.id = p_user_id;

  IF NOT FOUND OR (v_email IS NULL AND v_phone IS NULL) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'no_verified_contact');
  END IF;

  -- Never overwrite: this account is already a student or a guardian.
  IF EXISTS (SELECT 1 FROM public.students WHERE profile_id = p_user_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'already_linked');
  END IF;
  IF EXISTS (SELECT 1 FROM public.guardians WHERE profile_id = p_user_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'guardian_account');
  END IF;

  -- Match universe = EVERY live student sharing a verified email/phone, in any
  -- tenant, linked or not. Anything other than exactly one is left to Admin review
  -- (covers multiple matches and email-vs-phone conflicts).
  SELECT count(*) INTO v_count FROM public.students s
   WHERE s.deleted_at IS NULL
     AND ((v_email IS NOT NULL AND lower(btrim(s.email::text)) = v_email)
       OR (v_phone IS NOT NULL AND public.normalize_phone(s.phone) = v_phone));
  IF v_count = 0 THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'no_match');
  ELSIF v_count > 1 THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'ambiguous');
  END IF;

  SELECT s.* INTO v_match FROM public.students s
   WHERE s.deleted_at IS NULL
     AND ((v_email IS NOT NULL AND lower(btrim(s.email::text)) = v_email)
       OR (v_phone IS NOT NULL AND public.normalize_phone(s.phone) = v_phone))
   FOR UPDATE;

  IF v_match.profile_id IS NOT NULL THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'record_already_linked');
  END IF;
  IF v_match.status <> 'APPLICANT' OR coalesce(v_match.metadata->>'origin', '') <> 'apply_form' THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'not_public_applicant');
  END IF;

  -- Tenant / property isolation.
  IF EXISTS (SELECT 1 FROM public.tenant_memberships m
              WHERE m.user_id = p_user_id AND m.tenant_id <> v_match.tenant_id
                AND m.status IN ('INVITED', 'ACTIVE')) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'tenant_conflict');
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_memberships m
              WHERE m.user_id = p_user_id AND m.tenant_id = v_match.tenant_id
                AND m.status IN ('SUSPENDED', 'REVOKED')) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'membership_blocked');
  END IF;
  IF NULLIF(v_meta->>'property_slug', '') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.properties p
        WHERE p.id = v_match.property_id AND p.tenant_id = v_match.tenant_id
          AND p.slug = v_meta->>'property_slug') THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'property_mismatch');
  END IF;

  BEGIN
    UPDATE public.students
       SET profile_id = p_user_id, portal_access_enabled = true
     WHERE id = v_match.id AND profile_id IS NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('linked', false, 'reason', 'record_already_linked');
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- uniq_students_profile: the account got linked elsewhere concurrently.
    RETURN jsonb_build_object('linked', false, 'reason', 'already_linked');
  END;

  -- Same grants the manual "Confirm & link account" makes, so the student can reach
  -- their portal; status is deliberately left at APPLICANT.
  INSERT INTO public.tenant_memberships (tenant_id, user_id, status, joined_at)
  VALUES (v_match.tenant_id, p_user_id, 'ACTIVE', v_now)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = 'ACTIVE', joined_at = coalesce(public.tenant_memberships.joined_at, v_now)
    WHERE public.tenant_memberships.status = 'INVITED';

  IF NOT EXISTS (SELECT 1 FROM public.role_assignments r
                  WHERE r.user_id = p_user_id AND r.tenant_id = v_match.tenant_id
                    AND r.role = 'STUDENT' AND r.revoked_at IS NULL) THEN
    INSERT INTO public.role_assignments (tenant_id, user_id, role, property_id, is_active, granted_at)
    VALUES (v_match.tenant_id, p_user_id, 'STUDENT', v_match.property_id, true, v_now);
  END IF;

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, after_data)
  VALUES (v_match.tenant_id, v_match.property_id, p_user_id, 'APPLICANT_AUTO_LINKED', 'students', v_match.id,
          jsonb_build_object('admission_number', v_match.admission_number, 'status', v_match.status,
                             'matched_on', CASE WHEN v_email IS NOT NULL AND lower(btrim(v_match.email::text)) = v_email
                                                THEN 'email' ELSE 'phone' END));

  RETURN jsonb_build_object('linked', true, 'student_id', v_match.id, 'status', v_match.status);
END $$;

REVOKE ALL ON FUNCTION public.fn_link_public_applicant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_link_public_applicant(uuid) TO service_role;

-- Admin and Warden dashboards refresh live when a link (or any student change) lands.
-- RLS still filters what each subscriber receives.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'students') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  END IF;
END $$;
