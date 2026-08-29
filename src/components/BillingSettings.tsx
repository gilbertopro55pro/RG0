"use client";

import { useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import type { Photographer, SubscriptionStatus } from "@/lib/types";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "פעיל",
  trialing: "בתקופת ניסיון",
  past_due: "התשלום נכשל",
  canceled: "בוטל",
  incomplete: "ממתין להשלמת תשלום",
};

// current_period_end is only set once a real PayPlus charge webhook has fired — an account still
// in its first, not-yet-billed period (or one activated manually) would otherwise show no date at
// all. Falling back to created_at + one plan period keeps the date meaningful in every case.
function computePeriodEnd(photographer: Photographer): Date {
  if (photographer.current_period_end) return new Date(photographer.current_period_end);
  const start = new Date(photographer.created_at);
  return new Date(start.getFullYear(), start.getMonth() + SUBSCRIPTION_PLANS[photographer.plan].cycleMonths, start.getDate());
}

export default function BillingSettings({ photographer }: { photographer: Photographer }) {
  const [status, setStatus] = useState(photographer.subscription_status);
  const [autoRenew, setAutoRenew] = useState(photographer.auto_renew);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(photographer.cancel_at_period_end);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canceledAccessUntil, setCanceledAccessUntil] = useState<string | null>(null);
  const plan = SUBSCRIPTION_PLANS[photographer.plan];
  const isActive = status === "active" || status === "trialing";
  const periodEndHe = computePeriodEnd(photographer).toLocaleDateString("he-IL");
  const autoRenewOn = autoRenew && !cancelAtPeriodEnd;

  const otherPlanKeys = (Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[]).filter((key) => key !== photographer.plan);
  const [pendingPlan, setPendingPlan] = useState(photographer.pending_plan);
  const [pendingPlanEffectiveAt, setPendingPlanEffectiveAt] = useState(photographer.pending_plan_effective_at);
  const [switchTarget, setSwitchTarget] = useState<SubscriptionPlan | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const isCurrentLongCycle = plan.cycleMonths > 1;
  const switchExplanation = (targetKey: SubscriptionPlan) => {
    const target = SUBSCRIPTION_PLANS[targetKey];
    return isCurrentLongCycle
      ? `כבר שילמת מראש על מחזור החיוב הנוכחי — הגישה שלך ממשיכה כרגיל בלי שינוי עד עשרה חודשים ממועד החיוב האחרון. רק בשני החודשים האחרונים של אותה תקופה (שבמסלול הנוכחי היו חינמיים) תחויב/י ${target.pricePerMonth}₪ בכל חודש, ומשם ואילך ימשיך חיוב לפי מסלול ${target.label}.`
      : `המחזור הנוכחי שלך (עד ${periodEndHe}) לא משתנה — רק בחיוב הבא תחויב/י לפי מסלול ${target.label} (${target.note}).`;
  };

  const requestPlanSwitch = async (targetKey: SubscriptionPlan) => {
    setSwitching(true);
    setSwitchError(null);
    const res = await fetch("/api/payplus/switch-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPlan: targetKey }),
    });
    const data = await res.json().catch(() => ({}));
    setSwitching(false);
    if (!res.ok) {
      setSwitchError(data.error ?? "שגיאה בתזמון החלפת המסלול");
      return;
    }
    setPendingPlan(targetKey);
    setPendingPlanEffectiveAt(data.effectiveAt);
    setSwitchTarget(null);
  };

  const cancelPendingSwitch = async () => {
    setSwitching(true);
    setSwitchError(null);
    const res = await fetch("/api/payplus/switch-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel: true }),
    });
    setSwitching(false);
    if (!res.ok) {
      setSwitchError("שגיאה בביטול ההחלפה המתוזמנת");
      return;
    }
    setPendingPlan(null);
    setPendingPlanEffectiveAt(null);
  };

  // Turning the switch off IS the cancellation — the only way to guarantee no future charge is
  // to actually cancel the PayPlus recurring charge, not just flip a local flag. Turning it back
  // on isn't offered here: once the recurring charge is gone, re-subscribing goes through
  // /billing like any new signup.
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
    const accessUntil = data.current_period_end ? new Date(data.current_period_end) : computePeriodEnd(photographer);
    setCanceledAccessUntil(accessUntil.toLocaleDateString("he-IL"));
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

      {isActive && (
        <p className="text-xs mb-3 text-ink-soft">
          {cancelAtPeriodEnd
            ? `החידוש האוטומטי כבוי — הגישה למערכת פעילה עד ${periodEndHe}.`
            : `מחזור החיוב הנוכחי (${plan.label}) מסתיים ומתחדש אוטומטית ב-${periodEndHe}.`}
        </p>
      )}

      {canceledAccessUntil && (
        <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs bg-[#FBEEEC] text-rose font-medium">
          החידוש האוטומטי כובה. הגישה למערכת תישאר פעילה עד {canceledAccessUntil}.
        </div>
      )}

      {error && <p className="text-xs text-rose mb-2">{error}</p>}

      {!isActive && (
        <Link href="/billing" className="block w-full text-center rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white">
          {status === "past_due" ? "עדכון אמצעי תשלום" : "הפעלת מנוי"}
        </Link>
      )}

      {isActive && (
        <div className="pt-3 mt-1 border-t border-line">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold">ביטול המנוי</span>
              <p className="text-[11px] text-ink-soft mt-0.5">
                {autoRenewOn
                  ? "מכבה את החידוש האוטומטי — הגישה נשארת פעילה עד תום המחזור הנוכחי"
                  : "החידוש האוטומטי כבר כבוי"}
              </p>
            </div>
            <button
              onClick={() => setConfirmingCancel(true)}
              disabled={!autoRenewOn || canceling}
              className="shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold text-rose border border-rose disabled:opacity-50 disabled:border-line disabled:text-ink-soft"
            >
              ביטול מנוי
            </button>
          </div>

          {confirmingCancel && (
            <div className="rounded-xl p-3 mt-3 bg-[#FBEEEC]">
              <p className="text-xs font-semibold text-rose mb-1.5">לבטל את המנוי?</p>
              <p className="text-xs mb-3 text-rose">
                החיוב הבא יבוטל, אך הגישה למערכת תישאר פעילה עד תום מחזור החיוב הנוכחי ({periodEndHe}).
                האירועים, הגלריות והחוזים שלכם יישמרו במערכת ויחכו לכם — הם לא נמחקים, ואפשר להפעיל את
                המנוי מחדש בכל עת. הפעולה הזו סופית ולא ניתנת לביטול עצמי — לחידוש המנוי תצטרכו לעבור
                תשלום חדש.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancelAutoRenew}
                  disabled={canceling}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white disabled:opacity-60"
                >
                  {canceling ? "מבטל..." : "כן, לבטל את המנוי"}
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  disabled={canceling}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
                >
                  לא, השארה פעיל
                </button>
              </div>
            </div>
          )}

          {!cancelAtPeriodEnd && (
            <div className="pt-3 mt-3 border-t border-line">
              {pendingPlan ? (
                <div className="rounded-xl px-3.5 py-2.5 bg-amber-bg">
                  <p className="text-xs text-amber-deep mb-2">
                    מתוזמן מעבר למסלול {SUBSCRIPTION_PLANS[pendingPlan].label} ב-
                    {pendingPlanEffectiveAt ? new Date(pendingPlanEffectiveAt).toLocaleDateString("he-IL") : ""}.
                  </p>
                  <button
                    onClick={cancelPendingSwitch}
                    disabled={switching}
                    className="text-xs font-semibold text-rose disabled:opacity-60"
                  >
                    {switching ? "מבטל..." : "ביטול ההחלפה המתוזמנת"}
                  </button>
                </div>
              ) : switchTarget ? (
                <div className="rounded-xl p-3 bg-[#F1EFE9]">
                  <p className="text-xs mb-3 text-ink-soft">{switchExplanation(switchTarget)}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => requestPlanSwitch(switchTarget)}
                      disabled={switching}
                      className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                    >
                      {switching ? "מתזמן..." : `כן, מעבר למסלול ${SUBSCRIPTION_PLANS[switchTarget].label}`}
                    </button>
                    <button
                      onClick={() => setSwitchTarget(null)}
                      disabled={switching}
                      className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-ink-soft">מעבר למסלול אחר:</p>
                  {otherPlanKeys.map((key) => (
                    <button
                      key={key}
                      onClick={() => setSwitchTarget(key)}
                      className="w-full text-center text-xs font-semibold text-ink-soft underline block"
                    >
                      {SUBSCRIPTION_PLANS[key].label} (₪{SUBSCRIPTION_PLANS[key].pricePerMonth}/חודש)
                    </button>
                  ))}
                </div>
              )}
              {switchError && <p className="text-xs text-rose mt-2">{switchError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
