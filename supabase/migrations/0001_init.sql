-- ClearLine initial schema: orgs, profiles, invites, accounts, jobs, photos, job_events
-- Paste into Supabase SQL editor or run via supabase db push / migration.

-- Extensions
create extension if not exists "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id),
  display_name text not null,
  role text not null default 'tech' check (role in ('tech', 'admin')),
  created_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  email text not null,
  role text not null default 'tech' check (role in ('tech', 'admin')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  name text not null,
  site text,
  call_flow jsonb not null default '{}'::jsonb,
  call_flow_rev int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  account_id uuid references public.accounts(id) on delete set null,
  customer text not null,
  site text,
  stage text not null default 'survey' check (stage in ('survey', 'design', 'golive', 'complete')),
  assigned_to uuid references public.profiles(id),
  foc_date date,
  cutover_date date,
  survey jsonb not null default '{}'::jsonb,
  survey_rev int not null default 0,
  design jsonb not null default '{}'::jsonb,
  design_rev int not null default 0,
  golive jsonb not null default '{}'::jsonb,
  golive_rev int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  job_id uuid not null references public.jobs(id) on delete cascade,
  storage_path text not null,
  caption text,
  category text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.job_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor uuid references public.profiles(id),
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index jobs_org_updated_idx on public.jobs (org_id, updated_at desc) where deleted_at is null;
create index accounts_org_updated_idx on public.accounts (org_id, updated_at desc) where deleted_at is null;
create index photos_job_idx on public.photos (job_id);
create index job_events_job_idx on public.job_events (job_id, created_at desc);
create index invites_email_idx on public.invites (lower(email)) where accepted_at is null;

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.current_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ── Optimistic locking triggers ─────────────────────────────────────────────

create or replace function public.bump_job_revs()
returns trigger
language plpgsql
as $$
begin
  if new.survey is distinct from old.survey then
    if new.survey_rev is distinct from old.survey_rev then
      raise exception 'conflict:survey' using errcode = 'P0001';
    end if;
    new.survey_rev := old.survey_rev + 1;
  end if;

  if new.design is distinct from old.design then
    if new.design_rev is distinct from old.design_rev then
      raise exception 'conflict:design' using errcode = 'P0001';
    end if;
    new.design_rev := old.design_rev + 1;
  end if;

  if new.golive is distinct from old.golive then
    if new.golive_rev is distinct from old.golive_rev then
      raise exception 'conflict:golive' using errcode = 'P0001';
    end if;
    new.golive_rev := old.golive_rev + 1;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger jobs_bump
  before update on public.jobs
  for each row execute function public.bump_job_revs();

create or replace function public.bump_account_revs()
returns trigger
language plpgsql
as $$
begin
  if new.call_flow is distinct from old.call_flow then
    if new.call_flow_rev is distinct from old.call_flow_rev then
      raise exception 'conflict:call_flow' using errcode = 'P0001';
    end if;
    new.call_flow_rev := old.call_flow_rev + 1;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger accounts_bump
  before update on public.accounts
  for each row execute function public.bump_account_revs();

-- ── Onboarding RPCs ─────────────────────────────────────────────────────────

create or replace function public.create_org(name text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;
  if name is null or length(trim(name)) = 0 then
    raise exception 'org name required';
  end if;

  insert into public.orgs (name) values (trim(name))
  returning id into v_org_id;

  insert into public.profiles (id, org_id, display_name, role)
  values (v_uid, v_org_id, coalesce(nullif(trim(display_name), ''), 'Admin'), 'admin');

  return v_org_id;
end;
$$;

create or replace function public.accept_invite(display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'no email on user';
  end if;

  select * into v_invite
  from public.invites
  where lower(email) = lower(v_email)
    and accepted_at is null
  order by created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'no pending invite';
  end if;

  insert into public.profiles (id, org_id, display_name, role)
  values (
    v_uid,
    v_invite.org_id,
    coalesce(nullif(trim(display_name), ''), split_part(v_email, '@', 1)),
    v_invite.role
  );

  update public.invites
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

grant execute on function public.create_org(text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.current_org() to authenticated;
grant execute on function public.current_role() to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.accounts enable row level security;
alter table public.jobs enable row level security;
alter table public.photos enable row level security;
alter table public.job_events enable row level security;

-- orgs
create policy orgs_select on public.orgs
  for select to authenticated
  using (id = public.current_org());

create policy orgs_update on public.orgs
  for update to authenticated
  using (id = public.current_org() and public.current_role() = 'admin')
  with check (id = public.current_org() and public.current_role() = 'admin');

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (org_id = public.current_org());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and org_id = public.current_org()
    and (
      role = (select role from public.profiles p where p.id = auth.uid())
      or public.current_role() = 'admin'
    )
  );

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin')
  with check (org_id = public.current_org() and public.current_role() = 'admin');

-- invites (admin)
create policy invites_select on public.invites
  for select to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin');

create policy invites_insert on public.invites
  for insert to authenticated
  with check (org_id = public.current_org() and public.current_role() = 'admin');

create policy invites_update on public.invites
  for update to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin')
  with check (org_id = public.current_org() and public.current_role() = 'admin');

-- accounts
create policy accounts_select on public.accounts
  for select to authenticated
  using (org_id = public.current_org());

create policy accounts_insert on public.accounts
  for insert to authenticated
  with check (org_id = public.current_org());

create policy accounts_update on public.accounts
  for update to authenticated
  using (org_id = public.current_org())
  with check (org_id = public.current_org());

create policy accounts_delete on public.accounts
  for delete to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin');

-- jobs
create policy jobs_select on public.jobs
  for select to authenticated
  using (org_id = public.current_org());

create policy jobs_insert on public.jobs
  for insert to authenticated
  with check (org_id = public.current_org());

create policy jobs_update on public.jobs
  for update to authenticated
  using (org_id = public.current_org())
  with check (org_id = public.current_org());

create policy jobs_delete on public.jobs
  for delete to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin');

-- photos
create policy photos_select on public.photos
  for select to authenticated
  using (org_id = public.current_org());

create policy photos_insert on public.photos
  for insert to authenticated
  with check (org_id = public.current_org());

create policy photos_update on public.photos
  for update to authenticated
  using (org_id = public.current_org())
  with check (org_id = public.current_org());

create policy photos_delete on public.photos
  for delete to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin');

-- job_events
create policy job_events_select on public.job_events
  for select to authenticated
  using (org_id = public.current_org());

create policy job_events_insert on public.job_events
  for insert to authenticated
  with check (org_id = public.current_org());

create policy job_events_delete on public.job_events
  for delete to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin');

-- ── Storage bucket ──────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

create policy job_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_org()::text
  );

create policy job_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_org()::text
  );

create policy job_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_org()::text
  )
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_org()::text
  );

create policy job_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = public.current_org()::text
    and public.current_role() = 'admin'
  );
