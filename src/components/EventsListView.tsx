"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CloseEventConfirmModal from "@/components/CloseEventConfirmModal";
import type { EventRow } from "@/lib/types";
import { googleColorRgba } from "@/lib/googleColors";
import { eventDisplayName } from "@/lib/eventDisplayName";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import { compareEventsChronologically } from "@/lib/eventOrder";
import { comingWeekRange, DEFAULT_HOME_VIEW, type HomeEventsView, type HomeSortOrder, type HomeStatusFilter } from "@/lib/homeEventsView";
import { useVivid } from "@/components/VividProvider";
import ToneTag from "@/components/ToneTag";
import { eventDateTone, stageProgress, toneStyle } from "@/lib/tones";
import { HOME_LIST_FILTER_EVENT, eventNeedsAttention, type HomeListFilterRequest } from "@/lib/homeVivid";
import EventQuickActions from "@/components/EventQuickActions";
import ViewToggle from "@/components/ViewToggle";
import { eventsLayoutCookie, type EventsLayout } from "@/lib/eventQuickActions";
import { printSentDate } from "@/lib/printCheck";
import type { AlbumApprovalLine } from "@/lib/albumApproval";

// event_stages: embedded by page.tsx's events query; only the vivid look reads it (the thin
// progress bar under each row).
type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null; event_stages?: readonly { done: boolean }[] };
// "attention" (vivid look only): the events that need the photographer, from the header pill. A
// passing filter, never saved as the account's view.
type StatusFilter = HomeStatusFilter | "attention";
type SortOrder = HomeSortOrder;
const PAGE_SIZE = 10;
// The blocks view (owner, 2026-10-26): like the galleries' blocks, 2 across on a phone.
const EVENTS_GRID_CLASS = "grid grid-cols-2 gap-3 mb-3.5 sm:grid-cols-3 lg:grid-cols-4";

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
  nextStageByEvent,
  unreadCountByEvent,
  isPhotographer,
  needsReviewColorId,
  attentionByEvent = {},
  printSentByEvent = {},
  albumByEvent = {},
  initialView = DEFAULT_HOME_VIEW,
  saveView = false,
  initialLayout = "list",
}: {
  attentionByEvent?: Record<string, EventAttention>;
  // When each event's album was last sent to the print house (lib/printCheck.ts).
  printSentByEvent?: Record<string, string>;
  // Where each event's album design stands with the client (lib/albumApproval.ts).
  albumByEvent?: Record<string, AlbumApprovalLine>;
  // Rows or blocks (owner, 2026-10-26), remembered on this device in a cookie the server reads.
  initialLayout?: EventsLayout;
  // The view saved on the account (photographers.home_events_view); "the coming week" by default.
  initialView?: HomeEventsView;
  // Save every change of view on the account (a photographer; a team member has no row to save to).
  saveView?: boolean;
  events: EventWithCustomPackage[];
  // Name of the first stage not done yet; null when every stage is done (ready to close).
  nextStageByEvent: Record<string, string | null>;
  unreadCountByEvent: Record<string, number>;
  isPhotographer: boolean;
  // The photographer's own "צבע לזיהוי אירועים לייבוא" pick (Settings → יומן Google) — reused here
  // so a calendar-scan-imported event highlights in the SAME color the photographer already
  // associates with that flow, instead of a fixed color unrelated to their own choice.
  needsReviewColorId?: string | null;
}) {
  const t = useT();
  const vivid = useVivid();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialView.status);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialView.sort);
  // Vivid look only: the "עוד" pill's panel (the sort / month / date / range and duplicates
  // filters). Open from the start when one of those is the saved view, so it's never hidden.
  const [moreOpen, setMoreOpen] = useState(initialView.status === "duplicates" || initialView.sort !== "asc");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  // Filter by the event's date (owner, 2026-10-07): one exact day, or a range (either end may be
  // left empty for "from…" / "until…").
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }));
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [layout, setLayout] = useState<EventsLayout>(initialLayout);
  const changeLayout = (next: EventsLayout) => {
    setLayout(next);
    document.cookie = eventsLayoutCookie(next);
  };

  // "Done" is an explicit act now — the photographer's "סגירת אירוע" + confirmation (closed_at) —
  // NOT "every stage is checked", so finishing the last stage no longer moves an event out of the
  // active list by itself.
  const isEventDone = (event: EventWithCustomPackage) => !!event.closed_at;

  // The chosen view is saved on the account, so it's the same after logging out and on any device
  // (owner, 2026-10-13). A failed save only means the next visit opens on the previous view.
  const changeView = (next: { status: StatusFilter; sort: SortOrder }) => {
    setStatusFilter(next.status);
    setSortOrder(next.sort);
    setVisibleCount(PAGE_SIZE);
    if (!saveView || next.status === "attention") return;
    fetch("/api/preferences/home-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      keepalive: true,
    }).catch(() => {});
  };
  const week = comingWeekRange();

  // The header pills (HomeVividPills, vivid look): show this week's events or the ones that need
  // the photographer, exactly the events the pill counted (no search, nearest first), and scroll
  // to the list. The view before "attention" comes back when its pill is cleared.
  const listRef = useRef<HTMLDivElement>(null);
  const viewBeforeAttention = useRef<HomeEventsView>(initialView);
  useEffect(() => {
    if (!vivid) return;
    const onRequest = (e: Event) => {
      const show = (e as CustomEvent<HomeListFilterRequest>).detail;
      if (show === "attention" && statusFilter !== "attention") viewBeforeAttention.current = { status: statusFilter, sort: sortOrder };
      setQuery("");
      changeView({ status: show, sort: "asc" });
      requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener(HOME_LIST_FILTER_EVENT, onRequest);
    return () => window.removeEventListener(HOME_LIST_FILTER_EVENT, onRequest);
    // changeView only sets state and saves; it reads nothing that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vivid, statusFilter, sortOrder]);

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
      // The coming week: every event dated today through a week from today, whatever its status.
      if (statusFilter === "week" && (event.event_date < week.from || event.event_date > week.to)) return false;
      if (statusFilter === "attention" && !eventNeedsAttention(event, attentionByEvent[event.id])) return false;
      if (statusFilter === "upcoming" || statusFilter === "completed") {
        const done = isEventDone(event);
        if (statusFilter === "upcoming" && done) return false;
        if (statusFilter === "completed" && !done) return false;
      }
      if (sortOrder === "month" && !event.event_date.startsWith(selectedMonth)) return false;
      if (sortOrder === "date" && selectedDate && event.event_date !== selectedDate) return false;
      if (sortOrder === "range" && ((rangeFrom && event.event_date < rangeFrom) || (rangeTo && event.event_date > rangeTo))) return false;
      return true;
    });
    result.sort((a, b) => {
      if (sortOrder === "desc") return compareEventsChronologically(b, a);
      return compareEventsChronologically(a, b);
    });
    return result;
  }, [events, query, statusFilter, sortOrder, selectedMonth, selectedDate, rangeFrom, rangeTo, week.from, week.to, attentionByEvent]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  // The vivid look (lib/tones.ts, admin only for now; sketch "גילברטו – עיצוב עם יותר חיים"): the
  // status filter as pills, the rest of the filters behind "עוד", tinted date tiles, tone tags and
  // a thin stage bar under each row. Same state and the same saved view as below.
  if (vivid) {
    const extraFilterActive = statusFilter === "duplicates" || sortOrder !== "asc";
    return (
      <div ref={listRef} className="scroll-mt-4">
        <div className="flex items-center justify-between gap-2 mb-2.5 px-0.5">
          <h2 className="text-lg font-bold me-auto">{t("אירועים")}</h2>
          {events.length > 0 && <ViewToggle view={layout} onChange={changeLayout} />}
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full font-data"
            style={{ background: "var(--color-chip)", color: "var(--color-ink-soft)" }}
            title={
              filtered.length !== events.length
                ? t("{n} מתוך {total}", { n: filtered.length, total: events.length })
                : events.length === 1
                  ? t("אירוע אחד")
                  : t("{n} אירועים", { n: events.length })
            }
          >
            {filtered.length}
          </span>
        </div>

        {events.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2.5" role="group" aria-label={t("סינון לפי סטטוס")}>
              {VIVID_STATUS_PILLS.map((p) => (
                <VividPill key={p.value} active={statusFilter === p.value} onClick={() => changeView({ status: p.value, sort: sortOrder })}>
                  {t(p.label)}
                </VividPill>
              ))}
              {statusFilter === "attention" && (
                <VividPill active onClick={() => changeView(viewBeforeAttention.current)}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--tone-attention)" }} />
                  {t("דורשים טיפול")}
                  <span aria-hidden className="opacity-70">✕</span>
                </VividPill>
              )}
            </div>

            {/* Search, with the rest of the filters (sort, month / date / range, duplicates) behind
                "עוד" beside it, so the four status pills keep one row on a phone. */}
            <div className="flex items-stretch gap-2 mb-3">
              <label className="flex-1 min-w-0 h-[42px] rounded-xl px-3 flex items-center gap-2 bg-card">
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
                  placeholder={t("חיפוש לקוח או טלפון")}
                  aria-label={t("חיפוש אירוע")}
                  className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-soft"
                />
              </label>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className="h-[42px] px-3 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-medium shrink-0"
                style={
                  moreOpen
                    ? { background: "var(--color-ink)", color: "var(--color-paper)", border: "1px solid var(--color-ink)" }
                    : { background: "var(--color-card)", color: "var(--color-ink)", border: "1px solid var(--color-line)" }
                }
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M7 12h10M10 17h4" />
                </svg>
                {t("עוד")}
                {extraFilterActive && !moreOpen && <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--color-brass)" }} />}
              </button>
            </div>
            {moreOpen && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <select
                  value={sortOrder}
                  onChange={(e) => changeView({ status: statusFilter, sort: e.target.value as SortOrder })}
                  aria-label={t("מיון")}
                  className="min-w-0 h-10 rounded-xl px-2.5 text-sm bg-card"
                >
                  <option value="asc">{t("הקרוב ביותר")}</option>
                  <option value="desc">{t("הרחוק ביותר")}</option>
                  <option value="month">{t("חודש מסוים")}</option>
                  <option value="date">{t("תאריך מסוים")}</option>
                  <option value="range">{t("טווח תאריכים")}</option>
                </select>
                <button
                  type="button"
                  aria-pressed={statusFilter === "duplicates"}
                  onClick={() => changeView({ status: statusFilter === "duplicates" ? "all" : "duplicates", sort: sortOrder })}
                  className="min-w-0 h-10 rounded-xl px-2.5 text-sm font-medium truncate"
                  style={
                    statusFilter === "duplicates"
                      ? { background: "var(--color-ink)", color: "var(--color-paper)" }
                      : { background: "var(--color-card)", border: "1px solid var(--color-line)", color: "var(--color-ink)" }
                  }
                >
                  {t("כפילויות / פרילנס")}
                </button>
                {sortOrder === "month" && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="col-span-2 h-10 rounded-xl px-3 text-sm bg-card font-data"
                  />
                )}
                {sortOrder === "date" && (
                  <input
                    type="date"
                    value={selectedDate}
                    aria-label={t("תאריך האירוע")}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="col-span-2 h-10 rounded-xl px-3 text-sm bg-card font-data"
                  />
                )}
                {sortOrder === "range" && (
                  <div className="col-span-2 grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <span className="shrink-0">{t("מתאריך")}</span>
                      <input
                        type="date"
                        value={rangeFrom}
                        max={rangeTo || undefined}
                        onChange={(e) => {
                          setRangeFrom(e.target.value);
                          setVisibleCount(PAGE_SIZE);
                        }}
                        className="min-w-0 flex-1 h-10 rounded-xl px-2 text-sm bg-card font-data text-ink"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <span className="shrink-0">{t("עד תאריך")}</span>
                      <input
                        type="date"
                        value={rangeTo}
                        min={rangeFrom || undefined}
                        onChange={(e) => {
                          setRangeTo(e.target.value);
                          setVisibleCount(PAGE_SIZE);
                        }}
                        className="min-w-0 flex-1 h-10 rounded-xl px-2 text-sm bg-card font-data text-ink"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

          </>
        )}

        {visible.length > 0 ? (
          <>
            {layout === "grid" ? (
              <div className={EVENTS_GRID_CLASS}>
                {visible.map((event) => (
                  <EventBlock
                    vivid
                    attention={attentionByEvent[event.id]}
                    key={event.id}
                    event={event}
                    nextStage={nextStageByEvent[event.id] ?? null}
                    printSentAt={printSentByEvent[event.id] ?? null}
                    albumLine={albumByEvent[event.id] ?? null}
                    unreadCount={unreadCountByEvent[event.id] ?? 0}
                    canClose={isPhotographer}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden bg-card mb-3.5">
                {visible.map((event, i) => (
                  <VividEventCard
                    first={i === 0}
                    attention={attentionByEvent[event.id]}
                    key={event.id}
                    event={event}
                    nextStage={nextStageByEvent[event.id] ?? null}
                    printSentAt={printSentByEvent[event.id] ?? null}
                    albumLine={albumByEvent[event.id] ?? null}
                    unreadCount={unreadCountByEvent[event.id] ?? 0}
                    canClose={isPhotographer}
                  />
                ))}
              </div>
            )}
            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full rounded-xl py-2.5 mb-3.5 text-sm font-semibold bg-card border border-line text-ink-soft"
              >
                {t("טען עוד ({n} נוספים)", { n: filtered.length - visible.length })}
              </button>
            )}
          </>
        ) : (
          <div className="text-center py-16 text-sm text-ink-soft">
            {events.length === 0
              ? isPhotographer
                ? t("עדיין אין אירועים. לחצו על + כדי לסגור אירוע ראשון")
                : t("עדיין לא הוקצו לך אירועים")
              : statusFilter === "week" && !query.trim()
                ? t("אין אירועים בשבוע הקרוב")
                : statusFilter === "attention" && !query.trim()
                  ? t("אין אירועים שדורשים טיפול")
                  : t("לא נמצאו אירועים תואמים")}
            {events.length > 0 && (statusFilter === "week" || statusFilter === "attention") && (
              <button onClick={() => changeView({ status: "all", sort: sortOrder })} className="block mx-auto mt-3 text-sm font-semibold underline underline-offset-2 text-ink">
                {t("הצגת כל האירועים")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5 px-0.5">
        <h2 className="text-[17px] font-bold me-auto">{t("אירועים")}</h2>
        {events.length > 0 && <ViewToggle view={layout} onChange={changeLayout} />}
        <span className="text-[13px] text-ink-soft font-data">
          {filtered.length !== events.length
            ? t("{n} מתוך {total}", { n: filtered.length, total: events.length })
            : events.length === 1
              ? t("אירוע אחד")
              : t("{n} אירועים", { n: events.length })}
        </span>
      </div>

      {events.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select
            value={statusFilter}
            onChange={(e) => changeView({ status: e.target.value as StatusFilter, sort: sortOrder })}
            aria-label={t("סינון לפי סטטוס")}
            className="order-2 min-w-0 h-10 rounded-xl px-2.5 text-sm bg-card"
          >
            <option value="week">{t("השבוע הקרוב")}</option>
            <option value="upcoming">{t("פעילים")}</option>
            <option value="completed">{t("הושלמו")}</option>
            <option value="all">{t("הכל")}</option>
            <option value="duplicates">{t("כפילויות / פרילנס")}</option>
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
              placeholder={t("חיפוש לקוח או טלפון")}
              aria-label={t("חיפוש אירוע")}
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-soft"
            />
          </label>
          <select
            value={sortOrder}
            onChange={(e) => changeView({ status: statusFilter, sort: e.target.value as SortOrder })}
            aria-label={t("מיון")}
            className="order-3 min-w-0 h-10 rounded-xl px-2.5 text-sm bg-card"
          >
            <option value="asc">{t("הקרוב ביותר")}</option>
            <option value="desc">{t("הרחוק ביותר")}</option>
            <option value="month">{t("חודש מסוים")}</option>
            <option value="date">{t("תאריך מסוים")}</option>
            <option value="range">{t("טווח תאריכים")}</option>
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
          {sortOrder === "date" && (
            <input
              type="date"
              value={selectedDate}
              aria-label={t("תאריך האירוע")}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="order-4 col-span-2 h-10 rounded-xl px-3 text-sm bg-card font-data"
            />
          )}
          {sortOrder === "range" && (
            <div className="order-4 col-span-2 grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span className="shrink-0">{t("מתאריך")}</span>
                <input
                  type="date"
                  value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={(e) => {
                    setRangeFrom(e.target.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className="min-w-0 flex-1 h-10 rounded-xl px-2 text-sm bg-card font-data text-ink"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span className="shrink-0">{t("עד תאריך")}</span>
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => {
                    setRangeTo(e.target.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className="min-w-0 flex-1 h-10 rounded-xl px-2 text-sm bg-card font-data text-ink"
                />
              </label>
            </div>
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
              {t("יובא מהיומן. יש להשלים פרטים")}
            </span>
          )}
          {events.some(isFreelanceEvent) && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: FREELANCE_SWATCH }} />
              {t("אירוע פרילנס")}
            </span>
          )}
          {events.some((e) => !e.needs_review && !isFreelanceEvent(e)) && (
            <span className="flex items-center gap-1.5">
              {/* The plain card background (--color-card) is a near-transparent glass tint, too
                  faint to read as its own dot without a border — the actual cards get that same
                  legibility from sitting on the page's own gradient plus a border, which a floating
                  swatch doesn't have for free. */}
              <span className="h-2.5 w-2.5 rounded-full shrink-0 border border-line" style={{ background: "var(--color-card)" }} />
              {t("אירוע רגיל: נשמר ידנית")}
            </span>
          )}
        </div>
      )}

      {visible.length > 0 ? (
        <>
          {layout === "grid" ? (
            <div className={EVENTS_GRID_CLASS}>
              {visible.map((event) => (
                <EventBlock
                  vivid={false}
                  attention={attentionByEvent[event.id]}
                  key={event.id}
                  event={event}
                  nextStage={nextStageByEvent[event.id] ?? null}
                    printSentAt={printSentByEvent[event.id] ?? null}
                    albumLine={albumByEvent[event.id] ?? null}
                  unreadCount={unreadCountByEvent[event.id] ?? 0}
                  needsReviewColorId={needsReviewColorId}
                  canClose={isPhotographer}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden bg-card mb-3.5">
              {visible.map((event, i) => (
                <EventCard
                  first={i === 0}
                  attention={attentionByEvent[event.id]}
                  key={event.id}
                  event={event}
                  nextStage={nextStageByEvent[event.id] ?? null}
                    printSentAt={printSentByEvent[event.id] ?? null}
                    albumLine={albumByEvent[event.id] ?? null}
                  unreadCount={unreadCountByEvent[event.id] ?? 0}
                  needsReviewColorId={needsReviewColorId}
                  canClose={isPhotographer}
                />
              ))}
            </div>
          )}
          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full rounded-xl py-2.5 mb-3.5 text-sm font-semibold bg-card border border-line text-ink-soft"
            >
              {t("טען עוד ({n} נוספים)", { n: filtered.length - visible.length })}
            </button>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-sm text-ink-soft">
          {events.length === 0
            ? isPhotographer
              ? t("עדיין אין אירועים. לחצו על + כדי לסגור אירוע ראשון")
              : t("עדיין לא הוקצו לך אירועים")
            : statusFilter === "week" && !query.trim()
              ? t("אין אירועים בשבוע הקרוב")
              : t("לא נמצאו אירועים תואמים")}
          {events.length > 0 && statusFilter === "week" && (
            <button onClick={() => changeView({ status: "all", sort: sortOrder })} className="block mx-auto mt-3 text-sm font-semibold underline underline-offset-2 text-ink">
              {t("הצגת כל האירועים")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  nextStage,
  printSentAt,
  albumLine,
  unreadCount,
  needsReviewColorId,
  canClose,
  attention,
  first,
}: {
  event: EventWithCustomPackage;
  nextStage: string | null;
  printSentAt: string | null;
  albumLine: AlbumApprovalLine | null;
  unreadCount: number;
  needsReviewColorId?: string | null;
  // Photographer only — assistants never get a close button.
  canClose: boolean;
  attention?: EventAttention;
  first: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const done = !!event.closed_at;
  const isFreelance = isFreelanceEvent(event);
  // Falls back to the accent tint when the photographer hasn't picked an import color yet.
  const rowTint = googleColorRgba(needsReviewColorId ?? null, 0.16) ?? "var(--color-amber-bg)";
  // needs_review wins the row tint when both apply — it's the temporary "act on this" state.
  const rowBackground = event.needs_review ? rowTint : isFreelance ? `rgba(${FREELANCE_RGB}, 0.1)` : undefined;
  const [y, m, d] = event.event_date.split("-").map(Number);
  const showYear = y !== new Date().getFullYear();
  // Design stage 5: client name leads; type and place follow in plain words (no " · " chain, and
  // the package lives on the event page, not in the list).
  const meta = [event.event_type?.trim(), event.event_location?.trim()].filter(Boolean).join(", ");

  return (
    <>
    <Link
      href={`/events/${event.id}`}
      role="button"
      data-press="tint"
      className={`flex items-center gap-3 px-3.5 py-3.5 text-start ${first ? "" : "border-t border-line"}`}
      style={rowBackground ? { background: rowBackground } : undefined}
    >
      {/* Date column — sits at the start edge (right, in RTL) with a divider on its end side. */}
      <div className="w-11 shrink-0 text-center border-e border-line pe-3 box-content">
        <div className="text-xl leading-none font-bold font-data">{d}</div>
        <div className="text-[11px] text-ink-soft mt-1">
          {lang === "he" ? HE_MONTHS_SHORT[m - 1] : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(lang), { month: "short", timeZone: "UTC" })}
          {showYear && <span className="font-data"> {String(y).slice(2)}</span>}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-bold truncate">{event.client_name}</span>
          {unreadCount > 0 && (
            <span
              className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none font-data"
              style={{ background: "var(--color-rose)" }}
              title={t("עדכונים חדשים מהלקוח")}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        {meta && <div className="text-[12.5px] text-ink-soft truncate mt-0.5">{meta}</div>}
        {(attention || event.needs_review || isFreelance || event.resolution_note) && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <PlainTags event={event} attention={attention} needsReviewColorId={needsReviewColorId} />
          </div>
        )}
        <AlbumLine printSentAt={printSentAt} album={albumLine} className="mt-1.5" />
      </div>

      <div className="shrink-0 self-start mt-0.5 flex flex-col items-end gap-1.5 max-w-[104px]">
        {done ? (
          <span className="text-xs font-semibold" style={{ color: "var(--color-sage)" }}>
            {t("נסגר")}
          </span>
        ) : nextStage ? (
          <span className="text-xs text-ink-soft text-end leading-snug" title={t("השלב הבא")}>
            {t(nextStage)}
          </span>
        ) : canClose ? (
          // Every stage is done: closing is the next step. Lives inside the row's <Link>, so the
          // click must not also navigate to the event page.
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            className="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-bg"
            style={{ color: "var(--color-amber-deep)" }}
          >
            {t("לסגירה")}
          </button>
        ) : null}
        {/* Quick actions without opening the event (lib/eventQuickActions.ts), the photographer's. */}
        {canClose && <EventQuickActions eventId={event.id} />}
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

// ---- The vivid look (lib/tones.ts, admin only for now) -------------------------------------------

const VIVID_STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: "week", label: "השבוע הקרוב" },
  { value: "upcoming", label: "פעילים" },
  { value: "completed", label: "הושלמו" },
  { value: "all", label: "הכל" },
];

// A filter pill: the chosen one filled with ink, the rest glass with a hairline.
function VividPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-[34px] px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap ${active ? "font-semibold" : "font-medium"}`}
      style={
        active
          ? { background: "var(--color-ink)", color: "var(--color-paper)", border: "1px solid var(--color-ink)" }
          : { background: "var(--color-card)", color: "var(--color-ink)", border: "1px solid var(--color-line)" }
      }
    >
      {children}
    </button>
  );
}

// A faint wash of a tone over a whole row (an import to fill in, a freelance job).
const rowWash = (tone: "attention" | "creative") => `color-mix(in srgb, var(--tone-${tone}) 6%, transparent)`;

function VividEventCard({
  event,
  nextStage,
  printSentAt,
  albumLine,
  unreadCount,
  canClose,
  attention,
  first,
}: {
  event: EventWithCustomPackage;
  nextStage: string | null;
  printSentAt: string | null;
  albumLine: AlbumApprovalLine | null;
  unreadCount: number;
  canClose: boolean;
  attention?: EventAttention;
  first: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const done = !!event.closed_at;
  const isFreelance = isFreelanceEvent(event);
  const dateTone = eventDateTone({ closed: done, freelance: isFreelance });
  // needs_review wins the row wash when both apply, as in the regular look.
  const rowBackground = event.needs_review ? rowWash("attention") : isFreelance ? rowWash("creative") : undefined;
  const progress = stageProgress(event.event_stages);
  const [y, m, d] = event.event_date.split("-").map(Number);
  const showYear = y !== new Date().getFullYear();
  const meta = [event.event_type?.trim(), event.event_location?.trim()].filter(Boolean).join(", ");
  const hasTags = !!(attention?.openBalance || attention?.depositDue || attention?.contractPending || event.needs_review || isFreelance || event.resolution_note);

  return (
    <>
      <Link
        href={`/events/${event.id}`}
        role="button"
        data-press="tint"
        className={`flex items-center gap-3 px-3.5 py-3.5 text-start ${first ? "" : "border-t border-line"}`}
        style={rowBackground ? { background: rowBackground } : undefined}
      >
        {/* Date tile, tinted by what the event needs (lib/tones.ts eventDateTone). */}
        <div className="min-w-[46px] h-[52px] px-1 shrink-0 rounded-xl flex flex-col items-center justify-center" style={toneStyle(dateTone)}>
          <div className="text-xl leading-none font-extrabold font-data">{d}</div>
          <div className="text-[11px] font-semibold mt-[3px] whitespace-nowrap">
            {lang === "he" ? HE_MONTHS_SHORT[m - 1] : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(lang), { month: "short", timeZone: "UTC" })}
            {showYear && <span className="font-data"> {String(y).slice(2)}</span>}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold truncate">{event.client_name}</span>
                {unreadCount > 0 && (
                  <span
                    className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none font-data"
                    style={{ background: "var(--tone-attention)", color: "#ffffff" }}
                    title={t("עדכונים חדשים מהלקוח")}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              {meta && <div className="text-[12.5px] text-ink-soft truncate mt-0.5">{meta}</div>}
              {hasTags && (
                <div className="flex flex-wrap gap-1.5 mt-[7px]">
                  <VividTags event={event} attention={attention} />
                </div>
              )}
              <AlbumLine printSentAt={printSentAt} album={albumLine} className="mt-1.5" />
            </div>

            <div className="shrink-0 mt-0.5 flex flex-col items-end gap-1.5 max-w-[104px]">
              {done ? (
                <span className="text-xs font-semibold" style={{ color: "var(--tone-paid-ink)" }}>
                  {t("נסגר")}
                </span>
              ) : nextStage ? (
                <span className="text-xs text-ink-soft text-end leading-snug" title={t("השלב הבא")}>
                  {t(nextStage)}
                </span>
              ) : canClose ? (
                // Every stage is done: closing is the next step. Lives inside the row's <Link>, so the
                // click must not also navigate to the event page.
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmOpen(true);
                  }}
                  className="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-bg"
                  style={{ color: "var(--color-amber-deep)" }}
                >
                  {t("לסגירה")}
                </button>
              ) : null}
              {canClose && <EventQuickActions eventId={event.id} />}
            </div>
          </div>
          {/* How far the event is through its stages (green once it's closed), under the text and
              the next-stage column alike, so every row's bar starts and ends in the same place. */}
          {progress && (
            <div className="h-[3px] rounded-full overflow-hidden mt-[9px]" style={{ background: "var(--color-chip)" }} aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: done ? "var(--tone-paid)" : "var(--color-brass)" }} />
            </div>
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

// ---- Tags and the blocks view ----------------------------------------------------------------------

// What the event needs, as tags: the regular look's chips.
function PlainTags({ event, attention, needsReviewColorId }: { event: EventWithCustomPackage; attention?: EventAttention; needsReviewColorId?: string | null }) {
  const t = useT();
  const lang = useLang();
  const badgeTint = googleColorRgba(needsReviewColorId ?? null, 0.4) ?? "var(--color-amber-bg)";
  const tag = "inline-block text-[11.5px] font-medium px-2 py-0.5 rounded-md";
  return (
    <>
      {attention?.openBalance ? (
        <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-peach)" }}>
          {t("יתרה פתוחה")} <span className="font-data">₪{attention.openBalance.toLocaleString(dateLocale(lang))}</span>
        </span>
      ) : null}
      {attention?.depositDue ? (
        <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-peach)" }}>
          {t("מקדמה טרם שולמה")}
        </span>
      ) : null}
      {attention?.contractPending && (
        <span className={`${tag} bg-amber-bg`} style={{ color: "var(--color-amber-deep)" }}>
          {t("חוזה ממתין לחתימה")}
        </span>
      )}
      {event.needs_review && (
        <span className={tag} style={{ background: badgeTint, color: "var(--color-ink)" }}>
          {t("יובא מהיומן. יש להשלים פרטים")}
        </span>
      )}
      {isFreelanceEvent(event) && (
        <span className={tag} style={{ background: FREELANCE_BADGE_TINT, color: "var(--color-ink)" }}>
          {t("אירוע פרילנס")}
        </span>
      )}
      {event.resolution_note && (
        <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-coral-deep)" }}>
          {t("כפילות: {note}", { note: event.resolution_note })}
        </span>
      )}
    </>
  );
}

// The same tags in the vivid look's tones.
function VividTags({ event, attention }: { event: EventWithCustomPackage; attention?: EventAttention }) {
  const t = useT();
  const lang = useLang();
  return (
    <>
      {attention?.openBalance ? (
        <ToneTag tone="attention">
          {t("יתרה פתוחה")} <span className="font-data">₪{attention.openBalance.toLocaleString(dateLocale(lang))}</span>
        </ToneTag>
      ) : null}
      {attention?.depositDue ? <ToneTag tone="pending">{t("מקדמה טרם שולמה")}</ToneTag> : null}
      {attention?.contractPending && <ToneTag tone="pending">{t("חוזה ממתין לחתימה")}</ToneTag>}
      {event.needs_review && <ToneTag tone="attention">{t("יובא מהיומן. יש להשלים פרטים")}</ToneTag>}
      {isFreelanceEvent(event) && <ToneTag tone="creative">{t("אירוע פרילנס")}</ToneTag>}
      {event.resolution_note && <ToneTag tone="neutral">{t("כפילות: {note}", { note: event.resolution_note })}</ToneTag>}
    </>
  );
}

// One event as a block (owner, 2026-10-26: "כמו בגלריות"): the date, the client, the tags, the next
// stage and the quick actions, in either look. The whole card opens the event (a link stretched under
// it); the buttons sit above that link.
// The album's line under the event's tags in a row or a block, whichever happened last:
// "אלבום נשלח לדפוס בתאריך: …" (lib/printCheck.ts), or where the design stands with the client
// (lib/albumApproval.ts): sent for approval, approved, or corrections asked for.
function AlbumLine({ printSentAt, album, className = "" }: { printSentAt: string | null; album: AlbumApprovalLine | null; className?: string }) {
  const t = useT();
  const locale = dateLocale(useLang());
  if (printSentAt && (!album || printSentAt >= album.at)) return <PrintSentLine at={printSentAt} className={className} />;
  if (!album) return null;
  const changes = album.kind === "changes";
  return (
    <div className={`flex items-start gap-1 text-[11.5px] leading-snug ${changes ? "font-semibold" : "text-ink-soft"} ${className}`} style={changes ? { color: "var(--color-rose)" } : undefined}>
      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-px">
        {album.kind === "approved" ? <path d="M20 6 9 17l-5-5" /> : <path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />}
      </svg>
      <span className="min-w-0">
        {album.kind === "changes" ? (
          t("הלקוח ביקש תיקונים בעיצוב האלבום")
        ) : (
          <>
            {album.kind === "approved" ? t("עיצוב האלבום אושר בתאריך:") : t("עיצוב האלבום נשלח לאישור בתאריך:")}{" "}
            <span className="whitespace-nowrap font-data">{printSentDate(album.at, locale)}</span>
          </>
        )}
      </span>
    </div>
  );
}

// "אלבום נשלח לדפוס בתאריך: …" (lib/printCheck.ts).
function PrintSentLine({ at, className = "" }: { at: string; className?: string }) {
  const t = useT();
  const locale = dateLocale(useLang());
  return (
    <div className={`flex items-start gap-1 text-[11.5px] text-ink-soft leading-snug ${className}`}>
      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-px">
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
      </svg>
      {/* Wraps on a narrow row; the date itself never breaks. */}
      <span className="min-w-0">
        {t("אלבום נשלח לדפוס בתאריך:")} <span className="whitespace-nowrap font-data">{printSentDate(at, locale)}</span>
      </span>
    </div>
  );
}

function EventBlock({
  event,
  nextStage,
  printSentAt,
  albumLine,
  unreadCount,
  canClose,
  attention,
  needsReviewColorId,
  vivid,
}: {
  event: EventWithCustomPackage;
  nextStage: string | null;
  printSentAt: string | null;
  albumLine: AlbumApprovalLine | null;
  unreadCount: number;
  canClose: boolean;
  attention?: EventAttention;
  needsReviewColorId?: string | null;
  vivid: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const done = !!event.closed_at;
  const isFreelance = isFreelanceEvent(event);
  const background = event.needs_review
    ? vivid
      ? rowWash("attention")
      : (googleColorRgba(needsReviewColorId ?? null, 0.16) ?? "var(--color-amber-bg)")
    : isFreelance
      ? vivid
        ? rowWash("creative")
        : `rgba(${FREELANCE_RGB}, 0.1)`
      : undefined;
  const progress = vivid ? stageProgress(event.event_stages) : null;
  const [y, m, d] = event.event_date.split("-").map(Number);
  const showYear = y !== new Date().getFullYear();
  const meta = [event.event_type?.trim(), event.event_location?.trim()].filter(Boolean).join(", ");
  const hasTags = !!(attention?.openBalance || attention?.depositDue || attention?.contractPending || event.needs_review || isFreelance || event.resolution_note);

  return (
    <>
      <div className="relative flex flex-col rounded-2xl bg-card border border-line shadow-card p-3 min-w-0" style={background ? { background } : undefined}>
        <Link href={`/events/${event.id}`} aria-label={event.client_name} data-press="tint" className="absolute inset-0 rounded-2xl" />
        <div className="relative pointer-events-none flex items-start gap-2.5">
          <div
            className="min-w-[44px] h-[50px] px-1 shrink-0 rounded-xl flex flex-col items-center justify-center"
            style={vivid ? toneStyle(eventDateTone({ closed: done, freelance: isFreelance })) : { background: "var(--color-chip)" }}
          >
            <div className="text-lg leading-none font-extrabold font-data">{d}</div>
            <div className="text-[11px] font-semibold mt-[3px] whitespace-nowrap">
              {lang === "he" ? HE_MONTHS_SHORT[m - 1] : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(lang), { month: "short", timeZone: "UTC" })}
              {showYear && <span className="font-data"> {String(y).slice(2)}</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <span className="text-[14.5px] font-bold leading-snug line-clamp-2 [overflow-wrap:anywhere]">{event.client_name}</span>
              {unreadCount > 0 && (
                <span
                  className="shrink-0 min-w-[18px] h-[18px] px-1 mt-px rounded-full text-[10px] font-bold flex items-center justify-center leading-none font-data"
                  style={{ background: vivid ? "var(--tone-attention)" : "var(--color-rose)", color: "#ffffff" }}
                  title={t("עדכונים חדשים מהלקוח")}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            {meta && <div className="text-[12px] text-ink-soft leading-snug line-clamp-2 mt-0.5">{meta}</div>}
          </div>
        </div>
        {hasTags && (
          <div className="relative pointer-events-none flex flex-wrap gap-1 mt-2">
            {vivid ? <VividTags event={event} attention={attention} /> : <PlainTags event={event} attention={attention} needsReviewColorId={needsReviewColorId} />}
          </div>
        )}
        <AlbumLine printSentAt={printSentAt} album={albumLine} className="relative pointer-events-none mt-2" />
        <div className="relative pointer-events-none mt-auto pt-2.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11.5px]" style={{ color: done ? (vivid ? "var(--tone-paid-ink)" : "var(--color-sage)") : "var(--color-ink-soft)" }} title={!done && nextStage ? t("השלב הבא") : undefined}>
            {done ? t("נסגר") : nextStage ? t(nextStage) : ""}
          </span>
          <div className="pointer-events-auto shrink-0 flex items-center gap-1.5">
            {!done && !nextStage && canClose && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-bg"
                style={{ color: "var(--color-amber-deep)" }}
              >
                {t("לסגירה")}
              </button>
            )}
            {canClose && <EventQuickActions eventId={event.id} />}
          </div>
        </div>
        {progress && (
          <div className="relative pointer-events-none h-[3px] rounded-full overflow-hidden mt-2.5" style={{ background: "var(--color-chip)" }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: done ? "var(--tone-paid)" : "var(--color-brass)" }} />
          </div>
        )}
      </div>
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
