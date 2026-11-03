"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BodyPortal from "@/components/BodyPortal";
import { useModalEntered } from "@/lib/useModalEntered";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { planChangeDecision, PLAN_CHANGE_REFUSAL_TEXT, renewsAutomatically, type PlanChangeAccount } from "@/lib/adminPlanChange";
import { billedCycleAmount } from "@/lib/billedAmount";
import type { AdminPhotographerRow } from "@/app/admin/page";
import { useT } from "@/i18n/client";

// Admin dashboard › "שינוי מסלול" (owner's request, 2026-11-03). Picks a plan for the account; the
// server (api/admin/plan) checks the same rules again. Only the plan changes: a standing order in
// PayPlus keeps charging what it charges, and the dialog says how much.

type Row = Pick<AdminPhotographerRow, "id" | "name" | "plan" | "subscription_status" | "has_recurring" | "cancel_at_period_end" | "pending_plan" | "recurring_amount">;

const PLAN_KEYS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];

function cycleWord(plan: SubscriptionPlan): string {
  return SUBSCRIPTION_PLANS[plan].cycleMonths > 1 ? "לשנה" : "לחודש";
}

export default function AdminPlanChangeButton({ row, compact = false }: { row: Row; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`font-semibold rounded-lg border border-line bg-white shrink-0 ${compact ? "text-xs h-8 px-2.5" : "text-[13px] h-9 px-3"}`}
      >
        {t("שינוי מסלול")}
      </button>
      {open && <PlanDialog row={row} onClose={() => setOpen(false)} />}
    </>
  );
}

function PlanDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const entered = useModalEntered();
  const [target, setTarget] = useState<SubscriptionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const account: PlanChangeAccount = {
    plan: row.plan,
    payplus_recurring_uid: row.has_recurring ? "on-file" : null,
    cancel_at_period_end: row.cancel_at_period_end,
    pending_plan: row.pending_plan,
  };
  const renews = renewsAutomatically(account);
  const charging = renews ? billedCycleAmount(row.plan, row.recurring_amount) : null;
  const decision = target ? planChangeDecision(account, target, row.recurring_amount) : null;

  async function save() {
    if (!target || !decision?.ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photographerId: row.id, plan: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(target);
        router.refresh();
      } else {
        setError(data.reason ? t(PLAN_CHANGE_REFUSAL_TEXT[data.reason as keyof typeof PLAN_CHANGE_REFUSAL_TEXT]) : (data.error ?? t("השינוי נכשל")));
      }
    } catch {
      setError(t("השינוי נכשל, נסו שוב"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
        style={{
          background: "rgba(28, 27, 25, 0.45)",
          backdropFilter: entered ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: entered ? "blur(12px)" : "blur(0px)",
          transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
        }}
        onClick={() => !busy && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("שינוי מסלול")}
          className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-paper shadow-sheet p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold font-display">{t("שינוי מסלול: {name}", { name: row.name })}</h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label={t("סגירה")} className="text-ink-soft text-xl leading-none px-1 disabled:opacity-50">
              ×
            </button>
          </div>

          {done ? (
            <>
              <p className="text-sm mb-2">{t("המסלול שונה ל{plan}.", { plan: t(SUBSCRIPTION_PLANS[done].label) })}</p>
              {charging != null && (
                <p className="text-sm mb-4 text-ink-soft">
                  {t("הוראת הקבע לא השתנתה: הלקוח ממשיך לשלם ₪{amount} {cycle}.", { amount: charging, cycle: t(cycleWord(row.plan)) })}
                </p>
              )}
              <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-ink text-white font-bold text-sm">
                {t("סגירה")}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-chip px-3 py-2.5 text-sm mb-3">
                <div>{t("מסלול נוכחי: {plan}", { plan: t(SUBSCRIPTION_PLANS[row.plan].label) })}</div>
                <div className="text-xs text-ink-soft mt-0.5">
                  {charging != null
                    ? t("הוראת קבע פעילה: ₪{amount} {cycle}", { amount: charging, cycle: t(cycleWord(row.plan)) })
                    : row.subscription_status === "trialing"
                      ? t("בתקופת ניסיון. כשישלם, המסלול ייקבע לפי מה שישלם עליו.")
                      : t("אין הוראת קבע פעילה. כשישלם, המסלול ייקבע לפי מה שישלם עליו.")}
                </div>
              </div>

              {row.pending_plan ? (
                <p className="text-sm rounded-xl px-3 py-2.5 bg-chip">{t(PLAN_CHANGE_REFUSAL_TEXT.pending_switch)}</p>
              ) : (
                <>
                  <div className="space-y-1.5 mb-3" role="radiogroup" aria-label={t("מסלול חדש")}>
                    {PLAN_KEYS.map((key) => {
                      const current = key === row.plan;
                      const blocked = !current && planChangeDecision(account, key, row.recurring_amount).ok === false;
                      const info = SUBSCRIPTION_PLANS[key];
                      const price = info.annualAmount ?? info.pricePerMonth;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={target === key}
                          disabled={current || blocked || busy}
                          onClick={() => setTarget(key)}
                          className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm border text-start disabled:opacity-45"
                          style={{
                            borderColor: target === key ? "var(--color-ink)" : "var(--color-line)",
                            background: target === key ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
                            fontWeight: target === key ? 700 : 500,
                          }}
                        >
                          <span>{t(info.label)}</span>
                          <span className="text-xs text-ink-soft shrink-0">
                            {current ? t("המסלול הנוכחי") : t("₪{price} {cycle}", { price, cycle: t(cycleWord(key)) })}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {renews && <p className="text-xs text-ink-soft mb-3">{t("עם הוראת קבע אפשר לעבור רק למסלול עם אותו מחזור חיוב (חודשי או שנתי).")}</p>}

                  {decision?.ok && (
                    <p className="text-sm rounded-xl px-3 py-2.5 mb-3 bg-chip">
                      {decision.keepsCharging != null
                        ? decision.priceDiffers
                          ? t("רק המסלול משתנה. הוראת הקבע לא משתנה: הלקוח ימשיך לשלם ₪{amount} {cycle}, ולא את המחיר של {plan}. במייל התזכורת ובהגדרות › מנוי יופיע ₪{amount}.", {
                              amount: decision.keepsCharging,
                              cycle: t(cycleWord(row.plan)),
                              plan: t(SUBSCRIPTION_PLANS[decision.plan].label),
                            })
                          : t("רק המסלול משתנה. הוראת הקבע לא משתנה: הלקוח ימשיך לשלם ₪{amount} {cycle}.", { amount: decision.keepsCharging, cycle: t(cycleWord(row.plan)) })
                        : t("המסלול משתנה מיד, והכלים של המסלול נפתחים או נסגרים לפיו. אין חיוב ואין שינוי ב-PayPlus.")}
                    </p>
                  )}

                  {error && <p className="text-xs text-rose mb-2">{error}</p>}
                  <button
                    type="button"
                    onClick={save}
                    disabled={!decision?.ok || busy}
                    className="w-full h-11 rounded-xl bg-ink text-white font-bold text-sm disabled:opacity-40"
                  >
                    {busy
                      ? t("שומר...")
                      : target
                        ? t("שינוי ל{plan}", { plan: t(SUBSCRIPTION_PLANS[target].label) })
                        : t("בחרו מסלול")}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
