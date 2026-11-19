-- Lock a mess_menus row's content (and its mess_menu_items rows) from
-- being changed once at least one mess_feedback row exists against it.
-- Students have already rated/commented on a specific meal/date/time;
-- silently rewriting what that menu actually was underneath their feedback
-- would make the feedback retroactively misleading (same mess_menu_id, but
-- a different meal/title/items by the time anyone reads it).
--
-- Enforced at the trigger layer (BEFORE UPDATE/INSERT/DELETE) so it holds
-- for a direct Supabase API call too, not just the Warden UI — on top of,
-- not instead of, the existing mm_admin/mm_warden RLS policies (RLS still
-- decides who may even attempt the write; this decides whether that write
-- is allowed to succeed once feedback exists).
--
-- Deliberately scoped to content fields only (meal/title/menu_date/
-- serve_time/notes) — status/published_* are excluded so publishing and
-- any future cancellation flow stay unaffected, per the brief's "do not
-- change publishing/cancellation/viewing behavior unless required".
--
-- Live EXISTS check, not a permanent flag: there is currently no RLS
-- policy anywhere granting UPDATE/DELETE on mess_feedback to any role
-- (students can only INSERT their own via mf_student_insert; staff only
-- SELECT via mf_staff_read) — so in practice feedback can't be removed
-- through the app at all today, making this check permanent in effect.
-- Only a service-role/dashboard action bypassing RLS entirely could delete
-- a feedback row and re-open editing. A true tamper-proof lock would need
-- a new boolean column (e.g. mess_menus.locked_for_edit, set once and
-- never cleared) — not added here since no such column exists today and
-- the brief asked this limitation be explained rather than assumed away.

CREATE OR REPLACE FUNCTION public.fn_mess_menu_has_feedback(p_mess_menu_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.mess_feedback WHERE mess_menu_id = p_mess_menu_id);
$$;
REVOKE ALL ON FUNCTION public.fn_mess_menu_has_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mess_menu_has_feedback(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_block_mess_menu_edit_with_feedback()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.meal IS DISTINCT FROM OLD.meal
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.menu_date IS DISTINCT FROM OLD.menu_date
      OR NEW.serve_time IS DISTINCT FROM OLD.serve_time
      OR NEW.notes IS DISTINCT FROM OLD.notes)
     AND public.fn_mess_menu_has_feedback(OLD.id) THEN
    RAISE EXCEPTION 'This menu cannot be edited because students have already submitted feedback.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_mess_menu_edit_with_feedback ON public.mess_menus;
CREATE TRIGGER trg_block_mess_menu_edit_with_feedback
  BEFORE UPDATE ON public.mess_menus
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_mess_menu_edit_with_feedback();

-- Closes the item-replacement bypass: the Warden's Edit dialog saves by
-- deleting every mess_menu_items row for the menu and inserting fresh
-- ones, which wouldn't touch mess_menus itself and so wouldn't trip the
-- trigger above on its own.
CREATE OR REPLACE FUNCTION public.fn_block_mess_menu_items_change_with_feedback()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_menu_id uuid := COALESCE(NEW.mess_menu_id, OLD.mess_menu_id);
BEGIN
  IF public.fn_mess_menu_has_feedback(v_menu_id) THEN
    RAISE EXCEPTION 'This menu cannot be edited because students have already submitted feedback.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_block_mess_menu_items_change_with_feedback ON public.mess_menu_items;
CREATE TRIGGER trg_block_mess_menu_items_change_with_feedback
  BEFORE INSERT OR UPDATE OR DELETE ON public.mess_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_mess_menu_items_change_with_feedback();
