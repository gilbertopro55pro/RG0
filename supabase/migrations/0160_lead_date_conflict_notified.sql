-- A client who approved a quote but whose date was taken in the meantime can't finish the
-- questionnaire (submit-questionnaire). The photographer is told once per lead and date, so a client
-- retrying the same date doesn't notify them again (owner, 2026-10-12).
alter table leads add column if not exists date_conflict_notified_for date;
