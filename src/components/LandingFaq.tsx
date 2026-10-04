"use client";

import { useId, useState } from "react";
import { useT } from "@/i18n/client";

const FAQ_ITEMS = [
  {
    q: "איך עובדת תקופת הניסיון?",
    a: "14 הימים הראשונים בחינם, בלי כרטיס אשראי. בזמן הניסיון כל האפשרויות של מסלול פרו+ פתוחות, עם מכסת אחסון של 5GB. לקראת הסוף נזכיר לכם לבחור מסלול. כל מה שהכנסתם נשמר עוד 30 יום אחרי הניסיון, כדי שתוכלו להמשיך בדיוק מאיפה שעצרתם. מספר טלפון אחד מקבל תקופת ניסיון אחת",
  },
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
  {
    q: "מה קורה לתמונות והאירועים שלי אם אני מבטל את המנוי?",
    a: "כלום לא נמחק, האירועים, הגלריות והחוזים שלכם נשארים שמורים במערכת ומחכים לכם. אפשר להפעיל את המנוי מחדש בכל עת ולחזור בדיוק מאיפה שעצרתם",
  },
  {
    q: "אפשר לעבור בין מסלולים?",
    a: "כן, בכל שלב אפשר לשדרג או לרדת מסלול מתוך הגדרות > מנוי. המעבר מתוזמן כך שלא משלמים כפול על מה שכבר שולם במחזור הנוכחי",
  },
  {
    q: "יש הגבלה על נפח האחסון?",
    a: "תלוי במסלול: פרו סטארט עד 100GB, פרו עד 750GB, ופרו+ ללא הגבלה. הנפח בפועל שבשימוש תמיד מוצג בהגדרות, כך שאף פעם לא מגלים בהפתעה",
  },
  {
    q: "אפשר להתקין את המערכת כאפליקציה בנייד?",
    a: "כן, מתקינים ישירות מהדפדפן בלי חנות אפליקציות, ומקבלים חוויה מלאה של אפליקציה, כולל אייקון על המסך הראשי וטעינה מהירה יותר",
  },
];

export default function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();
  const t = useT();

  return (
    <div className="flex flex-col border-t border-[var(--l-line)]">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = openIndex === i;
        const answerId = `${baseId}-faq-${i}`;
        return (
          <div key={item.q} className="border-b border-[var(--l-line)]">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 bg-transparent py-3 text-start text-[var(--l-ink)] md:min-h-[72px] md:gap-6"
              aria-expanded={isOpen}
              aria-controls={answerId}
            >
              <span className="font-display text-[17px] font-semibold leading-snug md:text-[21px]">{t(item.q)}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 transition-transform duration-200 md:h-[22px] md:w-[22px] ${isOpen ? "rotate-45" : "rotate-0"}`}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <div
              id={answerId}
              hidden={!isOpen}
              className="max-w-[720px] pb-[18px] text-base leading-[1.65] text-[var(--l-ink-soft)] md:pb-6 md:text-[18px]"
            >
              {t(item.a)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
