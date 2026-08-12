-- Set when an event is created by resolving a double-booking from the waitlist ("אישור האירוע")
-- instead of the normal new-event flow — holds the explanation the photographer picked/typed
-- (e.g. "שלחתי צלם אחר"). Null for every ordinary event. Doubles as the marker the dashboard's
-- "כפילויות/פרילנס" filter uses to find these events.
alter table public.events
  add column resolution_note text;
