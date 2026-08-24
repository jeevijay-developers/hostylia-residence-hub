-- Fix duplicate "gate_passes_property_id_pass_number_key" violations that
-- still occurred after the previous advisory-lock fix.
--
-- Root cause: fn_gate_pass_number() is a BEFORE INSERT trigger with the
-- default SECURITY INVOKER, so its internal `SELECT COUNT(*) FROM
-- gate_passes WHERE property_id = ...` ran under the calling user's RLS.
-- A student can only SELECT their own gate passes (policy
-- gp_student_own_read), so when two different students in the same
-- property requested a pass in the same month, each one's count-based
-- sequence started from their own (empty) visible history and both
-- generated the same "GP-YYMM-00001" pass_number — colliding on the
-- property-wide unique constraint.
--
-- Fix: mark the function SECURITY DEFINER (matching the existing pattern
-- used by other trigger/helper functions in this schema, e.g.
-- record_manual_payment, is_paying_parent) so the COUNT(*) always sees every
-- gate pass for the property regardless of the caller's RLS visibility.
-- Same prefix/count generation logic and the advisory lock from the prior
-- migration are both kept as-is; the unique constraint is untouched.
CREATE OR REPLACE FUNCTION public.fn_gate_pass_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.pass_number IS NOT NULL AND NEW.pass_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'GP-' || to_char(now(),'YYMM') || '-';
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.property_id::text || v_prefix, 0));
  SELECT COUNT(*)+1 INTO v_count FROM public.gate_passes
    WHERE property_id = NEW.property_id AND pass_number LIKE v_prefix || '%';
  NEW.pass_number := v_prefix || lpad(v_count::text,5,'0');
  RETURN NEW;
END $$;
