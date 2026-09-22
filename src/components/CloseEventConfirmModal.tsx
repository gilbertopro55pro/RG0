"use client";

import { useEffect, useState } from "react";
import { monthLabel, type ClosePreview } from "@/lib/closeEvent";

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
      if (!res.ok || !data) setError(data?.error ?? "שגיאה בטעינת פרטי הסגירה");
      else setPreview(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

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
        setError(data.error ?? "שגיאה בסגירת האירוע");
        return;
      }
      await onClosed(data.closedAt);
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number) => `₪${n.toLocaleString("he-IL")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={() => !busy && onCancel()}
    >
      <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        {step === "confirm" || !preview ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">לסגור את האירוע?</h2>
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              סגירת האירוע מסמנת שהעבודה עליו הסתיימה. האירוע יעבור לרשימת ״הושלמו״ ולא יופיע יותר ברשימת האירועים הפעילים.
            </p>
            {preview && preview.openStagesCount > 0 && (
              <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs leading-relaxed bg-amber-bg text-amber-deep">
                שימו לב: יש עדיין {preview.openStagesCount === 1 ? "שלב אחד פתוח" : `${preview.openStagesCount} שלבים פתוחים`} שלא סומנו כבוצעו. סגירת האירוע לא
                תסמן אותם — הם יישארו פתוחים כפי שהם.
              </div>
            )}
            {preview && preview.remaining > 0 && (
              <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs leading-relaxed bg-chip text-ink">
                {preview.hasPartialPayment
                  ? `סומן תשלום חלקי על היתרה. החלק שנותר לתשלום (${money(preview.remaining)}) יתווסף לגרף ההכנסות של חודש סגירת האירוע — ${monthLabel(preview.closingMonth)}. התשלום החלקי נשאר בחודש שבו נרשם.`
                  : preview.needsMonthChoice
                    ? `היתרה (${money(preview.remaining)}) לא סומנה כשולמה. בשלב הבא תבחרו באיזה חודש להוסיף אותה לגרף ההכנסות.`
                    : `היתרה שלא סומנה כשולמה (${money(preview.remaining)}) תתווסף לגרף ההכנסות של ${monthLabel(preview.closingMonth)}.`}
              </div>
            )}
            <p className="text-xs text-ink-soft mb-5 leading-relaxed">
              שום דבר לא נמחק. אפשר לשחזר את האירוע בכל עת: להיכנס לכרטיס האירוע וללחוץ על ״שחזור אירוע״.
            </p>
            {error && <p className="text-xs text-rose mb-3">{error}</p>}
            <div className="flex gap-2">
              {preview?.needsMonthChoice ? (
                <button onClick={() => setStep("month")} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                  המשך
                </button>
              ) : (
                <button onClick={close} disabled={busy || !preview} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                  {busy ? "סוגר..." : preview ? "כן, לסגור את האירוע" : "טוען..."}
                </button>
              )}
              <button onClick={onCancel} disabled={busy} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                ביטול
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">באיזה חודש להוסיף את היתרה?</h2>
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              היתרה של {money(preview.remaining)} לא סומנה כשולמה. כל הסכום יתווסף לגרף ההכנסות של החודש שתבחרו:
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
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm text-right border-2"
                  style={{
                    borderColor: choice === value ? "var(--color-amber-deep)" : "var(--color-line)",
                    background: choice === value ? "var(--color-amber-bg)" : "#fff",
                  }}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="text-ink-soft">{monthLabel(month)}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-soft mb-4 leading-relaxed">רק אחרי האישור הסופי האירוע ייסגר במערכת.</p>
            {error && <p className="text-xs text-rose mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={close} disabled={busy || !choice} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {busy ? "סוגר..." : "אישור סופי וסגירת האירוע"}
              </button>
              <button onClick={() => setStep("confirm")} disabled={busy} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                חזרה
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
