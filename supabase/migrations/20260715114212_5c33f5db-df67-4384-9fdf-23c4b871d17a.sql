
-- View: any authenticated user can read within their tenant folder
CREATE POLICY "property_assets_read_own_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-public-assets'
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'ACTIVE'
        AND tm.tenant_id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "property_assets_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-public-assets'
    AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, 'HOSTEL_ADMIN')
  );

CREATE POLICY "property_assets_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-public-assets'
    AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, 'HOSTEL_ADMIN')
  );

CREATE POLICY "property_assets_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-public-assets'
    AND public.has_tenant_role(auth.uid(), split_part(name, '/', 1)::uuid, 'HOSTEL_ADMIN')
  );
