
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.complaint_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  default_priority text NOT NULL DEFAULT 'MEDIUM'
    CHECK (default_priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  sla_minutes integer NOT NULL CHECK (sla_minutes > 0),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE (property_id, name)
);
CREATE INDEX idx_complaint_categories_property_active
  ON public.complaint_categories (property_id, is_active) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_categories TO authenticated;
GRANT ALL ON public.complaint_categories TO service_role;
ALTER TABLE public.complaint_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories read tenant"
  ON public.complaint_categories FOR SELECT TO authenticated
  USING (
    has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role)
    OR warden_can_read_property(auth.uid(), tenant_id, property_id)
    OR EXISTS (SELECT 1 FROM public.students s
               WHERE s.property_id = complaint_categories.property_id
                 AND s.profile_id = auth.uid()
                 AND s.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.student_guardians sg
               JOIN public.guardians g ON g.id = sg.guardian_id
               JOIN public.students s ON s.id = sg.student_id
               WHERE s.property_id = complaint_categories.property_id
                 AND sg.unlinked_at IS NULL
                 AND g.profile_id = auth.uid())
  );

CREATE POLICY "categories admin write"
  ON public.complaint_categories FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));

CREATE TRIGGER trg_complaint_categories_updated_at
  BEFORE UPDATE ON public.complaint_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  bed_id uuid REFERENCES public.beds(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.complaint_categories(id) ON DELETE RESTRICT,
  complaint_number text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','WAITING_FOR_STUDENT','RESOLVED','CLOSED','REOPENED','CANCELLED')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  sla_due_at timestamptz NOT NULL,
  sla_breached_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_summary text,
  rating smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  rating_comment text,
  reopen_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE (property_id, complaint_number)
);
CREATE INDEX idx_complaints_property_status
  ON public.complaints (property_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_assigned_to
  ON public.complaints (assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_student
  ON public.complaints (student_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_complaints_sla_open
  ON public.complaints (sla_due_at)
  WHERE deleted_at IS NULL AND sla_breached_at IS NULL
    AND status NOT IN ('RESOLVED','CLOSED','CANCELLED');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "complaints student self read"
  ON public.complaints FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
                 WHERE s.id = complaints.student_id AND s.profile_id = auth.uid()));

CREATE POLICY "complaints student self insert"
  ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s
                      WHERE s.id = complaints.student_id AND s.profile_id = auth.uid()));

CREATE POLICY "complaints student self update"
  ON public.complaints FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
                 WHERE s.id = complaints.student_id AND s.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s
                      WHERE s.id = complaints.student_id AND s.profile_id = auth.uid()));

CREATE POLICY "complaints warden read"
  ON public.complaints FOR SELECT TO authenticated
  USING (warden_can_read_property(auth.uid(), tenant_id, property_id));

CREATE POLICY "complaints warden update"
  ON public.complaints FOR UPDATE TO authenticated
  USING (warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));

CREATE POLICY "complaints admin all"
  ON public.complaints FOR ALL TO authenticated
  USING (has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'::app_role));

CREATE POLICY "complaints parent read"
  ON public.complaints FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = complaints.student_id
      AND sg.unlinked_at IS NULL
      AND sg.can_view_complaints = true
      AND g.profile_id = auth.uid()
      AND g.deleted_at IS NULL
  ));

CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_generate_complaint_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.complaint_number IS NOT NULL AND NEW.complaint_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'C-' || to_char(now(), 'YYMM') || '-';
  SELECT COUNT(*) + 1 INTO v_count FROM public.complaints
    WHERE property_id = NEW.property_id AND complaint_number LIKE v_prefix || '%';
  NEW.complaint_number := v_prefix || lpad(v_count::text, 4, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_complaints_number BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_generate_complaint_number();

CREATE OR REPLACE FUNCTION public.fn_complaint_set_sla_due()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_mins int; v_priority text;
BEGIN
  SELECT sla_minutes, default_priority INTO v_mins, v_priority
    FROM public.complaint_categories WHERE id = NEW.category_id;
  IF v_mins IS NULL THEN RAISE EXCEPTION 'Complaint category % not found', NEW.category_id; END IF;
  IF NEW.priority IS NULL OR NEW.priority = 'MEDIUM' THEN NEW.priority := v_priority; END IF;
  NEW.sla_due_at := now() + make_interval(mins => v_mins);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_complaints_sla_due BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_set_sla_due();

CREATE OR REPLACE FUNCTION public.fn_complaint_auto_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.block_id IS NOT NULL THEN
    SELECT user_id INTO v_uid FROM public.role_assignments
    WHERE tenant_id = NEW.tenant_id AND role = 'WARDEN' AND is_active = true
      AND property_id = NEW.property_id AND block_id = NEW.block_id
    ORDER BY granted_at DESC LIMIT 1;
  END IF;
  IF v_uid IS NULL THEN
    SELECT user_id INTO v_uid FROM public.role_assignments
    WHERE tenant_id = NEW.tenant_id AND role = 'WARDEN' AND is_active = true
      AND property_id = NEW.property_id AND block_id IS NULL
    ORDER BY granted_at DESC LIMIT 1;
  END IF;
  IF v_uid IS NOT NULL THEN
    NEW.assigned_to := v_uid; NEW.assigned_at := now(); NEW.status := 'ASSIGNED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_complaints_auto_assign BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_auto_assign();

CREATE OR REPLACE FUNCTION public.fn_complaint_validate_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = NEW.assigned_to AND tenant_id = NEW.tenant_id AND is_active = true
      AND role IN ('WARDEN'::app_role, 'HOSTEL_ADMIN'::app_role)
      AND (property_id IS NULL OR property_id = NEW.property_id)
      AND (block_id IS NULL OR NEW.block_id IS NULL OR block_id = NEW.block_id)
  ) THEN
    RAISE EXCEPTION 'assigned_to % is not an active WARDEN/HOSTEL_ADMIN for tenant % property %',
      NEW.assigned_to, NEW.tenant_id, NEW.property_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_complaints_validate_assignee
  BEFORE INSERT OR UPDATE OF assigned_to ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_validate_assignee();

CREATE OR REPLACE FUNCTION public.fn_complaint_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'RESOLVED' AND (OLD.status IS DISTINCT FROM 'RESOLVED') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    NEW.reopen_until := NEW.resolved_at + interval '48 hours';
  END IF;
  IF NEW.status = 'CLOSED' AND (OLD.status IS DISTINCT FROM 'CLOSED') THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;
  IF NEW.status = 'REOPENED' AND OLD.status IN ('RESOLVED','CLOSED') THEN
    IF OLD.reopen_until IS NULL OR now() > OLD.reopen_until THEN
      RAISE EXCEPTION 'Reopen window has expired (reopen_until=%)', OLD.reopen_until;
    END IF;
    NEW.resolved_at := NULL; NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_complaints_lifecycle BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_seed_default_complaint_categories(p_property_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.properties WHERE id = p_property_id;
  IF v_tenant IS NULL THEN RETURN; END IF;
  INSERT INTO public.complaint_categories
    (tenant_id, property_id, name, description, default_priority, sla_minutes, display_order)
  VALUES
    (v_tenant, p_property_id, 'Electrical',    'Power, wiring, lights, sockets',        'HIGH',   240,  10),
    (v_tenant, p_property_id, 'Plumbing',      'Taps, drains, water supply, geyser',    'HIGH',   240,  20),
    (v_tenant, p_property_id, 'Cleanliness',   'Housekeeping, hygiene, pest',           'MEDIUM', 720,  30),
    (v_tenant, p_property_id, 'Wifi/Internet', 'Network outage, slow speed',            'MEDIUM', 360,  40),
    (v_tenant, p_property_id, 'Furniture',     'Beds, chairs, tables, wardrobes',       'LOW',    1440, 50),
    (v_tenant, p_property_id, 'Mess/Food',     'Food quality, timings, hygiene',        'MEDIUM', 480,  60),
    (v_tenant, p_property_id, 'Security',      'Locks, gate, intrusion, safety',        'URGENT', 60,   70),
    (v_tenant, p_property_id, 'Other',         'Anything not covered above',            'MEDIUM', 720,  99)
  ON CONFLICT (property_id, name) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.fn_property_seed_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_seed_default_complaint_categories(NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_property_seed_complaint_categories
  AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.fn_property_seed_categories();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.properties WHERE deleted_at IS NULL LOOP
    PERFORM public.fn_seed_default_complaint_categories(r.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_scan_complaint_sla_breaches()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_count int := 0;
BEGIN
  FOR r IN
    SELECT id, tenant_id, property_id, complaint_number, sla_due_at
    FROM public.complaints
    WHERE deleted_at IS NULL AND sla_breached_at IS NULL
      AND status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND sla_due_at < now()
    LIMIT 500
  LOOP
    UPDATE public.complaints SET sla_breached_at = now(), updated_at = now()
      WHERE id = r.id AND sla_breached_at IS NULL;
    -- TODO(Phase 10): also emit into `notifications` table when it exists.
    INSERT INTO public.audit_logs (tenant_id, property_id, action, entity_type, entity_id, after_data)
    VALUES (r.tenant_id, r.property_id, 'SLA_BREACH', 'complaints', r.id,
            jsonb_build_object('complaint_number', r.complaint_number, 'sla_due_at', r.sla_due_at));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
ALTER TABLE public.complaints REPLICA IDENTITY FULL;

CREATE POLICY "complaint-media student insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'complaint-media'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.profile_id = auth.uid()
        AND s.tenant_id::text = (storage.foldername(name))[1]
        AND s.property_id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "complaint-media student read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint-media'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.profile_id = auth.uid()
        AND s.tenant_id::text = (storage.foldername(name))[1]
        AND s.property_id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "complaint-media staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint-media'
    AND (
      has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'HOSTEL_ADMIN'::app_role)
      OR warden_can_read_property(auth.uid(),
           ((storage.foldername(name))[1])::uuid,
           ((storage.foldername(name))[2])::uuid)
    )
  );
