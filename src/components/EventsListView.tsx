"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { packageLabel } from "@/lib/stages";
import type { EventRow } from "@/lib/types";

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };
type StatusFilter = "upcoming" | "completed" | "all" | "duplicates";
type SortOrder = "asc" | "desc" | "month";
const PAGE_SIZE = 10;

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
}: {
  events: EventWithCustomPackage[];
  doneCountByEvent: Record<string, number>;
  totalCountByEvent: Record<string, number>;
  unreadCountByEvent: Record<string, number>;
  isPhotographer: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("upcoming");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isEventDone = (event: EventWithCustomPackage) => {
    const total = totalCountByEvent[event.id] ?? 1;
    const done = doneCountByEvent[event.id] ?? 0;
    return done >= total;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = events.filter((event) => {
      if (q) {
        const matchesName = event.client_name.toLowerCase().includes(q);
        const matchesPhone = (event.client_phone ?? "").includes(q);
        if (!matchesName && !matchesPhone) return false;
      }
      if (statusFilter === "duplicates" && !event.resolution_note) return false;
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
        <span className="text-sm font-semibold tracking-wide">אירועים</span>
        <span className="text-xs tracking-wide text-ink-soft font-data">{filtered.length} מתוך {events.length}</span>
      </div>

      {events.length > 0 && (
        <div className="flex gap-2 mb-3.5">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="חיפוש לפי שם לקוח או טלפון..."
            className="flex-1 rounded-lg px-3 py-2 text-sm border border-line bg-white"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setVisibleCount(PAGE_SIZE);
            }}
            className="rounded-lg px-2 py-2 text-sm border border-line bg-white"
          >
            <option value="upcoming">פעילים</option>
            <option value="completed">הושלמו</option>
            <option value="all">הכל</option>
            <option value="duplicates">כפילויות / פרילנס</option>
          </select>
        </div>
      )}

      {events.length > 0 && (
        <div className="flex gap-2 mb-3.5">
          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as SortOrder);
              setVisibleCount(PAGE_SIZE);
            }}
            className="rounded-lg px-2 py-2 text-sm border border-line bg-white"
          >
            <option value="asc">תאריך: מהקרוב לרחוק</option>
            <option value="desc">תאריך: מהרחוק לקרוב</option>
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
              className="rounded-lg px-2 py-2 text-sm border border-line bg-white font-data"
            />
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
              ? "עדיין אין אירועים — לחצו על + כדי לסגור אירוע ראשון"
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
}: {
  event: EventWithCustomPackage;
  doneCount: number;
  totalCount: number;
  unreadCount: number;
}) {
  const total = totalCount;
  const pct = Math.round((doneCount / total) * 100);
  const done = doneCount >= total;

  return (
    <Link
      href={`/events/${event.id}`}
      className="block w-full text-right rounded-2xl p-4 mb-3.5 bg-card border border-line shadow-card"
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="relative inline-block">
          <span className="font-semibold text-base font-display">{event.client_name}</span>
          {unreadCount > 0 && (
            <span
              className="absolute -top-2 -left-3 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none shadow"
              style={{ background: "var(--color-rose)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
        <span className="text-[10.5px] px-2.5 py-1 rounded-full tracking-wide bg-amber-bg text-amber-deep font-data">
          {packageLabel(event.package, event.custom_packages?.name)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-3.5 text-xs text-ink-soft">
        {new Date(event.event_date).toLocaleDateString("he-IL")}
      </div>
      {event.resolution_note && (
        <div
          className="text-[10.5px] px-2.5 py-1 rounded-full tracking-wide font-medium mb-2.5 inline-block"
          style={{ background: "var(--color-chip-tint)", color: "var(--color-coral-deep)" }}
        >
          כפילות — {event.resolution_note}
        </div>
      )}
      <div className="h-[5px] rounded-full mb-2.5 bg-line">
        <div
          className="h-[5px] rounded-full"
          style={{ width: `${pct}%`, background: done ? "var(--color-sage)" : "var(--color-amber)" }}
        />
      </div>
      <div className="text-xs" style={{ color: done ? "var(--color-sage)" : "var(--color-amber-deep)", fontWeight: 600 }}>
        {done ? "✓ נמסר ללקוח" : `${doneCount}/${total} שלבים הושלמו`}
      </div>
    </Link>
  );
}
