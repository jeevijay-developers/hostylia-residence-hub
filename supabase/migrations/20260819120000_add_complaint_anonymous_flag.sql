-- Anonymous complaints: a student can optionally hide their identity from
-- Admin/Warden when filing a complaint. Existing complaint tracking/status/
-- SLA/photo/notification behavior is unchanged either way; only the
-- student's displayed identity is affected.
--
-- Plain table RLS can't express this (RLS filters rows, not columns — an
-- Admin/Warden legitimately has row-level SELECT on `complaints` and
-- `students`, so a per-request column mask has to live in a view). Both
-- views below are `security_invoker = true`, so the caller's own existing
-- RLS on `complaints`/`complaint_comments`/`students`/`profiles` still
-- governs row access exactly as before — these views add no new access,
-- they only null out the student's identity columns when the complaint is
-- anonymous.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.v_complaints_feed
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.tenant_id,
  c.property_id,
  c.block_id,
  c.room_id,
  c.bed_id,
  c.student_id,
  c.category_id,
  c.complaint_number,
  c.title,
  c.description,
  c.priority,
  c.status,
  c.assigned_to,
  c.assigned_at,
  c.sla_due_at,
  c.sla_breached_at,
  c.resolved_at,
  c.resolved_by,
  c.closed_at,
  c.resolution_summary,
  c.rating,
  c.rating_comment,
  c.reopen_until,
  c.is_anonymous,
  c.created_at,
  c.updated_at,
  CASE WHEN c.is_anonymous THEN NULL ELSE s.full_name END AS student_full_name,
  CASE WHEN c.is_anonymous THEN NULL ELSE s.admission_number END AS student_admission_number,
  CASE WHEN c.is_anonymous THEN NULL ELSE s.profile_id END AS student_profile_id,
  CASE WHEN c.is_anonymous THEN NULL ELSE p.avatar_path END AS student_avatar_path,
  r.room_number,
  b.name AS block_name,
  cc.name AS category_name
FROM public.complaints c
LEFT JOIN public.students s ON s.id = c.student_id
LEFT JOIN public.profiles p ON p.id = s.profile_id
LEFT JOIN public.rooms r ON r.id = c.room_id
LEFT JOIN public.blocks b ON b.id = c.block_id
LEFT JOIN public.complaint_categories cc ON cc.id = c.category_id
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.v_complaints_feed TO authenticated;

-- Same masking for the per-complaint comment thread: a message the
-- anonymous student posts on their own complaint must not reveal their
-- name to Admin/Warden either. Staff replies are never masked.
CREATE OR REPLACE VIEW public.v_complaint_comments_feed
WITH (security_invoker = true) AS
SELECT
  cm.id,
  cm.tenant_id,
  cm.property_id,
  cm.complaint_id,
  cm.author_user_id,
  cm.body,
  cm.created_at,
  (c.is_anonymous AND cm.author_user_id = s.profile_id) AS is_anonymous_author,
  CASE WHEN c.is_anonymous AND cm.author_user_id = s.profile_id THEN NULL
       ELSE p.full_name END AS author_full_name
FROM public.complaint_comments cm
JOIN public.complaints c ON c.id = cm.complaint_id
LEFT JOIN public.students s ON s.id = c.student_id
LEFT JOIN public.profiles p ON p.id = cm.author_user_id;

GRANT SELECT ON public.v_complaint_comments_feed TO authenticated;
