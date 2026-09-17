-- Replaces the single free-text "description" prompt with structured picks (event type, style,
-- decorative elements) plus optional freeform notes — matches the new dropdown-driven UI in
-- FrameGeneratorTool.tsx. "description" is repurposed as the optional notes field, so it becomes
-- nullable instead of required.
alter table public.frame_requests
  add column event_type text not null default 'אחר',
  add column style text not null default 'אחר',
  add column elements text[] not null default '{}';

alter table public.frame_requests
  alter column description drop not null,
  alter column description set default '';
