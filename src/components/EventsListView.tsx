"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CloseEventConfirmModal from "@/components/CloseEventConfirmModal";
import { packageLabel } from "@/lib/stages";
import type { EventRow } from "@/lib/types";
import { googleColorRgba } from "@/lib/googleColors";
import { eventDisplayName } from "@/lib/eventDisplayName";

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };
type StatusFilter = "upcoming" | "completed" | "all" | "duplicates";
type SortOrder = "asc" | "desc" | "month";
const PAGE_SIZE = 10;

// A genuine orange — not this app's "amber" token, which despite the name is actually a
// blue-purple brand color (#5b6fd1), not orange at all. Kept as a plain constant here rather than
// a new globals.css token since it's only used in this one file, for one purpose: telling a
// freelance-covered event's card apart from a regular one at a glance. Separate from
// needs_review's own tint, which is whichever of Google's 11 calendar colors the photographer
// picked — the two are visually distinct on purpose since they mean different things.
const FREELANCE_RGB = "255, 149, 0";
const FREELANCE_CARD_TINT = `rgba(${FREELANCE_RGB}, 0.22)`;
const FREELANCE_BADGE_TINT = `rgba(${FREELANCE_RGB}, 0.5)`;
const FREELANCE_SWATCH = `rgba(${FREELANCE_RGB}, 0.9)`;

function isFreelanceEvent(event: Pick<EventRow, "is_freelance" | "package">): boolean {
  return event.is_freelance || (event.package?.startsWith("freelance_") ?? false);
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function EventsListView({
  events,
  doneCountByEvent,
  totalCountByEvent,
  unreadCountByEvent,
  isPhotographer,
  needsReviewColorId,
}: {
  events: EventWithCustomPackage[];
  doneCountByEvent: Record<string, number>;
  totalCountByEvent: Record<string, number>;
  unreadCountByEvent: Record<string, number>;
  isPhotographer: boolean;
  // The photographer's own "צבע לזיהוי אירועים לייבוא" pick (Settings → יומן Google) — reused here
  // so a calendar-scan-imported event highlights in the SAME color the photographer already
  // associates with that flow, instead of a fixed color unrelated to their own choice.
  needsReviewColorId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("upcoming");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // "Done" is an explicit act now — the photographer's "סגירת אירוע" + confirmation (closed_at) —
  // NOT "every stage is checked", so finishing the last stage no longer moves an event out of the
  // active list by itself.
  const isEventDone = (event: EventWithCustomPackage) => !!event.closed_at;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = events.filter((event) => {
      if (q) {
        const matchesName = eventDisplayName(event).toLowerCase().includes(q);
        const matchesPhone = (event.client_phone ?? "").includes(q);
        if (!matchesName && !matchesPhone) return false;
      }
      // The filter's own label is "כפילויות / פרילנס" — matches either, not just resolution_note.
      if (statusFilter === "duplicates" && !event.resolution_note && !isFreelanceEvent(event)) return false;
      if (statusFilter !== "duplicates" && statusFilter !== "all") {
        const done = isEventDone(event);
        if (statusFilter === "upcoming" && done) return false;
        if (statusFilter === "completed" && !done) return false;
      }
      if (sortOrder === "month" && !event.event_date.startsWith(selectedMonth)) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sortOrder === "desc") return b.event_date.localeCompare(a.event_date);
      return a.event_date.localeCompare(b.event_date);
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, query, statusFilter, sortOrder, selectedMonth, doneCountByEvent, totalCountByEvent]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-sm font-semibold">אירועים</span>
        <span className="text-xs text-ink-soft font-data">{filtered.length} מתוך {events.length}</span>
      </div>

      {events.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setVisibleCount(PAGE_SIZE);
            }}
            className="shrink-0 w-[74px] sm:w-auto rounded-lg px-1.5 py-2 text-xs sm:text-sm border border-line bg-white"
          >
            <option value="upcoming">פעילים</option>
            <option value="completed">הושלמו</option>
            <option value="all">הכל</option>
            <option value="duplicates">כפילויות / פרילנס</option>
          </select>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="חיפוש..."
            className="flex-1 min-w-[64px] rounded-lg px-2.5 py-2 text-xs sm:text-sm border border-line bg-white"
          />
          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as SortOrder);
              setVisibleCount(PAGE_SIZE);
            }}
            className="shrink-0 w-[92px] sm:w-auto rounded-lg px-1.5 py-2 text-xs sm:text-sm border border-line bg-white"
          >
            <option value="asc">מהקרוב לרחוק</option>
            <option value="desc">מהרחוק לקרוב</option>
            <option value="month">חודש מסוים</option>
          </select>
          {sortOrder === "month" && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="shrink-0 w-full sm:w-auto rounded-lg px-2 py-2 text-xs sm:text-sm border border-line bg-white font-data"
            />
          )}
        </div>
      )}

      {/* Only appears once either color actually shows up somewhere in the list — no point
          explaining a color scheme to a photographer whose events are all perfectly ordinary. */}
      {(events.some((e) => e.needs_review) || events.some(isFreelanceEvent)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3.5 text-[11px] text-ink-soft">
          {events.some((e) => e.needs_review) && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: googleColorRgba(needsReviewColorId ?? null, 0.9) ?? "var(--color-amber-deep)" }}
              />
              יובא מהיומן. יש להשלים פרטים
            </span>
          )}
          {events.some(isFreelanceEvent) && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: FREELANCE_SWATCH }} />
              אירוע פרילנס
            </span>
          )}
          {events.some((e) => !e.needs_review && !isFreelanceEvent(e)) && (
            <span className="flex items-center gap-1.5">
              {/* The plain card background (--color-card) is a near-transparent glass tint, too
                  faint to read as its own dot without a border — the actual cards get that same
                  legibility from sitting on the page's own gradient plus a border, which a floating
                  swatch doesn't have for free. */}
              <span className="h-2.5 w-2.5 rounded-full shrink-0 border border-line" style={{ background: "var(--color-card)" }} />
              אירוע רגיל: נשמר ידנית
            </span>
          )}
        </div>
      )}

      {visible.length > 0 ? (
        <>
          {visible.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              doneCount={doneCountByEvent[event.id] ?? 0}
              totalCount={totalCountByEvent[event.id] ?? 1}
              unreadCount={unreadCountByEvent[event.id] ?? 0}
              needsReviewColorId={needsReviewColorId}
              canClose={isPhotographer}
            />
          ))}
          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full rounded-xl py-2.5 mb-3.5 text-sm font-semibold bg-card border border-line text-ink-soft"
            >
              טען עוד ({filtered.length - visible.length} נוספים)
            </button>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-sm text-ink-soft">
          {events.length === 0
            ? isPhotographer
              ? "עדיין אין אירועים. לחצו על + כדי לסגור אירוע ראשון"
              : "עדיין לא הוקצו לך אירועים"
            : "לא נמצאו אירועים תואמים"}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  doneCount,
  totalCount,
  unreadCount,
  needsReviewColorId,
  canClose,
}: {
  event: EventWithCustomPackage;
  doneCount: number;
  totalCount: number;
  unreadCount: number;
  needsReviewColorId?: string | null;
  // Photographer only — assistants never get a close button.
  canClose: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const total = totalCount;
  const pct = Math.round((doneCount / total) * 100);
  const done = !!event.closed_at;
  const isFreelance = isFreelanceEvent(event);
  // Falls back to the app's default amber tint when the photographer hasn't picked an import
  // color yet (e.g. before ever opening the calendar-scan settings).
  const cardTint = googleColorRgba(needsReviewColorId ?? null, 0.3) ?? "var(--color-amber-bg)";
  const badgeTint = googleColorRgba(needsReviewColorId ?? null, 0.55) ?? "var(--color-amber-bg)";
  // needs_review wins the card background when both apply — it's the more urgent, temporary
  // "you need to act on this" state, versus is-freelance which is a persistent property that'll
  // still be true (and still badged) once the review is done and this tint stops competing for it.
  const cardBackground = event.needs_review ? cardTint : isFreelance ? FREELANCE_CARD_TINT : undefined;

  return (
    <>
    <Link
      href={`/events/${event.id}`}
      role="button"
      className="relative block w-full overflow-hidden text-right rounded-2xl p-4 mb-3.5 bg-card border border-line shadow-card"
      // .bg-card's own background comes from a plain (non-!important) Tailwind utility, so unlike
      // its border (which IS !important — see the border-fight history elsewhere in this app) an
      // inline style background here reliably wins and tints the whole card, not just an accent.
      style={cardBackground ? { background: cardBackground } : undefined}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="relative inline-block">
          <span className="font-semibold text-base font-display">{eventDisplayName(event)}</span>
          {unreadCount > 0 && (
            <span
              className="absolute -top-2 -left-3 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none shadow"
              style={{ background: "var(--color-rose)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        <span className="text-[10.5px] px-2.5 py-1 rounded-full bg-amber-bg text-amber-deep font-data">
          {packageLabel(event.package, event.custom_packages?.name)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-3.5 text-xs text-ink-soft">
        {new Date(event.event_date).toLocaleDateString("he-IL")}
      </div>
      {event.needs_review && (
        <div
          className="text-[10.5px] px-2.5 py-1 rounded-full font-medium mb-2.5 inline-block"
          // Dark ink text regardless of which of Google's 11 colors was picked — some (banana,
          // graphite) are too light for white/amber-deep text, so a color-specific text tone isn't
          // safe to compute; dark ink reads fine against every one of them at this tint strength.
          style={{ background: badgeTint, color: "var(--color-ink)" }}
        >
          יובא מהיומן. יש להשלים פרטים
        </div>
      )}
      {isFreelance && (
        <div
          className="text-[10.5px] px-2.5 py-1 rounded-full font-medium mb-2.5 inline-block"
          style={{ background: FREELANCE_BADGE_TINT, color: "var(--color-ink)" }}
        >
          אירוע פרילנס
        </div>
      )}
      {event.resolution_note && (
        <div
          className="text-[10.5px] px-2.5 py-1 rounded-full font-medium mb-2.5 inline-block"
          style={{ background: "var(--color-chip-tint)", color: "var(--color-coral-deep)" }}
        >
          כפילות: {event.resolution_note}
        </div>
      )}
      <div className="h-[5px] rounded-full mb-2.5 bg-line">
        <div
          className="h-[5px] rounded-full"
          style={{ width: `${done ? 100 : pct}%`, background: done ? "var(--color-sage)" : "var(--color-amber)" }}
        />
      </div>
      <div className="text-xs" style={{ color: done ? "var(--color-sage)" : "var(--color-amber-deep)", fontWeight: 600 }}>
        {done ? "✓ האירוע נסגר" : `${doneCount}/${total} שלבים הושלמו`}
      </div>
      {canClose && !done && (
        // Lives inside the card's <Link>, so the click must not also navigate to the event page.
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className="mt-3 text-xs font-semibold rounded-full px-3.5 py-1.5 bg-white border border-line text-ink"
        >
          סגירת אירוע
        </button>
      )}
    </Link>
    {confirmOpen && (
      <CloseEventConfirmModal
        eventId={event.id}
        onClosed={() => {
          setConfirmOpen(false);
          router.refresh();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    )}
    </>
  );
}
