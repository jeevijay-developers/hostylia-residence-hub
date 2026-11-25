-- Fix duplicate "payments_pkey"-adjacent races on payment_number generation.
--
-- fn_payment_number() computed the next payment_number as COUNT(*)+1 over
-- existing rows for the property+month prefix, with no serialization — the
-- same bug class already found and fixed for refunds
-- (20261130090000_fix_refund_number_race.sql), gate passes
-- (20260822082720_fix_gate_pass_number_race.sql) and complaints
-- (fix_complaint_number_race). Payment simulation mode's rapid-click testing
-- pattern makes this far more likely to actually surface than it has for
-- real gateway payments so far, but the bug itself is pre-existing and
-- independent of simulation mode.
--
-- Same fix: a transaction-scoped advisory lock keyed on property_id + month
-- prefix, serializing concurrent inserts for the same property so they
-- always see each other's rows. Output format (prefix, zero-padding,
-- uniqueness scope) is unchanged — verified against the live function before
-- this migration: 'PMT-' || YYMM || '-' || 5-digit zero-padded sequence,
-- scoped per property_id. This migration only adds the lock; it does not
-- change the generated number's shape in any way.

CREATE OR REPLACE FUNCTION public.fn_payment_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.payment_number IS NOT NULL AND NEW.payment_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'PMT-' || to_char(now(),'YYMM') || '-';
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.property_id::text || v_prefix, 0));
  SELECT COUNT(*)+1 INTO v_count FROM public.payments
    WHERE property_id = NEW.property_id AND payment_number LIKE v_prefix || '%';
  NEW.payment_number := v_prefix || lpad(v_count::text,5,'0');
  RETURN NEW;
END $$;
