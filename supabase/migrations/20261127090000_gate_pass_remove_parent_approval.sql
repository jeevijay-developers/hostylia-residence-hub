-- =============================================================================
-- Gate pass: remove the Parent approval step. Every request goes straight to the Warden.
--
-- Before: a minor's pass was created PENDING_PARENT and the Warden was told only after a linked parent
-- approved. In practice the guardian often has no login / no can_approve_gate_pass, so the pass was stuck
-- and the Warden never saw it. Now: every new pass is PENDING_WARDEN and the Warden is notified at once.
--
-- What this migration does
--   1. fn_notify_wardens_gate_pass_request: one stage only ("requested"). Same recipients, payload, bell
--      text and dedupe key (gate_pass_request:<pass>:<warden>:requested) as 20261126090000. The existing
--      UPDATE trigger (PENDING_PARENT -> PENDING_WARDEN) is kept ONLY so the one-off conversion in step 4
--      notifies once per converted pass.
--   2. BEFORE INSERT/UPDATE guard: a status of PENDING_PARENT is rewritten to PENDING_WARDEN (and a new
--      pass always gets requires_parent_approval = false), whatever path creates the row (server fn,
--      direct student INSERT allowed by gp_student_insert, seed, ...). Runs before the AFTER notify
--      triggers, so their WHEN conditions see the final status.
--   3. Drops the parent UPDATE policy gp_parent_approve: parents can no longer approve / reject a pass.
--      Their read access (gp_parent_read) and every other guardian permission stay.
--   4. Moves ONLY the currently pending (PENDING_PARENT, not soft-deleted) passes to PENDING_WARDEN so
--      they are actionable by Wardens. parent_approved_* and gate_pass_approvals history are untouched;
--      approved / rejected / expired / completed / cancelled passes are not modified. Each converted pass
--      yields at most one notification per Warden (idempotent key), and re-running finds nothing to do.
--
-- No table / column changes; RLS for every other role and property scoping are untouched.
-- =============================================================================

-- 1. Warden notification: single "requested" stage -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_wardens_gate_pass_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student text;
  v_warden  uuid;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'PENDING_WARDEN' THEN RETURN NEW; END IF;
    ELSE
      -- Only the one-off conversion of a legacy PENDING_PARENT pass.
      IF NOT (OLD.status IS NOT DISTINCT FROM 'PENDING_PARENT' AND NEW.status IS NOT DISTINCT FROM 'PENDING_WARDEN') THEN
        RETURN NEW;
      END IF;
    END IF;

    SELECT s.full_name INTO v_student FROM public.students s WHERE s.id = NEW.student_id;

    FOR v_warden IN
      SELECT DISTINCT ra.user_id FROM public.role_assignments ra
       WHERE ra.tenant_id = NEW.tenant_id
         AND ra.role = 'WARDEN' AND ra.is_active = true
         AND (ra.property_id IS NULL OR ra.property_id = NEW.property_id)
         AND ra.user_id IS NOT NULL
    LOOP
      PERFORM public.fn_enqueue_in_app_notification(
        NEW.tenant_id, NEW.property_id, v_warden,
        'GATE_PASS_REQUESTED', 'gate_pass_requested',
        jsonb_build_object(
          'title', 'New gate pass request',
          'body', coalesce(v_student, 'A student') || ' requested gate pass ' || coalesce(NEW.pass_number, '')
                  || CASE WHEN coalesce(NEW.reason, '') <> '' THEN ' - ' || NEW.reason ELSE '' END,
          'student_name', v_student,
          'pass_number', NEW.pass_number,
          'gate_pass_id', NEW.id,
          'audience', 'WARDEN'
        ),
        'gate_pass_request:' || NEW.id || ':' || v_warden || ':requested'
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_wardens_gate_pass_request failed for gate pass %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_wardens_gate_pass_request() FROM PUBLIC, anon, authenticated;

-- 2. No parent step on any path ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gate_passes_no_parent_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.requires_parent_approval := false;
  END IF;
  IF NEW.status = 'PENDING_PARENT' THEN
    NEW.status := 'PENDING_WARDEN';
    NEW.requires_parent_approval := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gate_passes_no_parent_approval ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_no_parent_approval
  BEFORE INSERT OR UPDATE OF status ON public.gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.fn_gate_passes_no_parent_approval();

-- 3. Parents can no longer approve / reject ----------------------------------------------------------
DROP POLICY IF EXISTS gp_parent_approve ON public.gate_passes;

-- 4. Un-stick the passes that are waiting for a parent right now -------------------------------------
UPDATE public.gate_passes
   SET status = 'PENDING_WARDEN', requires_parent_approval = false
 WHERE status = 'PENDING_PARENT' AND deleted_at IS NULL;
