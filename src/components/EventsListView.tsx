"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { packageLabel } from "@/lib/stages";
import type { EventRow } from "@/lib/types";

type EventWithCustomPackage = EventRow & { custom_packages: { name: string } | null };
type StatusFilter = "upcoming" | "completed" | "all";
const PAGE_SIZE = 10;

export default function EventsListView({
  events,
  doneCountByEvent,
  totalCountByEvent,
  isPhotographer,
}: {
  events: EventWithCustomPackage[];
  doneCountByEvent: Record<string, number>;
  totalCountByEvent: Record<string, number>;
  isPhotographer: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("upcoming");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isEventDone = (event: EventWithCustomPackage) => {
    const total = totalCountByEvent[event.id] ?? 1;
    const done = doneCountByEvent[event.id] ?? 0;
    return done >= total;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (q) {
        const matchesName = event.client_name.toLowerCase().includes(q);
        const matchesPhone = (event.client_phone ?? "").includes(q);
        if (!matchesName && !matchesPhone) return false;
      }
      const done = isEventDone(event);
      if (statusFilter === "upcoming" && done) return false;
      if (statusFilter === "completed" && !done) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, query, statusFilter, doneCountByEvent, totalCountByEvent]);

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
          </select>
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
}: {
  event: EventWithCustomPackage;
  doneCount: number;
  totalCount: number;
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
        <span className="font-semibold text-base font-display">{event.client_name}</span>
        <span className="text-[10.5px] px-2.5 py-1 rounded-full tracking-wide bg-amber-bg text-amber-deep font-data">
          {packageLabel(event.package, event.custom_packages?.name)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-3.5 text-xs text-ink-soft">
        {new Date(event.event_date).toLocaleDateString("he-IL")}
      </div>
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
