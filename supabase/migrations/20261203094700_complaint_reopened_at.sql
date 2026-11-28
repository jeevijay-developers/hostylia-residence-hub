-- =============================================================================
-- complaints.reopened_at — when a complaint last entered REOPENED.
--
-- The property Complaints tab shows a "Recent complaint activity" feed rebuilt from the complaint's
-- own timestamps (audit_logs are not readable from the browser). created_at / assigned_at /
-- resolved_at already exist; a reopen (the student's 48h reopen or the Admin override) cleared
-- resolved_at/closed_at but left no time of its own. This adds that one column, stamped by a
-- trigger on every transition INTO 'REOPENED' — whoever makes it — and forced to NULL on INSERT, so
-- the client never writes it.
--
--   * Additive only: existing rows keep reopened_at NULL (the time of a past reopen is unknown).
--   * The student self-update guard lists the columns a student may not change; reopened_at is set
--     by this trigger, not by the student, and is not on that list, so the student's own reopen
--     keeps working unchanged.
--   * No RLS change: the column is covered by the existing complaints policies.
-- =============================================================================

ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

CREATE OR REPLACE FUNCTION public.fn_complaint_stamp_reopened_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A new complaint has never been reopened, whatever the client sends.
    NEW.reopened_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status = 'REOPENED' AND OLD.status IS DISTINCT FROM 'REOPENED' THEN
    NEW.reopened_at := now();
  ELSIF NEW.reopened_at IS DISTINCT FROM OLD.reopened_at THEN
    -- Only this trigger maintains the column.
    NEW.reopened_at := OLD.reopened_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_complaint_stamp_reopened_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_complaints_stamp_reopened_at ON public.complaints;
CREATE TRIGGER trg_complaints_stamp_reopened_at
  BEFORE INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_complaint_stamp_reopened_at();

CREATE INDEX IF NOT EXISTS idx_complaints_property_reopened_at
  ON public.complaints (property_id, reopened_at DESC)
  WHERE deleted_at IS NULL AND reopened_at IS NOT NULL;
