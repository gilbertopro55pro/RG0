"use client";

import { useEffect, useRef, useState } from "react";

// Real, generic categories of tools a photographer would otherwise need to run a business —
// not named competitor products, and not a fabricated "former price" of this product (that would
// be a false discount claim). The anchoring effect comes from an honest cost comparison, not from
// pretending gilberto ever charged more than it does.
const STACK_ITEMS = [
  { label: "תוכנת CRM לניהול אירועים ולקוחות", price: 89 },
  { label: "תוכנת עיצוב אלבומים", price: 79 },
  { label: "שירות אחסון גלריות מאובטחות ללקוחות", price: 69 },
  { label: "תוכנת חוזים דיגיטליים לחתימה מרחוק", price: 69 },
  { label: "מערכת תזכורות תשלום אוטומטיות", price: 49 },
  { label: "ניהול לידים והצעות מחיר", price: 39 },
  { label: "סנכרון יומן ותיאומים", price: 29 },
];

const REAL_MONTHLY_PRICE = 50;

export default function PricingAnchor() {
  const [revealedCount, setRevealedCount] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setRevealedCount((prev) => Math.max(prev, index + 1));
          }
        });
      },
      { threshold: 0.6 }
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const total = STACK_ITEMS.slice(0, revealedCount).reduce((sum, item) => sum + item.price, 0);
  const allRevealed = revealedCount >= STACK_ITEMS.length;

  return (
    <section className="max-w-2xl mx-auto px-4 py-10">
      <h2 className="text-2xl font-bold font-display text-center mb-2">כמה זה עולה לנהל בעצמכם?</h2>
      <p className="text-sm text-ink-soft text-center mb-8">
        בממוצע, ניהול כל היכולות האלה בנפרד — עם כלים שונים — עשוי להיראות ככה:
      </p>

      <div className="sticky top-4 z-10 mb-6 flex justify-center">
        <div className="rounded-2xl px-6 py-3 bg-card border border-line shadow-sheet text-center">
          <div className="text-[11px] text-ink-soft mb-0.5">סה&quot;כ עד כה</div>
          <div className="text-2xl font-bold font-display">
            ₪{total}
            <span className="text-xs text-ink-soft font-normal">/חודש</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {STACK_ITEMS.map((item, i) => (
          <div
            key={item.label}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-index={i}
            className="rounded-2xl p-4 bg-card border border-line shadow-card flex items-center justify-between transition-all duration-500"
            style={{
              opacity: i < revealedCount ? 1 : 0.3,
              transform: i < revealedCount ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <span className="text-sm">{item.label}</span>
            <span className="text-sm font-bold shrink-0 mr-3">₪{item.price}</span>
          </div>
        ))}
      </div>

      <div
        className="mt-8 rounded-3xl p-6 text-center bg-amber-deep text-white shadow-card transition-opacity duration-700"
        style={{ opacity: allRevealed ? 1 : 0.3 }}
      >
        <div className="text-xs opacity-80 mb-1">עם גילברטו, כל זה במקום אחד:</div>
        <div className="text-4xl font-extrabold font-display">
          ₪{REAL_MONTHLY_PRICE}
          <span className="text-base font-normal opacity-80">/חודש</span>
        </div>
      </div>
    </section>
  );
}
