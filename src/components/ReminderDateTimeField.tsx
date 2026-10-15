"use client";

import NativeDateTimeField from "@/components/NativeDateTimeField";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// The date and time of a reminder (ContactReminderDialog, and the quote follow-up in
// PendingClientMessagePrompts). On a phone the value shows as "יום ו׳, 16 באוק׳ 2026, 10:00" in
// the photographer's language, in a box exactly as wide as it's given: the native iPhone field ran
// wider than the buttons under it, and showed the Hebrew date scrambled (owner, 2026-10-15).
export default function ReminderDateTimeField({
  value,
  min,
  onChange,
  ariaLabel,
  className = "",
}: {
  // "2026-10-16T10:00", the device's own time zone.
  value: string;
  min?: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const t = useT();
  const lang = useLang();
  const at = value ? new Date(value) : null;
  const valid = !!at && !Number.isNaN(at.getTime());
  const label = valid
    ? new Intl.DateTimeFormat(dateLocale(lang), { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at)
    : t("תאריך ושעה");
  return (
    <NativeDateTimeField
      type="datetime-local"
      value={value}
      min={min}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className={`h-11 ${className}`}
      display={
        <span dir={lang === "he" ? "rtl" : "ltr"} className={`truncate ${valid ? "text-ink" : "text-ink-soft"}`}>
          {label}
        </span>
      }
    />
  );
}
