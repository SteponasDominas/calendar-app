-- Use this helper after creating a user account:
-- select public.seed_sample_events('<user-uuid>');

create or replace function public.seed_sample_events(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (user_id, title, description, starts_at, ends_at, all_day, color)
  values
    (
      target_user,
      'Kickoff sync',
      'Initial planning session for the new calendar project.',
      timezone('utc', now()) + interval '1 day' + interval '9 hours',
      timezone('utc', now()) + interval '1 day' + interval '10 hours',
      false,
      '#0f766e'
    ),
    (
      target_user,
      'Planning focus block',
      'No-meeting work period for roadmap and architecture.',
      timezone('utc', now()) + interval '3 days' + interval '8 hours',
      timezone('utc', now()) + interval '3 days' + interval '11 hours',
      false,
      '#2563eb'
    ),
    (
      target_user,
      'Team retro',
      'Review what worked and what to improve next sprint.',
      timezone('utc', now()) + interval '7 days' + interval '15 hours',
      timezone('utc', now()) + interval '7 days' + interval '16 hours',
      false,
      '#ca8a04'
    );
end;
$$;
