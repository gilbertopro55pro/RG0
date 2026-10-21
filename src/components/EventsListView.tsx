"use client";

import { useMemo, useState } from "react";
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

// event_stages: embedded by page.tsx's events query; only the vivid look reads it (the thin
// progress bar under each row).
type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null; event_stages?: readonly { done: boolean }[] };
type StatusFilter = HomeStatusFilter;
type SortOrder = HomeSortOrder;
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
  nextStageByEvent,
  unreadCountByEvent,
  isPhotographer,
  needsReviewColorId,
  attentionByEvent = {},
  initialView = DEFAULT_HOME_VIEW,
  saveView = false,
}: {
  attentionByEvent?: Record<string, EventAttention>;
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

  // "Done" is an explicit act now — the photographer's "סגירת אירוע" + confirmation (closed_at) —
  // NOT "every stage is checked", so finishing the last stage no longer moves an event out of the
  // active list by itself.
  const isEventDone = (event: EventWithCustomPackage) => !!event.closed_at;

  // The chosen view is saved on the account, so it's the same after logging out and on any device
  // (owner, 2026-10-13). A failed save only means the next visit opens on the previous view.
  const changeView = (next: HomeEventsView) => {
    setStatusFilter(next.status);
    setSortOrder(next.sort);
    setVisibleCount(PAGE_SIZE);
    if (!saveView) return;
    fetch("/api/preferences/home-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      keepalive: true,
    }).catch(() => {});
  };
  const week = comingWeekRange();

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
  }, [events, query, statusFilter, sortOrder, selectedMonth, selectedDate, rangeFrom, rangeTo, week.from, week.to]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  // The vivid look (lib/tones.ts, admin only for now; sketch "גילברטו – עיצוב עם יותר חיים"): the
  // status filter as pills, the rest of the filters behind "עוד", tinted date tiles, tone tags and
  // a thin stage bar under each row. Same state and the same saved view as below.
  if (vivid) {
    const extraFilterActive = statusFilter === "duplicates" || sortOrder !== "asc";
    return (
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h2 className="text-lg font-bold">{t("אירועים")}</h2>
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
            <div className="rounded-2xl overflow-hidden bg-card mb-3.5">
              {visible.map((event, i) => (
                <VividEventCard
                  first={i === 0}
                  attention={attentionByEvent[event.id]}
                  key={event.id}
                  event={event}
                  nextStage={nextStageByEvent[event.id] ?? null}
                  unreadCount={unreadCountByEvent[event.id] ?? 0}
                  canClose={isPhotographer}
                />
              ))}
            </div>
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

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5 px-0.5">
        <h2 className="text-[17px] font-bold">{t("אירועים")}</h2>
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
          <div className="rounded-2xl overflow-hidden bg-card mb-3.5">
          {visible.map((event, i) => (
            <EventCard
              first={i === 0}
              attention={attentionByEvent[event.id]}
              key={event.id}
              event={event}
              nextStage={nextStageByEvent[event.id] ?? null}
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
  unreadCount,
  needsReviewColorId,
  canClose,
  attention,
  first,
}: {
  event: EventWithCustomPackage;
  nextStage: string | null;
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
  const badgeTint = googleColorRgba(needsReviewColorId ?? null, 0.4) ?? "var(--color-amber-bg)";
  // needs_review wins the row tint when both apply — it's the temporary "act on this" state.
  const rowBackground = event.needs_review ? rowTint : isFreelance ? `rgba(${FREELANCE_RGB}, 0.1)` : undefined;
  const [y, m, d] = event.event_date.split("-").map(Number);
  const showYear = y !== new Date().getFullYear();
  // Design stage 5: client name leads; type and place follow in plain words (no " · " chain, and
  // the package lives on the event page, not in the list).
  const meta = [event.event_type?.trim(), event.event_location?.trim()].filter(Boolean).join(", ");
  const tag = "inline-block text-[11.5px] font-medium px-2 py-0.5 rounded-md";

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
            {isFreelance && (
              <span className={tag} style={{ background: FREELANCE_BADGE_TINT, color: "var(--color-ink)" }}>
                {t("אירוע פרילנס")}
              </span>
            )}
            {event.resolution_note && (
              <span className={tag} style={{ background: "var(--color-chip-tint)", color: "var(--color-coral-deep)" }}>
                {t("כפילות: {note}", { note: event.resolution_note })}
              </span>
            )}
          </div>
        )}
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
  unreadCount,
  canClose,
  attention,
  first,
}: {
  event: EventWithCustomPackage;
  nextStage: string | null;
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
                  {attention?.openBalance ? (
                    <ToneTag tone="attention">
                      {t("יתרה פתוחה")} <span className="font-data">₪{attention.openBalance.toLocaleString(dateLocale(lang))}</span>
                    </ToneTag>
                  ) : null}
                  {attention?.depositDue ? <ToneTag tone="pending">{t("מקדמה טרם שולמה")}</ToneTag> : null}
                  {attention?.contractPending && <ToneTag tone="pending">{t("חוזה ממתין לחתימה")}</ToneTag>}
                  {event.needs_review && <ToneTag tone="attention">{t("יובא מהיומן. יש להשלים פרטים")}</ToneTag>}
                  {isFreelance && <ToneTag tone="creative">{t("אירוע פרילנס")}</ToneTag>}
                  {event.resolution_note && <ToneTag tone="neutral">{t("כפילות: {note}", { note: event.resolution_note })}</ToneTag>}
                </div>
              )}
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
