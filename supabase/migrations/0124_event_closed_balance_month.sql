-- When an event is closed with part (or all) of its balance still unpaid, that remainder is
-- recognized as revenue in ONE month ("YYYY-MM", Israel time): the closing month, or — when nothing
-- on the balance was paid and the event was saved in an earlier month — whichever of the two the
-- photographer picked at closing. The revenue views add the CURRENT remaining balance (balance_amount
-- minus what's been paid) to this month, so later payment edits can never double count.
-- Null = nothing recognized at closing (balance fully paid, or the event predates this feature).
alter table public.events add column closed_balance_month text;
