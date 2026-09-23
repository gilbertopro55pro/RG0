"use client";

import { useState } from "react";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan, type SubscriptionTier } from "@/lib/stages";
import Spinner from "@/components/Spinner";

const TIER_LABEL: Record<SubscriptionTier, string> = {
  basic: "פרו סטארט",
  standard: "פרו",
  studio_pro: "פרו+",
};
const TIER_ORDER: SubscriptionTier[] = ["basic", "standard", "studio_pro"];
const TIER_NOTE: Partial<Record<SubscriptionTier, string>> = {
  basic: "100GB אחסון, עד חבר צוות אחד, שמירת גלריה עד 14 יום, מסלול כניסה, אפשר לשדרג בכל עת.",
  standard: "750GB אחסון, עד 2 חברי צוות, שמירת גלריה עד 90 יום.",
  studio_pro: "אחסון ללא הגבלה, עד 3 חברי צוות, שמירת גלריה עד שנה, ומיתוג מלא: לוגו וצבע מותג משלכם על כל הגלריות ללקוחות.",
};

function plansForTier(tier: SubscriptionTier): SubscriptionPlan[] {
  return (Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[]).filter((key) => SUBSCRIPTION_PLANS[key].tier === tier);
}

export default function BillingPlanSelector({ initialPlan }: { initialPlan: SubscriptionPlan }) {
  const [plan, setPlan] = useState<SubscriptionPlan>(initialPlan);
  const [tier, setTier] = useState<SubscriptionTier>(SUBSCRIPTION_PLANS[initialPlan].tier);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/payplus/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "שגיאה ביצירת קישור לתשלום");
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  };

  const visiblePlans = plansForTier(tier);

  return (
    <div>
      <div className="flex gap-1 mb-3 p-1 rounded-full bg-chip">
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTier(t);
              setPlan(plansForTier(t)[0]);
            }}
            className="flex-1 rounded-full py-1.5 text-xs font-semibold"
            style={{
              background: tier === t ? "var(--color-amber-deep)" : "transparent",
              color: tier === t ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>
      {TIER_NOTE[tier] && <p className="text-[11px] mb-3 text-ink-soft">{TIER_NOTE[tier]}</p>}
      <div className="flex gap-2 mb-4">
        {visiblePlans.map((key) => {
          const info = SUBSCRIPTION_PLANS[key];
          return (
            <button
              key={key}
              onClick={() => setPlan(key)}
              className="flex-1 rounded-2xl p-3.5 relative text-right bg-white"
              style={{ border: plan === key ? "1.5px solid var(--color-amber)" : "1px solid var(--color-line)" }}
            >
              {info.badge && (
                <span className="absolute -top-2.5 right-3 text-[10px] px-2 py-0.5 rounded-full tracking-wide bg-amber text-white">
                  {info.badge}
                </span>
              )}
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold font-display">₪{info.pricePerMonth}</span>
                <span className="text-[11px] text-ink-soft">/חודש</span>
              </div>
              <div className="text-[11px] mt-1 text-ink-soft">{info.label}</div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] mb-4 text-ink-soft">{SUBSCRIPTION_PLANS[plan].note}</p>
      <button
        onClick={startCheckout}
        disabled={loading}
        className="w-full rounded-xl py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && <Spinner light />}
        {loading ? "מעביר לתשלום..." : "מעבר לתשלום מאובטח"}
      </button>
      {error && <p className="text-xs text-rose mt-2">{error}</p>}
    </div>
  );
}
