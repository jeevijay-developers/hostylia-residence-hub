-- Server-side validation for student KYC documents.
--
-- Why a trigger: the "documents student self insert" policy lets a student
-- INSERT a STUDENT-owned documents row directly through the Supabase client,
-- so checks that live only in registerDocument (a server function) can be
-- skipped. The kyc-documents bucket enforces 5 MB and jpeg/png/webp/pdf on the
-- uploaded object, but it cannot vary by document type. This trigger adds the
-- per-type rules and the document_type enum at the database, for every insert
-- path. It is INSERT-only: existing documents are never touched or revalidated.
--
--   AADHAAR, COLLEGE_ID : JPG, PNG, PDF
--   PHOTO               : JPG, PNG
--   OTHER               : whatever the bucket allows (JPG, PNG, WebP, PDF)
--   size                : <= 5 MB (bucket file_size_limit = 5242880, unchanged)
--
-- Mirrors KYC_DOCUMENT_RULES / validateKycFile in src/schemas/student.ts. Keep
-- the two in sync. Matching extension + MIME + size only shows the file is a
-- plausible image/PDF; it says nothing about authenticity, which remains the
-- Admin/Warden review's job. The bucket stays private and is not modified.
CREATE OR REPLACE FUNCTION public.fn_validate_kyc_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_bytes CONSTANT bigint := 5242880;
  v_exts text[];
  v_mimes text[];
  v_label text;
  v_allowed text;
  v_ext text;
  v_path_ext text;
  v_mime text;
  v_expected_mime text;
  v_obj_mime text;
  v_obj_size bigint;
  v_found boolean;
BEGIN
  IF NEW.owner_type IS DISTINCT FROM 'STUDENT' OR NEW.storage_bucket IS DISTINCT FROM 'kyc-documents' THEN
    RETURN NEW;
  END IF;

  IF NEW.document_type IN ('AADHAAR', 'COLLEGE_ID') THEN
    v_exts := ARRAY['jpg', 'jpeg', 'png', 'pdf'];
    v_mimes := ARRAY['image/jpeg', 'image/png', 'application/pdf'];
    v_label := 'JPG, PNG or PDF';
  ELSIF NEW.document_type = 'PHOTO' THEN
    v_exts := ARRAY['jpg', 'jpeg', 'png'];
    v_mimes := ARRAY['image/jpeg', 'image/png'];
    v_label := 'JPG or PNG';
  ELSIF NEW.document_type = 'OTHER' THEN
    v_exts := ARRAY['jpg', 'jpeg', 'png', 'webp', 'pdf'];
    v_mimes := ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    v_label := 'JPG, PNG, WebP or PDF';
  ELSE
    RAISE EXCEPTION 'Invalid document type. Choose one of: AADHAAR, COLLEGE_ID, PHOTO, OTHER.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_allowed := format('Allowed formats for %s: %s, up to 5 MB.',
    replace(NEW.document_type, '_', ' '), v_label);

  v_ext := lower(substring(NEW.original_filename FROM '\.([^.]+)$'));
  v_path_ext := lower(substring(NEW.storage_path FROM '\.([^.]+)$'));
  v_mime := lower(NEW.mime_type);

  IF v_ext IS NULL OR NOT (v_ext = ANY (v_exts)) THEN
    RAISE EXCEPTION 'Unsupported file extension. %', v_allowed USING ERRCODE = 'check_violation';
  END IF;
  IF v_path_ext IS NULL OR NOT (v_path_ext = ANY (v_exts)) THEN
    RAISE EXCEPTION 'Unsupported file extension. %', v_allowed USING ERRCODE = 'check_violation';
  END IF;
  IF v_mime IS NULL OR NOT (v_mime = ANY (v_mimes)) THEN
    RAISE EXCEPTION 'This file''s format is not allowed. %', v_allowed USING ERRCODE = 'check_violation';
  END IF;

  v_expected_mime := CASE v_ext
    WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'jpeg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png'
    WHEN 'webp' THEN 'image/webp'
    WHEN 'pdf' THEN 'application/pdf'
  END;
  IF v_mime IS DISTINCT FROM v_expected_mime THEN
    RAISE EXCEPTION 'The file extension (.%) does not match its format (%). %', v_ext, v_mime, v_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.size_bytes IS NULL OR NEW.size_bytes <= 0 THEN
    RAISE EXCEPTION 'File size is missing or empty. %', v_allowed USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.size_bytes > c_max_bytes THEN
    RAISE EXCEPTION 'File is too large. Maximum size is 5 MB. %', v_allowed USING ERRCODE = 'check_violation';
  END IF;

  -- If the object is already in storage (the normal flow uploads first), hold
  -- the actual stored MIME type and size to the same rules rather than trusting
  -- the values the client declared on the row. A row for an object that does
  -- not exist (seed data, tests) only gets the declared-value checks above.
  SELECT true,
         lower(o.metadata ->> 'mimetype'),
         NULLIF(o.metadata ->> 'size', '')::bigint
    INTO v_found, v_obj_mime, v_obj_size
  FROM storage.objects o
  WHERE o.bucket_id = 'kyc-documents' AND o.name = NEW.storage_path;

  IF COALESCE(v_found, false) THEN
    IF v_obj_mime IS NOT NULL AND NOT (v_obj_mime = ANY (v_mimes)) THEN
      RAISE EXCEPTION 'The uploaded file''s format is not allowed. %', v_allowed
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_obj_size IS NOT NULL AND v_obj_size > c_max_bytes THEN
      RAISE EXCEPTION 'The uploaded file is too large. Maximum size is 5 MB. %', v_allowed
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_validate_kyc_document() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_kyc_document ON public.documents;
CREATE TRIGGER trg_validate_kyc_document
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_kyc_document();
