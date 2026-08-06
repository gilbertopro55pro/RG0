-- Photographer profiles (1:1 with auth.users)
create table public.photographers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  email text not null,
  plan text not null check (plan in ('monthly', 'annual')),
  created_at timestamptz not null default now()
);

alter table public.photographers enable row level security;

create policy "photographers_select_own"
  on public.photographers for select
  using (auth.uid() = id);

create policy "photographers_update_own"
  on public.photographers for update
  using (auth.uid() = id);

-- Auto-create a photographer profile from signup metadata
-- (supabase.auth.signUp is called with options.data = { name, phone, plan })
create function public.handle_new_photographer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.photographers (id, name, phone, email, plan)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'plan', 'monthly')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_photographer();

-- Events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  client_name text not null,
  client_phone text,
  package text not null check (package in ('stills', 'stills_reel', 'stills_video', 'full', 'full_second')),
  event_date date not null,
  event_location text,
  arrival_time time,
  deposit_amount numeric(10, 2) not null default 0,
  balance_amount numeric(10, 2) not null default 0,
  deposit_paid boolean not null default false,
  balance_paid boolean not null default false,
  balance_due_date date,
  created_at timestamptz not null default now()
);

create index events_photographer_id_idx on public.events(photographer_id);

alter table public.events enable row level security;

create policy "events_all_own"
  on public.events for all
  using (auth.uid() = photographer_id)
  with check (auth.uid() = photographer_id);

-- Stage tracker per event (one row per stage in the event's package flow)
create table public.event_stages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage_key text not null check (stage_key in (
    'event_closing', 'second_shooter_coordination', 'shoot_day', 'backup', 'culling',
    'photo_editing', 'gallery_upload', 'client_photo_selection', 'client_song_selection',
    'video_editing', 'video_approval', 'album_design', 'album_approval',
    'album_production', 'final_delivery'
  )),
  stage_order int not null,
  done boolean not null default false,
  done_at timestamptz,
  unique (event_id, stage_key)
);

create index event_stages_event_id_idx on public.event_stages(event_id);

alter table public.event_stages enable row level security;

create policy "event_stages_all_own"
  on public.event_stages for all
  using (event_id in (select id from public.events where photographer_id = auth.uid()))
  with check (event_id in (select id from public.events where photographer_id = auth.uid()));

-- Notification log (WhatsApp updates + Google Calendar entries, real or simulated)
create table public.event_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index event_notifications_event_id_idx on public.event_notifications(event_id);

alter table public.event_notifications enable row level security;

create policy "event_notifications_all_own"
  on public.event_notifications for all
  using (event_id in (select id from public.events where photographer_id = auth.uid()))
  with check (event_id in (select id from public.events where photographer_id = auth.uid()));
