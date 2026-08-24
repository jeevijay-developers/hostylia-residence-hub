-- Fix duplicate "complaints_property_id_complaint_number_key" violations.
--
-- Root cause (same shape as the earlier gate_passes pass_number bug fixed in
-- 20260822120000_fix_gate_pass_number_race.sql /
-- 20260822130000_fix_gate_pass_number_rls_undercount.sql):
--
-- fn_generate_complaint_number() is a BEFORE INSERT trigger with the default
-- SECURITY INVOKER, so its internal `SELECT COUNT(*) FROM complaints WHERE
-- property_id = ...` runs under the calling user's RLS. A student can only
-- SELECT their own complaints ("complaints student self read" policy), so
-- when two different students in the same property submit a complaint in
-- the same month, each one's count-based sequence starts from their own
-- (empty) visible history and both generate the same "C-YYMM-0001"
-- complaint_number — colliding on the property-wide unique constraint. The
-- same COUNT-based approach is also inherently racy for two concurrent
-- inserts even from a role that *can* see every row (e.g. two rapid
-- double-submits from the admin/warden side), since both could read the
-- same count before either commits.
--
-- Fix: reuse the exact same prefix/count generation logic and format
-- ("C-" || YYMM || "-" || 4-digit sequence), but:
--   1) mark the function SECURITY DEFINER (same pattern already used by
--      fn_complaint_auto_assign/fn_complaint_validate_assignee in this same
--      schema, and by fn_gate_pass_number's fix) so COUNT(*) always sees
--      every complaint for the property regardless of the caller's RLS
--      visibility;
--   2) take a transaction-scoped advisory lock keyed on property_id + month
--      prefix before counting, so concurrent/duplicate-submit inserts for
--      the same property are serialized and always see each other's rows.
-- The unique constraint, schema, and every other complaint feature/trigger
-- are unchanged.
CREATE OR REPLACE FUNCTION public.fn_generate_complaint_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.complaint_number IS NOT NULL AND NEW.complaint_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'C-' || to_char(now(), 'YYMM') || '-';
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.property_id::text || v_prefix, 0));
  SELECT COUNT(*) + 1 INTO v_count FROM public.complaints
    WHERE property_id = NEW.property_id AND complaint_number LIKE v_prefix || '%';
  NEW.complaint_number := v_prefix || lpad(v_count::text, 4, '0');
  RETURN NEW;
END $$;
