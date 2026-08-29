-- Lets a photographer tag each portfolio photo with a free-text category (e.g. "חתונות",
-- "בר/בת מצווה") so the public portfolio page can filter by it. Free text rather than a foreign
-- key into event_types — a photographer may want portfolio categories that don't map 1:1 onto
-- their pricing event types (e.g. splitting "חתונות" into "חתונה" vs "אירוסין" for the portfolio
-- specifically). null means "uncategorized" and always shows under "הכל".
alter table public.gallery_photos add column portfolio_category text;
