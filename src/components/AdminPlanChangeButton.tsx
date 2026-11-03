"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BodyPortal from "@/components/BodyPortal";
import { useModalEntered } from "@/lib/useModalEntered";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import {
  canChangeBilling,
  isAdminPriceChange,
  planChangeDecision,
  PLAN_CHANGE_REFUSAL_TEXT,
  renewsAutomatically,
  type PlanChangeAccount,
  type PlanChangeRefusal,
} from "@/lib/adminPlanChange";
import { billedCycleAmount, planCycleAmount } from "@/lib/billedAmount";
import { LOCK_AFTER_DAYS } from "@/lib/dunning";
import type { AdminPhotographerRow } from "@/app/admin/page";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// Admin dashboard › "שינוי מסלול" (owner's requests, 2026-11-03). Step 1: the plan, and whether the
// charge changes too (asked whenever it could). Step 2: a summary of exactly what will happen, and
// only then the change ("double confirmation"). The server (api/admin/plan) checks every rule again.

type Row = Pick<
  AdminPhotographerRow,
  "id" | "name" | "plan" | "subscription_status" | "has_recurring" | "cancel_at_period_end" | "pending_plan" | "pending_plan_effective_at" | "current_period_end" | "recurring_amount"
>;

type Billing = "keep" | "change";

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
  const lang = useLang();
  const router = useRouter();
  const entered = useModalEntered();
  const [step, setStep] = useState<"pick" | "confirm" | "done">("pick");
  const [target, setTarget] = useState<SubscriptionPlan | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneText, setDoneText] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem" });
  const account: PlanChangeAccount = {
    plan: row.plan,
    payplus_recurring_uid: row.has_recurring ? "on-file" : null,
    cancel_at_period_end: row.cancel_at_period_end,
    pending_plan: row.pending_plan,
    current_period_end: row.current_period_end,
  };
  const renews = renewsAutomatically(account);
  const charging = renews ? billedCycleAmount(row.plan, row.recurring_amount) : null;
  const asksBilling = target ? canChangeBilling(account, target, row.recurring_amount) : false;
  const keepDecision = target ? planChangeDecision(account, target, row.recurring_amount, false) : null;
  const changeDecision = target && asksBilling ? planChangeDecision(account, target, row.recurring_amount, true) : null;
  // When the question doesn't apply, the charge simply stays.
  const chosen: Billing | null = asksBilling ? billing : target ? "keep" : null;
  const decision = chosen === "change" ? changeDecision : chosen === "keep" ? keepDecision : null;
  const refusalText = (reason: PlanChangeRefusal) => t(PLAN_CHANGE_REFUSAL_TEXT[reason]);

  function pickTarget(key: SubscriptionPlan) {
    setTarget(key);
    // Picking the current plan only makes sense to align its price.
    setBilling(key === row.plan ? "change" : null);
    setError("");
  }

  async function post(body: Record<string, unknown>, onOk: () => void) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photographerId: row.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onOk();
        setStep("done");
        router.refresh();
      } else {
        setError(data.reason ? refusalText(data.reason as PlanChangeRefusal) : (data.error ?? t("השינוי נכשל")));
      }
    } catch {
      setError(t("השינוי נכשל, נסו שוב"));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!target || !decision?.ok) return;
    const d = decision;
    void post({ plan: target, changeBilling: !!d.billingChange }, () =>
      setDoneText(
        d.billingChange
          ? t("השינוי נשמר. המסלול כבר {plan}, ומהחידוש ב-{renewal} המחיר יהיה ₪{amount} לחודש.", {
              plan: t(SUBSCRIPTION_PLANS[d.plan].label),
              renewal: fmtDate(d.billingChange.renewalAt),
              amount: d.billingChange.amount,
            })
          : d.charging != null
            ? t("המסלול שונה ל{plan}. הוראת הקבע לא השתנתה: הלקוח ממשיך לשלם ₪{amount} {cycle}.", {
                plan: t(SUBSCRIPTION_PLANS[d.plan].label),
                amount: d.charging,
                cycle: t(cycleWord(row.plan)),
              })
            : t("המסלול שונה ל{plan}.", { plan: t(SUBSCRIPTION_PLANS[d.plan].label) })
      )
    );
  }

  function cancelPriceChange() {
    void post({ cancelPriceChange: true }, () => setDoneText(t("שינוי המחיר בוטל. הוראת הקבע ממשיכה לחייב כמו היום.")));
  }

  const card = "rounded-xl bg-chip px-3 py-2.5 text-sm";
  const choiceStyle = (selected: boolean) => ({
    borderColor: selected ? "var(--color-ink)" : "var(--color-line)",
    background: selected ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
  });

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
            <h2 className="text-lg font-bold font-display">
              {step === "confirm" ? t("אישור השינוי: {name}", { name: row.name }) : t("שינוי מסלול: {name}", { name: row.name })}
            </h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label={t("סגירה")} className="text-ink-soft text-xl leading-none px-1 disabled:opacity-50">
              ×
            </button>
          </div>

          {step === "done" ? (
            <>
              <p className="text-sm mb-4">{doneText}</p>
              <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-ink text-white font-bold text-sm">
                {t("סגירה")}
              </button>
            </>
          ) : step === "confirm" && target && decision?.ok ? (
            <>
              <p className="text-sm mb-3">{t("לפני שמשנים, זה בדיוק מה שיקרה:")}</p>
              <div className={`${card} space-y-2 mb-3`}>
                <div>
                  <div className="text-xs text-ink-soft">{t("מסלול")}</div>
                  <div className="font-semibold">
                    {decision.plan === row.plan
                      ? t("{plan} (ללא שינוי)", { plan: t(SUBSCRIPTION_PLANS[row.plan].label) })
                      : t("{from} ← {to}, מיד", { from: t(SUBSCRIPTION_PLANS[row.plan].label), to: t(SUBSCRIPTION_PLANS[decision.plan].label) })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-soft">{t("חיוב")}</div>
                  <div className="font-semibold">
                    {decision.billingChange
                      ? t("מהחידוש ב-{renewal}: ₪{amount} לחודש (היום ₪{now})", {
                          renewal: fmtDate(decision.billingChange.renewalAt),
                          amount: decision.billingChange.amount,
                          now: decision.charging ?? "",
                        })
                      : decision.charging != null
                        ? t("ללא שינוי: ₪{amount} {cycle}", { amount: decision.charging, cycle: t(cycleWord(row.plan)) })
                        : t("אין הוראת קבע, ולכן אין חיוב")}
                  </div>
                </div>
              </div>
              {decision.billingChange && (
                <ul className="text-xs text-ink-soft list-disc ps-4 space-y-1 mb-3">
                  <li>{t("ב-{date} הוראת הקבע הנוכחית ב-PayPlus מתבטלת, והלקוח מקבל במייל קישור לתשלום החודשי החדש.", { date: fmtDate(decision.billingChange.switchAt) })}</li>
                  <li>{t("אם לא ישלם: ביום החידוש תזכורת, ו-{days} ימים אחריו החשבון ננעל עד התשלום.", { days: LOCK_AFTER_DAYS })}</li>
                  <li>{t("עד אז אפשר לבטל את שינוי המחיר מכאן. הלקוח עצמו לא יכול לבטל אותו.")}</li>
                </ul>
              )}
              {!decision.billingChange && decision.priceDiffers && (
                <p className="text-xs text-ink-soft mb-3">
                  {t("הלקוח ימשיך לשלם ₪{amount}, ולא את המחיר של {plan}. במייל התזכורת ובהגדרות › מנוי יופיע ₪{amount}.", {
                    amount: decision.charging ?? "",
                    plan: t(SUBSCRIPTION_PLANS[decision.plan].label),
                  })}
                </p>
              )}
              {error && <p className="text-xs text-rose mb-2">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("pick")} disabled={busy} className="flex-1 h-11 rounded-xl border border-line bg-white font-semibold text-sm disabled:opacity-50">
                  {t("חזרה")}
                </button>
                <button type="button" onClick={save} disabled={busy} className="flex-[2] h-11 rounded-xl bg-ink text-white font-bold text-sm disabled:opacity-40">
                  {busy ? t("שומר...") : t("כן, לבצע את השינוי")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={`${card} mb-3`}>
                <div>{t("מסלול נוכחי: {plan}", { plan: t(SUBSCRIPTION_PLANS[row.plan].label) })}</div>
                <div className="text-xs text-ink-soft mt-0.5">
                  {charging != null
                    ? t("הוראת קבע פעילה: ₪{amount} {cycle}", { amount: charging, cycle: t(cycleWord(row.plan)) })
                    : row.subscription_status === "trialing"
                      ? t("בתקופת ניסיון. כשישלם, המסלול ייקבע לפי מה שישלם עליו.")
                      : t("אין הוראת קבע פעילה. כשישלם, המסלול ייקבע לפי מה שישלם עליו.")}
                </div>
              </div>

              {isAdminPriceChange(account) ? (
                <div className={card}>
                  <p className="mb-2">
                    {t("מתוזמן שינוי מחיר: מהחידוש ב-{renewal} ₪{amount} לחודש. הקישור לתשלום יישלח ב-{date}.", {
                      renewal: row.current_period_end ? fmtDate(row.current_period_end) : "",
                      amount: planCycleAmount(row.plan),
                      date: row.pending_plan_effective_at ? fmtDate(row.pending_plan_effective_at) : "",
                    })}
                  </p>
                  {error && <p className="text-xs text-rose mb-2">{error}</p>}
                  {confirmCancel ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmCancel(false)} disabled={busy} className="flex-1 h-10 rounded-lg border border-line bg-white text-sm font-semibold">
                        {t("חזרה")}
                      </button>
                      <button type="button" onClick={cancelPriceChange} disabled={busy} className="flex-[2] h-10 rounded-lg text-white text-sm font-bold disabled:opacity-40" style={{ background: "var(--color-rose)" }}>
                        {busy ? t("שומר...") : t("כן, לבטל את שינוי המחיר")}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm font-semibold text-rose">
                      {t("ביטול שינוי המחיר")}
                    </button>
                  )}
                </div>
              ) : row.pending_plan ? (
                <p className={card}>{refusalText("pending_switch")}</p>
              ) : (
                <>
                  <div className="text-xs font-semibold mb-1.5">{t("1. המסלול החדש")}</div>
                  <div className="space-y-1.5 mb-3" role="radiogroup" aria-label={t("מסלול חדש")}>
                    {PLAN_KEYS.map((key) => {
                      const current = key === row.plan;
                      const selectable = current
                        ? canChangeBilling(account, key, row.recurring_amount)
                        : planChangeDecision(account, key, row.recurring_amount, false).ok;
                      const info = SUBSCRIPTION_PLANS[key];
                      const price = info.annualAmount ?? info.pricePerMonth;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={target === key}
                          disabled={!selectable || busy}
                          onClick={() => pickTarget(key)}
                          className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm border text-start disabled:opacity-45"
                          style={{ ...choiceStyle(target === key), fontWeight: target === key ? 700 : 500 }}
                        >
                          <span>{t(info.label)}</span>
                          <span className="text-xs text-ink-soft shrink-0">
                            {current ? t("המסלול הנוכחי · ₪{price} {cycle}", { price, cycle: t(cycleWord(key)) }) : t("₪{price} {cycle}", { price, cycle: t(cycleWord(key)) })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {renews && <p className="text-xs text-ink-soft mb-3">{t("עם הוראת קבע אפשר לעבור רק למסלול עם אותו מחזור חיוב (חודשי או שנתי).")}</p>}

                  {target && asksBilling && (
                    <>
                      <div className="text-xs font-semibold mb-1.5">{t("2. לשנות גם את עלות החיוב?")}</div>
                      <div className="space-y-1.5 mb-3" role="radiogroup" aria-label={t("לשנות גם את עלות החיוב?")}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={billing === "keep"}
                          disabled={!keepDecision?.ok || busy}
                          onClick={() => setBilling("keep")}
                          className="w-full rounded-xl px-3 py-2.5 text-sm border text-start disabled:opacity-45"
                          style={choiceStyle(billing === "keep")}
                        >
                          <div className="font-semibold">{t("לא, החיוב נשאר")}</div>
                          <div className="text-xs text-ink-soft">{t("ימשיך לשלם ₪{amount} {cycle}, כמו היום.", { amount: charging ?? "", cycle: t(cycleWord(row.plan)) })}</div>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={billing === "change"}
                          disabled={!changeDecision?.ok || busy}
                          onClick={() => setBilling("change")}
                          className="w-full rounded-xl px-3 py-2.5 text-sm border text-start disabled:opacity-45"
                          style={choiceStyle(billing === "change")}
                        >
                          <div className="font-semibold">{t("כן, גם החיוב משתנה")}</div>
                          <div className="text-xs text-ink-soft">
                            {changeDecision?.ok && changeDecision.billingChange
                              ? t("מהחידוש ב-{renewal} ישלם ₪{amount} לחודש.", { renewal: fmtDate(changeDecision.billingChange.renewalAt), amount: changeDecision.billingChange.amount })
                              : changeDecision && !changeDecision.ok
                                ? refusalText(changeDecision.reason)
                                : ""}
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                  {target && !asksBilling && renews && SUBSCRIPTION_PLANS[row.plan].cycleMonths > 1 && (
                    <p className="text-xs text-ink-soft mb-3">{refusalText("annual_billing")}</p>
                  )}

                  {error && <p className="text-xs text-rose mb-2">{error}</p>}
                  <button
                    type="button"
                    onClick={() => setStep("confirm")}
                    disabled={!decision?.ok || busy}
                    className="w-full h-11 rounded-xl bg-ink text-white font-bold text-sm disabled:opacity-40"
                  >
                    {!target ? t("בחרו מסלול") : asksBilling && !billing ? t("בחרו אם החיוב משתנה") : t("המשך לאישור")}
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
