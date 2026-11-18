-- Student Leave Management, integrated with Attendance.
--
-- Verified against the repo's migrations before writing:
--   * attendance has UNIQUE (student_id, attendance_date, session), status
--     CHECK already includes 'ON_LEAVE', RLS gates writes by can_*_attendance().
--   * can_edit_attendance()/can_view_attendance() already honour tenant,
--     property and block scope (HOSTEL_ADMIN always passes) — reused for approval.
--   * v_attendance_monthly_summary is the single source of attendance % for the
--     Warden/Admin report, the Student/Parent monthly report and reports.functions.
--
-- What this migration does
--   1. leave_requests: PENDING / APPROVED / REJECTED, inclusive date range,
--      reviewer + timestamp + rejection reason. Overlapping PENDING/APPROVED
--      requests for one student are impossible (exclusion constraint).
--      Clients get SELECT only; every write goes through the RPCs below.
--   2. request_leave(): student-owned, active allocation only, validates input.
--   3. review_leave_request(): can_edit_attendance scope, never the student's own
--      request, idempotent, row-locked. Approving reconciles attendance in the
--      same transaction.
--   4. fn_apply_leave_to_attendance(): writes ON_LEAVE attendance rows for every
--      date of an approved request. Existing rows are updated, never deleted, and
--      each change is recorded in audit_logs with the full previous row.
--   5. Attendance guard trigger: ON_LEAVE can only come from an approved request,
--      and a date covered by approved leave cannot be re-marked or deleted.
--   6. v_attendance_monthly_summary: attendance % = (Present + Late) /
--      (Present + Late + Absent); ON_LEAVE (and OUT_PASS / NOT_MARKED) are in
--      neither numerator nor denominator.
--   7. In-app notifications via the existing `notifications` table.
-- Nothing is dropped; no existing RLS policy is changed.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 1. leave_requests
-- ---------------------------------------------------------------------------
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  block_id uuid REFERENCES public.blocks(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  allocation_id uuid NOT NULL REFERENCES public.allocations(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  remarks text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT leave_requests_reason_len CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT leave_requests_remarks_len CHECK (remarks IS NULL OR char_length(remarks) <= 1000),
  CONSTRAINT leave_requests_review_state CHECK (
    (status = 'PENDING'  AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
    OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND rejection_reason IS NOT NULL AND char_length(btrim(rejection_reason)) >= 3)
  ),
  -- Inclusive ranges: [start, end]. Rejected requests never block a new one.
  CONSTRAINT leave_requests_no_overlap EXCLUDE USING gist (
    student_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('PENDING','APPROVED'))
);

CREATE INDEX idx_leave_requests_property_status ON public.leave_requests (property_id, status, created_at DESC);
CREATE INDEX idx_leave_requests_student ON public.leave_requests (student_id, start_date DESC);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.leave_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;

-- A student reads only their own requests; staff read requests inside their
-- tenant/property/block scope via the same attendance permission used for the
-- attendance table. Parents and everyone else get nothing. No INSERT / UPDATE /
-- DELETE policy exists, so the RPCs below are the only write path.
CREATE POLICY leave_requests_student_read ON public.leave_requests FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY leave_requests_staff_read ON public.leave_requests FOR SELECT TO authenticated
  USING (public.can_view_attendance(auth.uid(), tenant_id, property_id, block_id));

-- ---------------------------------------------------------------------------
-- 2. attendance: link to the request a row was derived from
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS leave_request_id uuid REFERENCES public.leave_requests(id);
CREATE INDEX IF NOT EXISTS idx_attendance_leave_request
  ON public.attendance (leave_request_id) WHERE leave_request_id IS NOT NULL;

COMMENT ON COLUMN public.attendance.leave_request_id IS
  'Set when the ON_LEAVE status was derived from an approved leave request (see fn_apply_leave_to_attendance).';

-- ---------------------------------------------------------------------------
-- 3. Notifications (tenant-scoped, idempotent, in-app)
-- ---------------------------------------------------------------------------
-- Staff = Hostel Admins of the tenant (property-scoped admins only for their
-- property) and Wardens whose scope covers the property/block with
-- attendance_edit. Pass NULL titles to skip the staff or the student message.
CREATE OR REPLACE FUNCTION public.fn_notify_leave_event(
  p_tenant_id uuid, p_property_id uuid, p_block_id uuid, p_student_profile_id uuid,
  p_event text, p_key text,
  p_staff_title text, p_staff_body text,
  p_student_title text, p_student_body text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recipient uuid;
BEGIN
  IF p_staff_title IS NOT NULL THEN
    FOR v_recipient IN
      SELECT DISTINCT ra.user_id FROM public.role_assignments ra
      WHERE ra.tenant_id = p_tenant_id AND ra.is_active = true
        AND (
          (ra.role = 'HOSTEL_ADMIN' AND (ra.property_id IS NULL OR ra.property_id = p_property_id))
          OR (ra.role = 'WARDEN'
              AND public.can_edit_attendance(ra.user_id, p_tenant_id, p_property_id, p_block_id))
        )
    LOOP
      INSERT INTO public.notifications (
        tenant_id, property_id, recipient_user_id, event_type, channel,
        template_key, payload, status, sent_at, delivered_at, idempotency_key
      ) VALUES (
        p_tenant_id, p_property_id, v_recipient, p_event, 'IN_APP',
        lower(p_event),
        p_payload || jsonb_build_object('title', p_staff_title, 'body', p_staff_body),
        'DELIVERED', now(), now(), p_key || ':' || v_recipient
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  IF p_student_profile_id IS NOT NULL AND p_student_title IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, property_id, recipient_user_id, event_type, channel,
      template_key, payload, status, sent_at, delivered_at, idempotency_key
    ) VALUES (
      p_tenant_id, p_property_id, p_student_profile_id, p_event, 'IN_APP',
      lower(p_event) || '_student',
      p_payload || jsonb_build_object('title', p_student_title, 'body', p_student_body),
      'DELIVERED', now(), now(), p_key || ':student'
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_notify_leave_event(uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Attendance guard: ON_LEAVE only via approved leave; approved leave is locked
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_attendance_guard_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_covered boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.leave_request_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE lr.id = OLD.leave_request_id AND lr.status = 'APPROVED'
    ) THEN
      RAISE EXCEPTION 'Attendance derived from approved leave cannot be deleted'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.leave_requests lr
    WHERE lr.student_id = NEW.student_id AND lr.status = 'APPROVED'
      AND NEW.attendance_date BETWEEN lr.start_date AND lr.end_date
  ) INTO v_covered;

  IF NEW.status = 'ON_LEAVE' THEN
    -- A pre-existing ON_LEAVE row (legacy manual mark) may be edited in place;
    -- nothing new may become ON_LEAVE unless an approved request covers the date.
    IF NOT v_covered AND NOT (TG_OP = 'UPDATE' AND OLD.status = 'ON_LEAVE') THEN
      RAISE EXCEPTION 'On Leave can only be set through an approved leave request'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_covered THEN
    RAISE EXCEPTION 'Student is on approved leave on %; attendance cannot be changed', NEW.attendance_date
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_attendance_guard_leave() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_attendance_guard_leave ON public.attendance;
CREATE TRIGGER trg_attendance_guard_leave
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_attendance_guard_leave();

-- ---------------------------------------------------------------------------
-- 5. Reconcile attendance for an approved request (internal, idempotent)
-- ---------------------------------------------------------------------------
-- Called only from review_leave_request(), inside its transaction, after the
-- request row is already APPROVED. For every date in [start_date, end_date]:
--   * existing rows (any session) are switched to ON_LEAVE and linked to the
--     request; the previous row is preserved in audit_logs.before_data
--   * if the date has no DAILY row, one is inserted
-- Re-running changes nothing (rows already linked to this request are skipped).
CREATE OR REPLACE FUNCTION public.fn_apply_leave_to_attendance(p_request_id uuid, p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.leave_requests;
  v_day date;
  v_att public.attendance;
  v_changed integer := 0;
  v_note text;
BEGIN
  SELECT * INTO v_req FROM public.leave_requests WHERE id = p_request_id AND status = 'APPROVED';
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Approved leave request not found';
  END IF;
  v_note := 'Approved leave: ' || btrim(v_req.reason);

  FOR v_day IN SELECT d::date FROM generate_series(v_req.start_date, v_req.end_date, interval '1 day') AS d LOOP
    FOR v_att IN
      SELECT * FROM public.attendance
      WHERE student_id = v_req.student_id AND attendance_date = v_day
      FOR UPDATE
    LOOP
      IF v_att.status = 'ON_LEAVE' AND v_att.leave_request_id = v_req.id THEN
        CONTINUE;
      END IF;

      INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
      VALUES (
        v_req.tenant_id, v_req.property_id, p_actor, 'LEAVE_RECONCILE', 'attendance', v_att.id,
        to_jsonb(v_att),
        jsonb_build_object('status', 'ON_LEAVE', 'leave_request_id', v_req.id, 'attendance_date', v_day)
      );

      UPDATE public.attendance SET
        status = 'ON_LEAVE', leave_request_id = v_req.id, source = 'SYSTEM',
        notes = v_note, marked_by = p_actor, marked_at = now(), updated_at = now()
      WHERE id = v_att.id;
      v_changed := v_changed + 1;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.attendance
      WHERE student_id = v_req.student_id AND attendance_date = v_day AND session = 'DAILY'
    ) THEN
      INSERT INTO public.attendance (
        tenant_id, property_id, block_id, student_id, attendance_date, session,
        status, marked_by, source, notes, leave_request_id
      ) VALUES (
        v_req.tenant_id, v_req.property_id, v_req.block_id, v_req.student_id, v_day, 'DAILY',
        'ON_LEAVE', p_actor, 'SYSTEM', v_note, v_req.id
      );
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION public.fn_apply_leave_to_attendance(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. request_leave — the only way a student creates a request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_leave(
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_remarks text DEFAULT NULL
) RETURNS public.leave_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_student record;
  v_alloc record;
  v_req public.leave_requests;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_remarks text := NULLIF(btrim(COALESCE(p_remarks, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Ownership: the request is always made for the caller's own student record.
  -- Locking the student row serialises concurrent submissions.
  SELECT s.id, s.tenant_id, s.property_id, s.profile_id, s.full_name INTO v_student
    FROM public.students s
    WHERE s.profile_id = v_uid AND s.deleted_at IS NULL AND s.status IN ('ACTIVE','NOTICE_GIVEN')
    ORDER BY s.created_at DESC LIMIT 1
    FOR UPDATE;
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Only a student with an active stay can request leave' USING ERRCODE = '42501';
  END IF;

  SELECT a.id, a.block_id INTO v_alloc
    FROM public.allocations a
    WHERE a.student_id = v_student.id AND a.status IN ('ACTIVE','NOTICE_GIVEN') AND a.deleted_at IS NULL
    ORDER BY a.created_at DESC LIMIT 1;
  IF v_alloc.id IS NULL THEN
    RAISE EXCEPTION 'You need an active room allocation to request leave' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date cannot be before the start date';
  END IF;
  IF p_start_date < v_today THEN
    RAISE EXCEPTION 'Leave cannot start in the past';
  END IF;
  IF (p_end_date - p_start_date) + 1 > 90 THEN
    RAISE EXCEPTION 'A single leave request can cover at most 90 days';
  END IF;
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Reason is required (3-500 characters)';
  END IF;
  IF v_remarks IS NOT NULL AND char_length(v_remarks) > 1000 THEN
    RAISE EXCEPTION 'Remarks must be 1000 characters or fewer';
  END IF;

  BEGIN
    INSERT INTO public.leave_requests (
      tenant_id, property_id, block_id, student_id, allocation_id,
      start_date, end_date, reason, remarks
    ) VALUES (
      v_student.tenant_id, v_student.property_id, v_alloc.block_id, v_student.id, v_alloc.id,
      p_start_date, p_end_date, v_reason, v_remarks
    ) RETURNING * INTO v_req;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'You already have a pending or approved leave request overlapping these dates'
      USING ERRCODE = '23P01';
  END;

  PERFORM public.fn_notify_leave_event(
    v_req.tenant_id, v_req.property_id, v_req.block_id, v_student.profile_id,
    'LEAVE_REQUEST_SUBMITTED', 'leave_request:' || v_req.id || ':submitted',
    'Leave request submitted',
    format('%s requested leave from %s to %s. Reason: %s', v_student.full_name, p_start_date, p_end_date, v_reason),
    'Leave request submitted',
    format('Your leave request for %s to %s has been submitted for review.', p_start_date, p_end_date),
    jsonb_build_object('leave_request_id', v_req.id, 'student_id', v_student.id,
                       'start_date', p_start_date, 'end_date', p_end_date)
  );

  RETURN v_req;
END $$;

REVOKE ALL ON FUNCTION public.request_leave(date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_leave(date, date, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. review_leave_request — approve / reject
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_leave_request(
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
) RETURNS public.leave_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.leave_requests;
  v_student record;
  v_reason text := NULLIF(btrim(COALESCE(p_rejection_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Decision must be APPROVED or REJECTED';
  END IF;

  SELECT * INTO v_req FROM public.leave_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;

  -- Same attendance_edit permission (tenant + property + block scoped) that
  -- guards writing attendance; HOSTEL_ADMIN always passes, other tenants never.
  IF NOT public.can_edit_attendance(v_uid, v_req.tenant_id, v_req.property_id, v_req.block_id) THEN
    RAISE EXCEPTION 'Not authorized to review this leave request' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.profile_id, s.full_name, s.status INTO v_student
    FROM public.students s WHERE s.id = v_req.student_id;
  IF v_student.profile_id IS NOT NULL AND v_student.profile_id = v_uid THEN
    RAISE EXCEPTION 'You cannot review your own leave request' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: repeating the same decision is a no-op; changing a decision is not allowed.
  IF v_req.status = p_decision THEN
    RETURN v_req;
  END IF;
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This leave request has already been %', lower(v_req.status);
  END IF;

  IF p_decision = 'REJECTED' THEN
    IF v_reason IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 500 THEN
      RAISE EXCEPTION 'A rejection reason is required (3-500 characters)';
    END IF;
    UPDATE public.leave_requests SET
      status = 'REJECTED', reviewed_by = v_uid, reviewed_at = now(),
      rejection_reason = v_reason, updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

    PERFORM public.fn_notify_leave_event(
      v_req.tenant_id, v_req.property_id, v_req.block_id, v_student.profile_id,
      'LEAVE_REQUEST_REJECTED', 'leave_request:' || v_req.id || ':rejected',
      NULL, NULL,
      'Leave request rejected',
      format('Your leave request for %s to %s was rejected. Reason: %s', v_req.start_date, v_req.end_date, v_reason),
      jsonb_build_object('leave_request_id', v_req.id, 'student_id', v_req.student_id)
    );
    RETURN v_req;
  END IF;

  IF v_student.status NOT IN ('ACTIVE', 'NOTICE_GIVEN') THEN
    RAISE EXCEPTION 'Leave can only be approved for a student with an active stay';
  END IF;

  UPDATE public.leave_requests SET
    status = 'APPROVED', reviewed_by = v_uid, reviewed_at = now(),
    rejection_reason = NULL, updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_req;

  PERFORM public.fn_apply_leave_to_attendance(v_req.id, v_uid);

  PERFORM public.fn_notify_leave_event(
    v_req.tenant_id, v_req.property_id, v_req.block_id, v_student.profile_id,
    'LEAVE_REQUEST_APPROVED', 'leave_request:' || v_req.id || ':approved',
    NULL, NULL,
    'Leave request approved',
    format('Your leave from %s to %s has been approved.', v_req.start_date, v_req.end_date),
    jsonb_build_object('leave_request_id', v_req.id, 'student_id', v_req.student_id)
  );
  RETURN v_req;
END $$;

REVOKE ALL ON FUNCTION public.review_leave_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_leave_request(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Attendance % — leave excluded from numerator and denominator
-- ---------------------------------------------------------------------------
-- Same columns, order and types as before so CREATE OR REPLACE is valid.
-- attendance_pct = (PRESENT + LATE) / (PRESENT + LATE + ABSENT) * 100.
-- present_days / late_days stay separate so reports can still show Late on its
-- own; leave_days is reported but never counted in the percentage.
CREATE OR REPLACE VIEW public.v_attendance_monthly_summary
WITH (security_invoker = true) AS
SELECT
  a.tenant_id,
  a.property_id,
  a.block_id,
  a.student_id,
  date_trunc('month', a.attendance_date)::date AS month,
  COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int    AS present_days,
  COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int      AS absent_days,
  COUNT(*) FILTER (WHERE a.status = 'LATE')::int        AS late_days,
  COUNT(*) FILTER (WHERE a.status = 'ON_LEAVE')::int    AS leave_days,
  COUNT(*) FILTER (WHERE a.status = 'OUT_PASS')::int    AS out_pass_days,
  COUNT(*) FILTER (WHERE a.status != 'NOT_MARKED')::int AS marked_days,
  CASE WHEN COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'ABSENT')) = 0 THEN NULL
       ELSE ROUND(
         COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))::numeric * 100.0
         / NULLIF(COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'ABSENT')), 0),
         2)
  END AS attendance_pct
FROM public.attendance a
GROUP BY a.tenant_id, a.property_id, a.block_id, a.student_id, date_trunc('month', a.attendance_date);

GRANT SELECT ON public.v_attendance_monthly_summary TO authenticated;
