-- Marks the moment a client approves a price quote via the public /quotes/[token] page (new
-- self-serve "approve quote -> fill event-details questionnaire -> event auto-created" flow,
-- admin-gated for now). Kept distinct from `converted_event_id` (already existed, set once the
-- questionnaire step actually creates the event) so the quote page can tell "not yet approved" /
-- "approved, questionnaire pending" / "done" apart.
alter table public.leads add column if not exists quote_approved_at timestamptz;
