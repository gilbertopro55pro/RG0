"use client";

import { useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

// Both cards show a per-month figure at all times — switching the toggle swaps which cycle's
// pricePerMonth is shown (and, for annual, the flat billed-total note), rather than switching
// between "a monthly price" and "an annual total" (the usual SaaS pattern: the toggle changes
// which number you're looking at, not what UNIT that number is in).
export default function PricingToggle() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");

  const basicKey: SubscriptionPlan = cycle === "annual" ? "basic_annual" : "basic_monthly";
  const flowKey: SubscriptionPlan = cycle === "annual" ? "annual" : "monthly";
  const frameKey: SubscriptionPlan = cycle === "annual" ? "studio_pro_annual" : "studio_pro_monthly";
  const basic = SUBSCRIPTION_PLANS[basicKey];
  const flow = SUBSCRIPTION_PLANS[flowKey];
  const frame = SUBSCRIPTION_PLANS[frameKey];

  return (
    <div>
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-chip">
          <button
            onClick={() => setCycle("monthly")}
            className="rounded-full px-4 py-2 text-xs font-semibold transition-colors"
            style={{
              background: cycle === "monthly" ? "var(--color-amber-deep)" : "transparent",
              color: cycle === "monthly" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            חודשי
          </button>
          <button
            onClick={() => setCycle("annual")}
            className="rounded-full px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-1.5"
            style={{
              background: cycle === "annual" ? "var(--color-amber-deep)" : "transparent",
              color: cycle === "annual" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            שנתי
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{
                background: cycle === "annual" ? "rgba(255,255,255,0.25)" : "var(--color-amber-bg)",
                color: cycle === "annual" ? "var(--color-on-accent)" : "var(--color-amber-deep)",
              }}
            >
              חוסכים
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="rounded-2xl p-7 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold text-ink-soft mb-2 font-display">{basic.tierName}</div>
          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 bg-amber-bg text-amber-deep">
            מסלול כניסה
          </span>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold font-display">₪{basic.pricePerMonth}</span>
            <span className="text-base text-ink-soft line-through">₪{basic.regularPricePerMonth}</span>
            <span className="text-xs text-ink-soft">/ לחודש</span>
          </div>
          <p className="text-xs text-ink-soft mb-2">{basic.note}</p>
          <p className="text-xs text-ink-soft mb-6">100GB אחסון, שמירת גלריה עד 14 יום</p>
          <Link href="/signup" className="block w-full text-center rounded-xl py-3 text-sm font-semibold bg-card border border-line shadow-card">
            בחירת {basic.tierName}
          </Link>
        </div>
        <div className="rounded-2xl p-7 bg-card border border-line shadow-card">
          <div className="text-sm font-semibold text-ink-soft mb-2 font-display">{flow.tierName}</div>
          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 bg-amber-bg text-amber-deep">
            מחיר השקה
          </span>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold font-display">₪{flow.pricePerMonth}</span>
            <span className="text-base text-ink-soft line-through">₪{flow.regularPricePerMonth}</span>
            <span className="text-xs text-ink-soft">/ לחודש</span>
          </div>
          <p className="text-xs text-ink-soft mb-2">{flow.note}</p>
          <p className="text-xs text-ink-soft mb-6">750GB אחסון, עד 2 חברי צוות, שמירת גלריה עד 90 יום</p>
          <Link href="/signup" className="block w-full text-center rounded-xl py-3 text-sm font-semibold bg-card border border-line shadow-card">
            בחירת {flow.tierName}
          </Link>
        </div>
        <div className="rounded-2xl p-7 relative bg-white border-[1.5px] border-amber shadow-card">
          {frame.badge && (
            <span className="absolute -top-2.5 right-6 text-[10px] px-2.5 py-0.5 rounded-full bg-amber text-white">
              {frame.badge}
            </span>
          )}
          <div className="text-sm font-semibold text-ink-soft mb-2 font-display">{frame.tierName}</div>
          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 bg-amber-bg text-amber-deep">
            מחיר השקה
          </span>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold font-display">₪{frame.pricePerMonth}</span>
            <span className="text-base text-ink-soft line-through">₪{frame.regularPricePerMonth}</span>
            <span className="text-xs text-ink-soft">/ לחודש</span>
          </div>
          <p className="text-xs text-ink-soft mb-2">{frame.note}</p>
          <p className="text-xs text-ink-soft mb-6">אחסון ללא הגבלה, עד 3 חברי צוות, שמירת גלריה עד שנה, ומיתוג מלא: לוגו וצבע מותג על כל הגלריות</p>
          <Link href="/signup" className="block w-full text-center rounded-xl py-3 text-sm font-semibold bg-amber-deep text-white">
            בחירת {frame.tierName}
          </Link>
        </div>
      </div>
      <p className="text-center text-xs text-ink-soft mt-6">ביטול בכל עת, בלי התחייבות</p>
    </div>
  );
}
