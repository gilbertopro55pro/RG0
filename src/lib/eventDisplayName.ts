// "סוג האירוע - שם הלקוח" as shown on event cards/headers (e.g. "עלייה לתורה - יוני כהן"). Falls
// back to the plain client name when no type was set. Display-only — messages, contracts and the
// gallery title deliberately keep using client_name alone.
export function eventDisplayName(event: { client_name: string; event_type?: string | null }): string {
  const type = event.event_type?.trim();
  return type ? `${type} - ${event.client_name}` : event.client_name;
}

// The title an event gets in the photographer's calendar (Google/Apple): "סוג האירוע - שם הלקוח -
// מיקום האירוע". Any part that isn't set is simply left out (no dangling dashes). The calendar
// description keeps its own separate detail lines.
export function calendarEventTitle(event: { client_name: string; event_type?: string | null; event_location?: string | null }): string {
  return [event.event_type, event.client_name, event.event_location]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" - ");
}
