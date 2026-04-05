-- Adds running timer support while keeping one active timer per user.

alter table public.events
  add column if not exists is_running boolean not null default false;

create index if not exists events_user_id_running_idx on public.events (user_id, is_running);

create unique index if not exists events_single_running_per_user_idx
  on public.events (user_id)
  where is_running = true;

