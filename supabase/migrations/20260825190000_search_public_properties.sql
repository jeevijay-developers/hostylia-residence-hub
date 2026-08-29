-- Public residence autocomplete for mobile/web signup.
-- Returns only ACTIVE, non-deleted properties with public-safe fields.

create or replace function public.search_public_properties(
  search_query text default '',
  result_limit integer default 8
)
returns table (
  id uuid,
  name text,
  city text,
  slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.city, p.slug
  from public.properties p
  where p.deleted_at is null
    and p.status = 'ACTIVE'
    and (
      coalesce(trim(search_query), '') = ''
      or p.name ilike '%' || trim(search_query) || '%'
      or coalesce(p.city, '') ilike '%' || trim(search_query) || '%'
      or coalesce(p.slug, '') ilike '%' || trim(search_query) || '%'
    )
  order by p.name
  limit greatest(1, least(coalesce(result_limit, 8), 20));
$$;

revoke all on function public.search_public_properties(text, integer) from public;
grant execute on function public.search_public_properties(text, integer) to anon, authenticated;

comment on function public.search_public_properties(text, integer) is
  'Public-safe ACTIVE property search for signup residence autocomplete.';
