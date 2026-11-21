-- ============================================================
-- Streetlight Fault Reporting System - Supabase setup
-- Run this whole file once in: Supabase Dashboard -> SQL Editor
-- It is safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Complaints table
-- ------------------------------------------------------------
create table if not exists public.complaints (
  tracking_id text primary key,
  description text not null check (char_length(description) between 5 and 500),
  photo_url   text not null,
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  status      text not null default 'submitted'
              check (status in ('submitted', 'verified', 'assigned', 'resolved', 'rejected')),
  admin_note  text check (char_length(admin_note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Duplicate handling. duplicate_warning records that the citizen was told a
-- nearby complaint was already open when they submitted (advisory only, set by
-- the app). duplicate_decision is the administrator's verdict and can only be
-- set by an admin: the insert policy below forces it to stay NULL on creation.
alter table public.complaints
  add column if not exists duplicate_warning boolean not null default false;

alter table public.complaints
  add column if not exists duplicate_decision text
  check (duplicate_decision in ('separate', 'duplicate', 'grouped'));

-- The tracking id is the citizen's only key to their own report, so it must
-- always be the unguessable SL-XXXXXX shape. This also rejects sequential or
-- hand-written ids such as SL-000001.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'complaints_tracking_id_format'
  ) then
    alter table public.complaints
      add constraint complaints_tracking_id_format
      check (tracking_id ~ '^SL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$');
  end if;
end $$;

create index if not exists complaints_created_at_idx on public.complaints (created_at desc);
create index if not exists complaints_status_idx     on public.complaints (status);

alter table public.complaints enable row level security;

-- ------------------------------------------------------------
-- 2. Admin allow-list
--    A user only counts as admin if their auth user id is in
--    this table. The table has RLS and NO policies, so it can
--    only be read through the is_admin() function below.
-- ------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
-- 3. Row level security policies on complaints
-- ------------------------------------------------------------

-- Citizens (anonymous) may only insert fresh complaints, always
-- starting in the "submitted" state with no admin note.
drop policy if exists "citizens can submit complaints" on public.complaints;
create policy "citizens can submit complaints"
  on public.complaints for insert
  to anon, authenticated
  with check (
    status = 'submitted'
    and admin_note is null
    -- only an admin may record a duplicate verdict
    and duplicate_decision is null
  );

-- Only admins can read the full list.
drop policy if exists "admins can read complaints" on public.complaints;
create policy "admins can read complaints"
  on public.complaints for select
  to authenticated
  using (public.is_admin());

-- Only admins can update status / notes.
drop policy if exists "admins can update complaints" on public.complaints;
create policy "admins can update complaints"
  on public.complaints for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 4. Keep updated_at current
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists complaints_touch_updated_at on public.complaints;
create trigger complaints_touch_updated_at
  before update on public.complaints
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 5. Public tracking lookup
--    Citizens have no SELECT permission on the table. They can
--    only look up a single complaint if they know its tracking
--    id, which is unguessable (SL-XXXXXX).
-- ------------------------------------------------------------
create or replace function public.track_complaint(p_tracking_id text)
returns table (
  tracking_id text,
  description text,
  photo_url   text,
  latitude    double precision,
  longitude   double precision,
  status      text,
  admin_note  text,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.tracking_id, c.description, c.photo_url, c.latitude, c.longitude,
         c.status, c.admin_note, c.created_at, c.updated_at
  from public.complaints c
  where c.tracking_id = upper(trim(p_tracking_id))
  limit 1;
$$;

grant execute on function public.track_complaint(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5b. Duplicate pre-check
--     Citizens cannot read the complaints table, so this function
--     answers one question only: "is anything still open within
--     N metres?" It returns a count, the distance of the nearest
--     match and that match's status. No ids, text or photos, so it
--     cannot be used to enumerate other people's reports.
-- ------------------------------------------------------------
create or replace function public.nearby_open_reports(
  p_latitude    double precision,
  p_longitude   double precision,
  p_radius_m    integer default 50
)
returns table (open_count integer, nearest_m integer, nearest_status text)
language sql
stable
security definer
set search_path = public
as $$
  with matches as (
    select c.status,
           (6371000 * 2 * asin(sqrt(
             power(sin(radians(c.latitude - p_latitude) / 2), 2)
             + cos(radians(p_latitude)) * cos(radians(c.latitude))
               * power(sin(radians(c.longitude - p_longitude) / 2), 2)
           ))) as distance_m
    from public.complaints c
    where p_latitude between -90 and 90
      and p_longitude between -180 and 180
      and c.status not in ('resolved', 'rejected')
  )
  select count(*)::integer,
         min(distance_m)::integer,
         (array_agg(status order by distance_m))[1]
  from matches
  where distance_m <= greatest(p_radius_m, 1);
$$;

grant execute on function public.nearby_open_reports(double precision, double precision, integer)
  to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Storage bucket for report photographs
--    Public read (so photos render in the app), but anyone can
--    only upload into the "reports/" folder.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'streetlight-photos',
  'streetlight-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = true;

drop policy if exists "anyone can upload a report photo" on storage.objects;
create policy "anyone can upload a report photo"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'streetlight-photos'
    and (storage.foldername(name))[1] = 'reports'
  );

-- ------------------------------------------------------------
-- 7. Create the first admin
--    Step 1: Authentication -> Users -> "Add user"
--            (use "Create new user", e.g. admin@yourcollege.edu)
--    Step 2: uncomment the statement below, set the email, run it.
-- ------------------------------------------------------------
-- insert into public.admin_users (user_id, email)
-- select id, email from auth.users where email = 'admin@yourcollege.edu'
-- on conflict (user_id) do nothing;
