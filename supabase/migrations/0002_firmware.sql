-- ClearLine firmware_refs — org-scoped Yealink firmware certification cards
-- Idempotent: safe to re-run in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.firmware_refs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  model text not null,
  family text,
  certified_version text,
  platform text,
  notes text,
  eol boolean not null default false,
  support_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (org_id, model)
);

create index if not exists firmware_refs_org_updated_idx
  on public.firmware_refs (org_id, updated_at desc);

alter table public.firmware_refs enable row level security;

drop policy if exists firmware_refs_select on public.firmware_refs;
create policy firmware_refs_select on public.firmware_refs
  for select to authenticated
  using (org_id = public.current_org());

drop policy if exists firmware_refs_insert on public.firmware_refs;
create policy firmware_refs_insert on public.firmware_refs
  for insert to authenticated
  with check (org_id = public.current_org());

drop policy if exists firmware_refs_update on public.firmware_refs;
create policy firmware_refs_update on public.firmware_refs
  for update to authenticated
  using (org_id = public.current_org())
  with check (org_id = public.current_org());

drop policy if exists firmware_refs_delete on public.firmware_refs;
create policy firmware_refs_delete on public.firmware_refs
  for delete to authenticated
  using (org_id = public.current_org() and public.current_role() = 'admin');

-- Keep updated_at / updated_by fresh on write (last-write-wins; no rev columns)
create or replace function public.touch_firmware_refs()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists firmware_refs_touch on public.firmware_refs;
create trigger firmware_refs_touch
  before insert or update on public.firmware_refs
  for each row execute function public.touch_firmware_refs();
