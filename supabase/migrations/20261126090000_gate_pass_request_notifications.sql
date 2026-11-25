-- =============================================================================
-- Gate pass requests -> the property's Wardens (bell notification).
--
-- Before: nothing told a Warden that a student had asked for a gate pass. The request showed up in the
-- Pending Gate Pass count but never in the notification bell.
--
-- Same mechanism as the complaint notifications (20261112090000_complaint_notifications.sql): AFTER-row
-- triggers on gate_passes that call fn_enqueue_in_app_notification, so it works whichever UI / API creates
-- or changes the pass, needs no edge function / secret, runs SECURITY DEFINER (notifications has no INSERT
-- policy for end users) and is idempotent through UNIQUE (tenant_id, idempotency_key). The whole body is
-- wrapped so a notification problem can never fail or roll back the gate pass operation itself.
--
-- When the Warden is told (a Warden can only act on PENDING_WARDEN):
--   * a pass is INSERTed already awaiting the Warden (adult student)        -> "requested"
--   * a pass moves PENDING_PARENT -> PENDING_WARDEN (the parent approved)    -> "parent-approved"
--   A minor's pass that is still waiting for the parent notifies nobody yet; a parent rejection or any other
--   status change notifies nobody.
--
-- Recipients: every active WARDEN role assignment of the pass's tenant that covers its property
-- (property_id NULL or equal), any block. gate_passes.block_id is not set at creation and the Warden gate
-- pass SELECT policy (can_view_gate_passes) is property-level, so this is exactly the set of wardens who see
-- the request in their Pending Gate Pass count.
--
-- payload.title / body feed the bell; payload.gate_pass_id + audience = 'WARDEN' make the item open
-- /warden/gate (NotificationBell). No new tables / columns; existing data and permissions are untouched.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_notify_wardens_gate_pass_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stage   text;
  v_student text;
  v_warden  uuid;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'PENDING_WARDEN' THEN RETURN NEW; END IF;
      v_stage := 'requested';
    ELSE
      IF NOT (OLD.status IS NOT DISTINCT FROM 'PENDING_PARENT' AND NEW.status IS NOT DISTINCT FROM 'PENDING_WARDEN') THEN
        RETURN NEW;
      END IF;
      v_stage := 'parent-approved';
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
          'title', CASE WHEN v_stage = 'requested' THEN 'New gate pass request'
                        ELSE 'Gate pass awaiting your approval' END,
          'body', CASE WHEN v_stage = 'requested'
                       THEN coalesce(v_student, 'A student') || ' requested gate pass ' || coalesce(NEW.pass_number, '')
                       ELSE coalesce(v_student, 'A student') || '''s parent approved gate pass ' || coalesce(NEW.pass_number, '')
                  END
                  || CASE WHEN coalesce(NEW.reason, '') <> '' THEN ' - ' || NEW.reason ELSE '' END,
          'student_name', v_student,
          'pass_number', NEW.pass_number,
          'gate_pass_id', NEW.id,
          'audience', 'WARDEN'
        ),
        'gate_pass_request:' || NEW.id || ':' || v_warden || ':' || v_stage
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_wardens_gate_pass_request failed for gate pass %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_notify_wardens_gate_pass_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gate_passes_notify_wardens_ins ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_notify_wardens_ins
  AFTER INSERT ON public.gate_passes
  FOR EACH ROW WHEN (NEW.status = 'PENDING_WARDEN')
  EXECUTE FUNCTION public.fn_notify_wardens_gate_pass_request();

DROP TRIGGER IF EXISTS trg_gate_passes_notify_wardens_upd ON public.gate_passes;
CREATE TRIGGER trg_gate_passes_notify_wardens_upd
  AFTER UPDATE OF status ON public.gate_passes
  FOR EACH ROW WHEN (OLD.status = 'PENDING_PARENT' AND NEW.status = 'PENDING_WARDEN')
  EXECUTE FUNCTION public.fn_notify_wardens_gate_pass_request();
