"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GoogleCalendarEvent } from "@/lib/google";

function formatEventTime(event: GoogleCalendarEvent): string {
  if (event.start.dateTime) {
    return new Date(event.start.dateTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }
  return "כל היום";
}

function groupByDate(events: GoogleCalendarEvent[]): Map<string, GoogleCalendarEvent[]> {
  const map = new Map<string, GoogleCalendarEvent[]>();
  for (const event of events) {
    const dateKey = (event.start.dateTime ?? event.start.date ?? "").slice(0, 10);
    map.set(dateKey, [...(map.get(dateKey) ?? []), event]);
  }
  return map;
}

export default function CalendarView({
  connected,
  events,
  loadError,
}: {
  connected: boolean;
  events: GoogleCalendarEvent[] | null;
  loadError: boolean;
}) {
  const router = useRouter();

  return (
    <div>
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 tracking-wide text-ink-soft">
        ← חזרה לדף הבית
      </Link>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-bold font-display">יומן Google</h1>
        {connected && (
          <button
            onClick={() => router.refresh()}
            className="text-xs font-semibold text-ink-soft underline"
          >
            רענון
          </button>
        )}
      </div>

      {!connected && (
        <div className="rounded-2xl p-5 bg-card border border-line shadow-card text-center">
          <p className="text-sm text-ink-soft mb-4">היומן שלכם עדיין לא מחובר, אז אין כרגע מה להציג כאן.</p>
          <Link
            href="/settings"
            className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white"
          >
            חיבור יומן Google בהגדרות
          </Link>
        </div>
      )}

      {connected && loadError && (
        <div className="rounded-2xl p-5 bg-card border border-line shadow-card text-center">
          <p className="text-sm text-rose mb-4">לא הצלחנו לטעון את היומן כרגע — ייתכן שההרשאה פגה.</p>
          <Link
            href="/settings"
            className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white"
          >
            בדיקת החיבור בהגדרות
          </Link>
        </div>
      )}

      {connected && !loadError && events && events.length === 0 && (
        <div className="rounded-2xl p-5 bg-card border border-line shadow-card text-center">
          <p className="text-sm text-ink-soft">אין אירועים ביומן ב-180 הימים הקרובים.</p>
        </div>
      )}

      {connected && !loadError && events && events.length > 0 && (
        <div className="space-y-4">
          {Array.from(groupByDate(events).entries()).map(([dateKey, dayEvents]) => (
            <div key={dateKey}>
              <div className="text-xs font-semibold text-ink-soft mb-2 tracking-wide">
                {new Date(dateKey).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <a
                    key={event.id}
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-xl p-3.5 bg-card border border-line shadow-card"
                  >
                    <span className="text-sm font-medium truncate">{event.summary || "(ללא כותרת)"}</span>
                    <span className="text-xs font-data text-ink-soft shrink-0">{formatEventTime(event)}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
