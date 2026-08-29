"use client";

import { useState } from "react";
import {
  IconCalendar,
  IconGallery,
  IconContract,
  IconChat,
  IconLeads,
  IconTrend,
  IconSettings,
} from "@/components/icons/NavIcons";
import { IconPalette } from "@/components/icons/AlbumIcons";

function Dot({ color }: { color: string }) {
  return <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
}

function FeatureIcon({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <span className="shrink-0 flex items-center justify-center" style={{ width: size, height: size, color: "var(--color-amber-deep)" }}>
      {children}
    </span>
  );
}

const GALLERY_HIGHLIGHTS = [
  "קישור אישי ומאובטח לכל אירוע, לבחירת תמונות והורדה",
  "5 ערכות עיצוב מלאות לגלריה: קלאסי, דרמטי, מינימלי, חם ורומנטי",
  "זיהוי פרצופים אוטומטי בדפדפן, לסינון הגלריה לפי מי מופיע/ה בתמונה",
  "שיתוף גמיש עם הלקוח: וואטסאפ, אינסטגרם, טיקטוק או קוד QR — כולל אפשרות לשתף רק לשוניות נבחרות או תמונות ספציפיות, ובאיזו איכות (מלאה או מותאמת לרשת)",
];

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; detail: string }[] = [
  {
    icon: IconTrend,
    title: "מסלול עבודה לכל אירוע",
    text: "כל שלב מהסגירה ועד המסירה במקום אחד, עם תזכורות ומקום להערות, כך שכלום לא נופל בין הכיסאות. נוסח ההודעות שנשלחות ללקוח בכל שלב ניתן לעריכה חופשית משלכם",
    detail:
      "לכל חבילת צילום יש מסלול שלבים קבוע — מסגירת האירוע ועד המסירה הסופית — עם סימון \"בוצע\" לכל שלב ותאריך. שלבים מסומנים כ\"מול הלקוח\" או \"שלב פנימי\", כך שברור מה חשוף ללקוח ומה לא. בכל שלב מרכזי אפשר לשלוח ללקוח עדכון בוואטסאפ בלחיצה אחת — ואת נוסח ההודעה אפשר לערוך בעצמכם בהגדרות, כולל הכנסת שם הלקוח, תאריך, מיקום, שעות, מקדמה ויתרה אוטומטית מתוך כרטיס האירוע.",
  },
  {
    icon: IconCalendar,
    title: "סנכרון יומן אמיתי",
    text: "כל אירוע חדש נכנס אוטומטית ל-Google וגם ל-Apple Calendar, כולל עדכון ומחיקה בזמן אמת, בלי הקלדה כפולה",
    detail:
      "ברגע שאירוע נסגר במערכת, הוא נכנס אוטומטית גם ליומן Google וגם ל-Apple Calendar שלכם — כולל שעות, מיקום ופרטי הלקוח. עדכון או מחיקה של האירוע במערכת מתעדכנים ביומן בעצמם, בלי לגעת בשני מקומות. המערכת גם מזהה אוטומטית אם נקבע כפל תאריכים ומתריעה על כך מיד בעת יצירת האירוע.",
  },
  {
    icon: IconContract,
    title: "חוזים דיגיטליים",
    text: "חוזה מותאם אישית לכל אירוע, נשלח לחתימה דיגיטלית תוך דקות, בלי נייר ובלי הדפסות",
    detail:
      "חוזה מלא נוצר אוטומטית לכל אירוע עם פרטי האירוע, התשלומים וסעיף חתימה אלקטרונית חוקי — והלקוח חותם ישירות מהנייד. את הסעיף המשמעותי באמת, \"תנאים כלליים\" (ביטולים, אחריות, זכויות יוצרים), אפשר להחליף בתנאים משלכם בהגדרות — כדי שהחוזה ישקף בדיוק את התנאים העסקיים שלכם, לא נוסח גנרי.",
  },
  {
    icon: IconChat,
    title: "תשלומים וחשבוניות",
    text: "תזכורות תשלום יוצאות ללקוח לבד בוואטסאפ, ומחוברים לחשבונית ירוקה או Finbot להפקת קבלה אמיתית על כל תשלום",
    detail:
      "מעקב מקדמה ויתרה לכל אירוע, עם תזכורת אוטומטית בוואטסאפ כשמתקרב מועד התשלום — בלי שתצטרכו לזכור בעצמכם. חיבור ישיר לחשבונית ירוקה או ל-Finbot מאפשר הפקת קבלה אמיתית ישירות מתוך כרטיס האירוע ברגע שהתשלום התקבל.",
  },
  {
    icon: IconLeads,
    title: "לידים והצעות מחיר",
    text: "כל פנייה נכנסת למעקב מסודר גם אם התאריך תפוס, ולידים ששותקים יוצא רצף תזכורות אוטומטי בלי שתזכרו לחזור אליהם. אפשר גם לבנות הצעת מחיר מפורטת עם טבלת פריטים ולוגו אישי, ולשלוח אותה כ-PDF במייל או בוואטסאפ",
    detail:
      "כל פנייה חדשה נכנסת לרשימת לידים מסודרת עם סטטוס (חדש / יצרתי קשר / נשלחה הצעה / סגור). אם התאריך המבוקש תפוס, הליד עובר לרשימת המתנה במקום להיעלם. לליד ששותק יוצא רצף תזכורות אוטומטי בוואטסאפ בלי שתצטרכו לזכור לחזור אליו. בונים הצעת מחיר עם טבלת פריטים, חישוב מע\"מ אוטומטי ולוגו העסק שלכם, ושולחים כקובץ PDF במייל או בוואטסאפ תוך פחות מדקה.",
  },
  {
    icon: IconPalette,
    title: "עיצוב אלבומים",
    text: "עורך אלבומים מובנה עם עשרות תבניות מוכנות, גרירת תמונות ישירות מהגלריה, ועיצוב חופשי לכל עמוד",
    detail:
      "עורך אלבומים מלא בתוך המערכת — גוררים תמונות ישירות מהגלריה לתבנית, עם עשרות תבניות מוכנות לכל סוג עמוד ואפשרות לעיצוב חופשי לחלוטין. הלקוח מאשר את העיצוב דרך הפורטל שלו, וברגע שהוא מאושר אפשר לייצא ישירות ל-PDF, JPG או PSD ולשלוח לבית הדפוס — הכל בלי לצאת מהמערכת.",
  },
  {
    icon: IconSettings,
    title: "חבילות צילום מותאמות לדרישות הצלם",
    text: "בונים חבילות וסוגי אירועים משלכם, עם מחיר ותהליך עבודה מדויקים לאופן שבו אתם עובדים בפועל",
    detail:
      "מעבר לחבילות המובנות (סטילס, סטילס+קליפ, חבילה מלאה ועוד), אפשר לבנות חבילות מותאמות אישית עם מסלול שלבים משלכם — כולל אם וכיצד כל שלב מעדכן את הלקוח. מתאים לצלמים שעובדים בשיטה שונה מהתבנית הסטנדרטית, בלי לוותר על המעקב האוטומטי.",
  },
];

export default function FeaturesGrid() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const active = openIndex !== null ? FEATURES[openIndex] : null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map(({ icon: Icon, title, text }, i) => (
          <button
            key={title}
            onClick={() => setOpenIndex(i)}
            className="text-right rounded-2xl p-6 bg-card border border-line shadow-card hover:border-amber-deep transition-colors"
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <FeatureIcon>
                <Icon className="h-full w-full" />
              </FeatureIcon>
              <h3 className="text-sm font-bold font-display">{title}</h3>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed mb-2">{text}</p>
            <span className="text-[11px] font-semibold text-amber-deep">לחץ לפרטים ←</span>
          </button>
        ))}

        {/* Gallery — its own full-width card, kept separate from the album tool below so each
            differentiator gets its own clear pitch instead of blurring into one long list. */}
        <button
          onClick={() => setGalleryOpen(true)}
          className="text-right sm:col-span-2 lg:col-span-3 rounded-2xl p-6 bg-card border border-line shadow-card hover:border-amber-deep transition-colors"
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <FeatureIcon>
              <IconGallery className="h-full w-full" />
            </FeatureIcon>
            <h3 className="text-sm font-bold font-display">גלריות מאובטחות ללקוחות</h3>
          </div>
          <p className="text-xs text-ink-soft leading-relaxed mb-4">
            קישור אישי ומעוצב לבחירת תמונות והורדה,
            <br />
            בעיצוב שתואם למותג שלכם
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-2">
            {GALLERY_HIGHLIGHTS.slice(0, 2).map((line) => (
              <div key={line} className="flex items-start gap-2 text-xs text-ink-soft leading-relaxed">
                <Dot color="var(--color-amber-deep)" />
                {line}
              </div>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-amber-deep">לחץ לפרטים ←</span>
        </button>
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          onClick={() => setOpenIndex(null)}
        >
          <div className="w-full max-w-md rounded-3xl p-6 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <FeatureIcon size={24}>
                <active.icon className="h-full w-full" />
              </FeatureIcon>
              <h3 className="text-base font-bold font-display">{active.title}</h3>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">{active.detail}</p>
            <button onClick={() => setOpenIndex(null)} className="w-full mt-6 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
              סגירה
            </button>
          </div>
        </div>
      )}

      {galleryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          onClick={() => setGalleryOpen(false)}
        >
          <div className="w-full max-w-md rounded-3xl p-6 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <FeatureIcon size={24}>
                <IconGallery className="h-full w-full" />
              </FeatureIcon>
              <h3 className="text-base font-bold font-display">גלריות מאובטחות ללקוחות</h3>
            </div>
            <div className="space-y-2.5">
              {GALLERY_HIGHLIGHTS.map((line) => (
                <div key={line} className="flex items-start gap-2 text-sm text-ink-soft leading-relaxed">
                  <Dot color="var(--color-amber-deep)" />
                  {line}
                </div>
              ))}
            </div>
            <button onClick={() => setGalleryOpen(false)} className="w-full mt-6 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
              סגירה
            </button>
          </div>
        </div>
      )}
    </>
  );
}
