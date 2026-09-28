"use client";

import { useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

// Every card shows a per-month figure at all times — switching the toggle swaps which cycle's
// pricePerMonth is shown (and, for annual, the flat billed-total note), rather than switching
// between "a monthly price" and "an annual total" (the usual SaaS pattern: the toggle changes
// which number you're looking at, not what UNIT that number is in).

type Card = {
  key: SubscriptionPlan;
  featured: boolean;
  features: string[];
};

function CheckIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 sm:h-[18px] sm:w-[18px] shrink-0 mt-[3px] sm:mt-0.5"
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export default function PricingToggle() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const annual = cycle === "annual";

  const cards: Card[] = [
    {
      key: annual ? "basic_annual" : "basic_monthly",
      featured: false,
      features: [
        "ניהול אירועים, לידים והצעות מחיר",
        "חוזים דיגיטליים ותזכורות תשלום",
        "גלריות ללקוחות, 100GB",
        "שמירת גלריה עד 14 יום",
      ],
    },
    {
      key: annual ? "annual" : "monthly",
      featured: true,
      features: [
        "כל מה שבפרו סטארט",
        "עורך אלבומים מובנה",
        "פורטפוליו ציבורי, 750GB",
        "שמירת גלריה עד 90 יום, עד 2 בצוות",
      ],
    },
    {
      key: annual ? "studio_pro_annual" : "studio_pro_monthly",
      featured: false,
      features: [
        "כל מה שבפרו",
        "אחסון ללא הגבלה",
        "מיתוג מלא: לוגו וצבע בכל הגלריות",
        "FTP Live מהמצלמה באירוע, עד 3 בצוות",
      ],
    },
  ];

  const segment = (active: boolean) =>
    `flex-1 sm:flex-none h-11 px-4 sm:px-[22px] rounded-[9px] text-[15px] sm:text-base font-bold transition-colors text-[var(--l-ink)] ${
      active ? "bg-[var(--l-bg)] shadow-[0_1px_2px_rgba(11,18,32,0.08)]" : "bg-transparent hover:bg-[var(--l-bg)]/50"
    }`;

  return (
    <div className="flex flex-col items-stretch sm:items-center gap-6 sm:gap-10">
      <div
        role="group"
        aria-label="מחזור חיוב"
        className="flex gap-1 p-1 rounded-[12px] bg-[var(--l-line)] sm:self-center"
      >
        <button type="button" aria-pressed={!annual} onClick={() => setCycle("monthly")} className={segment(!annual)}>
          חודשי
        </button>
        <button type="button" aria-pressed={annual} onClick={() => setCycle("annual")} className={segment(annual)}>
          <span className="sm:hidden">שנתי, חוסכים</span>
          <span className="hidden sm:inline">שנתי, חוסכים עד 3 חודשים</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {cards.map(({ key, featured, features }) => {
          const plan = SUBSCRIPTION_PLANS[key];
          return (
            <div
              key={key}
              className={`flex flex-col gap-4 sm:gap-[22px] rounded-[18px] sm:rounded-[20px] p-6 sm:p-9 border ${
                featured
                  ? "bg-[var(--l-navy)] text-[var(--l-on-navy)] border-[var(--l-navy-line)]"
                  : "bg-[var(--l-bg)] text-[var(--l-ink)] border-[var(--l-line)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-display text-[22px] sm:text-2xl font-bold">{plan.tierName}</div>
                {featured && (
                  <span className="rounded-[1px] bg-[var(--l-accent)] text-[var(--l-on-accent)] text-xs sm:text-[13px] font-bold px-[9px] py-1 sm:px-2.5 sm:py-[5px]">
                    הכי משתלם
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2 sm:gap-2.5 flex-wrap">
                <span className="font-display text-5xl sm:text-[64px] leading-none font-bold tracking-[-0.04em]">
                  ₪{plan.pricePerMonth}
                </span>
                <span className="text-[15px] sm:text-[17px] opacity-70">לחודש</span>
                {plan.regularPricePerMonth != null && (
                  <span className="text-[15px] sm:text-[17px] opacity-50 line-through">₪{plan.regularPricePerMonth}</span>
                )}
              </div>

              <div className="text-sm sm:text-[15px] opacity-75">{plan.note}</div>

              <div className={`h-px ${featured ? "bg-[var(--l-navy-line)]" : "bg-[var(--l-line)]"}`} />

              <ul className="flex flex-col gap-2.5 sm:gap-3">
                {features.map((f) => (
                  <li key={f} className="flex gap-2 sm:gap-2.5 text-[15px] sm:text-base leading-[1.45]">
                    <CheckIcon color={featured ? "var(--l-accent)" : "var(--l-ink)"} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-auto h-[50px] sm:h-[52px] flex items-center justify-center rounded-[1px] text-base sm:text-[17px] font-bold transition-opacity hover:opacity-90 ${
                  featured
                    ? "bg-[var(--l-accent)] text-[var(--l-on-accent)]"
                    : "bg-[var(--l-navy)] text-[var(--l-on-navy)]"
                }`}
              >
                להתחיל ניסיון חינם
              </Link>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-[var(--l-ink-soft)] -mt-2 sm:-mt-4">ביטול בכל עת, בלי התחייבות</p>
    </div>
  );
}
