-- Warden Complaint Management: who resolved a complaint (resolved_at
-- already existed, resolved_by never did), and a lightweight per-complaint
-- comment thread. conversations/messages (parent<->warden chat) has no
-- complaint linkage and extending it would mean touching the shared
-- can_access_conversation() security-definer function the working chat
-- feature depends on — a new small table mirrors the low-risk pattern
-- already used for mess_feedback instead.
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE public.complaint_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.complaint_comments TO authenticated;
GRANT ALL ON public.complaint_comments TO service_role;
ALTER TABLE public.complaint_comments ENABLE ROW LEVEL SECURITY;

-- Student: read/insert only on their own complaint's thread.
CREATE POLICY "complaint comments student read" ON public.complaint_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c JOIN public.students s ON s.id = c.student_id
                 WHERE c.id = complaint_comments.complaint_id AND s.profile_id = auth.uid()));
CREATE POLICY "complaint comments student insert" ON public.complaint_comments FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.complaints c JOIN public.students s ON s.id = c.student_id
    WHERE c.id = complaint_comments.complaint_id AND s.profile_id = auth.uid()));

-- Staff (warden in scope, or admin): full read/insert, mirrors the mess_headcounts `mh_staff` pattern.
CREATE POLICY "complaint comments staff" ON public.complaint_comments FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id))
  WITH CHECK (author_user_id = auth.uid() AND (
    public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id)));
