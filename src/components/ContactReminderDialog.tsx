"use client";

import { useState } from "react";
import BodyPortal from "@/components/BodyPortal";
import { useT } from "@/i18n/client";
import { CONTACT_REMIND_MAX_DAYS } from "@/lib/leadContactReminder";

// "תזכורת ליצירת קשר" (owner, 2026-10-15): asked when a lead is marked "יצרתי קשר" (LeadsView), and
// used again to put a due reminder off (ContactReminderPopup). The photographer picks a date and a
// time; the lead pops up in the app then, with a phone notification (api/cron/lead-reminders).

// "2026-10-16T10:00" in the device's own time zone, for a datetime-local field.
export function localInputValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Tomorrow at 10:00, the first suggestion.
function tomorrowAtTen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

export default function ContactReminderDialog({
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: React.ReactNode;
  confirmLabel?: string;
  // Gets the chosen moment as an ISO string; resolves false when saving failed.
  onConfirm: (remindAt: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(() => localInputValue(tomorrowAtTen()));
  const [min] = useState(() => localInputValue(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const at = new Date(value);
    const now = new Date().getTime();
    if (Number.isNaN(at.getTime()) || at.getTime() < now + 60_000) {
      setError(t("בחרו תאריך ושעה שעוד לא עברו."));
      return;
    }
    if (at.getTime() > now + CONTACT_REMIND_MAX_DAYS * 86_400_000) {
      setError(t("אפשר לקבוע תזכורת עד שנה קדימה."));
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onConfirm(at.toISOString());
    setBusy(false);
    if (!ok) setError(t("שמירת התזכורת נכשלה, נסו שוב."));
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.45)" }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet">
          <h2 className="text-lg font-bold font-display mb-1.5">{title}</h2>
          <div className="text-sm text-ink-soft mb-4">{text}</div>
          <label className="block text-xs font-semibold mb-1.5">{t("מתי להזכיר לך?")}</label>
          <input
            type="datetime-local"
            value={value}
            min={min}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            dir="ltr"
            className="w-full h-11 rounded-lg border border-line bg-white px-2 text-sm"
          />
          {error && <p className="text-xs text-rose mt-1.5">{error}</p>}
          <div className="flex gap-2 mt-5">
            <button onClick={onCancel} disabled={busy} className="flex-1 h-11 rounded-xl border border-line bg-white text-sm font-semibold text-ink disabled:opacity-60">
              {t("ביטול")}
            </button>
            <button onClick={confirm} disabled={busy || !value} className="flex-1 h-11 rounded-xl bg-ink text-white text-sm font-semibold disabled:opacity-60">
              {confirmLabel ?? t("אישור")}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
