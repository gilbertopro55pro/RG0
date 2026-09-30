import Link from "next/link";
import LandingFaq from "@/components/LandingFaq";
import LandingAlbumSection from "@/components/LandingAlbumSection";
import LandingMagnetSection from "@/components/LandingMagnetSection";
import TimeSavingsCalculator from "@/components/TimeSavingsCalculator";
import PricingToggle from "@/components/PricingToggle";
import PlanComparison from "@/components/PlanComparison";
import { LandingFooter, LANDING_CONTAINER } from "@/components/LandingChrome";

// Landing page, design 2026-09-28 (canvas "דף נחיתה Gilberto 2026", approved by the owner): white
// and cool grey with deep-navy bands and the app's deep brass as the one accent (tokens:
// .landing-2026 in globals.css). Owner's rules for this page: square corners (no pills), no italic
// emphasis, no numbered 01/02 labels, no monospace, no cream background. The hero still plays the
// real product tour (captions burned in, so it reads without sound).

// A typical road an event takes. Every line is something the product actually does today, worded
// as what it does: reminders are prepared and the photographer sends them, nothing goes out on its own.
const JOURNEY = [
  {
    title: "פנייה",
    icon: "M4 5h16v11H8l-4 4z",
    text: "כל ליד נכנס למקום אחד, והצעת מחיר מעוצבת יוצאת ישר מהטלפון. לליד שלא חזר, מחכה הודעת מעקב מוכנה.",
  },
  {
    title: "סגירה",
    icon: "M6 3h9l3 3v15H6zM9 13l2 2 4-4",
    text: "חוזה דיגיטלי שנחתם מהטלפון. המקדמה נרשמת, והאירוע נכנס ליומן Google או Apple.",
  },
  {
    title: "לפני האירוע",
    icon: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
    text: "פורטל אישי ללקוח עם השלבים והתשלומים. כשמגיע מועד היתרה, תזכורת מוכנה לשליחה בוואטסאפ.",
  },
  {
    title: "יום הצילום",
    icon: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    text: "מקום עם ניווט, שעות, טלפון הלקוח והחבילה, במסך אחד. בפרו+ מעלים לגלריה ישר מהמצלמה.",
  },
  {
    title: "גלריה ואלבום",
    icon: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
    text: "גלריה פרטית שבה הלקוח בוחר תמונות. האלבום מעוצב אוטומטית מהתמונות שבחר, והלקוח מאשר בפורטל.",
  },
  {
    title: "מסירה",
    icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z",
    text: "מסירה וסגירה עם תמונה ברורה של מה שולם. כמה ימים אחרי, תזכורת לבקש ביקורת.",
  },
];

const MORE = [
  { title: "לידים והצעות מחיר", icon: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5", text: "כל פנייה במקום אחד, הצעת מחיר מעוצבת בלחיצה." },
  { title: "חבילות ושלבים משלכם", icon: "M4 6h10M4 12h16M4 18h7M17 4v4M13 16v4", text: "מחירים, שלבי עבודה ונוסח ההודעות ללקוח, מותאמים לשיטה שלכם." },
  { title: "פורטפוליו ציבורי", icon: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z", text: "תיק עבודות לשיתוף, מתמלא מהגלריות שלכם בלחיצה (פרו ופרו+)." },
  { title: "דשבורד עסקי", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2", text: "הכנסות לפי חודש, מגמה, ותשלומים פתוחים." },
  {
    title: "צוות",
    icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9",
    text: "עוזרים וצלמים נוספים, כל אחד רואה רק את האירועים שלו.",
  },
  { title: "ייבוא מיומן Google", icon: "M4 6h16v14H4zM4 10h16M12 13v5M9.5 15.5L12 18l2.5-2.5", text: "אירועים שכבר ביומן נכנסים למערכת בסריקה אחת, בלי להקליד מחדש." },
];


function Icon({ d, size = 24, className = "", strokeWidth = 1.9 }: { d: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/signup"
      className={`h-14 px-7 rounded-[1px] inline-flex items-center justify-center gap-2.5 text-lg font-bold bg-[var(--l-accent)] text-[var(--l-on-accent)] ${className}`}
    >
      להתחיל 14 יום חינם
      <Icon d="M19 12H5M11 6l-6 6 6 6" size={18} strokeWidth={2.2} />
    </Link>
  );
}

const CONTAINER = LANDING_CONTAINER;

export default function LandingPage() {
  return (
    // min-h-screen + the opaque wrapper paint over the app body's fixed glow gradients (and the
    // body:has(.landing-2026) rule in globals.css turns that fixed layer off on this page).
    <div className="w-full min-h-screen landing-2026 font-sans">
      {/* HERO (navy) */}
      <section className="bg-[var(--l-navy)] text-[var(--l-on-navy)]">
        <div className={CONTAINER}>
          <header className="h-16 lg:h-[88px] flex items-center justify-between border-b border-[var(--l-navy-line)]">
            <Link href="/" className="flex items-center gap-2.5 text-[var(--l-on-navy)]">
              <span className="w-8 h-8 lg:w-9 lg:h-9 rounded-[8px] bg-[var(--l-accent)] text-[var(--l-on-accent)] flex items-center justify-center">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span className="font-display text-[19px] lg:text-[21px] font-bold tracking-tight">גילברטו</span>
            </Link>
            <nav className="flex items-center gap-4 lg:gap-8 text-[15px] lg:text-base">
              <a href="#features" className="hidden lg:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                איך זה עובד
              </a>
              <a href="#album" className="hidden lg:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                עיצוב אלבום
              </a>
              <a href="#pricing" className="hidden sm:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                מחירים
              </a>
              <a href="#faq" className="hidden lg:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                שאלות
              </a>
              <Link href="/login" className="text-[var(--l-on-navy)]">
                התחברות
              </Link>
              <Link href="/signup" className="h-11 px-4 lg:px-5 rounded-[10px] inline-flex items-center font-bold bg-[var(--l-on-navy)] text-[var(--l-navy)]">
                הרשמה
              </Link>
            </nav>
          </header>

          <div className="pt-10 pb-16 lg:pt-[88px] lg:pb-28 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12 lg:gap-16">
            <div className="flex flex-col gap-6 lg:gap-8 lg:max-w-[720px]">
              <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-on-navy-soft)]">
                <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
                מערכת לצלמי אירועים, שנבנתה ע״י צלם אירועים
              </div>
              <h1 className="font-display m-0 text-[54px] sm:text-7xl lg:text-[112px] leading-[0.98] font-bold tracking-[-0.035em] text-white text-balance">
                פחות ניהול.
                <br />
                יותר צילום.
              </h1>
              <p className="m-0 text-lg lg:text-[22px] leading-[1.55] text-[var(--l-on-navy-soft)] lg:max-w-[600px]">
                לידים, חוזים, תשלומים, גלריות ואלבומים במקום אחד. גילברטו מראה לכם בכל אירוע מה הצעד הבא, ומכינה את ההודעות
                ללקוח לפי שיטת העבודה שלכם.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                <PrimaryCta />
                <a
                  href="#pricing"
                  className="h-[52px] sm:h-14 px-6 rounded-[1px] inline-flex items-center justify-center border border-[var(--l-navy-border)] text-[var(--l-on-navy)] text-[17px] sm:text-lg font-semibold"
                >
                  כמה זה עולה
                </a>
              </div>
              <p className="m-0 text-sm lg:text-[15px] text-[var(--l-on-navy-mute)] text-center sm:text-right">
                בלי כרטיס אשראי. בזמן הניסיון כל האפשרויות של פרו+ פתוחות.
              </p>
            </div>

            {/* The product itself: the real tour, playing in a phone frame. */}
            <div className="relative self-center shrink-0 w-[260px] sm:w-[300px] lg:w-[440px] lg:h-[620px]">
              <div className="hidden lg:block absolute inset-[40px_20px_0_60px] rounded-[28px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)]" />
              <div className="relative lg:absolute lg:left-[100px] lg:top-0 w-full lg:w-[300px] rounded-[44px] p-3 bg-[#060a14] border border-[#2a3650] shadow-[0_40px_90px_rgba(0,0,0,0.5)]">
                <video
                  src="/guides/overview.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="סיור במערכת גילברטו"
                  className="block w-full aspect-[480/768] object-cover object-top rounded-[34px] bg-[var(--l-bg-alt)]"
                />
              </div>
              <div className="hidden lg:flex absolute right-0 bottom-16 w-[210px] flex-col gap-1 rounded-[14px] bg-white text-[var(--l-ink)] px-4 py-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
                <span className="text-xs text-[var(--l-ink-soft)]">עכשיו</span>
                <span className="text-sm font-bold leading-snug">הלקוחה אישרה את עיצוב האלבום</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* A person behind the product, right after the hero: a photographer who built it for himself is
          the one thing no competitor can copy, so it comes before the features (visitor feedback,
          2026-09-29). Dark so the quote stands out (owner's call); navy-2 with a rule on top so it
          reads as its own section, not the hero's tail. */}
      <section className="bg-[var(--l-navy-2)] text-[var(--l-on-navy)] border-t border-[var(--l-navy-line)]">
        <div className={`${CONTAINER} py-14 lg:py-24 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 lg:gap-20`}>
          <figure className="m-0 flex flex-col gap-5 lg:gap-7 lg:max-w-[820px]">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="var(--l-accent)" aria-hidden="true">
              <path d="M10 7H6a2 2 0 0 0-2 2v4h4v4h2V7zM20 7h-4a2 2 0 0 0-2 2v4h4v4h2V7z" />
            </svg>
            <blockquote className="font-display m-0 text-2xl lg:text-[38px] leading-[1.35] font-semibold tracking-[-0.015em] text-white">
              בניתי את גילברטו כי אחרי כל צילום אירוע חיכו לי עוד שעות של וואטסאפים, קבצים ותזכורות. היום כל זה מסודר ומוכן מראש,
              ואני חוזר לצלם.
            </blockquote>
            <figcaption className="flex items-center gap-3.5 text-base lg:text-lg text-[var(--l-on-navy-soft)]">
              {/* Phones: the whole photo, small, next to the name (owner: not just the face). Desktop shows the large one beside the quote. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/founder.jpg" alt="" className="lg:hidden w-[62px] h-[72px] object-cover rounded-[2px] border border-[var(--l-navy-border)]" />
              <span>רועי גלברט, צלם אירועים ומייסד גילברטו</span>
            </figcaption>
          </figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/founder.jpg"
            alt="רועי גלברט, צלם אירועים ומייסד גילברטו"
            loading="lazy"
            className="hidden lg:block w-[340px] aspect-[635/744] object-cover shrink-0 rounded-[2px] border border-[var(--l-navy-border)] shadow-[0_30px_70px_rgba(0,0,0,0.45)]"
          />
        </div>
      </section>

      {/* JOURNEY — a real sequence, drawn as a line of icons rather than numbers. */}
      <section id="features" className="bg-[var(--l-bg)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-32 flex flex-col gap-8 lg:gap-16`}>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3.5 lg:gap-16">
            <h2 className="font-display m-0 text-4xl lg:text-6xl leading-[1.05] font-bold tracking-[-0.03em] lg:max-w-[620px] text-balance">
              מהפנייה הראשונה ועד המסירה.
            </h2>
            <p className="m-0 text-[17px] lg:text-[19px] leading-relaxed text-[var(--l-ink-soft)] lg:max-w-[520px]">
              כל צלם עובד אחרת. אתם מגדירים את החבילות, השלבים וההודעות ללקוח, וגילברטו מסדרת את העבודה סביבם. ככה נראית דרך
              טיפוסית של אירוע:
            </p>
          </div>
          <ol className="relative m-0 p-0 list-none grid grid-cols-1 lg:grid-cols-6 gap-7">
            <span aria-hidden="true" className="absolute bg-[var(--l-line)] right-[23px] top-6 bottom-6 w-0.5 lg:right-7 lg:left-7 lg:top-[27px] lg:bottom-auto lg:w-auto lg:h-0.5" />
            {JOURNEY.map((step) => (
              <li key={step.title} className="relative flex lg:flex-col gap-4">
                <span className="w-12 h-12 lg:w-14 lg:h-14 shrink-0 rounded-[12px] lg:rounded-[14px] bg-[var(--l-navy)] text-[var(--l-accent)] flex items-center justify-center shadow-[0_0_0_6px_#fff] lg:shadow-[0_0_0_8px_#fff]">
                  <Icon d={step.icon} size={22} />
                </span>
                <span className="flex flex-col gap-1.5 lg:gap-4 pt-1 lg:pt-0">
                  <span className="font-display text-xl lg:text-[22px] font-bold tracking-tight">{step.title}</span>
                  <span className="text-base leading-relaxed text-[var(--l-ink-soft)]">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0 flex items-start gap-3.5 rounded-[14px] bg-[var(--l-bg-alt)] px-5 py-4 lg:px-6 lg:py-5 text-base lg:text-[17px] text-[#3a4560]">
            <Icon d="M4 6h16M4 12h10M4 18h6" size={22} className="shrink-0 mt-0.5 text-[var(--l-ink)]" />
            השלבים כאן הם דוגמה. בכל חבילה בונים מסלול משלכם, ואפשר לסמן שלב כבוצע בכל סדר, כי לא כל לקוח מתקדם באותו קצב.
          </p>
        </div>
      </section>

      {/* MORE */}
      <section className="bg-[var(--l-bg-alt)]">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col gap-6 lg:gap-12`}>
          <h2 className="font-display m-0 text-3xl lg:text-5xl leading-[1.1] font-bold tracking-[-0.025em]">ועוד דברים שתשתמשו בהם כל שבוע</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-4">
            {MORE.map((item) => (
              <div key={item.title} className="flex lg:flex-col gap-3.5 rounded-[16px] lg:rounded-[18px] bg-white border border-[var(--l-line)] p-5 lg:p-8 lg:min-h-[180px]">
                <Icon d={item.icon} size={28} className="shrink-0 text-[var(--l-accent)] w-6 h-6 lg:w-7 lg:h-7" />
                <span className="flex flex-col gap-1 lg:gap-3.5">
                  <span className="font-display text-lg lg:text-[22px] font-bold tracking-tight">{item.title}</span>
                  <span className="text-[15px] lg:text-[17px] leading-relaxed text-[var(--l-ink-soft)]">{item.text}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The automatic album designer (owner, 2026-09-30). */}
      <LandingAlbumSection />

      {/* The magnet frame designer, its own section (owner, 2026-09-30). */}
      <LandingMagnetSection />

      {/* The intake assistant: a real recorded conversation with the test account's assistant
          (public/guides/intake-demo.mp4, recorded with the guide-video skill), and the FAQ it
          answers from. Plan limits mirror INTAKE_MONTHLY_CAP in lib/intakeAssistant.ts. */}
      <section id="assistant" className="bg-[var(--l-navy)] text-[var(--l-on-navy)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12 lg:gap-20`}>
          <div className="flex flex-col gap-6 lg:gap-7 lg:max-w-[640px]">
            <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-on-navy-soft)]">
              <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
              עוזר פניות חכם
            </div>
            <h2 className="font-display m-0 text-4xl lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em] text-white text-balance">
              לקוח כותב בשתיים בלילה. מישהו כבר עונה לו.
            </h2>
            <p className="m-0 text-[17px] lg:text-[19px] leading-relaxed text-[var(--l-on-navy-soft)]">
              עוזר הפניות מדבר עם לקוחות חדשים כמו בן אדם, מהקישור בוואטסאפ או באתר שלכם. הוא בודק ביומן אם התאריך פנוי, שואל את
              השאלות הנכונות, ומעביר לכם ליד מסודר עם כל פרטי האירוע, במייל ובאופן אוטומטי במערכת.
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-3.5">
              {[
                { icon: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4M9 15l2 2 4-4", text: "בודק זמינות מול האירועים ויומן Google שלכם" },
                { icon: "M4 5h16v11H8l-4 4zM9 9h6M9 12h4", text: "עונה בשפה אנושית, שאלה אחת בכל פעם" },
                { icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M19 8v6M16 11h6", text: "הפניות מופיעות כליד באפליקציה באופן אוטומטי, עם כל הפרטים" },
              ].map((f) => (
                <li key={f.text} className="flex items-center gap-3.5 text-base lg:text-[17px]">
                  <span className="w-10 h-10 shrink-0 rounded-[10px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] text-[var(--l-accent)] flex items-center justify-center">
                    <Icon d={f.icon} size={20} />
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>

            {/* Behind the scenes: what the photographer writes in settings › אוטומציה. */}
            <div className="rounded-[14px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] p-5 lg:p-6 flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-lg font-bold text-white">מאחורי הקלעים: שאלות ותשובות משלכם</span>
                <span className="text-xs text-[var(--l-on-navy-mute)] whitespace-nowrap">הגדרות › אוטומציה</span>
              </div>
              <p className="m-0 text-[15px] leading-relaxed text-[var(--l-on-navy-soft)]">
                כותבים לעוזר את התשובות שלכם, והוא עונה לפיהן במקום להמציא. אפשר גם להוסיף שאלה משלכם שהוא ישאל כל לקוח.
              </p>
              {[
                { q: "מתי מקבלים את התמונות?", a: "גלריה ראשונה תוך שבוע, וכל התמונות תוך 45 יום." },
                { q: "מגיעים גם לצפון?", a: "כן, לכל הארץ. פרטי הנסיעה יופיעו בהצעת המחיר." },
              ].map((item) => (
                <div key={item.q} className="rounded-[10px] bg-[var(--l-navy)] border border-[var(--l-navy-line)] px-4 py-3 flex flex-col gap-1">
                  <span className="text-[15px] font-semibold text-white">{item.q}</span>
                  <span className="text-sm text-[var(--l-on-navy-soft)]">{item.a}</span>
                </div>
              ))}
              <span className="text-sm font-semibold text-[var(--l-accent)]">+ שאלה חדשה</span>
            </div>
            <p className="m-0 text-sm text-[var(--l-on-navy-mute)]">בכל המסלולים: פרו סטארט עד 100 שיחות בחודש, פרו עד 150, ופרו+ עד 200.</p>
          </div>

          {/* A real conversation with the assistant, recorded from the live site. */}
          <div className="self-center shrink-0 w-[260px] sm:w-[300px] lg:w-[340px]">
            <div className="rounded-[44px] p-3 bg-[#060a14] border border-[#2a3650] shadow-[0_40px_90px_rgba(0,0,0,0.5)]">
              <video
                src="/guides/intake-demo.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="הדגמה: שיחה של לקוח עם עוזר הפניות"
                className="block w-full aspect-[480/768] object-cover object-top rounded-[34px] bg-[var(--l-bg-alt)]"
              />
            </div>
            <p className="m-0 mt-3 text-center text-xs text-[var(--l-on-navy-mute)]">שיחה אמיתית עם העוזר, מחשבון הדגמה</p>
          </div>
        </div>
      </section>

      {/* Interactive time-savings calculator: the visitor's own numbers, not ours. */}
      <TimeSavingsCalculator />

      <section id="pricing" className="bg-[var(--l-bg-alt)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col gap-6 lg:gap-10`}>
          <div className="flex flex-col gap-2.5 lg:gap-3.5 lg:items-center lg:text-center">
            <h2 className="font-display m-0 text-[34px] lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em]">מחיר קבוע, בלי הפתעות</h2>
            <p className="m-0 text-base lg:text-[19px] text-[var(--l-ink-soft)]">14 יום ניסיון חינם, בלי כרטיס אשראי. בלי עמלות נסתרות, וביטול בכל עת.</p>
          </div>
          <PricingToggle />
          <PlanComparison />
        </div>
      </section>

      <section id="faq" className="bg-[var(--l-bg)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col lg:flex-row gap-5 lg:gap-24`}>
          <div className="lg:w-[380px] shrink-0">
            <h2 className="font-display m-0 text-3xl lg:text-5xl leading-[1.1] font-bold tracking-[-0.025em]">שאלות נפוצות</h2>
          </div>
          <div className="flex-1 min-w-0">
            <LandingFaq />
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
