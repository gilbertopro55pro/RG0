import { LANDING_CONTAINER } from "@/components/LandingChrome";
import { dateLocale, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import { ADMIN_MINUTES_PER_EVENT, DEFAULT_EVENTS_PER_MONTH, MINUTES_LEFT_WITH_GILBERTO, workdaysPerYear } from "@/lib/adminTime";

// "How it looks today, and how it looks with Gilberto" (landing sketch 2, approved 2026-10-11): the
// admin around one event, item by item, each with its minutes (lib/adminTime.ts adds them up), next
// to what the product does about it. Every solution line is something the product does today.
const PAIRS = [
  {
    topic: "פנייה חדשה",
    pain: "לקוח פונה בעשר בלילה ושואל אם התאריך פנוי. אתם רואים את ההודעה רק למחרת בבוקר, ובינתיים הוא כבר פנה לשני צלמים נוספים. ועל כל אירוע שנסגר יש עוד כמה פניות שלא הבשילו, וגם עליהן עניתם.",
    minutes: "כ-45 דקות לאירוע, כולל פניות שלא נסגרו",
    fix: "עוזר הפניות משיב לו מיד, בודק ביומן שלכם שהתאריך פנוי, שואל את השאלות הנחוצות ומעביר אליכם ליד מסודר עם הטלפון וכל הפרטים.",
  },
  {
    topic: "הצעת מחיר וחוזה",
    pain: "הצעת מחיר בקובץ אחד, חוזה בקובץ אחר, תיקונים לפי בקשת הלקוח, ולאחר מכן כמה ימים של תזכורות עד שהוא חותם ומעביר את פרטי האירוע.",
    minutes: "כ-40 דקות לאירוע",
    fix: "ההצעה נשלחת כקישור בוואטסאפ. הלקוח מאשר בטלפון, ממלא את פרטי האירוע וחותם על החוזה באותו הקישור, והאירוע נפתח אצלכם ונכנס ליומן.",
  },
  {
    topic: "תשלומים",
    pain: "לעקוב אחר מי ששילם מקדמה, לזכור למי ומתי יש להזכיר את היתרה, ולהפיק קבלה בתוכנה נפרדת, לעיתים פעמיים ושלוש לאותו אירוע.",
    minutes: "כ-25 דקות לאירוע",
    fix: "בכל אירוע רואים מה שולם ומה נותר. כשמגיע מועד היתרה, ממתינה לכם תזכורת מוכנה לשליחה, והקבלה מופקת מהמערכת ומגיעה ללקוח בקישור קצר.",
  },
  {
    topic: "לפני האירוע ואחריו",
    pain: "שיחות תיאום על השעות, המקום וצילומי המשפחה, תיאום עם האולם ועם צלם נוסף, שאלות הלקוח בשבוע האחרון, ולבסוף סבב הודעות נוסף כדי לסגור את המסירה.",
    minutes: "כ-60 דקות לאירוע",
    fix: "ללקוח יש פורטל אישי עם כל הפרטים והשלבים, וביום הצילום מרוכזים אצלכם במסך אחד המקום עם ניווט, השעות, הטלפון והחבילה.",
  },
  {
    topic: "גלריה ובחירת תמונות",
    pain: "שולחים גלריה, ממתינים שבועות לבחירה ושולחים תזכורות, ולבסוף מקבלים בוואטסאפ רשימה של עשרות מספרי קבצים, שאותם יש לאתר אחד אחד.",
    minutes: "כ-50 דקות לאירוע",
    fix: "הלקוח מסמן את התמונות האהובות עליו בגלריה עצמה, ואתם רואים את הבחירה מסודרת במקום אחד, מוכנה לאלבום.",
  },
  {
    topic: "עיצוב ואישור אלבום",
    pain: "ערב או שניים של עימוד, ולאחריהם סבבי הערות בהודעות עד שהלקוח מאשר, ולבסוף שליחת הקבצים לבית הדפוס.",
    minutes: "כ-50 דקות של תיאום לאירוע, לא כולל העיצוב עצמו",
    fix: "העיצוב האוטומטי מסדר את האלבום מהתמונות שהלקוח בחר, ואתם משנים כרצונכם. הלקוח עובר על העיצוב ומאשר בפורטל האישי, והקבצים נשלחים לבית הדפוס ישירות מהמערכת.",
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
          <span className="text-sm font-bold text-[var(--l-accent)]">{t("הכאב והפתרון")}</span>
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
