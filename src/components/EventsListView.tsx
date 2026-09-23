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

// What needs the photographer's attention on an event — computed server-side in page.tsx.
export type EventAttention = {
  openBalance?: number; // event date passed, money still unpaid
  depositDue?: number; // upcoming event, deposit not (fully) paid yet
  contractPending?: boolean; // contract sent, not signed yet
};

const HE_MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

// A genuine orange — distinct from the brass accent. Kept as a plain constant here rather than
// a new globals.css token since it's only used in this one file, for one purpose: telling a
// freelance-covered event's card apart from a regular one at a glance. Separate from
// needs_review's own tint, which is whichever of Google's 11 calendar colors the photographer
// picked — the two are visually distinct on purpose since they mean different things.
const FREELANCE_RGB = "255, 149, 0";
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
  attentionByEvent = {},
}: {
  attentionByEvent?: Record<string, EventAttention>;
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
      <div className="flex items-baseline justify-between mb-2.5 px-0.5">
        <h2 className="text-[17px] font-bold">אירועים</h2>
        <span className="text-[13px] text-ink-soft font-data">
          {filtered.length !== events.length
            ? `${filtered.length} מתוך ${events.length}`
            : events.length === 1
              ? "אירוע אחד"
              : `${events.length} אירועים`}
        </span>
      </div>

      {events.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setVisibleCount(PAGE_SIZE);
            }}
            aria-label="סינון לפי סטטוס"
            className="order-2 min-w-0 h-10 rounded-xl px-2.5 text-sm bg-card"
          >
            <option value="upcoming">פעילים</option>
            <option value="completed">הושלמו</option>
            <option value="all">הכל</option>
            <option value="duplicates">כפילויות / פרילנס</option>
          </select>
          <label className="order-1 col-span-2 h-10 rounded-xl px-3 flex items-center gap-2 bg-card">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="חיפוש לקוח או טלפון"
              aria-label="חיפוש אירוע"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-soft"
            />
          </label>
          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as SortOrder);
              setVisibleCount(PAGE_SIZE);
            }}
            aria-label="מיון"
            className="order-3 min-w-0 h-10 rounded-xl px-2.5 text-sm bg-card"
          >
            <option value="asc">הקרוב ביותר</option>
            <option value="desc">הרחוק ביותר</option>
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
              className="order-4 col-span-2 h-10 rounded-xl px-3 text-sm bg-card font-data"
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
          <div className="rounded-2xl overflow-hidden bg-card mb-3.5">
          {visible.map((event, i) => (
            <EventCard
              first={i === 0}
              attention={attentionByEvent[event.id]}
              key={event.id}
              event={event}
              doneCount={doneCountByEvent[event.id] ?? 0}
              totalCount={totalCountByEvent[event.id] ?? 1}
              unreadCount={unreadCountByEvent[event.id] ?? 0}
              needsReviewColorId={needsReviewColorId}
              canClose={isPhotographer}
            />
          ))}
          </div>
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
  attention,
  first,
}: {
  event: EventWithCustomPackage;
  doneCount: number;
  totalCount: number;
  unreadCount: number;
  needsReviewColorId?: string | null;
  // Photographer only — assistants never get a close button.
  canClose: boolean;
  attention?: EventAttention;
  first: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const total = Math.max(1, totalCount);
  const pct = Math.round((doneCount / total) * 100);
  const done = !!event.closed_at;
  const isFreelance = isFreelanceEvent(event);
  // Falls back to the accent tint when the photographer hasn't picked an import color yet.
  const rowTint = googleColorRgba(needsReviewColorId ?? null, 0.16) ?? "var(--color-amber-bg)";
  const badgeTint = googleColorRgba(needsReviewColorId ?? null, 0.4) ?? "var(--color-amber-bg)";
  // needs_review wins the row tint when both apply — it's the temporary "act on this" state.
  const rowBackground = event.needs_review ? rowTint : isFreelance ? `rgba(${FREELANCE_RGB}, 0.1)` : undefined;
  const [y, m, d] = event.event_date.split("-").map(Number);
  const showYear = y !== new Date().getFullYear();
  const meta = [event.event_location, packageLabel(event.package, event.custom_packages?.name)].filter(Boolean).join(" · ");
  const tag = "inline-block text-[11.5px] font-medium px-2 py-0.5 rounded-md";

  return (
    <>
    <Link
      href={`/events/${event.id}`}
      role="button"
      className={`flex items-center gap-3 px-3.5 py-3.5 text-start ${first ? "" : "border-t border-line"}`}
      style={rowBackground ? { background: rowBackground } : undefined}
    >
      {/* Date column — sits at the start edge (right, in RTL) with a divider on its end side. */}
      <div className="w-11 shrink-0 text-center border-e border-line pe-3 box-content">
        <div className="text-xl leading-none font-bold font-data">{d}</div>
        <div className="text-[11px] text-ink-soft mt-1">
          {HE_MONTHS_SHORT[m - 1]}
          {showYear && <span className="font-data"> {String(y).slice(2)}</span>}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold truncate">{eventDisplayName(event)}</span>
          {unreadCount > 0 && (
            <span
              className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none font-data"
              style={{ background: "var(--color-rose)" }}
              title="עדכונים חדשים מהלקוח"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        {meta && <div className="text-[12.5px] text-ink-soft truncate mt-0.5">{meta}</div>}
        {(attention || event.needs_review || isFreelance || event.resolution_note) && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {attention?.openBalance ? (
              <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-peach)" }}>
                יתרה פתוחה <span className="font-data">₪{attention.openBalance.toLocaleString("he-IL")}</span>
              </span>
            ) : null}
            {attention?.depositDue ? (
              <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-peach)" }}>
                מקדמה טרם שולמה
              </span>
            ) : null}
            {attention?.contractPending && (
              <span className={`${tag} bg-amber-bg`} style={{ color: "var(--color-amber-deep)" }}>
                חוזה ממתין לחתימה
              </span>
            )}
            {event.needs_review && (
              <span className={tag} style={{ background: badgeTint, color: "var(--color-ink)" }}>
                יובא מהיומן. יש להשלים פרטים
              </span>
            )}
            {isFreelance && (
              <span className={tag} style={{ background: FREELANCE_BADGE_TINT, color: "var(--color-ink)" }}>
                אירוע פרילנס
              </span>
            )}
            {event.resolution_note && (
              <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-coral-deep)" }}>
                כפילות: {event.resolution_note}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1.5">
        {done ? (
          <span className="text-xs font-semibold" style={{ color: "var(--color-sage)" }}>
            נסגר
          </span>
        ) : (
          <>
            <span className="text-xs text-ink-soft font-data" title={`${doneCount} מתוך ${total} שלבים הושלמו`}>
              {doneCount}/{total}
            </span>
            <span className="block w-14 h-1 rounded-full overflow-hidden" style={{ background: "var(--color-chip)" }}>
              <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-ink)" }} />
            </span>
          </>
        )}
        {canClose && !done && (
          // Lives inside the row's <Link>, so the click must not also navigate to the event page.
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            className="text-[11px] font-medium text-ink-soft underline underline-offset-2 mt-0.5"
          >
            סגירה
          </button>
        )}
      </div>
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
