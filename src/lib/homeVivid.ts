// The home screen in the vivid look (lib/tones.ts, admin only for now): the small rules behind its
// header pills, the next shoot's stage track and the leads badge. Pure, so the counts on the
// screen are tested (homeVivid.test.ts).

import { comingWeekRange } from "@/lib/homeEventsView";

type CountedEvent = { id: string; event_date: string; closed_at: string | null; needs_review?: boolean | null };

// What on an event needs the photographer (page.tsx's attentionByEvent: an open balance, an unpaid
// deposit, an unsigned contract), or an event imported from the calendar that still needs its
// details. A closed event never does. The same rule colors the event's date tile in the list.
export function eventNeedsAttention(
  event: Pick<CountedEvent, "closed_at" | "needs_review">,
  attention: { openBalance?: number; depositDue?: number; contractPending?: boolean } | null | undefined
): boolean {
  if (event.closed_at) return false;
  return !!(attention?.openBalance || attention?.depositDue || attention?.contractPending || event.needs_review);
}

// A tap on one of the header pills (HomeVividPills) asks the events list below to show those
// events (owner, 2026-10-22): a window event, since the two sit apart on the page.
export const HOME_LIST_FILTER_EVENT = "gf:home-list-filter";
export type HomeListFilterRequest = "week" | "attention";

// The two pills under the heading: events of the coming week (today through 7 days from today by
// the Israeli date, whatever their status: the same events the list's "השבוע הקרוב" shows), and
// events that need the photographer.
export function homeHeaderCounts(
  events: readonly CountedEvent[],
  attentionByEvent: Readonly<Record<string, { openBalance?: number; depositDue?: number; contractPending?: boolean }>>,
  now: Date = new Date()
): { week: number; attention: number } {
  const { from, to } = comingWeekRange(now);
  let week = 0;
  let attention = 0;
  for (const e of events) {
    if (e.event_date >= from && e.event_date <= to) week++;
    if (eventNeedsAttention(e, attentionByEvent[e.id])) attention++;
  }
  return { week, attention };
}

export type StageSegment = "done" | "next" | "todo";

// The next shoot's segmented bar: one segment per stage in its order, the first stage not done is
// "next" (half gold). `current` is that stage's position, 1-based, the same number the event page
// shows ("שלב 4 מתוך 8" while 3 are done), or null once every stage is done. No stages: nothing.
export function stageTrack(
  stages: readonly { done: boolean; stage_order: number }[] | null | undefined
): { total: number; current: number | null; segments: StageSegment[] } | null {
  if (!stages?.length) return null;
  const ordered = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  const nextIdx = ordered.findIndex((s) => !s.done);
  return {
    total: ordered.length,
    current: nextIdx === -1 ? null : nextIdx + 1,
    segments: ordered.map((s, i) => (s.done ? "done" : i === nextIdx ? "next" : "todo")),
  };
}

// A count on a badge: nothing at zero, and a cap so it fits the badge.
export function countBadge(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

// "New" leads for the badge on לידים ופניות: still in status "new" and not archived — the leads the
// photographer hasn't touched yet. Applied to a count query in page.tsx (vivid only).
// (Typed loosely on purpose: matching Supabase's query builder against a constraint is too deep
// for TypeScript, TS2589.)
type LeadFilterable = { eq(column: string, value: string): LeadFilterable; is(column: string, value: null): LeadFilterable };
export function onlyNewLeads<Q>(query: Q): Q {
  return (query as unknown as LeadFilterable).eq("status", "new").is("archived_at", null) as unknown as Q;
}

// The revenue card's bar: what came in this month and what's still expected, as shares of the
// month's forecast (received + due this month). Both 0 when nothing is expected at all.
export function revenueSplit(monthTotal: number, monthForecast: number): { receivedPct: number; expectedPct: number; stillDue: number } {
  const stillDue = Math.max(0, monthForecast - monthTotal);
  if (monthForecast <= 0) return { receivedPct: 0, expectedPct: 0, stillDue };
  const receivedPct = Math.min(100, Math.max(0, (monthTotal / monthForecast) * 100));
  return { receivedPct, expectedPct: 100 - receivedPct, stillDue };
}
