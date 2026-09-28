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

  // hoursWithout is still computed (kept for parity with the original math) but no longer shown.
  const { hoursSaved, moneySaved } = useMemo(() => {
    const minutesSavedPerEvent = MINUTES_WITHOUT_SYSTEM_PER_EVENT - MINUTES_WITH_GILBERTO_PER_EVENT;
    const totalMinutesSaved = minutesSavedPerEvent * eventsPerMonth;
    const hoursSaved = Math.round((totalMinutesSaved / 60) * 10) / 10;
    const hoursWithout = Math.round(((MINUTES_WITHOUT_SYSTEM_PER_EVENT * eventsPerMonth) / 60) * 10) / 10;
    const moneySaved = Math.round(hoursSaved * hourlyValue);
    return { hoursSaved, moneySaved, hoursWithout };
  }, [eventsPerMonth, hourlyValue]);

  return (
    <section className="bg-[var(--l-bg)] text-[var(--l-ink)]">
      <div className="max-w-[1344px] mx-auto px-5 sm:px-8 lg:px-12 py-16 lg:py-28 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-[72px]">
        <div className="lg:w-[440px] lg:shrink-0 flex flex-col gap-3 lg:gap-5">
          <h2 className="font-display font-bold text-[30px] leading-[1.15] lg:text-5xl lg:leading-[1.1] tracking-[-0.025em] m-0">
            כמה זמן אתם מבזבזים על ניהול?
          </h2>
          <p className="m-0 text-base lg:text-[19px] leading-[1.6] text-[var(--l-ink-soft)]">
            הזיזו את הסמנים לפי העסק שלכם. החישוב: כ-115 דקות ניהול לאירוע בלי מערכת, כ-20 דקות עם גילברטו.
          </p>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="border border-[var(--l-line)] rounded-[18px] lg:rounded-[20px] p-[22px] lg:p-10 flex flex-col gap-6 lg:gap-8 bg-[var(--l-bg)]">
            <div className="flex flex-col gap-2.5 lg:gap-3.5">
              <div className="flex items-center justify-between gap-4 text-base lg:text-lg">
                <label htmlFor="tsc-events" className="font-semibold">
                  כמה אירועים אתם מצלמים בחודש?
                </label>
                <span className="font-display font-data font-bold">{eventsPerMonth}</span>
              </div>
              <input
                id="tsc-events"
                type="range"
                min={1}
                max={25}
                value={eventsPerMonth}
                onChange={(e) => setEventsPerMonth(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: "var(--l-navy)" }}
              />
            </div>

            <div className="flex flex-col gap-2.5 lg:gap-3.5">
              <div className="flex items-center justify-between gap-4 text-base lg:text-lg">
                <label htmlFor="tsc-hourly" className="font-semibold">
                  כמה שווה לכם שעת עבודה?
                </label>
                <span className="font-display font-data font-bold">₪{Number(hourlyValue).toLocaleString("he-IL")}</span>
              </div>
              <input
                id="tsc-hourly"
                type="range"
                min={50}
                max={400}
                step={10}
                value={hourlyValue}
                onChange={(e) => setHourlyValue(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: "var(--l-navy)" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 lg:gap-4" aria-live="polite">
              <div className="rounded-[1px] bg-[var(--l-navy)] text-[var(--l-on-navy)] p-4 lg:p-6 flex flex-col gap-1 lg:gap-1.5 min-w-0">
                <div className="text-[13px] lg:text-[15px] text-[var(--l-on-navy-soft)]">שעות שחוזרות אליכם בחודש</div>
                <div className="font-display font-data font-bold text-[clamp(22px,7vw,36px)] sm:text-4xl lg:text-[52px] leading-none tracking-[-0.03em]">
                  {hoursSaved}
                </div>
              </div>
              <div className="rounded-[1px] bg-[var(--l-accent)] text-[var(--l-on-accent)] p-4 lg:p-6 flex flex-col gap-1 lg:gap-1.5 min-w-0">
                <div className="text-[13px] lg:text-[15px] font-semibold">שווי הזמן הזה בחודש</div>
                <div className="font-display font-data font-bold text-[clamp(22px,7vw,36px)] sm:text-4xl lg:text-[52px] leading-none tracking-[-0.03em] break-words">
                  ₪{moneySaved.toLocaleString("he-IL")}
                </div>
              </div>
            </div>
          </div>
          <p className="m-0 text-[11px] leading-relaxed text-[var(--l-ink-soft)]">
            מבוסס על הזמן הממוצע שצלמים מדווחים שהם משקיעים בהצעות מחיר, תיאום בוואטסאפ, חוזים, שיתוף גלריות ותזכורות תשלום, לעומת אותם שלבים כשהכל מרוכז במקום אחד, עם תבניות והודעות מוכנות מראש. זו הערכה, לא התחייבות.
          </p>
        </div>
      </div>
    </section>
  );
}
