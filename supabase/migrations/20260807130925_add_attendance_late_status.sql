-- Warden Attendance module: spec wants Present/Absent/Late/Leave. LATE never
-- existed as a value; add it (additive — OUT_PASS/NOT_MARKED stay in the
-- constraint for any other flow that uses them, just not exposed as options
-- in the warden marking UI). "Leave" maps to the existing ON_LEAVE value, no
-- new value needed there.
ALTER TABLE public.attendance DROP CONSTRAINT attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status = ANY (ARRAY['PRESENT'::text, 'ABSENT'::text, 'LATE'::text, 'ON_LEAVE'::text, 'OUT_PASS'::text, 'NOT_MARKED'::text]));
