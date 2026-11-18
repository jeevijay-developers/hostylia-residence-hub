-- =============================================================================
-- Gate entry curfew: evaluate the entry time in the PROPERTY's timezone, not UTC.
--
-- Bug: fn_check_gatepass_curfew() (BEFORE INSERT trigger trg_ge_curfew on gate_events) took
--   v_local_time := (NEW.event_at AT TIME ZONE 'UTC')::time
-- and compared it with properties.settings->>'curfew_time' (a local wall-clock time, default 21:00).
-- For an Asia/Kolkata property 9:00 PM IST (15:30 UTC) was read as 3:30 PM, so entries after the
-- curfew were not flagged late between 21:00 and 02:30 IST, while 02:30-05:30 IST entries (21:00-00:00 UTC)
-- were the ones flagged.
--
-- Fix (CREATE OR REPLACE, same signature, same trigger, same SECURITY DEFINER / search_path):
--   * timezone = properties.timezone (the same column the invoice-overdue and out-pass jobs use);
--   * v_local_time := (NEW.event_at AT TIME ZONE COALESCE(v_property_timezone, 'Asia/Kolkata'))::time;
--   * a missing, blank or INVALID timezone name falls back to 'Asia/Kolkata' (it never fails the insert).
--
-- Unchanged on purpose: the LATE rule (strictly AFTER curfew; exactly at curfew is ON TIME), the
-- curfew default 21:00 and its fallback on a malformed value, IN-events-of-students-only, event_at itself.
--
-- ONE related correction (same function, same intended rule): "returned after the pass's expected_in_at is
-- late" (timestamptz vs timestamptz, timezone-neutral) was written as `IF v_gp IS NOT NULL AND ...`. For a
-- record variable `IS NOT NULL` is true only if EVERY column is non-null; real gate passes always have NULL
-- columns, so that rule never fired and Out-Pass returns past their expected time were only flagged when also
-- past the curfew. It now uses FOUND. To revert just this behaviour, put `v_gp IS NOT NULL` back.
-- NO stored timestamp and no curfew setting is rewritten; gate_events.is_late of events already stored
-- (computed with the old UTC rule) is NOT recomputed (the table is append-only).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_gatepass_curfew()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_gp record;
  v_curfew time;
  v_settings jsonb;
  v_property_timezone text;
  v_late boolean := false;
  v_local_time time;
BEGIN
  IF NEW.direction <> 'IN' OR NEW.student_id IS NULL THEN RETURN NEW; END IF;

  SELECT settings, NULLIF(btrim(timezone), '')
    INTO v_settings, v_property_timezone
    FROM public.properties WHERE id = NEW.property_id;

  BEGIN
    v_curfew := COALESCE((v_settings->>'curfew_time')::time, TIME '21:00');
  EXCEPTION WHEN others THEN v_curfew := TIME '21:00';
  END;

  -- The entry's local wall-clock time in the property's timezone. An unknown timezone name raises an
  -- error, so it is caught and replaced by the default (Asia/Kolkata) rather than blocking the gate.
  BEGIN
    v_local_time := (NEW.event_at AT TIME ZONE COALESCE(v_property_timezone, 'Asia/Kolkata'))::time;
  EXCEPTION WHEN others THEN
    v_local_time := (NEW.event_at AT TIME ZONE 'Asia/Kolkata')::time;
  END;

  IF NEW.gate_pass_id IS NOT NULL THEN
    SELECT * INTO v_gp FROM public.gate_passes WHERE id = NEW.gate_pass_id;
    -- FOUND, not "v_gp IS NOT NULL": a record is "NOT NULL" only when EVERY column is non-null, and a real
    -- gate pass always has NULL columns (destination, qr_token_hash, actual_in_at ...), so the old test never
    -- let this rule fire.
    IF FOUND AND NEW.event_at > v_gp.expected_in_at THEN v_late := true; END IF;
  END IF;
  IF v_local_time > v_curfew THEN v_late := true; END IF;
  IF v_late THEN NEW.is_late := true; END IF;
  RETURN NEW;
END $$;

-- (CREATE OR REPLACE keeps the existing trigger and the REVOKE EXECUTE from PUBLIC / anon / authenticated.)
