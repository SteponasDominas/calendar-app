-- Adds recurrence + title color-group syncing support.

alter table public.events
  add column if not exists recurrence_freq text,
  add column if not exists recurrence_interval integer not null default 1,
  add column if not exists recurrence_until timestamptz;

alter table public.events
  drop constraint if exists events_recurrence_freq_check;
alter table public.events
  add constraint events_recurrence_freq_check check (
    recurrence_freq in ('daily', 'weekly', 'monthly', 'yearly')
    or recurrence_freq is null
  );

alter table public.events
  drop constraint if exists events_recurrence_interval_check;
alter table public.events
  add constraint events_recurrence_interval_check check (recurrence_interval >= 1);

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

create index if not exists event_color_groups_user_id_idx on public.event_color_groups (user_id);

drop trigger if exists event_color_groups_set_updated_at on public.event_color_groups;
create trigger event_color_groups_set_updated_at
before update on public.event_color_groups
for each row
execute function public.set_updated_at();

alter table public.event_color_groups enable row level security;

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
