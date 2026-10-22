-- Students attaching a photo to their own complaint.
--
-- ComplaintForm uploads to the complaint-media bucket (allowed by the existing
-- storage policies) and then registers a `documents` row with
-- owner_type = 'COMPLAINT'. `documents` only had student policies for
-- owner_type = 'STUDENT' (KYC), so the insert failed with
-- 'new row violates row-level security policy for table "documents"'.
--
-- Mirrors the existing owner-scoped pattern: the helper is SECURITY DEFINER so
-- the policy does not depend on the caller's own RLS visibility into
-- `complaints`, and reuses the same permission gates that the complaints
-- policies themselves use (can_student_edit_complaints / can_student_view_complaints).

create or replace function public.can_student_attach_complaint_document(
  _user_id uuid,
  _complaint_id uuid,
  _tenant_id uuid,
  _property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.complaints c
    where c.id = _complaint_id
      and c.tenant_id = _tenant_id
      and c.property_id is not distinct from _property_id
      and c.deleted_at is null
      and public.can_student_edit_complaints(_user_id, c.student_id)
  )
$$;

create or replace function public.can_student_view_complaint_document(
  _user_id uuid,
  _complaint_id uuid,
  _tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.complaints c
    where c.id = _complaint_id
      and c.tenant_id = _tenant_id
      and public.can_student_view_complaints(_user_id, c.student_id)
  )
$$;

revoke all on function public.can_student_attach_complaint_document(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.can_student_view_complaint_document(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_student_attach_complaint_document(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.can_student_view_complaint_document(uuid, uuid, uuid) to authenticated;

drop policy if exists "documents student complaint insert" on public.documents;
create policy "documents student complaint insert" on public.documents
  for insert to authenticated
  with check (
    owner_type = 'COMPLAINT'
    and storage_bucket = 'complaint-media'
    and created_by = auth.uid()
    and property_id is not null
    -- file must live under the complaint's own storage folder
    and storage_path like (tenant_id::text || '/' || property_id::text || '/' || owner_id::text || '/%')
    and public.can_student_attach_complaint_document(auth.uid(), owner_id, tenant_id, property_id)
  );

-- Needed so the attachment is readable by its owner (and so that
-- INSERT ... RETURNING in registerDocument passes the SELECT check).
drop policy if exists "documents student complaint read" on public.documents;
create policy "documents student complaint read" on public.documents
  for select to authenticated
  using (
    owner_type = 'COMPLAINT'
    and public.can_student_view_complaint_document(auth.uid(), owner_id, tenant_id)
  );
