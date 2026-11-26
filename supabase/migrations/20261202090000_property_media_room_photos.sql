-- Room photos (Add room → Photos, Rooms & Beds → room card).
--
-- Private bucket; files live at the tenant-scoped path the storage rules
-- prescribe: {tenant_id}/{property_id}/rooms/{room_id}/{file_id}.{ext}
-- No table column: the room's photos are the objects under its folder.
--
-- Read: Super Admin, or a member of that tenant (any role — a room photo is not
-- sensitive inside the tenant). Write/delete: Super Admin or that tenant's
-- Hostel Admin, only under a property that really belongs to the tenant and a
-- room that really belongs to that property.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-media',
  'property-media',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- True when `name` is {tenant}/{property}/rooms/{room}/<file> and the room sits
-- in that property, which sits in that tenant (all live rows).
CREATE OR REPLACE FUNCTION public.is_valid_room_media_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    array_length(storage.foldername(_name), 1) = 4
    AND (storage.foldername(_name))[3] = 'rooms'
    AND (storage.foldername(_name))[1] ~ '^[0-9a-f-]{36}$'
    AND (storage.foldername(_name))[2] ~ '^[0-9a-f-]{36}$'
    AND (storage.foldername(_name))[4] ~ '^[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.rooms r
      JOIN public.properties p ON p.id = r.property_id
      WHERE r.id = ((storage.foldername(_name))[4])::uuid
        AND r.property_id = ((storage.foldername(_name))[2])::uuid
        AND p.tenant_id = ((storage.foldername(_name))[1])::uuid
        AND r.deleted_at IS NULL
        AND p.deleted_at IS NULL
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_valid_room_media_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_room_media_path(text) TO authenticated;

DROP POLICY IF EXISTS "property-media read" ON storage.objects;
CREATE POLICY "property-media read" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'property-media'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

DROP POLICY IF EXISTS "property-media insert" ON storage.objects;
CREATE POLICY "property-media insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'property-media'
  AND public.is_valid_room_media_path(name)
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'HOSTEL_ADMIN'::app_role)
  )
);

DROP POLICY IF EXISTS "property-media delete" ON storage.objects;
CREATE POLICY "property-media delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'property-media'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'HOSTEL_ADMIN'::app_role)
  )
);
