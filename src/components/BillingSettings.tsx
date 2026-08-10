"use client";

import { useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { Photographer, SubscriptionStatus } from "@/lib/types";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "פעיל",
  trialing: "בתקופת ניסיון",
  past_due: "התשלום נכשל",
  canceled: "בוטל",
  incomplete: "ממתין להשלמת תשלום",
};

export default function BillingSettings({ photographer }: { photographer: Photographer }) {
  const [status, setStatus] = useState(photographer.subscription_status);
  const [autoRenew, setAutoRenew] = useState(photographer.auto_renew);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(photographer.cancel_at_period_end);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = SUBSCRIPTION_PLANS[photographer.plan];
  const isActive = status === "active" || status === "trialing";
  const periodEndHe = photographer.current_period_end
    ? new Date(photographer.current_period_end).toLocaleDateString("he-IL")
    : null;

  // A "turn auto-renew off" toggle and "cancel subscription" are the same operation under the
  // hood — the only way to guarantee no future charge is to actually cancel the PayPlus
  // recurring charge, so both paths call this. Turning auto-renew back on isn't offered here:
  // once the recurring charge is gone, re-subscribing goes through /billing like any new signup.
  const cancelAutoRenew = async () => {
    setCanceling(true);
    setError(null);
    const res = await fetch("/api/payplus/cancel", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "שגיאה בביטול המנוי");
      setCanceling(false);
      return;
    }
    setAutoRenew(false);
    setCancelAtPeriodEnd(true);
    setConfirmingCancel(false);
    setCanceling(false);
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">מנוי</span>
      </div>
      <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 mb-2" style={{ background: "var(--color-chip)" }}>
        <span>
          מסלול {plan.label} · ₪{plan.pricePerMonth}/חודש
        </span>
        <span style={{ color: isActive ? "var(--color-sage)" : "var(--color-rose)", fontWeight: 600 }}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {isActive && periodEndHe && (
        <p className="text-xs mb-3 text-ink-soft">
          {cancelAtPeriodEnd
            ? `החידוש האוטומטי כבוי — הגישה למערכת פעילה עד ${periodEndHe}.`
            : `מחזור החיוב הנוכחי מסתיים ומתחדש אוטומטית ב-${periodEndHe}.`}
        </p>
      )}

      {error && <p className="text-xs text-rose mb-2">{error}</p>}

      {!isActive && (
        <Link href="/billing" className="block w-full text-center rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white">
          {status === "past_due" ? "עדכון אמצעי תשלום" : "הפעלת מנוי"}
        </Link>
      )}

      {isActive && (
        <div className="pt-3 mt-1 border-t border-line">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-ink-soft">חידוש אוטומטי</span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: autoRenew && !cancelAtPeriodEnd ? "var(--color-sage-bg)" : "var(--color-chip)",
                color: autoRenew && !cancelAtPeriodEnd ? "var(--color-sage)" : "var(--color-ink-soft)",
              }}
            >
              {autoRenew && !cancelAtPeriodEnd ? "פעיל ✓" : "כבוי"}
            </span>
          </div>

          {confirmingCancel ? (
            <div className="rounded-xl p-3 bg-[#FBEEEC]">
              <p className="text-xs mb-3 text-rose">
                לכבות את החידוש האוטומטי? החיוב הבא יבוטל, אך הגישה למערכת תישאר פעילה עד תום מחזור החיוב
                הנוכחי{periodEndHe ? ` (${periodEndHe})` : ""}. האירועים, הגלריות והחוזים שלכם יישמרו
                במערכת ויחכו לכם — הם לא נמחקים, ואפשר להפעיל את המנוי מחדש בכל עת.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancelAutoRenew}
                  disabled={canceling}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white disabled:opacity-60"
                >
                  {canceling ? "מבטל..." : "כן, כבה חידוש אוטומטי"}
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  disabled={canceling}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            !cancelAtPeriodEnd && (
              <button onClick={() => setConfirmingCancel(true)} className="w-full rounded-lg py-2.5 text-sm font-semibold text-rose">
                ביטול המנוי
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
