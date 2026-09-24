import Image from "next/image";
import Link from "next/link";
import LandingFaq from "@/components/LandingFaq";
import TimeSavingsCalculator from "@/components/TimeSavingsCalculator";
import PricingToggle from "@/components/PricingToggle";
import PlanComparison from "@/components/PlanComparison";

// Landing page, rebuilt 2026-09-24 against the frontend-design review (approved sketch):
// the hero shows the product itself (the real overview tour, muted and looping; its captions are
// burned in, so it reads without sound), the middle tells the road every event takes as a real
// sequence, and a photographer's own voice replaces the generic "without / with" and the
// unsourced "what it would cost with separate tools" stack.

// A typical road an event takes. Every line is something the product actually does today, worded
// as what it does: reminders are prepared and the photographer sends them, nothing goes out on its own.
const JOURNEY = [
  {
    title: "פנייה",
    text: "כל ליד נכנס למקום אחד, ובונים לו הצעת מחיר מעוצבת ישר מהטלפון. לליד שלא חזר אליכם, המערכת מכינה הודעת מעקב ומזכירה לכם לשלוח.",
  },
  {
    title: "סגירה",
    text: "הלקוח חותם על החוזה דיגיטלית, מהטלפון. המקדמה נרשמת, והאירוע נכנס ליומן Google או Apple שחיברתם.",
  },
  {
    title: "לפני האירוע",
    text: "הלקוח מקבל קישור לפורטל אישי: שלבי האירוע, מה מחכה לו ומצב התשלומים. כשמגיע מועד היתרה, תזכורת מוכנה מחכה לכם לשליחה בוואטסאפ.",
  },
  {
    title: "יום הצילום",
    text: "כל פרטי היום במקום אחד: מקום עם ניווט בלחיצה, שעות, טלפון הלקוח והחבילה שנסגרה. במסלול פרו+ אפשר להעלות תמונות לגלריה ישירות מהמצלמה, עוד במהלך האירוע.",
  },
  {
    title: "גלריה ואלבום",
    text: "גלריה פרטית ללקוח, שבה הוא בוחר את התמונות לאלבום. במסלולי פרו ופרו+ מעצבים את האלבום מתוך הגלריה, והלקוח מאשר את העיצוב בפורטל.",
  },
  {
    title: "מסירה",
    text: "מסירה סופית וסגירת האירוע, עם תמונה ברורה של מה שולם. כמה ימים אחרי, המערכת מזכירה לכם לבקש מהלקוח ביקורת.",
  },
];

const MORE = [
  { title: "לידים והצעות מחיר", text: "כל פנייה במקום אחד, הצעת מחיר מעוצבת בלחיצה." },
  { title: "חבילות ושלבים משלכם", text: "מחירים, שלבי עבודה ונוסח ההודעות ללקוח, מותאמים לשיטת העבודה שלכם." },
  { title: "פורטפוליו ציבורי", text: "תיק עבודות לשיתוף, שמוסיפים אליו תמונות וגלריות בלחיצה (פרו ופרו+)." },
  { title: "דשבורד עסקי", text: "הכנסות לפי חודש, מגמה, ותשלומים פתוחים." },
  { title: "צוות", text: "עוזרים וצלמים נוספים, כל אחד רואה את האירועים שלו." },
  { title: "עברית מלאה", text: "נבנה בעברית, לצלמים בישראל." },
];

const FOOTER_LINKS = [
  { href: "/login", label: "כניסה למשתמשים קיימים" },
  { href: "/terms", label: "תקנון שימוש" },
  { href: "/privacy", label: "מדיניות פרטיות" },
  { href: "/cookies", label: "מדיניות עוגיות" },
  { href: "/cancellation-policy", label: "מדיניות ביטולים" },
  { href: "/accessibility", label: "הצהרת נגישות" },
  { href: "/business-info", label: "פרטי העסק" },
];

function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <Link href="/signup" className={`rounded-2xl px-6 py-3.5 text-base font-extrabold bg-ink text-white ${className}`}>
      מתחילים עכשיו
    </Link>
  );
}

export default function LandingPage() {
  return (
    // landing-warm: the landing's own warmer paper/ink tokens (see globals.css). min-h-screen + an
    // explicit background paint over the app body's fixed glow gradients.
    <div className="w-full min-h-screen landing-warm" style={{ background: "var(--color-paper)" }}>
      <header className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/icons/icon-192.png" alt="" width={38} height={38} className="rounded-xl" />
          <div className="flex flex-col leading-tight">
            <span className="font-display font-extrabold text-lg">גילברטו</span>
            <span className="text-[11px] text-ink-soft">ניהול אירועים לצלמים</span>
          </div>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="#pricing" className="text-ink-soft hidden sm:inline">
            מחירים
          </a>
          <Link href="/login" className="text-ink-soft">
            התחברות
          </Link>
          <Link href="/signup" className="rounded-xl px-4 py-2 font-bold bg-ink text-white">
            הרשמה
          </Link>
        </nav>
      </header>

      {/* Hero: the claim, and the product itself playing next to it. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-10 sm:pt-14 pb-16 sm:pb-24 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10 lg:gap-16">
        <div className="flex flex-col gap-5 max-w-xl">
          <h1 className="text-[44px] sm:text-6xl lg:text-7xl font-black font-display leading-[1.02] tracking-tight text-balance">
            פחות ניהול.
            <br />
            יותר צילום.
          </h1>
          <p className="text-[17px] sm:text-xl leading-relaxed text-ink-soft max-w-lg">
            גילברטו מרכזת לצלמי אירועים את הלידים, החוזים, התשלומים, הגלריות והאלבומים במקום אחד, ומזכירה לכם
            מה הצעד הבא בכל אירוע. הכל לפי שיטת העבודה שלכם.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryCta />
            <a href="#pricing" className="rounded-2xl px-6 py-3.5 text-base font-bold border border-line" style={{ background: "var(--color-card)" }}>
              כמה זה עולה
            </a>
          </div>
        </div>
        <div className="self-center shrink-0 w-[260px] sm:w-[300px] lg:w-[330px] rounded-[44px] p-3 bg-[#1b1712] border border-line shadow-[0_40px_80px_rgba(36,29,21,0.22),0_8px_20px_rgba(36,29,21,0.12)]">
          <video
            src="/guides/overview.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="סיור במערכת גילברטו"
            className="block w-full aspect-[480/768] object-cover object-top rounded-[32px]"
            style={{ background: "var(--color-paper)" }}
          />
        </div>
      </section>

      {/* The road every event takes — numbered because it really is a sequence. */}
      <section className="border-y border-line" style={{ background: "var(--color-card)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16 sm:py-20 flex flex-col gap-8">
          <div className="flex flex-col gap-3 max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-balance">מהפנייה הראשונה ועד המסירה</h2>
            <p className="text-base sm:text-lg text-ink-soft">
              כל צלם עובד אחרת. אתם מגדירים את החבילות, השלבים וההודעות ללקוח, וגילברטו מסדרת את העבודה סביבם: מה
              הבא בתור, מה הלקוח צריך לעשות ומה עוד לא שולם. ככה נראית דרך טיפוסית של אירוע:
            </p>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10">
            {JOURNEY.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-1.5 py-5 border-t border-line">
                <span className="text-[13px] font-extrabold font-data" style={{ color: "var(--color-amber-deep)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xl font-extrabold">{step.title}</span>
                <span className="text-[15px] leading-relaxed text-ink-soft">{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="text-[15px] text-ink-soft max-w-2xl">
            השלבים כאן הם דוגמה. בכל חבילה בונים מסלול משלכם, עם השלבים שלכם ובסדר שלכם, ואפשר לסמן שלב כבוצע
            בכל סדר, כי לא כל לקוח מתקדם באותו קצב.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-16 sm:py-20 flex flex-col gap-6">
        <h2 className="text-2xl sm:text-3xl font-black font-display tracking-tight">ועוד כמה דברים שתשתמשו בהם כל שבוע</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10">
          {MORE.map((item) => (
            <div key={item.title} className="flex flex-col gap-1 py-4 border-t border-line">
              <span className="text-base font-extrabold">{item.title}</span>
              <span className="text-sm leading-relaxed text-ink-soft">{item.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive time-savings calculator: the visitor's own numbers, not ours. */}
      <TimeSavingsCalculator />

      <section id="pricing" className="max-w-3xl mx-auto px-4 py-14 scroll-mt-6">
        <h2 className="text-3xl font-black font-display text-center mb-2">מחיר קבוע, בלי הפתעות</h2>
        <p className="text-sm text-ink-soft text-center mb-9">שלושה מסלולים, בלי עמלות נסתרות, וביטול בכל עת</p>
        <PricingToggle />
        <PlanComparison />
      </section>

      {/* A person behind the product. */}
      {/* Inline colors, not bg-ink: the app's dark theme repaints .bg-ink as brass (globals.css). Ink/paper
          simply swap here, so the band inverts in both themes. */}
      <section style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <figure className="flex flex-col gap-4 max-w-2xl m-0">
            <blockquote className="m-0 text-[22px] sm:text-2xl leading-relaxed font-semibold">
              &quot;בניתי את גילברטו כי אחרי כל צילום אירוע חיכו לי עוד שעות של וואטסאפים, קבצים ותזכורות. היום כל זה
              קורה לבד, ואני חוזר לצלם.&quot;
            </blockquote>
            <figcaption className="text-[15px] opacity-75">רועי גלברט, צלם אירועים ומייסד גילברטו</figcaption>
          </figure>
          <Link
            href="/signup"
            className="self-start lg:self-center rounded-2xl px-7 py-4 text-base font-extrabold whitespace-nowrap"
            style={{ background: "#d2ad68", color: "#1b1712" }}
          >
            מתחילים עכשיו
          </Link>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-4 py-14">
        <h2 className="text-3xl font-black font-display text-center mb-9">שאלות נפוצות</h2>
        <LandingFaq />
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-8 pb-10 pt-6 border-t border-line flex flex-col gap-3">
        <p className="text-xs text-ink-soft">© {new Date().getFullYear()} כל הזכויות שמורות לרועי גלברט, צילום אירועים</p>
        <nav className="flex items-center gap-x-5 gap-y-2 flex-wrap">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-xs text-ink-soft underline underline-offset-2">
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
