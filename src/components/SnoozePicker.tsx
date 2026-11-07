"use client";

import { useState } from "react";
import ReminderDateTimeField from "@/components/ReminderDateTimeField";
import { useT } from "@/i18n/client";
import { SNOOZE_MAX_DAYS } from "@/lib/reminderSnooze";

export type SnoozeChoice = { remindMinutes: number } | { remindAt: string };

// "2026-10-16T10:00" in the device's own time zone, for a datetime-local field.
function localInputValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// "תזכורת" in a reminder window (owner, 2026-11-07, lib/reminderSnooze.ts): in an hour, in three
// hours, or at a date and time of the photographer's choice (tomorrow at 10:00 to start from).
export default function SnoozePicker({
  busy,
  hint,
  onPick,
  onBack,
}: {
  busy: boolean;
  // What happens if the photographer deals with it before then.
  hint?: string;
  onPick: (choice: SnoozeChoice) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [custom, setCustom] = useState<{ value: string; min: string; error: string | null } | null>(null);
  const openCustom = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    setCustom({ value: localInputValue(start), min: localInputValue(now), error: null });
  };
  const pickCustom = () => {
    if (!custom) return;
    const at = new Date(custom.value);
    const now = new Date().getTime();
    if (Number.isNaN(at.getTime()) || at.getTime() < now + 60_000) {
      setCustom({ ...custom, error: t("בחרו תאריך ושעה שעוד לא עברו.") });
      return;
    }
    if (at.getTime() > now + SNOOZE_MAX_DAYS * 86_400_000) {
      setCustom({ ...custom, error: t("אפשר לקבוע תזכורת עד 90 יום קדימה.") });
      return;
    }
    onPick({ remindAt: at.toISOString() });
  };
  const option = "flex-1 rounded-lg py-3 text-sm font-semibold border disabled:opacity-60";
  return (
    <div>
      <p className="text-sm font-semibold mb-2">{t("מתי להזכיר לך?")}</p>
      <div className="flex gap-2">
        <button onClick={() => onPick({ remindMinutes: 60 })} disabled={busy} className={`${option} border-line bg-white text-ink`}>
          {t("בעוד שעה")}
        </button>
        <button onClick={() => onPick({ remindMinutes: 180 })} disabled={busy} className={`${option} border-line bg-white text-ink`}>
          {t("בעוד 3 שעות")}
        </button>
        <button onClick={openCustom} disabled={busy} className={`${option} ${custom ? "border-amber-deep bg-amber-bg text-ink" : "border-line bg-white text-ink"}`}>
          {t("תאריך ושעה")}
        </button>
      </div>
      {custom && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <ReminderDateTimeField
            value={custom.value}
            min={custom.min}
            onChange={(v) => setCustom({ ...custom, value: v, error: null })}
            ariaLabel={t("תאריך ושעה")}
            className="sm:flex-1 min-w-0"
          />
          <button onClick={pickCustom} disabled={busy || !custom.value} className="rounded-lg h-11 px-4 text-sm font-semibold bg-ink text-white disabled:opacity-60">
            {t("קביעת התזכורת")}
          </button>
        </div>
      )}
      {custom?.error && <p className="text-xs text-rose mt-1.5">{custom.error}</p>}
      <p className="text-xs text-ink-soft mt-2">{hint ?? t("החלון ייעלם עד אז, ויחזור עם התראה לטלפון.")}</p>
      <button onClick={onBack} className="mt-2 text-xs font-semibold underline text-ink-soft">
        {t("חזרה")}
      </button>
    </div>
  );
}
