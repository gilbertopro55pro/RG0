// The home screen's events view, saved on the photographer's account (photographers.home_events_view,
// migration 0170), so it survives logging out and follows them to every device (owner, 2026-10-13).

export const HOME_STATUS_FILTERS = ["week", "upcoming", "completed", "all", "duplicates"] as const;
export const HOME_SORT_ORDERS = ["asc", "desc", "month", "date", "range"] as const;
export type HomeStatusFilter = (typeof HOME_STATUS_FILTERS)[number];
export type HomeSortOrder = (typeof HOME_SORT_ORDERS)[number];
export type HomeEventsView = { status: HomeStatusFilter; sort: HomeSortOrder };

// The default until the photographer picks something else: the events of the coming week.
export const DEFAULT_HOME_VIEW: HomeEventsView = { status: "week", sort: "asc" };

// A saved value read back safely: anything unknown falls back to the default.
export function parseHomeEventsView(value: unknown): HomeEventsView {
  const v = (value && typeof value === "object" ? value : {}) as { status?: unknown; sort?: unknown };
  return {
    status: HOME_STATUS_FILTERS.includes(v.status as HomeStatusFilter) ? (v.status as HomeStatusFilter) : DEFAULT_HOME_VIEW.status,
    sort: HOME_SORT_ORDERS.includes(v.sort as HomeSortOrder) ? (v.sort as HomeSortOrder) : DEFAULT_HOME_VIEW.sort,
  };
}

// "The coming week": today through 7 days from today, by the Israeli date ("YYYY-MM-DD" bounds).
// Seven calendar days, not 168 hours: across a clock change the hours land a day off.
export function comingWeekRange(now = new Date()): { from: string; to: string } {
  const from = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const [y, m, d] = from.split("-").map(Number);
  return { from, to: new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10) };
}
