-- Out-Pass attendance + overdue-return detection.
--
-- Nothing here creates, edits or deletes an attendance row, a gate event or a
-- gate-pass return. "Out-Pass" is DERIVED, on read, from the existing gate
-- records:
--
--   A student is Out-Pass at an instant T when one of their approved passes has
--   an actual OUT gate event before T and NO IN gate event at or before T.
--
-- gate_events is the source of truth (it is append-only and written first by the
-- scan; gate_passes.actual_out_at / actual_in_at are denormalised copies updated
-- afterwards). Expiry is never treated as a return: only a recorded IN event ends
-- an Out-Pass.
--
-- Status handling (existing workflow is untouched):
--   * A pass that has been scanned OUT stays ACTIVE until its IN scan, exactly as
--     today. The return scan only accepts ACTIVE passes and the gate screen lists
--     ACTIVE passes as "currently out", so an overdue pass is NOT flipped to
--     EXPIRED — it is flagged as overdue instead (derived + alerted).
--   * EXPIRED is used for what it means: an APPROVED pass whose return time has
--     passed without the student ever being scanned out (it can no longer be used,
--     and it never counts as Out-Pass because there was no departure).
--
-- Permissions: the read functions are SECURITY INVOKER, so each caller sees only
-- what the existing RLS on gate_passes / gate_events / students lets them see
-- (admin: tenant, warden: their property/block scope + gate permission). The
-- scheduled scan is SECURITY DEFINER, schedule-only (not callable by clients).

-- ---------------------------------------------------------------------------
-- 1. Departure / return "legs" of approved passes (property-scoped, or all when NULL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gate_pass_legs(p_property_id uuid DEFAULT NULL)
RETURNS TABLE (
  gate_pass_id uuid, tenant_id uuid, property_id uuid, block_id uuid, student_id uuid,
  pass_number text, out_at timestamptz, in_at timestamptz, expected_in_at timestamptz, tz text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT gp.id, gp.tenant_id, gp.property_id, gp.block_id, gp.student_id,
         gp.pass_number, o.out_at, i.in_at, gp.expected_in_at,
         coalesce(pr.timezone, 'Asia/Kolkata')
    FROM public.gate_passes gp
    JOIN public.properties pr ON pr.id = gp.property_id
    JOIN LATERAL (
      SELECT min(e.event_at) AS out_at
        FROM public.gate_events e
       WHERE e.gate_pass_id = gp.id AND e.direction = 'OUT'
    ) o ON o.out_at IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT min(e.event_at) AS in_at
        FROM public.gate_events e
       WHERE e.gate_pass_id = gp.id AND e.direction = 'IN' AND e.event_at >= o.out_at
    ) i ON true
   WHERE gp.deleted_at IS NULL
     AND gp.student_id IS NOT NULL
     AND gp.status IN ('APPROVED', 'ACTIVE', 'COMPLETED', 'EXPIRED')
     AND (p_property_id IS NULL OR gp.property_id = p_property_id);
$$;
REVOKE ALL ON FUNCTION public.fn_gate_pass_legs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_gate_pass_legs(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Students who are Out-Pass on a given date (property timezone)
-- ---------------------------------------------------------------------------
-- Reference instant = end of that local day, capped at "now" for today. A student
-- who left and came back inside the same day is therefore NOT Out-Pass; one who
-- left and has not returned by then is. Future dates return nothing.
CREATE OR REPLACE FUNCTION public.fn_students_on_out_pass(p_property_id uuid, p_date date)
RETURNS TABLE (
  student_id uuid, gate_pass_id uuid, pass_number text,
  out_at timestamptz, expected_in_at timestamptz, is_overdue boolean, tz text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH prop AS (
    SELECT coalesce(pr.timezone, 'Asia/Kolkata') AS tz FROM public.properties pr WHERE pr.id = p_property_id
  ), ref AS (
    SELECT prop.tz,
           least(((p_date + 1)::timestamp AT TIME ZONE prop.tz), now()) AS ts,
           (p_date <= (now() AT TIME ZONE prop.tz)::date) AS not_future
      FROM prop
  )
  SELECT l.student_id, l.gate_pass_id, l.pass_number, l.out_at, l.expected_in_at,
         (l.in_at IS NULL AND l.expected_in_at < now()) AS is_overdue, ref.tz
    FROM ref
    CROSS JOIN LATERAL public.fn_gate_pass_legs(p_property_id) l
   WHERE ref.not_future
     AND l.out_at < ref.ts
     AND (l.in_at IS NULL OR l.in_at >= ref.ts)
     AND EXISTS (
       SELECT 1 FROM public.students s
        WHERE s.id = l.student_id AND s.property_id = p_property_id
          AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
     );
$$;
REVOKE ALL ON FUNCTION public.fn_students_on_out_pass(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_students_on_out_pass(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Overdue returns right now (departed, expected return passed, no IN scan)
-- ---------------------------------------------------------------------------
-- Clears itself: the moment an IN event exists the pass drops out of this list.
CREATE OR REPLACE FUNCTION public.fn_overdue_out_passes(p_property_id uuid)
RETURNS TABLE (
  gate_pass_id uuid, student_id uuid, full_name text, admission_number text, pass_number text,
  room_number text, bed_code text, out_at timestamptz, expected_in_at timestamptz,
  overdue_minutes integer, tz text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT l.gate_pass_id, l.student_id, s.full_name, s.admission_number, l.pass_number,
         al.room_number, al.bed_code, l.out_at, l.expected_in_at,
         greatest(0, floor(extract(epoch FROM (now() - l.expected_in_at)) / 60))::integer, l.tz
    FROM public.fn_gate_pass_legs(p_property_id) l
    JOIN public.students s ON s.id = l.student_id
    LEFT JOIN LATERAL (
      SELECT r.room_number, b.code AS bed_code
        FROM public.allocations a
        LEFT JOIN public.rooms r ON r.id = a.room_id
        LEFT JOIN public.beds b ON b.id = a.bed_id
       WHERE a.student_id = l.student_id AND a.deleted_at IS NULL
         AND a.status IN ('ACTIVE', 'NOTICE_GIVEN')
       ORDER BY a.created_at DESC LIMIT 1
    ) al ON true
   WHERE l.in_at IS NULL
     AND l.expected_in_at < now()
     AND s.deleted_at IS NULL AND s.status IN ('ACTIVE', 'NOTICE_GIVEN')
   ORDER BY l.expected_in_at;
$$;
REVOKE ALL ON FUNCTION public.fn_overdue_out_passes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_overdue_out_passes(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Monthly attendance report with Out-Pass (Admin / Warden reports)
-- ---------------------------------------------------------------------------
-- Same columns and rules as v_attendance_monthly_summary (which Student / Parent
-- keep reading unchanged), plus gate-derived Out-Pass days:
--   * every local day on which the student was Out-Pass (see §2) counts once in
--     out_pass_days — whether or not an attendance row exists for that day;
--   * on such a day, saved Present / Late / Absent rows are NOT counted as
--     present / late / absent (the rows themselves are untouched);
--   * approved-leave rows win: a day on leave is leave, never Out-Pass;
--   * attendance_pct = (Present + Late) / (Present + Late + Absent), so Out-Pass
--     (and leave) are out of the denominator.
CREATE OR REPLACE FUNCTION public.fn_attendance_monthly_report(p_property_id uuid, p_month date)
RETURNS TABLE (
  tenant_id uuid, property_id uuid, block_id uuid, student_id uuid, month date,
  present_days integer, absent_days integer, late_days integer, leave_days integer,
  out_pass_days integer, marked_days integer, attendance_pct numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH p AS (
    SELECT pr.id, pr.tenant_id, coalesce(pr.timezone, 'Asia/Kolkata') AS tz,
           date_trunc('month', p_month)::date AS m_start,
           (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date AS m_end
      FROM public.properties pr WHERE pr.id = p_property_id
  ),
  out_days AS (
    SELECT l.student_id, d::date AS day, max(l.block_id::text)::uuid AS block_id
      FROM p
      CROSS JOIN LATERAL public.fn_gate_pass_legs(p_property_id) l
      CROSS JOIN LATERAL generate_series(
        greatest((l.out_at AT TIME ZONE p.tz)::date, p.m_start)::timestamp,
        least(
          CASE WHEN l.in_at IS NULL THEN (now() AT TIME ZONE p.tz)::date
               ELSE (l.in_at AT TIME ZONE p.tz)::date - 1 END,
          p.m_end)::timestamp,
        interval '1 day') d
     GROUP BY l.student_id, d::date
  ),
  att AS (
    SELECT a.student_id, a.block_id, a.status, a.attendance_date
      FROM public.attendance a, p
     WHERE a.property_id = p_property_id
       AND a.attendance_date BETWEEN p.m_start AND p.m_end
  ),
  leave_days AS (
    SELECT DISTINCT student_id, attendance_date AS day FROM att WHERE status = 'ON_LEAVE'
  ),
  rows_flagged AS (
    SELECT a.student_id, a.block_id, a.status,
           (o.day IS NOT NULL AND a.status <> 'ON_LEAVE') AS is_out
      FROM att a
      LEFT JOIN out_days o ON o.student_id = a.student_id AND o.day = a.attendance_date
  ),
  per_student AS (
    SELECT st.student_id,
           count(rf.*) FILTER (WHERE rf.status = 'PRESENT' AND NOT rf.is_out)::int AS present_days,
           count(rf.*) FILTER (WHERE rf.status = 'ABSENT'  AND NOT rf.is_out)::int AS absent_days,
           count(rf.*) FILTER (WHERE rf.status = 'LATE'    AND NOT rf.is_out)::int AS late_days,
           count(rf.*) FILTER (WHERE rf.status = 'ON_LEAVE')::int                   AS leave_days,
           count(rf.*) FILTER (WHERE rf.status = 'OUT_PASS' AND NOT rf.is_out)::int AS legacy_out_rows,
           count(rf.*) FILTER (WHERE rf.status <> 'NOT_MARKED')::int                AS marked_days,
           coalesce(max(rf.block_id::text)::uuid,
                    (SELECT max(od.block_id::text)::uuid FROM out_days od WHERE od.student_id = st.student_id)) AS block_id
      FROM (SELECT att.student_id FROM att UNION SELECT od.student_id FROM out_days od) st
      LEFT JOIN rows_flagged rf ON rf.student_id = st.student_id
     GROUP BY st.student_id
  )
  SELECT p.tenant_id, p.id, ps.block_id, ps.student_id, p.m_start,
         ps.present_days, ps.absent_days, ps.late_days, ps.leave_days,
         (ps.legacy_out_rows + (
            SELECT count(*) FROM out_days o
             WHERE o.student_id = ps.student_id
               AND NOT EXISTS (SELECT 1 FROM leave_days ld WHERE ld.student_id = o.student_id AND ld.day = o.day)
          ))::int AS out_pass_days,
         ps.marked_days,
         CASE WHEN (ps.present_days + ps.late_days + ps.absent_days) = 0 THEN NULL
              ELSE round((ps.present_days + ps.late_days)::numeric * 100.0
                         / (ps.present_days + ps.late_days + ps.absent_days), 2)
         END AS attendance_pct
    FROM per_student ps CROSS JOIN p;
$$;
REVOKE ALL ON FUNCTION public.fn_attendance_monthly_report(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_attendance_monthly_report(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Returning clears the alert (immediately, not at the next scan)
-- ---------------------------------------------------------------------------
-- An IN gate event marks that pass's overdue notifications read and stamps them
-- resolved. The event itself is untouched; this only updates the notification.
CREATE OR REPLACE FUNCTION public.fn_gate_event_resolve_overdue_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications n
     SET read_at = coalesce(n.read_at, now()),
         updated_at = now(),
         payload = n.payload || jsonb_build_object('resolved', true, 'returned_at', NEW.event_at)
   WHERE n.event_type = 'GATE_PASS_OVERDUE'
     AND n.payload ->> 'pass_id' = NEW.gate_pass_id::text
     AND n.read_at IS NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_gate_event_resolve_overdue_alert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gate_events_resolve_overdue ON public.gate_events;
CREATE TRIGGER trg_gate_events_resolve_overdue
  AFTER INSERT ON public.gate_events
  FOR EACH ROW
  WHEN (NEW.direction = 'IN' AND NEW.gate_pass_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_gate_event_resolve_overdue_alert();

-- ---------------------------------------------------------------------------
-- 6. Scheduled scan (idempotent, tenant/property-scoped, timezone-aware)
-- ---------------------------------------------------------------------------
--  a) EXPIRE: APPROVED passes whose return time passed with no OUT event ever.
--  b) ALERT: overdue departed passes -> in-app notification to the property's
--     Hostel Admins and Wardens (block scope + gate-view permission). The
--     notification idempotency key is (pass, recipient), so re-running the scan,
--     or two overlapping runs, can never create a second alert.
--  c) SWEEP: any overdue alert whose pass now has an IN event is marked resolved
--     (belt and braces for the trigger in §5).
CREATE OR REPLACE FUNCTION public.fn_scan_overdue_gate_passes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_user uuid;
  v_expired int := 0;
  v_alerts int := 0;
  v_resolved int := 0;
  v_id uuid;
BEGIN
  UPDATE public.gate_passes gp
     SET status = 'EXPIRED', updated_at = now()
   WHERE gp.status = 'APPROVED' AND gp.deleted_at IS NULL
     AND gp.expected_in_at < now() AND gp.actual_out_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.gate_events e WHERE e.gate_pass_id = gp.id AND e.direction = 'OUT');
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  FOR r IN
    SELECT l.gate_pass_id, l.tenant_id, l.property_id, l.block_id, l.student_id, l.pass_number,
           l.out_at, l.expected_in_at, l.tz, s.full_name, al.room_number, al.bed_code
      FROM public.fn_gate_pass_legs(NULL) l
      JOIN public.students s ON s.id = l.student_id
      LEFT JOIN LATERAL (
        SELECT rm.room_number, bd.code AS bed_code
          FROM public.allocations a
          LEFT JOIN public.rooms rm ON rm.id = a.room_id
          LEFT JOIN public.beds bd ON bd.id = a.bed_id
         WHERE a.student_id = l.student_id AND a.deleted_at IS NULL AND a.status IN ('ACTIVE', 'NOTICE_GIVEN')
         ORDER BY a.created_at DESC LIMIT 1
      ) al ON true
     WHERE l.in_at IS NULL AND l.expected_in_at < now()
       AND s.deleted_at IS NULL AND s.status IN ('ACTIVE', 'NOTICE_GIVEN')
     LIMIT 1000
  LOOP
    FOR v_user IN
      SELECT DISTINCT ra.user_id
        FROM public.role_assignments ra
       WHERE ra.tenant_id = r.tenant_id AND ra.is_active = true AND ra.revoked_at IS NULL
         AND (ra.property_id IS NULL OR ra.property_id = r.property_id)
         AND (
           ra.role = 'HOSTEL_ADMIN'::app_role
           OR (ra.role = 'WARDEN'::app_role
               AND (ra.block_id IS NULL OR r.block_id IS NULL OR ra.block_id = r.block_id)
               AND public.can_view_gate_passes(ra.user_id, r.tenant_id, r.property_id))
         )
    LOOP
      v_id := public.fn_enqueue_in_app_notification(
        r.tenant_id, r.property_id, v_user, 'GATE_PASS_OVERDUE', 'gate_pass_overdue',
        jsonb_build_object(
          'title', 'Overdue return — ' || r.full_name,
          'body', r.full_name
                  || CASE WHEN r.room_number IS NOT NULL
                          THEN ' (Room ' || r.room_number || coalesce(' / ' || r.bed_code, '') || ')' ELSE '' END
                  || ' left at ' || to_char(r.out_at AT TIME ZONE r.tz, 'DD Mon, HH12:MI AM')
                  || ', expected back by ' || to_char(r.expected_in_at AT TIME ZONE r.tz, 'DD Mon, HH12:MI AM')
                  || ' — no return scan yet.',
          'pass_id', r.gate_pass_id, 'pass_number', r.pass_number, 'student_id', r.student_id,
          'out_at', r.out_at, 'expected_in_at', r.expected_in_at
        ),
        'gate-overdue:' || r.gate_pass_id::text || ':' || v_user::text
      );
      IF v_id IS NOT NULL THEN v_alerts := v_alerts + 1; END IF;
    END LOOP;
  END LOOP;

  UPDATE public.notifications n
     SET read_at = coalesce(n.read_at, now()), updated_at = now(),
         payload = n.payload || jsonb_build_object('resolved', true)
   WHERE n.event_type = 'GATE_PASS_OVERDUE' AND n.read_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.gate_events e
        WHERE e.gate_pass_id::text = n.payload ->> 'pass_id' AND e.direction = 'IN'
     );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  RETURN jsonb_build_object('expired', v_expired, 'alerts', v_alerts, 'resolved', v_resolved);
END $$;
REVOKE ALL ON FUNCTION public.fn_scan_overdue_gate_passes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_scan_overdue_gate_passes() TO service_role;

-- Every 5 minutes (same pattern as complaint-sla-scan / publish-scheduled-notices).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gate-overdue-scan') THEN
    PERFORM cron.unschedule('gate-overdue-scan');
  END IF;
  PERFORM cron.schedule('gate-overdue-scan', '*/5 * * * *', $cmd$SELECT public.fn_scan_overdue_gate_passes();$cmd$);
END $$;
