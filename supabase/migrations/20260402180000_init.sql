-- Initial calendar foundation schema.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  color text not null default '#0f766e',
  is_running boolean not null default false,
  recurrence_freq text,
  recurrence_interval integer not null default 1,
  recurrence_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint events_valid_range check (ends_at > starts_at),
  constraint events_recurrence_freq_check check (
    recurrence_freq in ('daily', 'weekly', 'monthly', 'yearly')
    or recurrence_freq is null
  ),
  constraint events_recurrence_interval_check check (recurrence_interval >= 1)
);

create table if not exists public.event_color_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title_key text not null,
  canonical_title text not null,
  color text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_color_groups_title_key_not_empty check (length(trim(title_key)) > 0),
  constraint event_color_groups_unique unique (user_id, title_key)
);

create index if not exists events_user_id_idx on public.events (user_id);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_user_id_starts_at_idx on public.events (user_id, starts_at);
create index if not exists events_user_id_running_idx on public.events (user_id, is_running);
create unique index if not exists events_single_running_per_user_idx
  on public.events (user_id)
  where is_running = true;
create index if not exists event_color_groups_user_id_idx on public.event_color_groups (user_id);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

drop trigger if exists event_color_groups_set_updated_at on public.event_color_groups;
create trigger event_color_groups_set_updated_at
before update on public.event_color_groups
for each row
execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_color_groups enable row level security;

drop policy if exists "Users can read own events" on public.events;
create policy "Users can read own events"
on public.events
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own events" on public.events;
create policy "Users can insert own events"
on public.events
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own events" on public.events;
create policy "Users can update own events"
on public.events
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own events" on public.events;
create policy "Users can delete own events"
on public.events
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own color groups" on public.event_color_groups;
create policy "Users can read own color groups"
on public.event_color_groups
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own color groups" on public.event_color_groups;
create policy "Users can insert own color groups"
on public.event_color_groups
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own color groups" on public.event_color_groups;
create policy "Users can update own color groups"
on public.event_color_groups
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own color groups" on public.event_color_groups;
create policy "Users can delete own color groups"
on public.event_color_groups
for delete
using (auth.uid() = user_id);
