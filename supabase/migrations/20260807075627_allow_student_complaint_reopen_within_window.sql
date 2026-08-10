-- Students previously could NOT reopen their own RESOLVED/CLOSED complaint at all:
-- fn_complaints_guard_self_update blocked ANY status change from a student-only actor,
-- even though the UI (RatingWidget "Reopen" button) and fn_complaint_lifecycle both
-- already implement a 48h reopen window via reopen_until. Carve out that one specific,
-- time-boxed transition; everything else about the guard stays exactly as strict.

CREATE OR REPLACE FUNCTION public.fn_complaints_guard_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_valid_reopen boolean;
BEGIN
  IF public.fn_is_acting_as_student_only(NEW.tenant_id) THEN
    v_is_valid_reopen :=
      OLD.status IN ('RESOLVED', 'CLOSED')
      AND NEW.status = 'REOPENED'
      AND OLD.reopen_until IS NOT NULL
      AND now() <= OLD.reopen_until;

    -- Students may only edit description, title, priority (downgrade), attachments;
    -- or reopen their own RESOLVED/CLOSED complaint within the 48h reopen window.
    IF NEW.tenant_id            IS DISTINCT FROM OLD.tenant_id
    OR NEW.property_id          IS DISTINCT FROM OLD.property_id
    OR NEW.block_id             IS DISTINCT FROM OLD.block_id
    OR NEW.student_id           IS DISTINCT FROM OLD.student_id
    OR NEW.complaint_number     IS DISTINCT FROM OLD.complaint_number
    OR NEW.category_id          IS DISTINCT FROM OLD.category_id
    OR (NEW.status IS DISTINCT FROM OLD.status AND NOT v_is_valid_reopen)
    OR NEW.assigned_to          IS DISTINCT FROM OLD.assigned_to
    OR NEW.assigned_at          IS DISTINCT FROM OLD.assigned_at
    OR NEW.resolved_at          IS DISTINCT FROM OLD.resolved_at
    OR NEW.resolution_summary   IS DISTINCT FROM OLD.resolution_summary
    OR NEW.closed_at            IS DISTINCT FROM OLD.closed_at
    OR NEW.sla_due_at           IS DISTINCT FROM OLD.sla_due_at
    OR NEW.sla_breached_at      IS DISTINCT FROM OLD.sla_breached_at
    OR NEW.reopen_until         IS DISTINCT FROM OLD.reopen_until
    OR NEW.deleted_at           IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Students may not modify staff-controlled complaint columns';
    END IF;
  END IF;
  RETURN NEW;
END $$;
