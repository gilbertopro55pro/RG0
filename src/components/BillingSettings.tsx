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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = SUBSCRIPTION_PLANS[photographer.plan];
  const isActive = status === "active" || status === "trialing";

  const cancelSubscription = async () => {
    setCanceling(true);
    setError(null);
    const res = await fetch("/api/payplus/cancel", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "שגיאה בביטול המנוי");
      setCanceling(false);
      return;
    }
    setStatus("canceled");
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

      {error && <p className="text-xs text-rose mb-2">{error}</p>}

      {!isActive && (
        <Link href="/billing" className="block w-full text-center rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white">
          {status === "past_due" ? "עדכון אמצעי תשלום" : "הפעלת מנוי"}
        </Link>
      )}

      {isActive && (
        <div className="pt-3 mt-1 border-t border-line">
          {confirmingCancel ? (
            <div className="rounded-xl p-3 bg-[#FBEEEC]">
              <p className="text-xs mb-3 text-rose">
                לבטל את המנוי? הגישה למערכת תיפסק בתום מחזור החיוב הנוכחי. האירועים, הגלריות
                והחוזים שלכם יישמרו במערכת ויחכו לכם — הם לא נמחקים, ואפשר להפעיל את המנוי מחדש בכל עת.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancelSubscription}
                  disabled={canceling}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white disabled:opacity-60"
                >
                  {canceling ? "מבטל..." : "כן, בטל מנוי"}
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
            <button onClick={() => setConfirmingCancel(true)} className="w-full rounded-lg py-2.5 text-sm font-semibold text-rose">
              ביטול המנוי
            </button>
          )}
        </div>
      )}
    </div>
  );
}
