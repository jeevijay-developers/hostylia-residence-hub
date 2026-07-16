
-- Phase 11A: Attendance, Gate Pass/Visitor, Mess, Feedback

-- ============ ATTENDANCE ============
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  block_id uuid REFERENCES public.blocks(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  attendance_date date NOT NULL,
  session text NOT NULL DEFAULT 'DAILY' CHECK (session IN ('DAILY','MORNING','EVENING')),
  status text NOT NULL CHECK (status IN ('PRESENT','ABSENT','ON_LEAVE','OUT_PASS','NOT_MARKED')),
  marked_by uuid NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','BULK','IMPORT','SYSTEM')),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date, session)
);
CREATE INDEX idx_attendance_property_date ON public.attendance(property_id, attendance_date);
CREATE INDEX idx_attendance_block_date ON public.attendance(block_id, attendance_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY att_admin_all ON public.attendance FOR ALL TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY att_warden_write ON public.attendance FOR ALL TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY att_student_read ON public.attendance FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY att_parent_read ON public.attendance FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = attendance.student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid() AND sg.can_view_attendance = true
  ));

-- ============ GATE PASSES ============
CREATE TABLE public.gate_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  block_id uuid REFERENCES public.blocks(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  pass_number text NOT NULL,
  reason text NOT NULL,
  destination text,
  out_at timestamptz NOT NULL,
  expected_in_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_WARDEN','PENDING_PARENT','APPROVED','REJECTED','ACTIVE','COMPLETED','EXPIRED','CANCELLED')),
  requires_parent_approval boolean NOT NULL DEFAULT false,
  warden_approved_by uuid,
  warden_approved_at timestamptz,
  parent_approved_by uuid,
  parent_approved_at timestamptz,
  decision_reason text,
  qr_token_hash text,
  qr_expires_at timestamptz,
  actual_out_at timestamptz,
  actual_in_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (property_id, pass_number),
  CONSTRAINT gp_expected_after_out CHECK (expected_in_at > out_at)
);
CREATE INDEX idx_gp_status ON public.gate_passes(property_id, status);
CREATE INDEX idx_gp_student ON public.gate_passes(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gate_passes TO authenticated;
GRANT ALL ON public.gate_passes TO service_role;
ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY gp_admin_all ON public.gate_passes FOR ALL TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY gp_warden ON public.gate_passes FOR ALL TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY gp_student_own_read ON public.gate_passes FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY gp_student_insert ON public.gate_passes FOR INSERT TO authenticated
  WITH CHECK (public.is_owning_student(auth.uid(), student_id) AND status IN ('DRAFT','PENDING_PARENT','PENDING_WARDEN'));
CREATE POLICY gp_student_cancel ON public.gate_passes FOR UPDATE TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id))
  WITH CHECK (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY gp_parent_read ON public.gate_passes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = gate_passes.student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid() AND sg.can_view_gate_events = true
  ));

-- Auto pass_number
CREATE OR REPLACE FUNCTION public.fn_gate_pass_number()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.pass_number IS NOT NULL AND NEW.pass_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'GP-' || to_char(now(),'YYMM') || '-';
  SELECT COUNT(*)+1 INTO v_count FROM public.gate_passes
    WHERE property_id = NEW.property_id AND pass_number LIKE v_prefix || '%';
  NEW.pass_number := v_prefix || lpad(v_count::text,5,'0');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gp_number BEFORE INSERT ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.fn_gate_pass_number();
CREATE TRIGGER trg_gp_updated BEFORE UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ GATE PASS APPROVALS ============
CREATE TABLE public.gate_pass_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  gate_pass_id uuid NOT NULL REFERENCES public.gate_passes(id) ON DELETE CASCADE,
  approver_type text NOT NULL CHECK (approver_type IN ('WARDEN','PARENT','HOSTEL_ADMIN')),
  approver_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gpa_pass ON public.gate_pass_approvals(gate_pass_id);
GRANT SELECT, INSERT ON public.gate_pass_approvals TO authenticated;
GRANT ALL ON public.gate_pass_approvals TO service_role;
ALTER TABLE public.gate_pass_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY gpa_read_scoped ON public.gate_pass_approvals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gate_passes gp WHERE gp.id = gate_pass_id AND (
    public.is_hostel_admin(auth.uid(), gp.tenant_id, gp.property_id)
    OR public.warden_can_read_property(auth.uid(), gp.tenant_id, gp.property_id)
    OR public.is_owning_student(auth.uid(), gp.student_id)
  )));
CREATE POLICY gpa_insert_by_actor ON public.gate_pass_approvals FOR INSERT TO authenticated
  WITH CHECK (approver_user_id = auth.uid());

-- Parent approval must be a linked guardian with can_approve_gate_pass
CREATE OR REPLACE FUNCTION public.fn_validate_parent_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_student uuid; v_ok boolean;
BEGIN
  IF NEW.parent_approved_by IS NOT NULL AND (OLD IS NULL OR OLD.parent_approved_by IS DISTINCT FROM NEW.parent_approved_by) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = NEW.student_id AND sg.unlinked_at IS NULL
        AND g.profile_id = NEW.parent_approved_by AND sg.can_approve_gate_pass = true
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Parent approver % is not a linked guardian with can_approve_gate_pass', NEW.parent_approved_by;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gp_parent_validate BEFORE INSERT OR UPDATE ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_parent_approval();

-- ============ VISITORS ============
CREATE TABLE public.visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  host_student_id uuid NOT NULL REFERENCES public.students(id),
  name text NOT NULL,
  phone text NOT NULL,
  purpose text NOT NULL,
  photo_document_id uuid REFERENCES public.documents(id),
  id_document_id uuid REFERENCES public.documents(id),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED','CHECKED_IN','CHECKED_OUT','EXPIRED','CANCELLED')),
  expected_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_visitors_status ON public.visitors(property_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitors TO authenticated;
GRANT ALL ON public.visitors TO service_role;
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vis_admin ON public.visitors FOR ALL TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY vis_warden ON public.visitors FOR ALL TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY vis_student_own_read ON public.visitors FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), host_student_id));
CREATE POLICY vis_student_insert ON public.visitors FOR INSERT TO authenticated
  WITH CHECK (public.is_owning_student(auth.uid(), host_student_id));
CREATE TRIGGER trg_vis_updated BEFORE UPDATE ON public.visitors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ GATE EVENTS ============
CREATE TABLE public.gate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  block_id uuid REFERENCES public.blocks(id),
  student_id uuid REFERENCES public.students(id),
  visitor_id uuid REFERENCES public.visitors(id),
  gate_pass_id uuid REFERENCES public.gate_passes(id),
  direction text NOT NULL CHECK (direction IN ('IN','OUT')),
  method text NOT NULL DEFAULT 'MANUAL' CHECK (method IN ('QR','MANUAL')),
  event_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  device_id text,
  idempotency_key text NOT NULL,
  is_late boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ge_one_subject CHECK (
    (student_id IS NOT NULL AND visitor_id IS NULL) OR
    (student_id IS NULL AND visitor_id IS NOT NULL)
  ),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX idx_ge_property_time ON public.gate_events(property_id, event_at DESC);
CREATE INDEX idx_ge_student ON public.gate_events(student_id, event_at DESC);
-- Append-only: no UPDATE/DELETE grants
GRANT SELECT, INSERT ON public.gate_events TO authenticated;
GRANT ALL ON public.gate_events TO service_role;
ALTER TABLE public.gate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ge_admin_read ON public.gate_events FOR SELECT TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY ge_warden_read ON public.gate_events FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY ge_warden_insert ON public.gate_events FOR INSERT TO authenticated
  WITH CHECK (public.warden_can_read_property(auth.uid(), tenant_id, property_id)
    OR public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY ge_student_read ON public.gate_events FOR SELECT TO authenticated
  USING (student_id IS NOT NULL AND public.is_owning_student(auth.uid(), student_id));
CREATE POLICY ge_parent_read ON public.gate_events FOR SELECT TO authenticated
  USING (student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = gate_events.student_id AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid() AND sg.can_view_gate_events = true
  ));

-- Curfew/late-entry trigger
CREATE OR REPLACE FUNCTION public.fn_check_gatepass_curfew()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_gp record; v_curfew time; v_settings jsonb; v_late boolean := false;
  v_local_time time;
BEGIN
  IF NEW.direction <> 'IN' OR NEW.student_id IS NULL THEN RETURN NEW; END IF;
  SELECT settings INTO v_settings FROM public.properties WHERE id = NEW.property_id;
  BEGIN
    v_curfew := COALESCE((v_settings->>'curfew_time')::time, TIME '21:00');
  EXCEPTION WHEN others THEN v_curfew := TIME '21:00';
  END;
  v_local_time := (NEW.event_at AT TIME ZONE 'UTC')::time;

  IF NEW.gate_pass_id IS NOT NULL THEN
    SELECT * INTO v_gp FROM public.gate_passes WHERE id = NEW.gate_pass_id;
    IF v_gp IS NOT NULL AND NEW.event_at > v_gp.expected_in_at THEN v_late := true; END IF;
  END IF;
  IF v_local_time > v_curfew THEN v_late := true; END IF;
  IF v_late THEN NEW.is_late := true; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ge_curfew BEFORE INSERT ON public.gate_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_gatepass_curfew();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_passes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;

-- ============ MESS ============
CREATE TABLE public.mess_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  menu_date date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('BREAKFAST','LUNCH','SNACKS','DINNER','OTHER')),
  title text,
  notes text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CANCELLED')),
  published_by uuid,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, menu_date, meal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_menus TO authenticated;
GRANT ALL ON public.mess_menus TO service_role;
ALTER TABLE public.mess_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_admin ON public.mess_menus FOR ALL TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id));
CREATE POLICY mm_warden ON public.mess_menus FOR ALL TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY mm_student_read ON public.mess_menus FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.property_id = mess_menus.property_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY mm_parent_read ON public.mess_menus FOR SELECT TO authenticated
  USING (status = 'PUBLISHED' AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.student_guardians sg ON sg.student_id = s.id AND sg.unlinked_at IS NULL
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE s.property_id = mess_menus.property_id AND g.profile_id = auth.uid()
  ));
CREATE TRIGGER trg_mm_updated BEFORE UPDATE ON public.mess_menus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mess_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  mess_menu_id uuid NOT NULL REFERENCES public.mess_menus(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  description text,
  is_vegetarian boolean,
  allergen_notes text,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_menu_items TO authenticated;
GRANT ALL ON public.mess_menu_items TO service_role;
ALTER TABLE public.mess_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY mmi_scoped ON public.mess_menu_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mess_menus m WHERE m.id = mess_menu_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id));

CREATE TABLE public.mess_headcounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  mess_menu_id uuid NOT NULL REFERENCES public.mess_menus(id) ON DELETE CASCADE,
  expected_count int NOT NULL DEFAULT 0,
  actual_count int,
  recorded_by uuid,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_headcounts TO authenticated;
GRANT ALL ON public.mess_headcounts TO service_role;
ALTER TABLE public.mess_headcounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mh_staff ON public.mess_headcounts FOR ALL TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE TRIGGER trg_mh_updated BEFORE UPDATE ON public.mess_headcounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mess_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  mess_menu_id uuid NOT NULL REFERENCES public.mess_menus(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mess_menu_id, student_id)
);
GRANT SELECT, INSERT ON public.mess_feedback TO authenticated;
GRANT ALL ON public.mess_feedback TO service_role;
ALTER TABLE public.mess_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY mf_student_insert ON public.mess_feedback FOR INSERT TO authenticated
  WITH CHECK (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY mf_student_read ON public.mess_feedback FOR SELECT TO authenticated
  USING (public.is_owning_student(auth.uid(), student_id));
CREATE POLICY mf_staff_read ON public.mess_feedback FOR SELECT TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id));

-- ============ FEEDBACK SURVEYS ============
CREATE TABLE public.feedback_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('MESS','CLEANLINESS','WARDEN','GENERAL')),
  questions jsonb NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_surveys TO authenticated;
GRANT ALL ON public.feedback_surveys TO service_role;
ALTER TABLE public.feedback_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY fs_staff ON public.feedback_surveys FOR ALL TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id))
  WITH CHECK (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY fs_published_read ON public.feedback_surveys FOR SELECT TO authenticated
  USING (status = 'PUBLISHED');
CREATE TRIGGER trg_fs_updated BEFORE UPDATE ON public.feedback_surveys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  survey_id uuid NOT NULL REFERENCES public.feedback_surveys(id) ON DELETE CASCADE,
  respondent_user_id uuid NOT NULL,
  student_id uuid REFERENCES public.students(id),
  answers jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, respondent_user_id)
);
GRANT SELECT, INSERT ON public.feedback_responses TO authenticated;
GRANT ALL ON public.feedback_responses TO service_role;
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY fr_insert_self ON public.feedback_responses FOR INSERT TO authenticated
  WITH CHECK (respondent_user_id = auth.uid());
CREATE POLICY fr_read_own ON public.feedback_responses FOR SELECT TO authenticated
  USING (respondent_user_id = auth.uid());
CREATE POLICY fr_staff_read ON public.feedback_responses FOR SELECT TO authenticated
  USING (public.is_hostel_admin(auth.uid(), tenant_id, property_id)
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id));
