-- =============================================================================
-- Bed status & active-allocation safety (database-level, no new tables/columns)
--
-- Gap closed: fn_guard_bed_status (20261103090000) let EVERY VACANT <-> OCCUPIED change through
-- "untouched", so an authenticated user with row access could still run
--   UPDATE beds SET status = 'OCCUPIED' WHERE id = ...        -- bed with no allocation
--   UPDATE beds SET status = 'VACANT'   WHERE id = ...        -- bed that is really occupied
-- directly (PostgREST), bypassing the allocation workflow and undermining double-allocation safety.
--
-- Rule now (state-based, so it needs no marker and cannot be spoofed by a client):
--   * -> OCCUPIED  only while an OPEN allocation exists on the bed
--   * OCCUPIED -> VACANT  only when NO open allocation remains
--   "Open" = the same status list as uidx_allocations_active_bed (PENDING_AGREEMENT, PENDING_PAYMENT,
--   ACTIVE, NOTICE_GIVEN, MOVE_OUT_INSPECTION), not soft-deleted.
-- Every existing workflow already changes the allocation row BEFORE the bed row, so they all satisfy
-- this unchanged: trg_allocations_flip_bed (AFTER trigger), activate_allocation (allocation ->
-- ACTIVE, then bed), swap_allocation_bed (allocation.bed_id moved, then both beds) and
-- complete_move_out (allocation -> CLOSED, bed released by the flip trigger). None of them is edited.
--
-- Also: MAINTENANCE / BLOCKED on a bed that is OCCUPIED (or has a pending allocation) now says so
-- explicitly, and a bed can no longer be INSERTED as OCCUPIED.
--
-- Concurrency (unchanged design, verified on a real PostgreSQL with two sessions):
--   status change  : BEFORE UPDATE row trigger runs holding the bed's tuple lock, then re-checks the
--                    allocations with a fresh snapshot;
--   allocation open: fn_guard_allocation_bed takes SELECT ... FOR SHARE on the bed until commit;
--   so the two serialize and whichever commits second sees the other's result.
-- uidx_allocations_active_bed keeps preventing two open allocations on one bed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_bed_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open constant text[] := ARRAY['PENDING_AGREEMENT', 'PENDING_PAYMENT', 'ACTIVE', 'NOTICE_GIVEN', 'MOVE_OUT_INSPECTION'];
  v_has_open boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Open allocation on THIS bed (SECURITY DEFINER: sees every row regardless of the caller's RLS).
  -- Runs while this row's tuple lock is held, so a concurrent allocation insert has either committed
  -- (and is seen here) or is still waiting on the bed lock in fn_guard_allocation_bed.
  SELECT EXISTS (
    SELECT 1 FROM public.allocations a
     WHERE a.bed_id = NEW.id AND a.deleted_at IS NULL AND a.status = ANY (v_open)
  ) INTO v_has_open;

  -- OCCUPIED is owned by the allocation workflows: it must always mirror an open allocation.
  IF NEW.status = 'OCCUPIED' THEN
    IF OLD.status <> 'VACANT' THEN
      RAISE EXCEPTION 'Bed is % and cannot become OCCUPIED. OCCUPIED is set only by the allocation workflow, from a VACANT bed.',
        OLD.status USING ERRCODE = '55000';
    END IF;
    IF NOT v_has_open THEN
      RAISE EXCEPTION 'OCCUPIED cannot be set manually: this bed has no active allocation. Allocate a student to it instead.'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'OCCUPIED' THEN
    IF NEW.status = 'VACANT' THEN
      IF v_has_open THEN
        RAISE EXCEPTION 'This bed still has an active allocation and cannot be set to VACANT manually. Move the student out or swap their bed.'
          USING ERRCODE = '55000';
      END IF;
      NEW.notes := NULL;
      NEW.maintenance_until := NULL;
      RETURN NEW;
    END IF;
    IF NOT v_has_open THEN
      -- legacy/stale status: nothing is actually allocated, so the fix is to release the bed first
      RAISE EXCEPTION 'This bed is marked OCCUPIED but has no active allocation. Set it to VACANT first, then mark it %.',
        NEW.status USING ERRCODE = '55000';
    END IF;
    RAISE EXCEPTION 'This bed is OCCUPIED (active allocation) and cannot be marked %. Move out or swap the student first.',
      NEW.status USING ERRCODE = '55000';
  END IF;

  -- From here OLD.status is VACANT / MAINTENANCE / BLOCKED and NEW.status is not OCCUPIED.
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
  IF v_has_open THEN
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
-- (trg_beds_guard_status from 20261103090000 already points at this function name.)

-- ---------------------------------------------------------------------------
-- Allocation-side guard: lock the bed EXCLUSIVELY (was FOR SHARE).
-- Found on a real PostgreSQL: with FOR SHARE, N simultaneous allocations of one bed all took the
-- shared lock, then each AFTER-trigger flip (fn_flip_bed_status -> UPDATE beds) tried to upgrade it
-- to exclusive, so they deadlocked each other ("deadlock detected") instead of one winning cleanly.
-- FOR UPDATE makes them queue on the bed row; the loser then gets the normal unique-index error
-- (uidx_allocations_active_bed). Everything else is identical to 20261103090000. A bed-status change
-- still serializes against this the same way (it needs the same tuple lock).
-- ---------------------------------------------------------------------------
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

  SELECT b.status INTO v_status FROM public.beds b WHERE b.id = NEW.bed_id FOR UPDATE;
  IF v_status IN ('MAINTENANCE', 'BLOCKED') THEN
    RAISE EXCEPTION 'This bed is % and cannot be allocated. Return it to VACANT first.', v_status
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
-- (trg_allocations_guard_bed from 20261103090000 already points at this function name.)

-- A brand-new bed has no allocation, so it can only start VACANT (or be marked MAINTENANCE/BLOCKED
-- later through the guarded update path). Applies to every writer.
CREATE OR REPLACE FUNCTION public.fn_guard_bed_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'OCCUPIED' THEN
    RAISE EXCEPTION 'A new bed cannot be created as OCCUPIED. OCCUPIED is set only by the allocation workflow.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beds_guard_insert ON public.beds;
CREATE TRIGGER trg_beds_guard_insert
  BEFORE INSERT ON public.beds
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_bed_insert();
