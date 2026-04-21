-- Manual Supabase SQL for third-party integration delivery.
-- Run this in the Supabase SQL editor for the target project.

create table if not exists public.integration_destinations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  type text not null default 'webhook',
  url text not null,
  auth_type text not null default 'none',
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_destinations_type_check
    check (type in ('webhook')),
  constraint integration_destinations_auth_type_check
    check (auth_type in ('none', 'bearer', 'hmac'))
);

create index if not exists integration_destinations_owner_idx
  on public.integration_destinations(owner_user_id);

create index if not exists integration_destinations_client_idx
  on public.integration_destinations(client_id);

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  submission_id text not null,
  destination_id uuid references public.integration_destinations(id) on delete set null,
  destination_name text,
  destination_type text not null default 'webhook',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  idempotency_key text not null,
  request_payload jsonb,
  response_status integer,
  response_body jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_jobs_status_check
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  constraint integration_jobs_destination_type_check
    check (destination_type in ('webhook')),
  constraint integration_jobs_idempotency_key_unique unique (idempotency_key)
);

create index if not exists integration_jobs_owner_idx
  on public.integration_jobs(owner_user_id);

create index if not exists integration_jobs_submission_idx
  on public.integration_jobs(submission_id, created_at desc);

create index if not exists integration_jobs_destination_idx
  on public.integration_jobs(destination_id, created_at desc);

alter table public.integration_destinations enable row level security;
alter table public.integration_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_destinations'
      and policyname = 'Users can read their integration destinations'
  ) then
    create policy "Users can read their integration destinations"
      on public.integration_destinations
      for select
      using (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_destinations'
      and policyname = 'Users can create their integration destinations'
  ) then
    create policy "Users can create their integration destinations"
      on public.integration_destinations
      for insert
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_destinations'
      and policyname = 'Users can update their integration destinations'
  ) then
    create policy "Users can update their integration destinations"
      on public.integration_destinations
      for update
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_destinations'
      and policyname = 'Users can delete their integration destinations'
  ) then
    create policy "Users can delete their integration destinations"
      on public.integration_destinations
      for delete
      using (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_jobs'
      and policyname = 'Users can read their integration jobs'
  ) then
    create policy "Users can read their integration jobs"
      on public.integration_jobs
      for select
      using (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_jobs'
      and policyname = 'Users can create their integration jobs'
  ) then
    create policy "Users can create their integration jobs"
      on public.integration_jobs
      for insert
      with check (auth.uid() = owner_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_jobs'
      and policyname = 'Users can update their integration jobs'
  ) then
    create policy "Users can update their integration jobs"
      on public.integration_jobs
      for update
      using (auth.uid() = owner_user_id)
      with check (auth.uid() = owner_user_id);
  end if;
end $$;
