import Image from "next/image";
import Link from "next/link";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import LandingFaq from "@/components/LandingFaq";
import PricingAnchor from "@/components/PricingAnchor";
import {
  IconCalendar,
  IconGallery,
  IconContract,
  IconChat,
  IconLeads,
  IconTrend,
  IconAnalytics,
} from "@/components/icons/NavIcons";

const FEATURES = [
  {
    icon: IconTrend,
    title: "ניהול אירועים ושלבי עבודה",
    text: "מעקב אחרי כל שלב באירוע — מסגירה ועד מסירה סופית — עם מקום להערות חופשיות, כך שכלום לא נופל בין הכיסאות ושום פרט לא נשכח.",
  },
  {
    icon: IconCalendar,
    title: "סנכרון אוטומטי עם Google ו-Apple Calendar",
    text: "כל אירוע חדש נכנס ליומן שלכם אוטומטית — Google, Apple (iCloud), או שניהם יחד — כולל עדכון תאריך ומחיקה בזמן אמת.",
  },
  {
    icon: IconGallery,
    title: "גלריות מאובטחות ללקוחות, בעיצוב שלכם",
    text: "קישור אישי לכל אירוע, עם בחירת תמונות והורדה, שיתוף גמיש (וואטסאפ, קוד QR ועוד), ו-5 ערכות עיצוב מלאות (קלאסי, דרמטי, מינימלי, חם, רומנטי) — כל אחת עם פריסת תמונות, צבעים וטיפוגרפיה משלה. מעלים ישירות מהטלפון, גם מאייפון. כלי proofing מובנה לעיצוב אלבום: הלקוח/ה עוברים על עמודי האלבום, כותבים הערות ומאשרים את העיצוב הסופי ישירות מהגלריה — כולל עיצוב חופשי עם כמה תמונות שרוצים בעמוד, ספריית תבניות פריסה לשימוש חוזר, אפקטים (שחור-לבן/סאפיה) ומסגרות לתמונות, שכבות טקסט, נקודות מיקוד לחיתוך וייצוא PDF למעבדת הדפוס.",
  },
  {
    icon: IconContract,
    title: "חוזים דיגיטליים",
    text: "שליחת חוזה לחתימה דיגיטלית תוך דקות, בלי נייר ובלי הדפסות.",
  },
  {
    icon: IconChat,
    title: "עדכונים אוטומטיים בוואטסאפ",
    text: "תזכורות תשלום ועדכוני סטטוס נשלחים ללקוחות אוטומטית, בלי שתצטרכו לזכור לעדכן אף אחד. מחברים חשבון חשבוניות אישי (Finbot או חשבונית ירוקה — לבחירתכם) ומפיקים ללקוחות קבלה/חשבונית אמיתית על כל תשלום, ישירות מכרטיס האירוע.",
  },
  {
    icon: IconLeads,
    title: "לידים, הצעות מחיר ורשימת המתנה",
    text: "כל פנייה חדשה נכנסת למערכת ומקבלת מעקב מסודר — גם אם התאריך המבוקש כבר תפוס. לידים ששותקים מקבלים רצף תזכורות אוטומטי בוואטסאפ, בלי שתצטרכו לזכור לחזור אליהם.",
  },
  {
    icon: IconAnalytics,
    title: "ניתוח עסקי וייצוא לרואה חשבון",
    text: "מעקב הכנסות חודשי, ושליחת כל תשלומי החודש ברגע — במייל, בוואטסאפ או בכל דרך אחרת — ישר לרואה החשבון שלכם.",
  },
];

const STEPS = [
  { n: "1", title: "נרשמים ובוחרים מסלול", text: "חודשי או שנתי — לפי מה שנוח לכם." },
  { n: "2", title: "מגדירים חבילות ומחירים", text: "בונים את סוגי האירועים והחבילות שלכם, בדיוק כמו שאתם מתמחרים היום." },
  { n: "3", title: "מתחילים לנהל אירועים", text: "המערכת עוקבת, מזכירה ומעדכנת בשבילכם — אתם מתמקדים בצילום." },
];

export default function LandingPage() {
  const monthly = SUBSCRIPTION_PLANS.monthly;
  const annual = SUBSCRIPTION_PLANS.annual;

  return (
    <div className="w-full">
      <header className="max-w-5xl mx-auto px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/icons/icon-192.png" alt="גילברטו" width={36} height={36} className="rounded-xl shadow-card" />
          <div className="flex flex-col leading-tight">
            <span className="font-display font-bold text-lg">גילברטו</span>
            <span className="text-[10px] text-ink-soft">ניהול אירועים לצלמים</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-ink-soft hidden sm:inline">
            התחברות
          </Link>
          <Link href="/signup" className="rounded-xl px-4 py-2 text-sm font-semibold bg-amber-deep text-white">
            הרשמה
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-14 pb-10 text-center">
        <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold mb-4" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
          מערכת ניהול לצלמי אירועים
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold font-display leading-tight mb-4">
          תפסיקו לנהל את העסק שלכם
          <br />
          דרך 15 אפליקציות שונות
        </h1>
        <p className="text-base text-ink-soft leading-relaxed mb-7 max-w-xl mx-auto">
          כל האירועים, הלקוחות, החוזים, הגלריות והתשלומים שלכם — במקום אחד. גילברטו עושה את
          העבודה המנהלתית בשבילכם, כדי שתוכלו להתמקד בצילום.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/signup" className="rounded-xl px-6 py-3.5 text-sm font-semibold bg-amber-deep text-white">
            הרשמה עכשיו
          </Link>
          <a href="#pricing" className="rounded-xl px-6 py-3.5 text-sm font-semibold bg-card border border-line shadow-card">
            צפייה במחיר
          </a>
        </div>
      </section>

      {/* Pain points */}
      <section className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-2xl p-6 bg-card border border-line shadow-card">
          <h2 className="text-lg font-bold font-display mb-4 text-center">אתם מכירים את זה?</h2>
          <ul className="space-y-2.5 max-w-md mx-auto">
            {[
              "רודפים אחרי לקוחות שלא עונים בוואטסאפ",
              "שוכחים לשלוח תזכורת תשלום ומגלים שנשארתם בלי מקדמה",
              "בונים חוזה מאפס לכל אירוע",
              "מפספסים תאריך כי הוא לא סונכרן ליומן",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm text-ink-soft">
                <span className="mt-1 shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-rose)" }} />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-center text-sm font-semibold mt-5">גילברטו עושה את כל זה אוטומטית.</p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold font-display text-center mb-8">הכל במקום אחד</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl p-5 bg-card border border-line shadow-card">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center mb-3.5"
                style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold mb-1.5">{title}</h3>
              <p className="text-xs text-ink-soft leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold font-display text-center mb-8">איך זה עובד</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl p-5 bg-card border border-line shadow-card text-center">
              <div
                className="h-9 w-9 rounded-full mx-auto flex items-center justify-center mb-3 text-sm font-bold text-white"
                style={{ background: "var(--color-amber-deep)" }}
              >
                {step.n}
              </div>
              <h3 className="text-sm font-bold mb-1.5">{step.title}</h3>
              <p className="text-xs text-ink-soft leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Price anchoring — real category costs stacking up, landing on the real price below */}
      <PricingAnchor />

      {/* Pricing */}
      <section id="pricing" className="max-w-3xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold font-display text-center mb-2">מחיר פשוט, בלי הפתעות</h2>
        <p className="text-sm text-ink-soft text-center mb-8">מחיר קבוע וברור מראש — בלי עמלות נסתרות ובלי הפתעות בחיוב.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl p-6 bg-card border border-line shadow-card">
            <div className="text-sm font-semibold text-ink-soft mb-2">מסלול {monthly.label}</div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold font-display">₪{monthly.pricePerMonth}</span>
              <span className="text-xs text-ink-soft">/ לחודש</span>
            </div>
            <p className="text-xs text-ink-soft mb-5">{monthly.note}</p>
            <Link href="/signup" className="block w-full text-center rounded-xl py-3 text-sm font-semibold bg-card border border-line shadow-card">
              בחירת מסלול חודשי
            </Link>
          </div>
          <div className="rounded-2xl p-6 relative bg-white border-[1.5px] border-amber shadow-card">
            <span className="absolute -top-2.5 right-5 text-[10px] px-2.5 py-0.5 rounded-full tracking-wide bg-amber text-white">
              {annual.badge}
            </span>
            <div className="text-sm font-semibold text-ink-soft mb-2">מסלול {annual.label}</div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold font-display">₪{annual.pricePerMonth}</span>
              <span className="text-xs text-ink-soft">/ לחודש</span>
            </div>
            <p className="text-xs text-ink-soft mb-5">{annual.note}</p>
            <Link href="/signup" className="block w-full text-center rounded-xl py-3 text-sm font-semibold bg-amber-deep text-white">
              בחירת מסלול שנתי
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-ink-soft mt-5">ביטול בכל עת, בלי התחייבות.</p>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold font-display text-center mb-8">שאלות נפוצות</h2>
        <LandingFaq />
      </section>

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-3xl p-8 text-center bg-amber-deep text-white shadow-card">
          <h2 className="text-2xl font-bold font-display mb-3">מוכנים להתחיל?</h2>
          <p className="text-sm opacity-90 mb-6">ההרשמה לוקחת כמה דקות. בואו לנהל את העסק שלכם בלי כאב ראש.</p>
          <Link href="/signup" className="inline-block rounded-xl px-7 py-3.5 text-sm font-semibold bg-white text-ink">
            הרשמה עכשיו
          </Link>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-4 pb-10 text-center">
        <p className="text-[11px] text-ink-soft">
          © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט — צילום אירועים
        </p>
        <Link href="/login" className="text-[11px] text-ink-soft underline mt-1 inline-block">
          כניסה למשתמשים קיימים
        </Link>
      </footer>
    </div>
  );
}
