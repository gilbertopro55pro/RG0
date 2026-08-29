import Image from "next/image";
import Link from "next/link";
import LandingFaq from "@/components/LandingFaq";
import PricingAnchor from "@/components/PricingAnchor";
import TimeSavingsCalculator from "@/components/TimeSavingsCalculator";
import FeaturesGrid from "@/components/FeaturesGrid";
import PricingToggle from "@/components/PricingToggle";
import PlanComparison from "@/components/PlanComparison";

function Dot({ color }: { color: string }) {
  return <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
}

const BEFORE = [
  "רודפים אחרי לקוחות שלא עונים בוואטסאפ",
  "בונים חוזה מאפס לכל אירוע, שוב ושוב",
  "שוכחים תזכורת תשלום ומגלים שנשארתם בלי מקדמה",
  "מפספסים תאריך כי הוא לא סונכרן ליומן",
];

const AFTER = [
  "וואטסאפ אוטומטי שרץ מעצמו, כולל תזכורות תשלום",
  "חוזה מותאם לאירוע, חתום דיגיטלית תוך דקות",
  "כל תשלום עם תזכורת שיוצאת בזמן, בלי שתזכרו בעצמכם",
  "כל אירוע נכנס ליומן (Google או Apple) ברגע שנוצר",
  "כלי מובנה לעיצוב אלבומים, ישר מתוך הגלריה",
];

export default function LandingPage() {
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
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold font-display leading-[1.15] tracking-tight mb-5 text-balance">
          העסק שלכם מנוהל ב-15 אפליקציות שונות?
          <br />
          הגיע הזמן לקחת את העסק שלכם קדימה, והכל במקום אחד
        </h1>
        <p className="text-base sm:text-lg text-ink-soft leading-relaxed mb-8 max-w-xl mx-auto">
          כל האירועים, הגלריות, החוזים, התשלומים והלידים שלכם במקום אחד, שרץ ברקע בשבילכם, כדי
          שהשעות שהולכות היום על ניהול יחזרו להיות שעות צילום
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap mb-5">
          <Link href="/signup" className="rounded-xl px-6 py-3.5 text-sm font-semibold bg-amber-deep text-white">
            הרשמה עכשיו
          </Link>
          <a href="#pricing" className="rounded-xl px-6 py-3.5 text-sm font-semibold bg-card border border-line shadow-card">
            צפייה במחיר
          </a>
        </div>
        <p className="text-xs text-ink-soft">נרשמים, מגדירים את המחירים שלכם, ומתחילים לנהל אירועים תוך כמה דקות</p>
      </section>

      {/* Before/after — a direct comparison instead of a generic pain-points card, with a quiet
          colored label rather than a full accent rail down the card so it stays restrained. */}
      <section className="max-w-4xl mx-auto px-4 py-10">
        <h2 className="text-xl sm:text-2xl font-bold font-display text-center mb-10">ההבדל הוא בשעות שחוזרות אליכם</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="rounded-2xl p-7 bg-card border border-line shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-rose)" }} />
              <span className="text-xs font-bold tracking-wide text-ink-soft">בלי גילברטו</span>
            </div>
            <ul className="space-y-3">
              {BEFORE.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-ink-soft leading-relaxed">
                  <Dot color="var(--color-rose)" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-7 bg-card border border-line shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-sage)" }} />
              <span className="text-xs font-bold tracking-wide" style={{ color: "var(--color-sage)" }}>
                עם גילברטו
              </span>
            </div>
            <ul className="space-y-3">
              {AFTER.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <Dot color="var(--color-sage)" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features — icons sit inline beside the title, not inside a colored square, for a
          quieter, more editorial card treatment. Click-to-expand detail modals live in the
          client component below (LandingPage itself stays a server component). */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-display text-center mb-10">הכל במקום אחד</h2>
        <FeaturesGrid />
      </section>

      {/* Price anchoring — real category costs stacking up, landing on the real price below */}
      <PricingAnchor />

      {/* Interactive time-savings calculator — real user input driving a live, personalized result */}
      <TimeSavingsCalculator />

      {/* Pricing */}
      <section id="pricing" className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-display text-center mb-2">מחיר פשוט, בלי הפתעות</h2>
        <p className="text-sm text-ink-soft text-center mb-9">מחיר קבוע וברור מראש, בלי עמלות נסתרות ובלי הפתעות בחיוב</p>
        <PricingToggle />
        <PlanComparison />
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold font-display text-center mb-9">שאלות נפוצות</h2>
        <LandingFaq />
      </section>

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-4 py-14">
        <div className="rounded-3xl p-9 text-center bg-amber-deep text-white shadow-card">
          <h2 className="text-2xl font-bold font-display mb-3">מוכנים לקבל את השעות האלה בחזרה?</h2>
          <p className="text-sm opacity-90 mb-6">ההרשמה לוקחת כמה דקות, ואז אתם מנהלים את העסק בלי כאב ראש</p>
          <Link href="/signup" className="inline-block rounded-xl px-7 py-3.5 text-sm font-semibold bg-white text-ink">
            הרשמה עכשיו
          </Link>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-4 pb-10 text-center">
        <p className="text-[11px] text-ink-soft">
          © {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים
        </p>
        <Link href="/login" className="text-[11px] text-ink-soft underline mt-1 inline-block">
          כניסה למשתמשים קיימים
        </Link>
      </footer>
    </div>
  );
}
