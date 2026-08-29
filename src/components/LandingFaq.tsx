"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    q: "אפשר לבטל מתי שרוצים?",
    a: "כן, ביטול החידוש האוטומטי אפשרי בכל רגע מתוך ההגדרות, בלי התחייבות, והגישה למערכת נשארת פעילה עד תום התקופה ששולמה, כך שהאירועים, הגלריות והחוזים שלכם לא נמחקים",
  },
  {
    q: "המידע שלי ושל הלקוחות שלי מאובטח?",
    a: "כן, הנתונים מאוחסנים בשרתים מאובטחים עם הצפנה, וכל גלריית לקוח מוגנת בקישור אישי ייחודי",
  },
  {
    q: "כמה זמן לוקח להתחיל לעבוד עם המערכת?",
    a: "כמה דקות: נרשמים, מגדירים את החבילות והמחירים שלכם, ומיד אפשר להתחיל להוסיף אירועים",
  },
  {
    q: "המערכת בעברית?",
    a: "כן, כל המערכת בעברית ובנויה במיוחד לצלמי אירועים בישראל, כולל התאמה לוואטסאפ ולמסלולי תשלום מקומיים",
  },
];

export default function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-2.5">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.q} className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-right"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-semibold">{item.q}</span>
              <span
                className="shrink-0 text-lg text-ink-soft transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(45deg)" : "rotate(0deg)" }}
              >
                +
              </span>
            </button>
            {isOpen && <p className="px-4 pb-3.5 text-xs text-ink-soft leading-relaxed">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
