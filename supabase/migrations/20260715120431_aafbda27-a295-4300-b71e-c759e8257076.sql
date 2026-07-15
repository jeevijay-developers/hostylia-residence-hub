
-- ============================================================================
-- STUDENTS
-- ============================================================================
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  admission_number text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  phone text,
  email citext,
  photo_path text,
  academic_institute text,
  course_name text,
  academic_year text,
  status text NOT NULL DEFAULT 'APPLICANT'
    CHECK (status IN ('APPLICANT','VERIFIED','ACTIVE','NOTICE_GIVEN','MOVED_OUT','ARCHIVED','REJECTED')),
  is_minor boolean NOT NULL DEFAULT false,
  portal_access_enabled boolean NOT NULL DEFAULT false,
  joined_at date,
  moved_out_at date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE UNIQUE INDEX uniq_students_property_admission_active
  ON public.students (property_id, admission_number)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uniq_students_profile
  ON public.students (profile_id)
  WHERE profile_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_students_tenant_property_status
  ON public.students (tenant_id, property_id, status)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
-- No anon grants: public admission goes through a server function only.
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- DOCUMENTS
-- ============================================================================
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  owner_type text NOT NULL
    CHECK (owner_type IN ('STUDENT','GUARDIAN','ADMISSION','ALLOCATION','PROPERTY','COMPLAINT','VISITOR','INVOICE','RECEIPT','OTHER')),
  owner_id uuid NOT NULL,
  document_type text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum text,
  status text NOT NULL DEFAULT 'UPLOADING'
    CHECK (status IN ('UPLOADING','PROCESSING','AVAILABLE','REJECTED','QUARANTINED','DELETED')),
  verification_status text NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (verification_status IN ('NOT_REQUIRED','PENDING','VERIFIED','REJECTED')),
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  CONSTRAINT uniq_documents_bucket_path UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX idx_documents_owner ON public.documents (owner_type, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_tenant ON public.documents (tenant_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- AGREEMENTS  (created before allocations because allocations references it)
-- ============================================================================
CREATE TABLE public.agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  allocation_id uuid, -- FK added after allocations table below
  template_version text NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SENT','VIEWED','SIGNED','DECLINED','VOID')),
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by_user_id uuid,
  signature_method text CHECK (signature_method IN ('OTP','CLICK_CONSENT','EXTERNAL_ESIGN')),
  signature_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  voided_at timestamptz,
  void_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_agreements_student ON public.agreements (student_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_agreements_allocation ON public.agreements (allocation_id) WHERE allocation_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreements TO authenticated;
GRANT ALL ON public.agreements TO service_role;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_agreements_updated_at
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ALLOCATIONS
-- ============================================================================
CREATE TABLE public.allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  bed_id uuid NOT NULL REFERENCES public.beds(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE RESTRICT,
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  fee_plan_id uuid, -- no FK yet, Phase 8 creates fee_plans
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_AGREEMENT','PENDING_PAYMENT','ACTIVE','NOTICE_GIVEN','MOVE_OUT_INSPECTION','CLOSED','CANCELLED')),
  start_date date NOT NULL,
  expected_end_date date,
  actual_end_date date,
  rent_snapshot_paise bigint NOT NULL CHECK (rent_snapshot_paise >= 0),
  deposit_snapshot_paise bigint NOT NULL DEFAULT 0 CHECK (deposit_snapshot_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  billing_cycle_day smallint CHECK (billing_cycle_day BETWEEN 1 AND 28),
  lock_in_until date,
  notice_period_days integer NOT NULL DEFAULT 0,
  agreement_id uuid REFERENCES public.agreements(id) ON DELETE SET NULL,
  activated_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE UNIQUE INDEX uidx_allocations_active_bed ON public.allocations (bed_id)
  WHERE status IN ('PENDING_AGREEMENT','PENDING_PAYMENT','ACTIVE','NOTICE_GIVEN','MOVE_OUT_INSPECTION')
    AND deleted_at IS NULL;
CREATE UNIQUE INDEX uidx_allocations_active_student ON public.allocations (student_id)
  WHERE status IN ('PENDING_AGREEMENT','PENDING_PAYMENT','ACTIVE','NOTICE_GIVEN','MOVE_OUT_INSPECTION')
    AND deleted_at IS NULL;
CREATE INDEX idx_allocations_property_status ON public.allocations (tenant_id, property_id, status)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_allocations_updated_at
  BEFORE UPDATE ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deferred FK: agreements.allocation_id -> allocations.id
ALTER TABLE public.agreements
  ADD CONSTRAINT fk_agreements_allocation
  FOREIGN KEY (allocation_id) REFERENCES public.allocations(id) ON DELETE SET NULL;

-- Deferred FK from Phase 2: student_guardians.student_id -> students.id
ALTER TABLE public.student_guardians
  ADD CONSTRAINT fk_student_guardians_student
  FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

-- ============================================================================
-- HIERARCHY VALIDATION (student/bed/room/floor/block same tenant+property)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_allocation_hierarchy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_bed_property uuid; v_bed_room uuid; v_bed_floor uuid; v_bed_block uuid;
  v_student_property uuid; v_student_tenant uuid;
BEGIN
  SELECT property_id, room_id, floor_id, block_id
    INTO v_bed_property, v_bed_room, v_bed_floor, v_bed_block
    FROM public.beds WHERE id = NEW.bed_id;
  IF v_bed_property IS NULL THEN
    RAISE EXCEPTION 'Bed % not found', NEW.bed_id;
  END IF;
  IF v_bed_property <> NEW.property_id THEN
    RAISE EXCEPTION 'Bed property % does not match allocation property %', v_bed_property, NEW.property_id;
  END IF;
  IF v_bed_room <> NEW.room_id OR v_bed_floor <> NEW.floor_id THEN
    RAISE EXCEPTION 'Allocation room/floor must match bed';
  END IF;
  IF NEW.block_id IS NOT NULL AND v_bed_block IS NOT NULL AND NEW.block_id <> v_bed_block THEN
    RAISE EXCEPTION 'Allocation block must match bed block';
  END IF;

  SELECT tenant_id, property_id INTO v_student_tenant, v_student_property
    FROM public.students WHERE id = NEW.student_id;
  IF v_student_tenant <> NEW.tenant_id OR v_student_property <> NEW.property_id THEN
    RAISE EXCEPTION 'Student tenant/property must match allocation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_allocations_validate_hierarchy
  BEFORE INSERT OR UPDATE ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_allocation_hierarchy();

-- ============================================================================
-- ACTIVATE fn_flip_bed_status(): flip VACANT<->OCCUPIED based on allocation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_flip_bed_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_active_states text[] := ARRAY['PENDING_AGREEMENT','PENDING_PAYMENT','ACTIVE','NOTICE_GIVEN','MOVE_OUT_INSPECTION'];
  v_bed_status text;
  v_new_bed uuid;
  v_old_bed uuid;
BEGIN
  v_new_bed := CASE WHEN TG_OP <> 'DELETE' THEN NEW.bed_id ELSE NULL END;
  v_old_bed := CASE WHEN TG_OP <> 'INSERT' THEN OLD.bed_id ELSE NULL END;

  -- Handle current bed
  IF v_new_bed IS NOT NULL THEN
    SELECT status INTO v_bed_status FROM public.beds WHERE id = v_new_bed;
    IF v_bed_status IN ('VACANT','OCCUPIED') THEN
      IF NEW.status = ANY(v_active_states) AND NEW.deleted_at IS NULL THEN
        UPDATE public.beds SET status = 'OCCUPIED', updated_at = now()
          WHERE id = v_new_bed AND status = 'VACANT';
      ELSIF NEW.status IN ('CLOSED','CANCELLED') OR NEW.deleted_at IS NOT NULL THEN
        -- Only flip to VACANT if no other active allocation holds this bed
        IF NOT EXISTS (
          SELECT 1 FROM public.allocations
          WHERE bed_id = v_new_bed
            AND id <> NEW.id
            AND deleted_at IS NULL
            AND status = ANY(v_active_states)
        ) THEN
          UPDATE public.beds SET status = 'VACANT', updated_at = now()
            WHERE id = v_new_bed AND status = 'OCCUPIED';
        END IF;
      END IF;
    END IF;
  END IF;

  -- If bed_id changed on UPDATE, potentially vacate the old bed
  IF TG_OP = 'UPDATE' AND v_old_bed IS NOT NULL AND v_old_bed <> COALESCE(v_new_bed, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    SELECT status INTO v_bed_status FROM public.beds WHERE id = v_old_bed;
    IF v_bed_status = 'OCCUPIED' AND NOT EXISTS (
      SELECT 1 FROM public.allocations
      WHERE bed_id = v_old_bed
        AND id <> NEW.id
        AND deleted_at IS NULL
        AND status = ANY(v_active_states)
    ) THEN
      UPDATE public.beds SET status = 'VACANT', updated_at = now() WHERE id = v_old_bed;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_allocations_flip_bed
  AFTER INSERT OR UPDATE ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.fn_flip_bed_status();

-- ============================================================================
-- Move-out date + refund helpers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.earliest_move_out_date(p_allocation_id uuid)
RETURNS date LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_lock date; v_notice int; v_today date := current_date;
BEGIN
  SELECT lock_in_until, COALESCE(notice_period_days,0) INTO v_lock, v_notice
    FROM public.allocations WHERE id = p_allocation_id;
  IF v_lock IS NULL THEN
    RETURN v_today + make_interval(days => v_notice);
  END IF;
  RETURN GREATEST(v_lock, v_today + make_interval(days => v_notice))::date;
END; $$;

CREATE OR REPLACE FUNCTION public.provisional_refund_paise(p_allocation_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_deposit bigint;
BEGIN
  -- TODO(Phase 8+): subtract sum(outstanding invoice balances) and any
  -- deposit_ledger_entries once fee_plans/invoices/deposit_ledger_entries exist.
  SELECT deposit_snapshot_paise INTO v_deposit
    FROM public.allocations WHERE id = p_allocation_id;
  RETURN COALESCE(v_deposit, 0);
END; $$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- STUDENTS
CREATE POLICY "students admin/warden read"
  ON public.students FOR SELECT TO authenticated
  USING (
    public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN')
    OR public.has_tenant_role(auth.uid(), tenant_id, 'ACCOUNTANT')
    OR public.warden_can_read_property(auth.uid(), tenant_id, property_id)
  );

CREATE POLICY "students admin write"
  ON public.students FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));

CREATE POLICY "students warden write"
  ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL));
CREATE POLICY "students warden update"
  ON public.students FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL));

CREATE POLICY "students self read"
  ON public.students FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
CREATE POLICY "students self update"
  ON public.students FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "students parent read"
  ON public.students FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = students.id
      AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid()
  ));

-- ALLOCATIONS
CREATE POLICY "allocations admin all"
  ON public.allocations FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY "allocations warden read"
  ON public.allocations FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY "allocations warden write"
  ON public.allocations FOR INSERT TO authenticated
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY "allocations warden update"
  ON public.allocations FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));
CREATE POLICY "allocations accountant read"
  ON public.allocations FOR SELECT TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'ACCOUNTANT'));
CREATE POLICY "allocations student read"
  ON public.allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = allocations.student_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY "allocations parent read"
  ON public.allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = allocations.student_id
      AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid()
  ));

-- DOCUMENTS
CREATE POLICY "documents admin all"
  ON public.documents FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY "documents warden read"
  ON public.documents FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY "documents warden write"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (property_id IS NOT NULL AND public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL));
CREATE POLICY "documents warden update"
  ON public.documents FOR UPDATE TO authenticated
  USING (property_id IS NOT NULL AND public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL))
  WITH CHECK (property_id IS NOT NULL AND public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL));
CREATE POLICY "documents student self read"
  ON public.documents FOR SELECT TO authenticated
  USING (owner_type = 'STUDENT' AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = documents.owner_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY "documents student self insert"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (owner_type = 'STUDENT' AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = documents.owner_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY "documents parent read"
  ON public.documents FOR SELECT TO authenticated
  USING (owner_type = 'STUDENT' AND EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = documents.owner_id
      AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid()
  ));

-- AGREEMENTS
CREATE POLICY "agreements admin all"
  ON public.agreements FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY "agreements warden read"
  ON public.agreements FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY "agreements warden write"
  ON public.agreements FOR INSERT TO authenticated
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL));
CREATE POLICY "agreements warden update"
  ON public.agreements FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, NULL));
CREATE POLICY "agreements student read"
  ON public.agreements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = agreements.student_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY "agreements student sign"
  ON public.agreements FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = agreements.student_id AND s.profile_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = agreements.student_id AND s.profile_id = auth.uid()
  ));
CREATE POLICY "agreements parent read"
  ON public.agreements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = agreements.student_id
      AND sg.unlinked_at IS NULL
      AND g.profile_id = auth.uid()
  ));
