-- The heading on the photographer's public chat page (e.g. "רועי גלברט - צילום אירועים"). Null = name.
alter table photographers add column if not exists intake_chat_title text;
