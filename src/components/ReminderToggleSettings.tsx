"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";

// Settings › Automation: a reminder the photographer can switch off, on by default.
// - shoot_day_reminder: 3 days before the event, the "יום הצילום" message ready to send
//   (lib/shootDayReminder.ts, owner 2026-10-22).
// - song_stage_reminder: while the clip song-selection stage is open, a reminder to ask the client
//   for the songs (lib/songStageReminder.ts, owner 2026-10-25).
// - morning_digest: at 08:00, a phone notification with the day's tasks and the next shoot
//   (lib/morningDigest.ts, owner 2026-10-26). Also in the tasks panel, `compact`, with its short text.
const REMINDERS: Record<string, { title: string; text: string; shortTitle?: string; shortText?: string }> = {
  shoot_day_reminder: {
    title: "תזכורת לפני יום הצילום",
    text: "3 ימים לפני כל אירוע נפתח חלון עם הודעת יום הצילום מההודעות ללקוח, מוכנה לשליחה, ומגיעה התראה לטלפון.",
  },
  song_stage_reminder: {
    title: "תזכורת לבחירת שירים לקליפ",
    text: "כשהגיע שלב בחירת השירים לקליפ, או שהוא נשאר פתוח, נפתח חלון עם ההודעה של השלב מההודעות ללקוח, עם הקישור לפורטל, ומגיעה התראה לטלפון. עד 3 פעמים, כל 3 ימים, עד שהלקוח בוחר.",
  },
  morning_digest: {
    title: "התראת בוקר: המשימות של היום",
    text: "כל בוקר ב-8:00 מגיעה התראה לטלפון עם המשימות הפתוחות להיום והצילום הבא. רק בימים שיש בהם משימה פתוחה, או צילום היום או מחר. לחיצה עליה פותחת את רשימת המשימות.",
    shortTitle: "התראת בוקר ב-8:00",
    shortText: "המשימות של היום והצילום הבא, בהתראה לטלפון.",
  },
};

export default function ReminderToggleSettings({
  photographerId,
  column,
  initialEnabled,
  compact = false,
  onChange,
}: {
  photographerId: string;
  column: "shoot_day_reminder" | "song_stage_reminder" | "morning_digest";
  initialEnabled: boolean;
  compact?: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    setError(false);
    const { error: saveError } = await createClient().from("photographers").update({ [column]: next }).eq("id", photographerId);
    setBusy(false);
    if (saveError) {
      setEnabled(!next);
      setError(true);
    } else onChange?.(next);
  };
  const reminder = REMINDERS[column];
  const title = (compact && reminder.shortTitle) || reminder.title;
  const text = (compact && reminder.shortText) || reminder.text;

  return (
    <div className={compact ? "rounded-xl p-3 bg-white border border-line" : "rounded-2xl p-4 bg-card border border-line shadow-card mb-5"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t(title)}</div>
          <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">{t(text)}</div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={enabled}
          aria-label={t(title)}
          className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-60"
          style={{ background: enabled ? "var(--color-sage)" : "var(--color-line)", justifyContent: enabled ? "flex-end" : "flex-start" }}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow" />
        </button>
      </div>
      {error && <p className="text-xs text-rose mt-2">{t("השמירה נכשלה. נסו שוב")}</p>}
    </div>
  );
}
