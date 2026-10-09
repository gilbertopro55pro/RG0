"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ClosePreview } from "@/lib/closeEvent";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// Centered flow shown before an event is closed — shared by the event card and the home-screen
// events list. Closing never touches stages (open ones stay open) and can be undone from the event
// card. It also settles the unpaid balance for the revenue views: a partial payment's remainder
// always lands in the closing month; a fully unpaid balance goes to the closing month too unless
// the event was saved in an earlier month, in which case a second step lets the photographer pick
// which month gets it — and only its final confirmation actually closes the event.
export default function CloseEventConfirmModal({
  eventId,
  onClosed,
  onCancel,
}: {
  eventId: string;
  onClosed: (closedAt: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = dateLocale(useLang());
  // Same as lib/closeEvent monthLabel, in the UI language.
  const monthLabel = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  };
  const [preview, setPreview] = useState<ClosePreview | null>(null);
  const [step, setStep] = useState<"confirm" | "month">("confirm");
  const [choice, setChoice] = useState<"created" | "closing" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/events/${eventId}/close`);
      const data = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !data) setError(data?.error ? t(data.error) : t("שגיאה בטעינת פרטי הסגירה"));
      else setPreview(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, t]);

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closed: true, ...(choice ? { balanceMonth: choice } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ? t(data.error) : t("שגיאה בסגירת האירוע"));
        return;
      }
      await onClosed(data.closedAt);
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number) => `₪${n.toLocaleString(locale)}`;

  // Rendered at the end of <body>, not where the caller puts it (owner's report, 2026-10-09: on the
  // home screen the confirm button flickered and closing didn't work). The home list wraps its rows
  // in a frosted .bg-card with overflow-hidden, and an ancestor with backdrop-filter becomes the box
  // a fixed element is placed in: the overlay was squeezed into the list's own height and clipped,
  // cutting off the buttons, with blur nested in blur on top.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={() => !busy && onCancel()}
    >
      <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        {step === "confirm" || !preview ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{t("לסגור את האירוע?")}</h2>
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              {t("סגירת האירוע מסמנת שהעבודה עליו הסתיימה. האירוע יעבור לרשימת ״הושלמו״ ולא יופיע יותר ברשימת האירועים הפעילים.")}
            </p>
            {preview && preview.openStagesCount > 0 && (
              <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs leading-relaxed bg-amber-bg text-amber-deep">
                {preview.openStagesCount === 1
                  ? t("שימו לב: יש עדיין שלב אחד פתוח שלא סומן כבוצע. סגירת האירוע לא תסמן אותו. הוא יישאר פתוח כפי שהוא.")
                  : t("שימו לב: יש עדיין {n} שלבים פתוחים שלא סומנו כבוצעו. סגירת האירוע לא תסמן אותם. הם יישארו פתוחים כפי שהם.", { n: preview.openStagesCount })}
              </div>
            )}
            {preview && preview.remaining > 0 && (
              <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs leading-relaxed bg-chip text-ink">
                {preview.hasPartialPayment
                  ? t("סומן תשלום חלקי על היתרה. החלק שנותר לתשלום ({amount}) יתווסף לגרף ההכנסות של חודש סגירת האירוע, {month}. התשלום החלקי נשאר בחודש שבו נרשם.", { amount: money(preview.remaining), month: monthLabel(preview.closingMonth) })
                  : preview.needsMonthChoice
                    ? t("היתרה ({amount}) לא סומנה כשולמה. בשלב הבא תבחרו באיזה חודש להוסיף אותה לגרף ההכנסות.", { amount: money(preview.remaining) })
                    : t("היתרה שלא סומנה כשולמה ({amount}) תתווסף לגרף ההכנסות של {month}.", { amount: money(preview.remaining), month: monthLabel(preview.closingMonth) })}
              </div>
            )}
            <p className="text-xs text-ink-soft mb-5 leading-relaxed">
              {t("שום דבר לא נמחק. אפשר לשחזר את האירוע בכל עת: להיכנס לכרטיס האירוע וללחוץ על ״שחזור אירוע״.")}
            </p>
            {error && <p className="text-xs text-rose mb-3">{error}</p>}
            <div className="flex gap-2">
              {preview?.needsMonthChoice ? (
                <button onClick={() => setStep("month")} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                  {t("המשך")}
                </button>
              ) : (
                <button onClick={close} disabled={busy || !preview} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                  {busy ? t("סוגר...") : preview ? t("כן, לסגור את האירוע") : t("טוען...")}
                </button>
              )}
              <button onClick={onCancel} disabled={busy} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                {t("ביטול")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{t("באיזה חודש להוסיף את היתרה?")}</h2>
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              {t("היתרה של {amount} לא סומנה כשולמה. כל הסכום יתווסף לגרף ההכנסות של החודש שתבחרו:", { amount: money(preview.remaining) })}
            </p>
            <div className="space-y-2 mb-4">
              {(
                [
                  ["created", "חודש שמירת האירוע", preview.createdMonth],
                  ["closing", "חודש סגירת האירוע", preview.closingMonth],
                ] as const
              ).map(([value, label, month]) => (
                <button
                  key={value}
                  onClick={() => setChoice(value)}
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm text-start border-2"
                  style={{
                    borderColor: choice === value ? "var(--color-amber-deep)" : "var(--color-line)",
                    background: choice === value ? "var(--color-amber-bg)" : "var(--color-input-bg)",
                  }}
                >
                  <span className="font-semibold">{t(label)}</span>
                  <span className="text-ink-soft">{monthLabel(month)}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-soft mb-4 leading-relaxed">{t("רק אחרי האישור הסופי האירוע ייסגר במערכת.")}</p>
            {error && <p className="text-xs text-rose mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={close} disabled={busy || !choice} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {busy ? t("סוגר...") : t("אישור סופי וסגירת האירוע")}
              </button>
              <button onClick={() => setStep("confirm")} disabled={busy} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                {t("חזרה")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
