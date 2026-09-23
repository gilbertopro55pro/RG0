"use client";

import { useMemo, useState } from "react";

// Rough, defensible per-event admin-time estimates for a photographer working without a single
// system — quote, WhatsApp back-and-forth, contract, gallery + chasing photo selection, payment
// reminders, calendar coordination. ~2 hours/event is a conservative, round total.
const MINUTES_WITHOUT_SYSTEM_PER_EVENT = 115;
// What's realistically still needed with Gilberto handling the repetitive parts automatically —
// personal touches (replying to a real question, culling/style choices) don't disappear.
const MINUTES_WITH_GILBERTO_PER_EVENT = 20;
const DEFAULT_HOURLY_VALUE = 150;

export default function TimeSavingsCalculator() {
  const [eventsPerMonth, setEventsPerMonth] = useState(6);
  const [hourlyValue, setHourlyValue] = useState(DEFAULT_HOURLY_VALUE);

  const { hoursSaved, moneySaved, hoursWithout } = useMemo(() => {
    const minutesSavedPerEvent = MINUTES_WITHOUT_SYSTEM_PER_EVENT - MINUTES_WITH_GILBERTO_PER_EVENT;
    const totalMinutesSaved = minutesSavedPerEvent * eventsPerMonth;
    const hoursSaved = Math.round((totalMinutesSaved / 60) * 10) / 10;
    const hoursWithout = Math.round(((MINUTES_WITHOUT_SYSTEM_PER_EVENT * eventsPerMonth) / 60) * 10) / 10;
    const moneySaved = Math.round(hoursSaved * hourlyValue);
    return { hoursSaved, moneySaved, hoursWithout };
  }, [eventsPerMonth, hourlyValue]);

  return (
    <section className="max-w-2xl mx-auto px-4 py-12">
      <h2 className="text-2xl font-bold font-display text-center mb-2">כמה זמן אתם מבזבזים על ניהול?</h2>
      <p className="text-sm text-ink-soft text-center mb-8">
        הזיזו את המחוונים לפי הקצב שלכם, ותראו כמה שעות וכסף אפשר לחסוך בחודש
      </p>

      <div className="rounded-3xl p-6 bg-card border border-line shadow-card space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">כמה אירועים אתם מצלמים בחודש?</label>
            <span className="text-sm font-bold font-data">{eventsPerMonth}</span>
          </div>
          <input
            type="range"
            min={1}
            max={25}
            value={eventsPerMonth}
            onChange={(e) => setEventsPerMonth(Number(e.target.value))}
            className="w-full accent-amber-deep"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">כמה שווה לכם שעת עבודה?</label>
            <span className="text-sm font-bold font-data">₪{Number(hourlyValue).toLocaleString("he-IL")}</span>
          </div>
          <input
            type="range"
            min={50}
            max={400}
            step={10}
            value={hourlyValue}
            onChange={(e) => setHourlyValue(Number(e.target.value))}
            className="w-full accent-amber-deep"
          />
        </div>

        <div className="rounded-2xl p-5 text-center bg-amber-deep text-white">
          <div className="text-xs opacity-85 mb-1">
            בלי מערכת: כ-{hoursWithout} שעות ניהול בחודש. עם גילברטו, אתם חוסכים בערך
          </div>
          <div className="text-4xl font-extrabold font-display">{hoursSaved} שעות</div>
          <div className="text-sm opacity-90 mt-1">שהיו שוות כ-₪{moneySaved.toLocaleString("he-IL")} בחודש</div>
        </div>
        <p className="text-[11px] text-ink-soft text-center leading-relaxed">
          מבוסס על הזמן הממוצע שצלמים מדווחים שהם משקיעים בהצעות מחיר, תיאום בוואטסאפ, חוזים, שיתוף גלריות ותזכורות תשלום, לעומת אותם שלבים כשהמערכת עושה את רוב העבודה בשבילכם.
        </p>
      </div>
    </section>
  );
}
