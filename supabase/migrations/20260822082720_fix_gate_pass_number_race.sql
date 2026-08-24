-- Fix duplicate "gate_passes_property_id_pass_number_key" violations.
--
-- fn_gate_pass_number() computed the next pass_number as COUNT(*)+1 over
-- existing rows for the property+month prefix, with no serialization: two
-- concurrent inserts for the same property could both read the same count
-- before either committed, then both try to insert the same pass_number,
-- tripping the unique (property_id, pass_number) constraint. Reuse the same
-- prefix + count generation logic, but take a transaction-scoped advisory
-- lock keyed on property_id + month prefix first so concurrent inserts for
-- the same property are serialized and always see each other's rows. The
-- unique constraint itself is unchanged.
CREATE OR REPLACE FUNCTION public.fn_gate_pass_number()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
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
