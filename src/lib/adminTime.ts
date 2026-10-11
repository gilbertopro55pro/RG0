// The landing page's admin-time numbers (owner, 2026-10-11: "שעתיים של מנהלות נשמע מעט", raise it
// as far as is still believable). Minutes of admin per event without a system, one per pain/solution
// item on the page: inquiries including the ones that never book, quote and contract, payments,
// coordination before and after, gallery and photo selection, album coordination (not the design
// itself). The page shows each item's minutes, so the total is never a bare claim, and the
// calculator lets a visitor set their own. Shared by the server sections and the client calculator.

export const ADMIN_MINUTES_BY_STEP = [45, 40, 25, 60, 50, 50] as const;
export const ADMIN_MINUTES_PER_EVENT = ADMIN_MINUTES_BY_STEP.reduce((sum, m) => sum + m, 0);
// What still takes the photographer's time with Gilberto: mostly answering real client questions.
export const MINUTES_LEFT_WITH_GILBERTO = 40;
export const DEFAULT_EVENTS_PER_MONTH = 6;
export const DEFAULT_HOURLY_VALUE = 150;
const WORKDAY_HOURS = 8;

// Hours a month the photographer gets back.
export function hoursSavedPerMonth(adminMinutesPerEvent: number, eventsPerMonth: number): number {
  return Math.round((Math.max(0, adminMinutesPerEvent - MINUTES_LEFT_WITH_GILBERTO) * eventsPerMonth) / 6) / 10;
}

// Eight-hour working days a year that the given minutes per event add up to.
export function workdaysPerYear(minutesPerEvent: number, eventsPerMonth: number): number {
  return Math.round((Math.max(0, minutesPerEvent) * eventsPerMonth * 12) / 60 / WORKDAY_HOURS);
}
