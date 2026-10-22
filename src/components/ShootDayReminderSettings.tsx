"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";

// Settings › Automation: the reminder 3 days before the event to send the client the "יום הצילום"
// message (lib/shootDayReminder.ts, owner 2026-10-22). On by default.
export default function ShootDayReminderSettings({ photographerId, initialEnabled }: { photographerId: string; initialEnabled: boolean }) {
  const t = useT();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    setError(false);
    const { error: saveError } = await createClient().from("photographers").update({ shoot_day_reminder: next }).eq("id", photographerId);
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
          <div className="text-sm font-semibold">{t("תזכורת לפני יום הצילום")}</div>
          <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
            {t("3 ימים לפני כל אירוע נפתח חלון עם הודעת יום הצילום מההודעות ללקוח, מוכנה לשליחה, ומגיעה התראה לטלפון.")}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={enabled}
          aria-label={t("תזכורת לפני יום הצילום")}
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
