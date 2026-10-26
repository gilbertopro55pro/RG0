"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import ToggleSwitch from "@/components/ToggleSwitch";
import { DIGEST_TIMES, digestTimeLabel } from "@/lib/morningDigest";

// The daily tasks reminder (lib/morningDigest.ts): on/off and the time it comes at, in Settings ›
// Automation and, `compact`, at the bottom of the tasks panel. On by default, at 08:00.
export default function MorningDigestSettings({
  photographerId,
  initialEnabled,
  initialMinutes,
  compact = false,
  onChange,
}: {
  photographerId: string;
  initialEnabled: boolean;
  initialMinutes: number;
  compact?: boolean;
  onChange?: (next: { enabled: boolean; minutes: number }) => void;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [minutes, setMinutes] = useState(initialMinutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (next: { enabled: boolean; minutes: number }) => {
    const prev = { enabled, minutes };
    setEnabled(next.enabled);
    setMinutes(next.minutes);
    setBusy(true);
    setError(false);
    setSaved(false);
    const { error: saveError } = await createClient()
      .from("photographers")
      .update({ morning_digest: next.enabled, morning_digest_minutes: next.minutes })
      .eq("id", photographerId);
    setBusy(false);
    if (saveError) {
      setEnabled(prev.enabled);
      setMinutes(prev.minutes);
      setError(true);
      return;
    }
    setSaved(next.minutes !== prev.minutes);
    onChange?.(next);
  };

  const title = t("תזכורת יומית למשימות");
  return (
    <div className={compact ? "rounded-xl p-3 bg-white border border-line" : "rounded-2xl p-4 bg-card border border-line shadow-card mb-5"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
            {compact
              ? t("המשימות של היום והצילום הבא, בהתראה לטלפון.")
              : t("בכל יום, בשעה שתבחרו, מגיעה התראה לטלפון עם המשימות הפתוחות להיום והצילום הבא. רק בימים שיש בהם משימה פתוחה, או צילום היום או מחר. לחיצה עליה פותחת את רשימת המשימות.")}
          </div>
        </div>
        <ToggleSwitch checked={enabled} onClick={() => void save({ enabled: !enabled, minutes })} disabled={busy} label={title} />
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`digest-time-${compact ? "panel" : "settings"}`} className="text-xs font-semibold text-ink-soft">
            {t("שעת התזכורת")}
          </label>
          <select
            id={`digest-time-${compact ? "panel" : "settings"}`}
            value={minutes}
            disabled={busy}
            onChange={(e) => void save({ enabled, minutes: Number(e.target.value) })}
            dir="ltr"
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm font-data disabled:opacity-60"
          >
            {DIGEST_TIMES.map((m) => (
              <option key={m} value={m}>
                {digestTimeLabel(m)}
              </option>
            ))}
          </select>
          {saved && <span className="text-xs font-semibold" style={{ color: "var(--color-sage)" }}>{t("נשמר")}</span>}
        </div>
      )}
      {error && <p className="text-xs text-rose mt-2">{t("השמירה נכשלה. נסו שוב")}</p>}
    </div>
  );
}
