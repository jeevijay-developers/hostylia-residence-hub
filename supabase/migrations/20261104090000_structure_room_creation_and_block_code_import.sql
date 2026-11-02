-- Property Structure: one room-creation path for the manual form and CSV import,
-- plus Block Code in the CSV import.
--
-- * fn_create_room_with_beds: validates a room (number, type, capacity rules)
--   and inserts it with its B1..Bn beds in ONE call/transaction. The manual
--   "Add Room" dialog now calls it directly; fn_import_structure_row calls it
--   after resolving the row's block and floor. So both paths apply identical
--   rules and produce identical rows (the old manual path inserted the room
--   and the beds as two independent writes).
-- * fn_import_structure_row gains p_block_code (optional) and its signature
--   changes, so the previous 8-argument version from
--   20261103090000_bed_status_management_and_csv_row_import.sql is dropped.
--   Block Code is only applied when a NEW block is created; for an existing
--   block it must match (case-insensitively) or be omitted — an import row
--   never silently edits or contradicts an existing block.
--
-- Both functions are SECURITY INVOKER: every write runs under the caller's own
-- RLS, exactly like the manual client inserts they replace. No data is touched.

-- ---------------------------------------------------------------------------
-- Room + beds
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_room_with_beds(
  p_floor_id uuid,
  p_room_number text,
  p_room_type text,
  p_capacity integer,
  p_base_rent_paise bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_property_id uuid;
  v_block_id uuid;
  v_room_id uuid;
  v_fixed integer;
  v_beds integer;
  v_number text := btrim(coalesce(p_room_number, ''));
BEGIN
  -- Tenant / property / block come from the floor (visible to the caller via
  -- RLS), never from client input.
  SELECT tenant_id, property_id, block_id INTO v_tenant_id, v_property_id, v_block_id
    FROM public.floors WHERE id = p_floor_id AND deleted_at IS NULL;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Floor not found or not accessible' USING ERRCODE = '42501';
  END IF;

  IF v_number = '' OR length(v_number) > 40 THEN
    RAISE EXCEPTION 'Room Number is required (up to 40 characters)' USING ERRCODE = '23514';
  END IF;
  IF p_room_type IS NULL OR p_room_type NOT IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'DORM', 'CUSTOM') THEN
    RAISE EXCEPTION 'Invalid room type %', coalesce(p_room_type, '(blank)') USING ERRCODE = '23514';
  END IF;
  IF p_base_rent_paise IS NOT NULL AND p_base_rent_paise < 0 THEN
    RAISE EXCEPTION 'Base rent cannot be negative' USING ERRCODE = '23514';
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

  BEGIN
    INSERT INTO public.rooms (tenant_id, property_id, block_id, floor_id, room_number, room_type, capacity, base_rent_paise)
    VALUES (v_tenant_id, v_property_id, v_block_id, p_floor_id, v_number, p_room_type, p_capacity, p_base_rent_paise)
    RETURNING id INTO v_room_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Room % already exists in this property', v_number USING ERRCODE = '23505';
  END;

  INSERT INTO public.beds (tenant_id, property_id, block_id, floor_id, room_id, code)
  SELECT v_tenant_id, v_property_id, v_block_id, p_floor_id, v_room_id, 'B' || g
    FROM generate_series(1, p_capacity) AS g;
  GET DIAGNOSTICS v_beds = ROW_COUNT;

  RETURN jsonb_build_object('room_id', v_room_id, 'beds', v_beds);
END $$;

REVOKE ALL ON FUNCTION public.fn_create_room_with_beds(uuid, text, text, integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_room_with_beds(uuid, text, text, integer, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- CSV row = block (+code) -> floor -> room + beds, one transaction
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_import_structure_row(uuid, text, text, integer, text, text, integer, bigint);

CREATE OR REPLACE FUNCTION public.fn_import_structure_row(
  p_property_id uuid,
  p_block_name text,
  p_block_code text,
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
  v_code text := NULLIF(btrim(coalesce(p_block_code, '')), '');
  v_block_id uuid;
  v_block_code_existing text;
  v_clash_name text;
  v_floor_id uuid;
  v_room jsonb;
  v_block_created boolean := false;
  v_floor_created boolean := false;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.properties WHERE id = p_property_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Property not found or not accessible' USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_floor_name, '')) = '' OR length(p_floor_name) > 80 THEN
    RAISE EXCEPTION 'Floor Name is required (up to 80 characters)' USING ERRCODE = '23514';
  END IF;
  IF length(v_block_name) > 80 THEN
    RAISE EXCEPTION 'Block Name can be at most 80 characters' USING ERRCODE = '23514';
  END IF;
  IF v_code IS NOT NULL AND length(v_code) > 20 THEN
    RAISE EXCEPTION 'Block Code can be at most 20 characters' USING ERRCODE = '23514';
  END IF;
  IF v_code IS NOT NULL AND v_block_name = '' THEN
    RAISE EXCEPTION 'Block Code needs a Block Name' USING ERRCODE = '23514';
  END IF;

  -- Block: matched case-insensitively with whitespace normalized (same rule as
  -- uniq_blocks_property_name_norm_active); reuse or create.
  IF v_block_name <> '' THEN
    v_block_key := lower(v_block_name);
    SELECT id, code INTO v_block_id, v_block_code_existing FROM public.blocks
     WHERE property_id = p_property_id AND deleted_at IS NULL
       AND lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) = v_block_key;

    IF v_block_id IS NOT NULL THEN
      IF v_code IS NOT NULL AND v_block_code_existing IS NOT NULL
         AND lower(btrim(v_block_code_existing)) <> lower(v_code) THEN
        RAISE EXCEPTION 'Block "%" already exists with code "%", not "%"', v_block_name, btrim(v_block_code_existing), v_code
          USING ERRCODE = '23505';
      END IF;
    ELSE
      IF v_code IS NOT NULL THEN
        SELECT name INTO v_clash_name FROM public.blocks
         WHERE property_id = p_property_id AND deleted_at IS NULL AND code IS NOT NULL
           AND lower(btrim(code)) = lower(v_code);
        IF v_clash_name IS NOT NULL THEN
          RAISE EXCEPTION 'Block Code "%" is already used by block "%"', v_code, v_clash_name USING ERRCODE = '23505';
        END IF;
      END IF;
      BEGIN
        INSERT INTO public.blocks (tenant_id, property_id, name, code)
        VALUES (v_tenant_id, p_property_id, v_block_name, v_code)
        RETURNING id INTO v_block_id;
        v_block_created := true;
      EXCEPTION WHEN unique_violation THEN
        -- A concurrent import created the same block between our SELECT and INSERT: reuse it.
        SELECT id INTO v_block_id FROM public.blocks
         WHERE property_id = p_property_id AND deleted_at IS NULL
           AND lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) = v_block_key;
        IF v_block_id IS NULL THEN
          RAISE EXCEPTION 'Block Code "%" is already used by another block', v_code USING ERRCODE = '23505';
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

  v_room := public.fn_create_room_with_beds(v_floor_id, p_room_number, p_room_type, p_capacity, p_base_rent_paise);

  RETURN v_room || jsonb_build_object(
    'floor_id', v_floor_id, 'block_id', v_block_id,
    'block_created', v_block_created, 'floor_created', v_floor_created
  );
END $$;

REVOKE ALL ON FUNCTION public.fn_import_structure_row(uuid, text, text, text, integer, text, text, integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_import_structure_row(uuid, text, text, text, integer, text, text, integer, bigint) TO authenticated;
