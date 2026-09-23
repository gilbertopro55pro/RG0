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
  "שיתוף גמיש עם הלקוח: וואטסאפ, אינסטגרם, טיקטוק או קוד QR, כולל אפשרות לשתף רק לשוניות נבחרות או תמונות ספציפיות, ובאיזו איכות (מלאה או מותאמת לרשת)",
];

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; detail: string[] }[] = [
  {
    icon: IconTrend,
    title: "מסלול עבודה לכל אירוע",
    text: "כל שלב מהסגירה ועד המסירה במקום אחד, עם תזכורות ומקום להערות, כך שכלום לא נופל בין הכיסאות. נוסח ההודעות שנשלחות ללקוח בכל שלב ניתן לעריכה חופשית משלכם",
    detail: [
      "מסלול שלבים קבוע מסגירת האירוע ועד המסירה, עם סימון \"בוצע\" ותאריך לכל שלב",
      "שלבים מסומנים כ\"מול הלקוח\" או \"שלב פנימי\". תמיד ברור מה חשוף ללקוח ומה לא",
      "עדכון ללקוח בוואטסאפ בלחיצה אחת בכל שלב מרכזי",
      "נוסח ההודעות ניתן לעריכה חופשית, עם מילוי אוטומטי של שם, תאריך, מיקום ותשלומים",
    ],
  },
  {
    icon: IconCalendar,
    title: "סנכרון יומן אמיתי",
    text: "כל אירוע חדש נכנס אוטומטית ל-Google וגם ל-Apple Calendar, כולל עדכון ומחיקה בזמן אמת, בלי הקלדה כפולה",
    detail: [
      "אירוע שנסגר נכנס אוטומטית גם ל-Google Calendar וגם ל-Apple Calendar",
      "עדכון או מחיקה של האירוע במערכת מתעדכנים ביומן בעצמם",
      "זיהוי אוטומטי של כפל תאריכים, עם התראה מיידית בעת יצירת האירוע",
    ],
  },
  {
    icon: IconContract,
    title: "חוזים דיגיטליים",
    text: "חוזה מותאם אישית לכל אירוע, נשלח לחתימה דיגיטלית תוך דקות, בלי נייר ובלי הדפסות",
    detail: [
      "חוזה מלא נוצר אוטומטית לכל אירוע, עם פרטי האירוע והתשלומים",
      "חתימה דיגיטלית חוקית ישירות מהנייד, תוך דקות",
      "\"תנאים כלליים\" (ביטולים, אחריות, זכויות יוצרים) ניתנים להחלפה בתנאים שלכם",
      "בלי נייר ובלי הדפסות",
    ],
  },
  {
    icon: IconChat,
    title: "תשלומים וחשבוניות",
    text: "תזכורות תשלום יוצאות ללקוח לבד בוואטסאפ, ומחוברים לחשבונית ירוקה או Finbot להפקת קבלה אמיתית על כל תשלום",
    detail: [
      "מעקב מקדמה ויתרה אוטומטי לכל אירוע",
      "תזכורת תשלום יוצאת ללקוח לבד בוואטסאפ, בדיוק בזמן",
      "חיבור לחשבונית ירוקה או Finbot להפקת קבלה אמיתית מיד עם קבלת התשלום",
    ],
  },
  {
    icon: IconLeads,
    title: "לידים והצעות מחיר",
    text: "כל פנייה נכנסת למעקב מסודר גם אם התאריך תפוס, ולידים ששותקים יוצא רצף תזכורות אוטומטי בלי שתזכרו לחזור אליהם. אפשר גם לבנות הצעת מחיר מפורטת עם טבלת פריטים ולוגו אישי, ולשלוח אותה כ-PDF במייל או בוואטסאפ",
    detail: [
      "כל פנייה חדשה נכנסת למעקב מסודר עם סטטוס ברור",
      "תאריך תפוס? הליד עובר לרשימת המתנה במקום להיעלם",
      "רצף תזכורות אוטומטי ללידים ששותקים, בלי שתזכרו לחזור אליהם",
      "הצעת מחיר עם טבלת פריטים, מע\"מ אוטומטי ולוגו אישי, נשלחת כ-PDF תוך פחות מדקה",
    ],
  },
  {
    icon: IconPalette,
    title: "עיצוב אלבומים",
    text: "עורך אלבומים מובנה עם עשרות תבניות מוכנות, גרירת תמונות ישירות מהגלריה, ועיצוב חופשי לכל עמוד",
    detail: [
      "עורך אלבומים מלא בתוך המערכת, גרירת תמונות ישירות מהגלריה",
      "עשרות תבניות מוכנות, ואפשרות לעיצוב חופשי לחלוטין",
      "הלקוח מאשר את העיצוב דרך הפורטל האישי שלו",
      "ייצוא ישיר ל-PDF, JPG או PSD לבית הדפוס, בלי לצאת מהמערכת",
    ],
  },
  {
    icon: IconSettings,
    title: "חבילות צילום מותאמות לדרישות הצלם",
    text: "בונים חבילות וסוגי אירועים משלכם, עם מחיר ותהליך עבודה מדויקים לאופן שבו אתם עובדים בפועל",
    detail: [
      "חבילות מובנות מוכנות לשימוש (סטילס, סטילס+קליפ, חבילה מלאה ועוד)",
      "אפשר גם לבנות חבילות מותאמות אישית עם מסלול שלבים משלכם",
      "שולטים האם וכיצד כל שלב מעדכן את הלקוח",
      "מתאים לשיטת עבודה שונה מהתבנית הסטנדרטית, בלי לוותר על המעקב האוטומטי",
    ],
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
          style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          onClick={() => setOpenIndex(null)}
        >
          <div className="w-full max-w-md rounded-3xl p-6 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <FeatureIcon size={24}>
                <active.icon className="h-full w-full" />
              </FeatureIcon>
              <h3 className="text-base font-bold font-display">{active.title}</h3>
            </div>
            <div className="space-y-2.5">
              {active.detail.map((line) => (
                <div key={line} className="flex items-start gap-2 text-sm text-ink-soft leading-relaxed">
                  <Dot color="var(--color-amber-deep)" />
                  {line}
                </div>
              ))}
            </div>
            <button onClick={() => setOpenIndex(null)} className="w-full mt-6 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
              סגירה
            </button>
          </div>
        </div>
      )}

      {galleryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
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
