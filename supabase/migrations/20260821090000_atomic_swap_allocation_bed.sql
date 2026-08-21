-- RULES.md 19.3: allocation actions must be atomic — "Swap bed" is listed
-- explicitly alongside allocate/activate/move-out, all of which already go
-- through a SECURITY DEFINER function rather than independent client-side
-- writes. PRD 6.2.3 "Room/bed allocation with one-tap swap" is the feature
-- this backs: move a student with an open allocation to a different vacant
-- bed without closing/recreating the allocation, so the existing agreement,
-- invoices, and payment history all stay attached to the same allocation_id.
-- RULES.md 19.5: bed.status must never move independently of allocation state.

CREATE OR REPLACE FUNCTION public.swap_allocation_bed(p_allocation_id uuid, p_new_bed_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_property_id uuid;
  v_old_bed_id uuid;
  v_old_block_id uuid;
  v_new_tenant_id uuid;
  v_new_property_id uuid;
  v_new_block_id uuid;
  v_new_floor_id uuid;
  v_new_room_id uuid;
  v_new_bed_status text;
BEGIN
  -- Matches uidx_allocations_active_student's status list — only an
  -- allocation that's still "open" has a bed worth swapping.
  SELECT tenant_id, property_id, bed_id, block_id
    INTO v_tenant_id, v_property_id, v_old_bed_id, v_old_block_id
    FROM public.allocations
    WHERE id = p_allocation_id
      AND status IN ('PENDING_AGREEMENT','PENDING_PAYMENT','ACTIVE','NOTICE_GIVEN','MOVE_OUT_INSPECTION')
      AND deleted_at IS NULL
    FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Allocation not found or no longer open';
  END IF;

  SELECT tenant_id, property_id, block_id, floor_id, room_id, status
    INTO v_new_tenant_id, v_new_property_id, v_new_block_id, v_new_floor_id, v_new_room_id, v_new_bed_status
    FROM public.beds
    WHERE id = p_new_bed_id AND deleted_at IS NULL
    FOR UPDATE;

  IF v_new_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Bed not found';
  END IF;

  -- SECURITY DEFINER bypasses RLS entirely, so the "allocations admin all" /
  -- "allocations warden write" policies never run for this call — mirror
  -- them explicitly here. Without this, any authenticated user of any role
  -- or tenant could swap any allocation's bed.
  IF NOT (
    public.has_tenant_role(auth.uid(), v_tenant_id, 'HOSTEL_ADMIN')
    OR (
      public.warden_can_write_scope(auth.uid(), v_tenant_id, v_property_id, v_old_block_id)
      AND public.warden_can_write_scope(auth.uid(), v_new_tenant_id, v_new_property_id, v_new_block_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to swap this allocation''s bed';
  END IF;

  IF v_new_tenant_id <> v_tenant_id OR v_new_property_id <> v_property_id THEN
    RAISE EXCEPTION 'Bed does not belong to the same property as the allocation';
  END IF;
  IF p_new_bed_id = v_old_bed_id THEN
    RAISE EXCEPTION 'Student is already assigned to this bed';
  END IF;
  IF v_new_bed_status <> 'VACANT' THEN
    RAISE EXCEPTION 'Bed is not vacant';
  END IF;

  UPDATE public.allocations
    SET bed_id = p_new_bed_id,
        block_id = v_new_block_id,
        floor_id = v_new_floor_id,
        room_id = v_new_room_id
    WHERE id = p_allocation_id;

  UPDATE public.beds SET status = 'VACANT' WHERE id = v_old_bed_id;
  UPDATE public.beds SET status = 'OCCUPIED' WHERE id = p_new_bed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_allocation_bed(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.swap_allocation_bed(uuid, uuid) TO authenticated, service_role;
