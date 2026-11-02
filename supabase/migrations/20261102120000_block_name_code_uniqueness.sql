-- Block Name / Block Code uniqueness: case-insensitive, whitespace-normalized,
-- per property, soft-delete aware.
--
-- Before this migration only (property_id, name) was unique, case- and
-- whitespace-sensitive ("A" and "a" and "A  " were all allowed) and codes were
-- not unique at all.
--
-- Safety
--   * Nothing is deleted, renamed, merged or rewritten. Existing rows are left
--     exactly as they are.
--   * Step 1 inspects existing data FIRST. If any live (non-deleted) blocks in
--     one property would collide under the new rules, the migration aborts with
--     an actionable report (property, normalized key, the conflicting block ids,
--     names and codes) and changes nothing — migrations run in one transaction.
--     Resolve by renaming / re-coding / soft-deleting the listed blocks in the
--     app, then re-run.
--   * Soft-deleted blocks (deleted_at IS NOT NULL) never conflict: their name
--     and code can be reused.
--
-- Normalization (identical for the index, the duplicate check and the app):
--   name: lower(btrim(collapse runs of whitespace to one space))
--   code: lower(btrim(code)); blank / whitespace-only codes are "no code" (NULL)
-- The database is the authority; the app mirrors this only for friendly errors.

-- ---------------------------------------------------------------------------
-- 1. Existing-data check (fails safely with a duplicate report)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_report text := '';
  v_row record;
BEGIN
  FOR v_row IN
    SELECT 'name' AS kind, property_id,
           lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) AS norm_key,
           string_agg(format('%s [name=%L code=%L]', id, name, code), '; ' ORDER BY created_at) AS blocks
    FROM public.blocks
    WHERE deleted_at IS NULL
    GROUP BY property_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
    HAVING count(*) > 1
    UNION ALL
    SELECT 'code', property_id, lower(btrim(code)),
           string_agg(format('%s [name=%L code=%L]', id, name, code), '; ' ORDER BY created_at)
    FROM public.blocks
    WHERE deleted_at IS NULL AND code IS NOT NULL AND btrim(code) <> ''
    GROUP BY property_id, lower(btrim(code))
    HAVING count(*) > 1
  LOOP
    v_report := v_report || format(E'\n  - duplicate block %s in property %s, normalized key %L: %s',
                                   v_row.kind, v_row.property_id, v_row.norm_key, v_row.blocks);
  END LOOP;

  IF v_report <> '' THEN
    RAISE EXCEPTION E'Cannot add case-insensitive Block Name / Block Code uniqueness: existing blocks conflict.%\nNothing was changed. Rename, re-code or soft-delete the listed blocks (do not merge blocks that hold floors/allocations without moving them first), then re-run this migration.', v_report
      USING ERRCODE = '23505';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Unique indexes (new ones first, then the superseded one is dropped)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX uniq_blocks_property_name_norm_active
  ON public.blocks (property_id, (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uniq_blocks_property_code_norm_active
  ON public.blocks (property_id, (lower(btrim(code))))
  WHERE deleted_at IS NULL AND code IS NOT NULL AND btrim(code) <> '';

-- The new name index is strictly stricter than (property_id, name).
DROP INDEX IF EXISTS public.uniq_blocks_property_name_active;

-- ---------------------------------------------------------------------------
-- 3. Row hygiene for NEW writes only
-- ---------------------------------------------------------------------------
-- A block must have a real name. NOT VALID: enforced for new/updated rows, not
-- re-checked against existing rows (none are blank today, but we never block a
-- migration or rewrite data over it).
ALTER TABLE public.blocks
  ADD CONSTRAINT blocks_name_not_blank CHECK (btrim(name) <> '') NOT VALID;

-- Store the clean form on insert, or when the column itself is being changed:
-- name trimmed with runs of whitespace collapsed, empty code => NULL. Updating
-- an unrelated column (status, display_order, ...) never touches name/code, so
-- existing rows are not silently rewritten.
CREATE OR REPLACE FUNCTION public.fn_blocks_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  END IF;
  IF TG_OP = 'INSERT' OR NEW.code IS DISTINCT FROM OLD.code THEN
    NEW.code := NULLIF(btrim(NEW.code), '');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_blocks_normalize ON public.blocks;
CREATE TRIGGER trg_blocks_normalize
  BEFORE INSERT OR UPDATE ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.fn_blocks_normalize();
