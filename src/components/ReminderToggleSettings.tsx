"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import ToggleSwitch from "@/components/ToggleSwitch";

// Settings › Automation: a reminder the photographer can switch off, on by default.
// - shoot_day_reminder: 3 days before the event, the "יום הצילום" message ready to send
//   (lib/shootDayReminder.ts, owner 2026-10-22).
// - song_stage_reminder: while the clip song-selection stage is open, a reminder to ask the client
//   for the songs (lib/songStageReminder.ts, owner 2026-10-25).
// The daily tasks reminder, which also has a time, is MorningDigestSettings.
const REMINDERS = {
  shoot_day_reminder: {
    title: "תזכורת לפני יום הצילום",
    text: "3 ימים לפני כל אירוע נפתח חלון עם הודעת יום הצילום מההודעות ללקוח, מוכנה לשליחה, ומגיעה התראה לטלפון.",
  },
  song_stage_reminder: {
    title: "תזכורת לבחירת שירים לקליפ",
    text: "כשהגיע שלב בחירת השירים לקליפ, או שהוא נשאר פתוח, נפתח חלון עם ההודעה של השלב מההודעות ללקוח, עם הקישור לפורטל, ומגיעה התראה לטלפון. עד 3 פעמים, כל 3 ימים, עד שהלקוח בוחר.",
  },
} as const;

export default function ReminderToggleSettings({
  photographerId,
  column,
  initialEnabled,
}: {
  photographerId: string;
  column: keyof typeof REMINDERS;
  initialEnabled: boolean;
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
    }
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t(REMINDERS[column].title)}</div>
          <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
            {t(REMINDERS[column].text)}
          </div>
        </div>
        <ToggleSwitch checked={enabled} onClick={toggle} disabled={busy} label={t(REMINDERS[column].title)} />
      </div>
      {error && <p className="text-xs text-rose mt-2">{t("השמירה נכשלה. נסו שוב")}</p>}
    </div>
  );
}
