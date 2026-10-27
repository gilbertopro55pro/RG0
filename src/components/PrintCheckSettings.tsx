"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import ToggleSwitch from "@/components/ToggleSwitch";
import { PRINT_CHECK_DAY_OPTIONS } from "@/lib/printCheck";

// Settings › Automation: the task to check with the print house whether an album is ready, which
// goes into the to-do list a number of days after the album is sent to print (lib/printCheck.ts,
// migrations 0196, 0197). On/off (photographers.print_check) and the days, 3–14 (print_check_days).
// On by default, after 5 days.
export default function PrintCheckSettings({
  photographerId,
  initialEnabled,
  initialDays,
}: {
  photographerId: string;
  initialEnabled: boolean;
  initialDays: number;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [days, setDays] = useState(initialDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (next: { enabled: boolean; days: number }) => {
    const prev = { enabled, days };
    setEnabled(next.enabled);
    setDays(next.days);
    setBusy(true);
    setError(false);
    setSaved(false);
    const { error: saveError } = await createClient()
      .from("photographers")
      .update({ print_check: next.enabled, print_check_days: next.days })
      .eq("id", photographerId);
    setBusy(false);
    if (saveError) {
      setEnabled(prev.enabled);
      setDays(prev.days);
      setError(true);
      return;
    }
    setSaved(next.days !== prev.days);
  };

  const title = t("תזכורת לבדיקה מול הדפוס");
  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
            {t("כשאלבום נשלח לדפוס, נכנסת לרשימת המשימות משימה לבדוק מול הדפוס אם האלבום מוכן, אחרי מספר הימים שתבחרו.")}
          </div>
        </div>
        <ToggleSwitch checked={enabled} onClick={() => void save({ enabled: !enabled, days })} disabled={busy} label={title} />
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="print-check-days" className="text-xs font-semibold text-ink-soft">
            {t("אחרי")}
          </label>
          <select
            id="print-check-days"
            value={days}
            disabled={busy}
            onChange={(e) => void save({ enabled, days: Number(e.target.value) })}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60"
          >
            {PRINT_CHECK_DAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t("{n} ימים", { n })}
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
