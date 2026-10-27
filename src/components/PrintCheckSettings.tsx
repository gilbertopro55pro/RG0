"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { PRINT_CHECK_DAY_OPTIONS } from "@/lib/printCheck";

// Settings › Automation: how many days after an album is sent to the print house a task to check
// whether it's ready goes into the to-do list (lib/printCheck.ts, migration 0196). 3–14, 5 by default.
export default function PrintCheckSettings({ photographerId, initialDays }: { photographerId: string; initialDays: number }) {
  const t = useT();
  const [days, setDays] = useState(initialDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (next: number) => {
    const prev = days;
    setDays(next);
    setBusy(true);
    setError(false);
    setSaved(false);
    const { error: saveError } = await createClient().from("photographers").update({ print_check_days: next }).eq("id", photographerId);
    setBusy(false);
    if (saveError) {
      setDays(prev);
      setError(true);
      return;
    }
    setSaved(true);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card mb-5">
      <div className="text-sm font-semibold">{t("תזכורת לבדיקה מול הדפוס")}</div>
      <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
        {t("כשאלבום נשלח לדפוס, נכנסת לרשימת המשימות משימה לבדוק מול הדפוס אם האלבום מוכן, אחרי מספר הימים שתבחרו.")}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="print-check-days" className="text-xs font-semibold text-ink-soft">
          {t("אחרי")}
        </label>
        <select
          id="print-check-days"
          value={days}
          disabled={busy}
          onChange={(e) => void save(Number(e.target.value))}
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
      {error && <p className="text-xs text-rose mt-2">{t("השמירה נכשלה. נסו שוב")}</p>}
    </div>
  );
}
