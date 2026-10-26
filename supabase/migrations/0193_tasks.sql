-- Daily to-do list (owner, 2026-10-26, "עדכון ללא"): the photographer's own tasks by date, from the
-- "משימות" button on the home screen's header (TasksPanel, lib/tasks.ts, api/tasks). One row per
-- task. Personal to the signed-in user (auth.uid()), so deleting the user deletes their tasks.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_date date not null,
  title text not null check (char_length(title) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, task_date);
-- The header's count: open tasks up to today.
create index if not exists tasks_user_open_idx on public.tasks (user_id, task_date) where not done;

alter table public.tasks enable row level security;

create policy tasks_select_own on public.tasks for select using (user_id = auth.uid());
create policy tasks_insert_own on public.tasks for insert with check (user_id = auth.uid());
create policy tasks_update_own on public.tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_delete_own on public.tasks for delete using (user_id = auth.uid());
