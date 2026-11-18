-- Bed status management + atomic per-row CSV structure import.
--
-- 1. Bed status (VACANT <-> MAINTENANCE / BLOCKED)
--    * No new columns. The remark is stored in the existing beds.notes and the
--      expected completion date in the existing beds.maintenance_until (both
--      unused by the app today). They are only meaningful while a bed is
--      MAINTENANCE / BLOCKED and are cleared when it returns to VACANT; the
--      previous values are preserved in audit_logs.before_data by the RPC.
--    * Rules live in the database, not just the UI:
--        - trg_beds_guard_status  validates every beds.status change, whoever
--          issues it (RPC, direct PostgREST UPDATE, other functions).
--        - trg_allocations_guard_bed  refuses to open an allocation on a
--          MAINTENANCE / BLOCKED bed.
--        - fn_set_bed_status  is the supported entry point (authorizes, locks,
--          writes, audits).
--    * OCCUPIED is never set manually: only the existing allocation automation
--      moves a bed VACANT <-> OCCUPIED, and those transitions are passed
--      through untouched.
--    * "Open" allocation = the same status list as uidx_allocations_active_student
--      (PENDING_AGREEMENT, PENDING_PAYMENT, ACTIVE, NOTICE_GIVEN,
--      MOVE_OUT_INSPECTION). A bed with a PENDING_* allocation is still VACANT
--      until activation, so blocking only ACTIVE would let an activation later
--      flip a blocked bed to OCCUPIED.
--    * Concurrency: the status change takes the bed row lock (FOR UPDATE / the
--      UPDATE's own tuple lock) and the allocation guard takes FOR SHARE on the
--      same row, so the two serialize. Whichever commits second sees the
--      other's result (READ COMMITTED re-reads the locked row / re-runs the
--      open-allocation check with a fresh snapshot).
--
-- 2. fn_import_structure_row: one CSV row = one function call = one
--    transaction. Block/Floor/Room/Beds are created together or not at all; an
--    exception rolls back everything this call did and nothing else, so blocks
--    and floors committed by earlier rows (or pre-existing) are never touched.
--    SECURITY INVOKER: every insert runs under the caller's own RLS, exactly
--    like the previous client-side inserts.

-- ---------------------------------------------------------------------------
-- 1a. Who may manage bed status
-- ---------------------------------------------------------------------------
-- Hostel Admin, or a Warden holding the existing rooms_beds_edit permission for
-- the bed's property/block. Mirrors the beds UPDATE policies (beds_admin_all /
-- beds_warden_write) but additionally requires the WARDEN role, so an
-- Accountant that was granted the key by mistake still cannot change beds.
CREATE OR REPLACE FUNCTION public.fn_can_manage_bed_status(_tenant_id uuid, _property_id uuid, _block_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_tenant_role(auth.uid(), _tenant_id, 'HOSTEL_ADMIN')
    OR (
      public.can_edit_rooms_beds(auth.uid(), _tenant_id, _property_id, _block_id)
      AND EXISTS (
        SELECT 1 FROM public.role_assignments ra
        WHERE ra.user_id = auth.uid() AND ra.tenant_id = _tenant_id
          AND ra.role = 'WARDEN'::app_role AND ra.is_active = true
          AND (ra.property_id IS NULL OR ra.property_id = _property_id)
      )
    );
$$;
REVOKE ALL ON FUNCTION public.fn_can_manage_bed_status(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_bed_status(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Guard every beds.status change
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the open-allocation check sees every allocation
-- regardless of the caller's RLS (a Warden without allocations_view would
-- otherwise "see" none and bypass the rule).
CREATE OR REPLACE FUNCTION public.fn_guard_bed_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Existing allocation automation (activation / move-out / swap): untouched.
  IF (OLD.status = 'VACANT' AND NEW.status = 'OCCUPIED')
     OR (OLD.status = 'OCCUPIED' AND NEW.status = 'VACANT') THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'VACANT' AND NEW.status IN ('MAINTENANCE', 'BLOCKED'))
    OR (OLD.status IN ('MAINTENANCE', 'BLOCKED') AND NEW.status = 'VACANT')
  ) THEN
    RAISE EXCEPTION 'Invalid bed status change % -> %. Only VACANT <-> MAINTENANCE / BLOCKED can be set manually; OCCUPIED is controlled by allocations.',
      OLD.status, NEW.status USING ERRCODE = '55000';
  END IF;

  -- End-user JWT (PostgREST / RPC): must be allowed to manage bed status.
  -- NULL auth.uid() = service role / migration / internal job.
  IF auth.uid() IS NOT NULL
     AND NOT public.fn_can_manage_bed_status(NEW.tenant_id, NEW.property_id, NEW.block_id) THEN
    RAISE EXCEPTION 'Not authorized to change bed status' USING ERRCODE = '42501';
  END IF;

  -- Back to VACANT: the restriction is lifted, drop its remark / date.
  IF NEW.status = 'VACANT' THEN
    NEW.notes := NULL;
    NEW.maintenance_until := NULL;
    RETURN NEW;
  END IF;

  -- VACANT -> MAINTENANCE / BLOCKED
  IF EXISTS (
    SELECT 1 FROM public.allocations a
    WHERE a.bed_id = NEW.id AND a.deleted_at IS NULL
      AND a.status IN ('PENDING_AGREEMENT', 'PENDING_PAYMENT', 'ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION')
  ) THEN
    RAISE EXCEPTION 'This bed has an active or pending allocation and cannot be marked %. Move out or swap the student first.',
      NEW.status USING ERRCODE = '55000';
  END IF;

  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.notes IS NULL THEN
    RAISE EXCEPTION 'A reason is required to mark a bed %', NEW.status USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'MAINTENANCE' THEN
    IF NEW.maintenance_until IS NULL THEN
      RAISE EXCEPTION 'An expected completion date is required for MAINTENANCE' USING ERRCODE = '23514';
    END IF;
    IF (NEW.maintenance_until AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'Expected completion date cannot be in the past' USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.maintenance_until := NULL; -- BLOCKED has no completion date
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beds_guard_status ON public.beds;
CREATE TRIGGER trg_beds_guard_status
  BEFORE UPDATE OF status ON public.beds
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_bed_status();

-- ---------------------------------------------------------------------------
-- 1c. No new open allocation on a MAINTENANCE / BLOCKED bed
-- ---------------------------------------------------------------------------
-- Fires only when an allocation becomes open on a bed (insert, bed change, or
-- a closed allocation reopened) — NOT on ACTIVE/NOTICE_GIVEN/... transitions of
-- an already-open allocation, so existing activation / notice / move-out flows
-- are not affected. FOR SHARE serializes against fn_set_bed_status.
CREATE OR REPLACE FUNCTION public.fn_guard_allocation_bed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open constant text[] := ARRAY['PENDING_AGREEMENT', 'PENDING_PAYMENT', 'ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION'];
  v_status text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NOT (NEW.status = ANY (v_open)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.bed_id IS NOT DISTINCT FROM NEW.bed_id
     AND OLD.status = ANY (v_open)
     AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.status INTO v_status FROM public.beds b WHERE b.id = NEW.bed_id FOR SHARE;
  IF v_status IN ('MAINTENANCE', 'BLOCKED') THEN
    RAISE EXCEPTION 'This bed is % and cannot be allocated. Return it to VACANT first.', v_status
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_allocations_guard_bed ON public.allocations;
CREATE TRIGGER trg_allocations_guard_bed
  BEFORE INSERT OR UPDATE OF bed_id, status, deleted_at ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_allocation_bed();

-- ---------------------------------------------------------------------------
-- 1d. Supported entry point
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_bed_status(
  p_bed_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_maintenance_until date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bed public.beds%ROWTYPE;
  v_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('VACANT', 'MAINTENANCE', 'BLOCKED') THEN
    RAISE EXCEPTION 'Status must be VACANT, MAINTENANCE or BLOCKED (OCCUPIED is controlled by allocations)'
      USING ERRCODE = '22023';
  END IF;

  -- Row lock first: serializes with allocation creation on this bed.
  SELECT * INTO v_bed FROM public.beds WHERE id = p_bed_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_manage_bed_status(v_bed.tenant_id, v_bed.property_id, v_bed.block_id) THEN
    RAISE EXCEPTION 'Not authorized to change bed status' USING ERRCODE = '42501';
  END IF;

  IF v_bed.status = p_new_status THEN
    RAISE EXCEPTION 'Bed is already %', p_new_status USING ERRCODE = '55000';
  END IF;

  IF p_new_status = 'MAINTENANCE' AND p_maintenance_until IS NOT NULL THEN
    v_until := p_maintenance_until::timestamp AT TIME ZONE 'Asia/Kolkata';
  END IF;

  -- Transition rules, allocation check and reason/date validation are enforced
  -- by trg_beds_guard_status so they also cover direct updates.
  UPDATE public.beds
     SET status = p_new_status,
         notes = CASE WHEN p_new_status = 'VACANT' THEN notes ELSE p_reason END,
         maintenance_until = CASE WHEN p_new_status = 'VACANT' THEN maintenance_until ELSE v_until END
   WHERE id = p_bed_id;

  INSERT INTO public.audit_logs (tenant_id, property_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  SELECT v_bed.tenant_id, v_bed.property_id, auth.uid(), 'BED_STATUS_CHANGED', 'beds', v_bed.id,
         jsonb_build_object('status', v_bed.status, 'notes', v_bed.notes, 'maintenance_until', v_bed.maintenance_until),
         jsonb_build_object('status', b.status, 'notes', b.notes, 'maintenance_until', b.maintenance_until)
    FROM public.beds b WHERE b.id = v_bed.id;

  RETURN (SELECT jsonb_build_object('id', b.id, 'status', b.status, 'notes', b.notes, 'maintenance_until', b.maintenance_until)
            FROM public.beds b WHERE b.id = v_bed.id);
END $$;

REVOKE ALL ON FUNCTION public.fn_set_bed_status(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_bed_status(uuid, text, text, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. One CSV row = one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_import_structure_row(
  p_property_id uuid,
  p_block_name text,
  p_floor_name text,
  p_floor_number integer,
  p_room_number text,
  p_room_type text,
  p_capacity integer,
  p_base_rent_paise bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_block_name text := btrim(regexp_replace(coalesce(p_block_name, ''), '\s+', ' ', 'g'));
  v_block_key text;
  v_block_id uuid;
  v_floor_id uuid;
  v_room_id uuid;
  v_fixed integer;
  v_beds integer;
  v_block_created boolean := false;
  v_floor_created boolean := false;
BEGIN
  -- Tenant comes from the property (visible to the caller through RLS), never
  -- from client input.
  SELECT tenant_id INTO v_tenant_id FROM public.properties WHERE id = p_property_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Property not found or not accessible' USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_floor_name, '')) = '' OR length(p_floor_name) > 80 THEN
    RAISE EXCEPTION 'Floor name is required (up to 80 characters)' USING ERRCODE = '23514';
  END IF;
  IF btrim(coalesce(p_room_number, '')) = '' OR length(p_room_number) > 40 THEN
    RAISE EXCEPTION 'Room number is required (up to 40 characters)' USING ERRCODE = '23514';
  END IF;
  IF length(v_block_name) > 80 THEN
    RAISE EXCEPTION 'Block name is too long (up to 80 characters)' USING ERRCODE = '23514';
  END IF;
  IF p_room_type IS NULL OR p_room_type NOT IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'DORM', 'CUSTOM') THEN
    RAISE EXCEPTION 'Invalid room type %', coalesce(p_room_type, '(blank)') USING ERRCODE = '23514';
  END IF;

  -- Same capacity rules as the app (resolveRoomCapacity).
  v_fixed := CASE p_room_type WHEN 'SINGLE' THEN 1 WHEN 'DOUBLE' THEN 2 WHEN 'TRIPLE' THEN 3 END;
  IF v_fixed IS NOT NULL THEN
    IF p_capacity IS DISTINCT FROM v_fixed THEN
      RAISE EXCEPTION '% rooms always have capacity % (got %)', p_room_type, v_fixed, coalesce(p_capacity::text, 'blank')
        USING ERRCODE = '23514';
    END IF;
  ELSIF p_capacity IS NULL OR p_capacity < 1 OR p_capacity > 50 THEN
    RAISE EXCEPTION 'Capacity for % rooms must be a whole number from 1 to 50', p_room_type USING ERRCODE = '23514';
  END IF;

  -- Block: matched case-insensitively with whitespace normalized (same rule as
  -- uniq_blocks_property_name_norm_active); reuse or create.
  IF v_block_name <> '' THEN
    v_block_key := lower(v_block_name);
    SELECT id INTO v_block_id FROM public.blocks
     WHERE property_id = p_property_id AND deleted_at IS NULL
       AND lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) = v_block_key;
    IF v_block_id IS NULL THEN
      BEGIN
        INSERT INTO public.blocks (tenant_id, property_id, name)
        VALUES (v_tenant_id, p_property_id, v_block_name)
        RETURNING id INTO v_block_id;
        v_block_created := true;
      EXCEPTION WHEN unique_violation THEN
        -- A concurrent import created it between our SELECT and INSERT: reuse.
        SELECT id INTO v_block_id FROM public.blocks
         WHERE property_id = p_property_id AND deleted_at IS NULL
           AND lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) = v_block_key;
        IF v_block_id IS NULL THEN
          RAISE EXCEPTION 'Block "%" could not be created (code clash)', v_block_name USING ERRCODE = '23505';
        END IF;
      END;
    END IF;
  END IF;

  -- Floor: exact-name match within (property, block), like uniq_floors_property_block_name_active.
  SELECT id INTO v_floor_id FROM public.floors
   WHERE property_id = p_property_id AND deleted_at IS NULL
     AND name = p_floor_name AND block_id IS NOT DISTINCT FROM v_block_id;
  IF v_floor_id IS NULL THEN
    BEGIN
      INSERT INTO public.floors (tenant_id, property_id, block_id, name, floor_number)
      VALUES (v_tenant_id, p_property_id, v_block_id, p_floor_name, p_floor_number)
      RETURNING id INTO v_floor_id;
      v_floor_created := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_floor_id FROM public.floors
       WHERE property_id = p_property_id AND deleted_at IS NULL
         AND name = p_floor_name AND block_id IS NOT DISTINCT FROM v_block_id;
      IF v_floor_id IS NULL THEN
        RAISE EXCEPTION 'Floor "%" could not be created', p_floor_name USING ERRCODE = '23505';
      END IF;
    END;
  END IF;

  BEGIN
    INSERT INTO public.rooms (tenant_id, property_id, block_id, floor_id, room_number, room_type, capacity, base_rent_paise)
    VALUES (v_tenant_id, p_property_id, v_block_id, v_floor_id, p_room_number, p_room_type, p_capacity, p_base_rent_paise)
    RETURNING id INTO v_room_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Room % already exists in this property', p_room_number USING ERRCODE = '23505';
  END;

  INSERT INTO public.beds (tenant_id, property_id, block_id, floor_id, room_id, code)
  SELECT v_tenant_id, p_property_id, v_block_id, v_floor_id, v_room_id, 'B' || g
    FROM generate_series(1, p_capacity) AS g;
  GET DIAGNOSTICS v_beds = ROW_COUNT;

  RETURN jsonb_build_object(
    'room_id', v_room_id, 'floor_id', v_floor_id, 'block_id', v_block_id,
    'beds', v_beds, 'block_created', v_block_created, 'floor_created', v_floor_created
  );
END $$;

REVOKE ALL ON FUNCTION public.fn_import_structure_row(uuid, text, text, integer, text, text, integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_import_structure_row(uuid, text, text, integer, text, text, integer, bigint) TO authenticated;
