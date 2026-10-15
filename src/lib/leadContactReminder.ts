// "תזכורת ליצירת קשר" (owner, 2026-10-15; migration 0175): a reminder to get back to a lead, at a
// date and time the photographer picks when marking the lead "יצרתי קשר" (LeadsView,
// ContactReminderDialog). When it falls due the lead pops up in the app (ContactReminderPopup,
// api/leads/contact-reminders) and a phone notification goes out once (api/cron/lead-reminders).
// A lead that was won, lost, booked or archived meanwhile doesn't come back.

// The furthest ahead a reminder can be set.
export const CONTACT_REMIND_MAX_DAYS = 365;

// A reminder time from a request: an ISO moment from now (less a little clock skew) up to the limit.
export function validContactRemindAt(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string") return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at < now - 60_000 || at > now + CONTACT_REMIND_MAX_DAYS * 86_400_000) return null;
  return new Date(at).toISOString();
}

// The lead columns a due reminder shows.
export const CONTACT_REMINDER_COLUMNS = "id, name, phone, event_type_name, event_date_interest, notes, contact_remind_at";

export type DueContactReminder = {
  id: string;
  name: string;
  phone: string | null;
  event_type_name: string | null;
  event_date_interest: string | null;
  notes: string | null;
  contact_remind_at: string;
};
