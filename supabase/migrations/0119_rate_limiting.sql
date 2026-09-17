-- Fixed-window rate-limit counters for the handful of genuinely public, no-session, no-token
-- endpoints this app has (see src/lib/rateLimit.ts) — currently just /api/auth/signup, the one
-- custom-built endpoint that bypasses Supabase Auth's own signUp() (and its own baseline
-- rate limiting) via admin.createUser instead. Service-role only, never exposed to any client
-- directly — RLS is enabled with zero policies, which blocks anon/authenticated entirely, the
-- same pattern already used for other infra-only tables like payplus_webhook_events.
create table public.rate_limit_windows (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_windows enable row level security;

-- Atomic increment-and-return, so two concurrent requests in the same window can't both read the
-- same pre-increment count and both slip through — a plain select-then-update from the JS client
-- would race exactly like the job-claiming bug fixed elsewhere this session.
create function public.increment_rate_limit(p_key text, p_window_start timestamptz)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limit_windows (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limit_windows.count + 1
  returning count;
$$;
