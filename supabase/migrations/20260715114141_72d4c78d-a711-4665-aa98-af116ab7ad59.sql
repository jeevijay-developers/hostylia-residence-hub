
-- ============================================================
-- Phase 4: Hostel structure — blocks, floors, rooms, beds
-- ============================================================

-- Helper security-definer functions for RLS
CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id uuid, _tenant_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id
      AND role = _role AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.warden_can_read_property(_user_id uuid, _tenant_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = 'WARDEN'
      AND is_active = true
      AND (property_id IS NULL OR property_id = _property_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.warden_can_write_scope(_user_id uuid, _tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments ra
    WHERE ra.user_id = _user_id AND ra.tenant_id = _tenant_id AND ra.role = 'WARDEN'
      AND ra.is_active = true
      AND (ra.property_id IS NULL OR ra.property_id = _property_id)
      AND (ra.block_id IS NULL OR ra.block_id = _block_id)
  );
$$;

-- ============================================================
-- blocks
-- ============================================================
CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  gender_policy text CHECK (gender_policy IS NULL OR gender_policy IN ('MALE','FEMALE','COED','CUSTOM')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uniq_blocks_property_name_active ON public.blocks(property_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_blocks_tenant_property ON public.blocks(tenant_id, property_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocks_admin_all ON public.blocks FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY blocks_warden_read ON public.blocks FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY blocks_warden_write ON public.blocks FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, id));

CREATE TRIGGER trg_blocks_updated_at BEFORE UPDATE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- floors
-- ============================================================
CREATE TABLE public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor_number integer,
  layout_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uniq_floors_property_block_name_active
  ON public.floors(property_id, COALESCE(block_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_floors_tenant_property ON public.floors(tenant_id, property_id) WHERE deleted_at IS NULL;

-- Validation trigger: block (if set) must belong to same property
CREATE OR REPLACE FUNCTION public.validate_floor_hierarchy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_bpid uuid;
BEGIN
  IF NEW.block_id IS NOT NULL THEN
    SELECT property_id INTO v_bpid FROM public.blocks WHERE id = NEW.block_id;
    IF v_bpid IS NULL OR v_bpid <> NEW.property_id THEN
      RAISE EXCEPTION 'Block % does not belong to property %', NEW.block_id, NEW.property_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_floors_validate BEFORE INSERT OR UPDATE ON public.floors
  FOR EACH ROW EXECUTE FUNCTION public.validate_floor_hierarchy();
CREATE TRIGGER trg_floors_updated_at BEFORE UPDATE ON public.floors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.floors TO authenticated;
GRANT ALL ON public.floors TO service_role;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY floors_admin_all ON public.floors FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY floors_warden_read ON public.floors FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY floors_warden_write ON public.floors FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));

-- ============================================================
-- rooms
-- ============================================================
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  room_type text NOT NULL DEFAULT 'DOUBLE' CHECK (room_type IN ('SINGLE','DOUBLE','TRIPLE','DORM','CUSTOM')),
  capacity integer NOT NULL CHECK (capacity > 0),
  base_rent_paise bigint CHECK (base_rent_paise IS NULL OR base_rent_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED','MAINTENANCE','INACTIVE')),
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uniq_rooms_property_number_active ON public.rooms(property_id, room_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_rooms_tenant_property ON public.rooms(tenant_id, property_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rooms_floor ON public.rooms(floor_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_room_hierarchy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_fpid uuid; v_fbid uuid;
BEGIN
  SELECT property_id, block_id INTO v_fpid, v_fbid FROM public.floors WHERE id = NEW.floor_id;
  IF v_fpid IS NULL OR v_fpid <> NEW.property_id THEN
    RAISE EXCEPTION 'Floor % does not belong to property %', NEW.floor_id, NEW.property_id;
  END IF;
  IF NEW.block_id IS NOT NULL AND v_fbid IS NOT NULL AND NEW.block_id <> v_fbid THEN
    RAISE EXCEPTION 'Room block_id % must match floor block_id %', NEW.block_id, v_fbid;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_rooms_validate BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.validate_room_hierarchy();
CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_admin_all ON public.rooms FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY rooms_warden_read ON public.rooms FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY rooms_warden_write ON public.rooms FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));

-- ============================================================
-- beds
-- ============================================================
CREATE TABLE public.beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.blocks(id) ON DELETE SET NULL,
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'VACANT' CHECK (status IN ('VACANT','OCCUPIED','BLOCKED','MAINTENANCE')),
  rent_override_paise bigint CHECK (rent_override_paise IS NULL OR rent_override_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  maintenance_until timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uniq_beds_room_code_active ON public.beds(room_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_beds_property_status ON public.beds(tenant_id, property_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_beds_room ON public.beds(room_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_bed_hierarchy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_rpid uuid; v_rfid uuid; v_rbid uuid;
BEGIN
  SELECT property_id, floor_id, block_id INTO v_rpid, v_rfid, v_rbid
    FROM public.rooms WHERE id = NEW.room_id;
  IF v_rpid IS NULL OR v_rpid <> NEW.property_id THEN
    RAISE EXCEPTION 'Bed property % must match room property %', NEW.property_id, v_rpid;
  END IF;
  IF NEW.floor_id <> v_rfid THEN
    RAISE EXCEPTION 'Bed floor % must match room floor %', NEW.floor_id, v_rfid;
  END IF;
  IF NEW.block_id IS DISTINCT FROM v_rbid AND v_rbid IS NOT NULL THEN
    RAISE EXCEPTION 'Bed block % must match room block %', NEW.block_id, v_rbid;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_beds_validate BEFORE INSERT OR UPDATE ON public.beds
  FOR EACH ROW EXECUTE FUNCTION public.validate_bed_hierarchy();
CREATE TRIGGER trg_beds_updated_at BEFORE UPDATE ON public.beds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Phase-5 hook: flips bed status VACANT <-> OCCUPIED when an allocation
-- row is inserted/closed. No-op until the `allocations` table exists.
CREATE OR REPLACE FUNCTION public.fn_flip_bed_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- TODO(Phase 5): once public.allocations exists, this function will be
  -- attached AFTER INSERT/UPDATE on allocations and will:
  --   * set beds.status = 'OCCUPIED' when an active allocation is created
  --   * set beds.status = 'VACANT' when the last active allocation closes
  -- Left as a no-op shell so the trigger point is defined and reserved.
  RETURN COALESCE(NEW, OLD);
END; $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beds TO authenticated;
GRANT ALL ON public.beds TO service_role;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

CREATE POLICY beds_admin_all ON public.beds FOR ALL TO authenticated
  USING (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'))
  WITH CHECK (public.has_tenant_role(auth.uid(), tenant_id, 'HOSTEL_ADMIN'));
CREATE POLICY beds_warden_read ON public.beds FOR SELECT TO authenticated
  USING (public.warden_can_read_property(auth.uid(), tenant_id, property_id));
CREATE POLICY beds_warden_write ON public.beds FOR UPDATE TO authenticated
  USING (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id))
  WITH CHECK (public.warden_can_write_scope(auth.uid(), tenant_id, property_id, block_id));
