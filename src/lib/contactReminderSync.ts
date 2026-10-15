// The leads screen (LeadsView) keeps its own copy of the leads, so a contact reminder moved or
// cleared from the reminder popup (ContactReminderPopup, on any screen) reached the database but
// the lead's card still showed the old time (owner, 2026-10-15). Every change is announced here:
// as an event for a leads screen that's open, and kept for a minute for one that opens right after
// ("לצפייה בליד" navigates while the change is still being saved, so the page may have read the
// lead before it). Client only.

const EVENT = "contact-reminder-changed";
const KEEP_MS = 60_000;

type Change = { id: string; remindAt: string | null };
const recent = new Map<string, { remindAt: string | null; at: number }>();

export function announceContactReminder(id: string, remindAt: string | null) {
  recent.set(id, { remindAt, at: new Date().getTime() });
  window.dispatchEvent(new CustomEvent<Change>(EVENT, { detail: { id, remindAt } }));
}

// Calls fn with the changes of the last minute, then with every new one. Returns the unsubscribe.
export function onContactReminderChange(fn: (id: string, remindAt: string | null) => void) {
  const now = new Date().getTime();
  for (const [id, c] of recent) {
    if (now - c.at < KEEP_MS) fn(id, c.remindAt);
    else recent.delete(id);
  }
  const handler = (e: Event) => {
    const { id, remindAt } = (e as CustomEvent<Change>).detail;
    fn(id, remindAt);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
