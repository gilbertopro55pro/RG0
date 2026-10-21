import { LANDING_CONTAINER } from "@/components/LandingChrome";
import { dateLocale, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import { ADMIN_MINUTES_PER_EVENT, DEFAULT_EVENTS_PER_MONTH, MINUTES_LEFT_WITH_GILBERTO, workdaysPerYear } from "@/lib/adminTime";

// "How it looks today, and how it looks with Gilberto" (landing sketch 2, approved 2026-10-11): the
// admin around one event, item by item, one sentence a side (trust pass, 2026-10-21), each with its minutes (lib/adminTime.ts adds them up), next
// to what the product does about it. Every solution line is something the product does today.
const PAIRS = [
  {
    topic: "פנייה חדשה",
    pain: "לקוח שואל בעשר בלילה אם התאריך פנוי. עד שאתם עונים בבוקר, הוא כבר פנה לעוד שני צלמים.",
    minutes: "כ-45 דקות לאירוע, כולל פניות שלא נסגרו",
    fix: "עוזר הפניות עונה לו מיד, בודק ביומן שלכם שהתאריך פנוי, ומעביר לכם ליד עם כל הפרטים.",
  },
  {
    topic: "הצעת מחיר וחוזה",
    pain: "הצעה בקובץ אחד, חוזה בקובץ אחר, ועוד כמה ימים של תזכורות עד שהלקוח חותם.",
    minutes: "כ-40 דקות לאירוע",
    fix: "קישור אחד בוואטסאפ: הלקוח מאשר, ממלא את הפרטים וחותם, והאירוע נכנס ליומן שלכם.",
  },
  {
    topic: "תשלומים",
    pain: "לזכור מי שילם מקדמה, למי להזכיר את היתרה, ולהפיק קבלה בתוכנה אחרת.",
    minutes: "כ-25 דקות לאירוע",
    fix: "בכל אירוע רואים מה שולם ומה נשאר, והתזכורת והקבלה מוכנות לשליחה.",
  },
  {
    topic: "לפני האירוע ואחריו",
    pain: "שיחות על השעות, המקום וצילומי המשפחה, ועוד סבב הודעות כדי לסגור את המסירה.",
    minutes: "כ-60 דקות לאירוע",
    fix: "ללקוח יש פורטל עם כל הפרטים, וביום הצילום הכל מרוכז אצלכם במסך אחד.",
  },
  {
    topic: "גלריה ובחירת תמונות",
    pain: "שבועות של המתנה לבחירה, ובסוף רשימה של מספרי קבצים בוואטסאפ.",
    minutes: "כ-50 דקות לאירוע",
    fix: "הלקוח מסמן את התמונות בגלריה עצמה, והבחירה מחכה לכם מסודרת לאלבום.",
  },
  {
    topic: "עיצוב ואישור אלבום",
    pain: "ערב או שניים של עימוד, וסבבי הערות בהודעות עד שהלקוח מאשר.",
    minutes: "כ-50 דקות של תיאום לאירוע, לא כולל העיצוב עצמו",
    fix: "העיצוב האוטומטי מסדר את האלבום, הלקוח מאשר בפורטל, והקבצים נשלחים לבית הדפוס מהמערכת.",
  },
];

export default function LandingPainSection({ lang = "he" }: { lang?: Lang }) {
  const t = makeT(messagesFor(lang));
  const locale = dateLocale(lang);
  // "שעות" alone is "Hours" (a column title) elsewhere; after a number it needs its own key.
  const unit = (he: string, key: string) => (lang === "he" ? he : t(key));
  const nums = [
    { value: (ADMIN_MINUTES_PER_EVENT / 60).toLocaleString(locale), unit: unit("שעות", "שעות (אחרי מספר)"), text: "של עבודה מנהלית על אירוע אחד, ללא מערכת", good: false },
    { value: MINUTES_LEFT_WITH_GILBERTO.toLocaleString(locale), unit: t("דקות"), text: "מה שנותר עם גילברטו, בעיקר מענה לשאלות אמיתיות של לקוחות", good: true },
    {
      value: workdaysPerYear(ADMIN_MINUTES_PER_EVENT - MINUTES_LEFT_WITH_GILBERTO, DEFAULT_EVENTS_PER_MONTH).toLocaleString(locale),
      unit: t("ימי עבודה"),
      text: "שחוזרים אליכם בשנה, בשישה אירועים בחודש",
      good: false,
    },
  ];

  return (
    <section id="features" className="bg-[var(--l-bg)] scroll-mt-4">
      <div className={`${LANDING_CONTAINER} py-16 lg:py-28`}>
        <div className="flex flex-col gap-3 max-w-[760px]">
          <h2 className="font-display m-0 text-[30px] lg:text-5xl leading-[1.12] font-bold tracking-[-0.025em] text-balance">
            {t("כך זה נראה היום, וכך זה נראה עם גילברטו")}
          </h2>
          <p className="m-0 text-[17px] lg:text-lg leading-relaxed text-[var(--l-ink-soft)]">
            {t("כל צלם אירועים מכיר את הרשימה הזו היטב. ההבדל הוא מי מבצע את העבודה.")}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3.5">
          {PAIRS.map((pair) => (
            <div key={pair.topic} className="grid lg:grid-cols-2 rounded-[16px] overflow-hidden border border-[var(--l-line)] bg-white">
              <div className="bg-[var(--l-pain-bg)] px-5 py-[18px] flex flex-col gap-1.5 min-w-0">
                <span className="text-[12.5px] font-bold text-[var(--l-pain)]">{t("היום")}</span>
                <span className="font-display text-lg font-bold">{t(pair.topic)}</span>
                <p className="m-0 text-base leading-relaxed text-[var(--l-pain-ink)]">{t(pair.pain)}</p>
                <span className="text-[13px] tabular-nums text-[var(--l-pain)]">{t(pair.minutes)}</span>
              </div>
              <div className="px-5 py-[18px] flex flex-col gap-1.5 min-w-0">
                <span className="text-[12.5px] font-bold text-[var(--l-accent)]">{t("עם גילברטו")}</span>
                <p className="m-0 text-base leading-relaxed">{t(pair.fix)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-3 lg:grid-cols-3">
          {nums.map((n) => (
            <div
              key={n.text}
              className={`rounded-[14px] p-5 border ${n.good ? "bg-[var(--l-navy)] border-[var(--l-navy)] text-white" : "bg-white border-[var(--l-line)]"}`}
            >
              <div className="font-display text-[44px] font-extrabold leading-[1.05] tabular-nums">
                {n.value} <small className={`text-lg font-semibold ${n.good ? "text-[var(--l-on-navy-soft)]" : "text-[var(--l-ink-soft)]"}`}>{n.unit}</small>
              </div>
              <div className={`mt-1 text-[15px] ${n.good ? "text-[var(--l-on-navy-soft)]" : "text-[var(--l-ink-soft)]"}`}>{t(n.text)}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 mb-0 text-[13px] text-[var(--l-ink-soft)]">
          {t("הזמנים הם הערכה לאירוע ממוצע, מהפנייה הראשונה ועד המסירה, כולל פניות שלא נסגרו. כל צלם עובד אחרת, ולכן במחשבון שלמטה אפשר להתאים אותם לעסק שלכם.")}
        </p>
      </div>
    </section>
  );
}
