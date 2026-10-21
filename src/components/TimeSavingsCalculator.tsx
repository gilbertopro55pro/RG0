"use client";

import { useState } from "react";
import { LANDING_CONTAINER } from "@/components/LandingChrome";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import {
  ADMIN_MINUTES_PER_EVENT,
  DEFAULT_EVENTS_PER_MONTH,
  DEFAULT_HOURLY_VALUE,
  MINUTES_LEFT_WITH_GILBERTO,
  hoursSavedPerMonth,
  workdaysPerYear,
} from "@/lib/adminTime";

// The landing calculator (sketch 2, 2026-10-11): the visitor's own numbers, not ours. The admin
// time per event starts at the page's itemized total (lib/adminTime.ts) and can be moved, since the
// page says "every photographer works differently".
export default function TimeSavingsCalculator() {
  const [eventsPerMonth, setEventsPerMonth] = useState(DEFAULT_EVENTS_PER_MONTH);
  const [adminMinutes, setAdminMinutes] = useState(ADMIN_MINUTES_PER_EVENT);
  const [hourlyValue, setHourlyValue] = useState(DEFAULT_HOURLY_VALUE);
  const t = useT();
  const locale = dateLocale(useLang());

  const hoursSaved = hoursSavedPerMonth(adminMinutes, eventsPerMonth);
  const moneySaved = Math.round(hoursSaved * hourlyValue);
  const daysSaved = workdaysPerYear(adminMinutes - MINUTES_LEFT_WITH_GILBERTO, eventsPerMonth);

  const sliders = [
    { id: "tsc-events", label: t("כמה אירועים אתם מצלמים בחודש?"), shown: eventsPerMonth.toLocaleString(locale), value: eventsPerMonth, min: 1, max: 25, step: 1, set: setEventsPerMonth },
    {
      id: "tsc-admin",
      label: t("זמן עבודה מנהלית על כל אירוע"),
      shown: t("{n} שעות", { n: (adminMinutes / 60).toLocaleString(locale) }),
      value: adminMinutes,
      // From an hour and a half ("1 שעות" isn't Hebrew), up to eight.
      min: 90,
      max: 480,
      step: 30,
      set: setAdminMinutes,
    },
    { id: "tsc-hourly", label: t("מה שווי שעת העבודה שלכם?"), shown: `₪${hourlyValue.toLocaleString(locale)}`, value: hourlyValue, min: 50, max: 500, step: 10, set: setHourlyValue },
  ];
  const results = [
    { value: hoursSaved.toLocaleString(locale), label: t("שעות שחוזרות אליכם בחודש") },
    { value: `₪${moneySaved.toLocaleString(locale)}`, label: t("שווי הזמן הזה בחודש") },
    { value: daysSaved.toLocaleString(locale), label: t("ימי עבודה שחוזרים אליכם בשנה") },
  ];

  return (
    <section id="calc" className="bg-[var(--l-navy)] text-[var(--l-on-navy)] scroll-mt-4">
      <div className={`${LANDING_CONTAINER} py-16 lg:py-28`}>
        <div className="flex flex-col gap-3 max-w-[760px]">
          <h2 className="font-display m-0 text-[30px] lg:text-5xl leading-[1.12] font-bold tracking-[-0.025em] text-white text-balance">
            {t("כמה זמן וכסף העבודה המנהלית עולה לכם?")}
          </h2>
          <p className="m-0 text-[17px] lg:text-lg leading-relaxed text-[var(--l-on-navy-soft)]">{t("הזיזו את הסמנים בהתאם לעסק שלכם, וקבלו את המספרים שלכם.")}</p>
        </div>

        <div className="mt-8 grid gap-7 lg:grid-cols-2 lg:gap-12 items-start">
          <div className="flex flex-col gap-6">
            {sliders.map((s) => (
              <div key={s.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4 text-base lg:text-[17px] font-semibold">
                  <label htmlFor={s.id}>{s.label}</label>
                  <output htmlFor={s.id} className="shrink-0 whitespace-nowrap font-extrabold tabular-nums text-white">
                    {s.shown}
                  </output>
                </div>
                <input
                  id={s.id}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={s.value}
                  onChange={(e) => s.set(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: "var(--l-accent-light)" }}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" aria-live="polite">
              {results.map((r) => (
                <div key={r.label} className="min-w-0 rounded-[12px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] p-4">
                  <div className="font-display text-[clamp(26px,4vw,36px)] font-extrabold leading-[1.1] tabular-nums text-white break-words">{r.value}</div>
                  <div className="mt-1 text-[13px] text-[var(--l-on-navy-soft)]">{r.label}</div>
                </div>
              ))}
            </div>
            <p className="m-0 text-xs leading-relaxed text-[var(--l-on-navy-mute)]">
              {t("החישוב מניח שגם עם גילברטו נשארות כ-40 דקות לאירוע, ושיום עבודה הוא שמונה שעות. זו הערכה, לא התחייבות.")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
