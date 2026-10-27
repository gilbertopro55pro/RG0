"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import ToggleSwitch from "@/components/ToggleSwitch";
import { ALBUM_REMINDER_DAY_OPTIONS } from "@/lib/albumApproval";

type Values = { reminder: boolean; days: number; autoPrint: boolean };

// Settings › Notifications & automation: the album design sent to the client for approval (owner,
// 2026-10-27; lib/albumApproval.ts, migrations 0200–0201).
// - The reminder to nudge the client when the design isn't approved yet: on/off
//   (photographers.album_approval_reminder) and after how many days, 1–14
//   (album_approval_reminder_days). On by default, after 3 days.
// - Sending the album to the print house by itself when the client approves it (album_auto_print):
//   JPG at the album's size, to the default print-house address of the album tool. On by default.
export default function AlbumApprovalSettings({ photographerId, initial }: { photographerId: string; initial: Values }) {
  const t = useT();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (next: Values) => {
    const prev = values;
    setValues(next);
    setBusy(true);
    setError(false);
    setSaved(false);
    const { error: saveError } = await createClient()
      .from("photographers")
      .update({ album_approval_reminder: next.reminder, album_approval_reminder_days: next.days, album_auto_print: next.autoPrint })
      .eq("id", photographerId);
    setBusy(false);
    if (saveError) {
      setValues(prev);
      setError(true);
      return;
    }
    setSaved(next.days !== prev.days);
  };

  const reminderTitle = t("תזכורת לאישור עיצוב האלבום");
  const printTitle = t("שליחה לבית הדפוס כשהלקוח מאשר");
  return (
    <>
      <div className="rounded-2xl p-4 bg-card border border-line shadow-card mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{reminderTitle}</div>
            <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
              {t("אחרי ששלחתם ללקוח את עיצוב האלבום, אם הוא עוד לא אישר אותו, תקבלו התראה עם הודעת תזכורת מוכנה לשליחה.")}
            </div>
          </div>
          <ToggleSwitch checked={values.reminder} onClick={() => void save({ ...values, reminder: !values.reminder })} disabled={busy} label={reminderTitle} />
        </div>
        {values.reminder && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="album-reminder-days" className="text-xs font-semibold text-ink-soft">
              {t("אחרי")}
            </label>
            <select
              id="album-reminder-days"
              value={values.days}
              disabled={busy}
              onChange={(e) => void save({ ...values, days: Number(e.target.value) })}
              className="h-9 rounded-lg border border-line bg-white px-2 text-sm disabled:opacity-60"
            >
              {ALBUM_REMINDER_DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? t("יום אחד") : t("{n} ימים", { n })}
                </option>
              ))}
            </select>
            {saved && <span className="text-xs font-semibold" style={{ color: "var(--color-sage)" }}>{t("נשמר")}</span>}
          </div>
        )}
      </div>
      <div className="rounded-2xl p-4 bg-card border border-line shadow-card mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{printTitle}</div>
            <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">
              {t("כשהלקוח מאשר את עיצוב האלבום בגלריה, קבצי ה-JPG במידות האלבום נשלחים לבית הדפוס שמוגדר כברירת מחדל בכלי האלבום. בלי כתובת שמורה של בית דפוס, תקבלו הודעה ותשלחו בעצמכם.")}
            </div>
          </div>
          <ToggleSwitch checked={values.autoPrint} onClick={() => void save({ ...values, autoPrint: !values.autoPrint })} disabled={busy} label={printTitle} />
        </div>
      </div>
      {error && <p className="text-xs text-rose -mt-3 mb-5">{t("השמירה נכשלה. נסו שוב")}</p>}
    </>
  );
}
