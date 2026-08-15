-- Correction to 0041: WhatsApp template messages can't carry genuinely free-form text — Meta
-- only approves templates with a fixed body and a small number of named variable slots (this is
-- exactly why review_request_v1 only varies the client name and a link, not its whole body).
-- Per-photographer custom follow-up text was never actually deliverable; drop the columns before
-- anything depends on them and keep just the on/off toggle.
alter table public.photographers
  drop column lead_follow_up_msg_1,
  drop column lead_follow_up_msg_2,
  drop column lead_follow_up_msg_3;
