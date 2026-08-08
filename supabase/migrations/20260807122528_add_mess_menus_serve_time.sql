-- Per-meal serve time for the Warden Mess module. One row per (property,
-- date, meal) already exists in mess_menus, so a single time column here
-- naturally becomes "Breakfast Time"/"Lunch Time"/etc. depending on which
-- meal row it's set on — no separate schedule table needed.
ALTER TABLE public.mess_menus ADD COLUMN IF NOT EXISTS serve_time time;
