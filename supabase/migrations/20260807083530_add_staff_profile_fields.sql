-- Warden/Accountant profile management: personal-identity fields on
-- profiles, a tenant-scoped employee_id on role_assignments, and an
-- avatars storage bucket. Self-RLS already in place on both tables
-- (phase1_profiles_self_all, "own role_assignments readable") covers
-- reading/writing these new columns — no policy changes needed there.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('MALE','FEMALE','OTHER')),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS blood_group TEXT CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  ADD COLUMN IF NOT EXISTS address JSONB,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_number TEXT;

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS employee_id TEXT;

-- Deterministic, unique-by-construction (derived from the row's own PK) —
-- generated server-side only, so it can never be user-editable.
CREATE OR REPLACE FUNCTION public.fn_role_assignments_set_employee_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  prefix := CASE NEW.role
    WHEN 'WARDEN' THEN 'WRD'
    WHEN 'ACCOUNTANT' THEN 'ACC'
    WHEN 'HOSTEL_ADMIN' THEN 'ADM'
    ELSE 'STF'
  END;
  NEW.employee_id := prefix || '-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_assignments_employee_id ON public.role_assignments;
CREATE TRIGGER trg_role_assignments_employee_id
  BEFORE INSERT ON public.role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_role_assignments_set_employee_id();

-- Backfill existing rows (id already exists, so this is retroactively safe).
UPDATE public.role_assignments
SET employee_id = (
  CASE role
    WHEN 'WARDEN' THEN 'WRD'
    WHEN 'ACCOUNTANT' THEN 'ACC'
    WHEN 'HOSTEL_ADMIN' THEN 'ADM'
    ELSE 'STF'
  END || '-' || upper(substr(replace(id::text, '-', ''), 1, 8))
)
WHERE employee_id IS NULL;

-- ============ avatars storage bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars self insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars self update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars self delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
