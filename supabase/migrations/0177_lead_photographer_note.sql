-- The photographer's own note on a lead (owner, 2026-10-16): free text added from the lead's "⋯"
-- menu on the leads screen, shown on the card. Separate from leads.notes, which the intake
-- assistant writes (and rewrites while the chat goes on), so the assistant never overwrites it.
-- Writing it is activity on the lead (leads_touch_activity), like any other edit.
alter table public.leads add column if not exists photographer_note text;
