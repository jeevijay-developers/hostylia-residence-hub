-- Fix duplicate "uniq_refunds_property_number" violations.
--
-- fn_refund_number() computed the next refund_number as COUNT(*)+1 over existing
-- rows for the property+month prefix, with no serialization: two concurrent
-- inserts for the same property (e.g. a double-submitted refund request) could
-- both read the same count before either committed, then both try to insert the
-- same refund_number, tripping the unique (property_id, refund_number)
-- constraint. Same bug class already fixed for gate passes
-- (20260822082720_fix_gate_pass_number_race.sql) and complaints
-- (fix_complaint_number_race) — reusing the identical fix here: take a
-- transaction-scoped advisory lock keyed on property_id + month prefix first,
-- so concurrent inserts for the same property are serialized and always see
-- each other's rows. The unique constraint itself is unchanged.

CREATE OR REPLACE FUNCTION public.fn_refund_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text; v_count int;
BEGIN
  IF NEW.refund_number IS NOT NULL AND NEW.refund_number <> '' THEN RETURN NEW; END IF;
  v_prefix := 'RFD-' || to_char(now(),'YYMM') || '-';
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.property_id::text || v_prefix, 0));
  SELECT COUNT(*)+1 INTO v_count FROM public.refunds
    WHERE property_id = NEW.property_id AND refund_number LIKE v_prefix || '%';
  NEW.refund_number := v_prefix || lpad(v_count::text,4,'0');
  RETURN NEW;
END $$;
