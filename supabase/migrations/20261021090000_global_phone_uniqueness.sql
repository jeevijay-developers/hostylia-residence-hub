-- Global phone-number uniqueness across login accounts.
--
-- Background: auth.users.phone is unique only as an exact string, and the app
-- has historically stored the same mobile as "+91XXXXXXXXXX", "91XXXXXXXXXX"
-- and bare "XXXXXXXXXX", which produced duplicate login accounts for one
-- person (see the conflict report delivered with this change).
--
-- Existing duplicates are NOT modified here (no merge/delete/reassign). The
-- guard below only fires when a profile row is inserted or its phone changes,
-- so legacy conflicts are grandfathered until someone resolves them manually.
-- Every auth signup inserts a profiles row (handle_new_user), so this also
-- blocks duplicate auth accounts at the database level.
--
-- guardians / students rows are contact records, not login accounts: one
-- parent phone legitimately appears on many guardian rows (one parent, many
-- students), so they are intentionally not constrained.

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when d = '' then null
    when length(d) >= 10 then right(d, 10)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s
$$;

create index if not exists profiles_phone_normalized_idx
  on public.profiles (public.normalize_phone(phone))
  where phone is not null;

create or replace function public.fn_profiles_phone_unique_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
begin
  v_norm := public.normalize_phone(new.phone);
  if v_norm is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and public.normalize_phone(old.phone) is not distinct from v_norm then
    return new;
  end if;

  -- Serialise concurrent writers of the same number; the lock is released at
  -- commit/rollback, so the loser re-reads after the winner has committed.
  perform pg_advisory_xact_lock(hashtextextended('profile-phone:' || v_norm, 0));

  if exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and public.normalize_phone(p.phone) = v_norm
  ) then
    raise exception 'This phone number is already registered. Please log in with your existing account.'
      using errcode = '23505', constraint = 'profiles_phone_normalized_unique';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_phone_unique_guard on public.profiles;
create trigger trg_profiles_phone_unique_guard
  before insert or update of phone on public.profiles
  for each row execute function public.fn_profiles_phone_unique_guard();

-- Server-side lookup used by the OTP send path and staff invites. Returns:
--   'auth_exact'    an auth user already holds this number in the exact form
--                   Supabase will look up for +91 login (OTP login works)
--   'auth_variant'  an auth user holds this number in another format
--                   (legacy duplicate-format account; OTP login would create a
--                   second account instead of reaching it)
--   'profile_only'  a profile holds the number but no auth user does
--   'none'
create or replace function public.phone_registration_state(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_norm text := public.normalize_phone(p_phone);
begin
  if v_norm is null then
    return 'none';
  end if;
  if exists (select 1 from auth.users u where u.phone = '91' || v_norm) then
    return 'auth_exact';
  end if;
  if exists (select 1 from auth.users u where public.normalize_phone(u.phone) = v_norm) then
    return 'auth_variant';
  end if;
  if exists (select 1 from public.profiles p where public.normalize_phone(p.phone) = v_norm) then
    return 'profile_only';
  end if;
  return 'none';
end;
$$;

create or replace function public.find_profile_id_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where public.normalize_phone(p.phone) = public.normalize_phone(p_phone)
  order by p.created_at asc
  limit 1
$$;

revoke all on function public.phone_registration_state(text) from public, anon, authenticated;
revoke all on function public.find_profile_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.phone_registration_state(text) to service_role;
grant execute on function public.find_profile_id_by_phone(text) to service_role;
