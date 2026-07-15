
-- Path convention: <tenant_id>/<property_id>/...
-- storage.foldername(name) returns the folder path segments as text[].

CREATE POLICY "kyc/agreements admin all"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id IN ('kyc-documents','agreements')
    AND public.has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'HOSTEL_ADMIN')
  )
  WITH CHECK (
    bucket_id IN ('kyc-documents','agreements')
    AND public.has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'HOSTEL_ADMIN')
  );

CREATE POLICY "kyc/agreements warden read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('kyc-documents','agreements')
    AND public.warden_can_read_property(
      auth.uid(),
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

-- Students may upload/read their own KYC files (folder pattern: tenant/property/students/<student_id>/...)
CREATE POLICY "kyc student self read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[3] = 'students'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ((storage.foldername(name))[4])::uuid
        AND s.profile_id = auth.uid()
    )
  );
CREATE POLICY "kyc student self write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[3] = 'students'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ((storage.foldername(name))[4])::uuid
        AND s.profile_id = auth.uid()
    )
  );
