import type { Metadata } from "next";
import Link from "next/link";
import LandingFaq from "@/components/LandingFaq";
import LandingQuoteSection from "@/components/LandingQuoteSection";
import LandingMagnetSection from "@/components/LandingMagnetSection";
import TimeSavingsCalculator from "@/components/TimeSavingsCalculator";
import LandingPainSection from "@/components/LandingPainSection";
import LandingProcessSection from "@/components/LandingProcessSection";
import PricingToggle from "@/components/PricingToggle";
import PlanComparison from "@/components/PlanComparison";
import { LandingFooter, LandingLangSwitch, LANDING_CONTAINER, authHref, landingHome } from "@/components/LandingChrome";
import ClientLangScope from "@/i18n/ClientLangScope";
import { dirOf, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT, type TFn } from "@/i18n/translate";

// Landing page, design 2026-09-28 (canvas "דף נחיתה Gilberto 2026", approved by the owner): white
// and cool grey with deep-navy bands and the app's deep brass as the one accent (tokens:
// .landing-2026 in globals.css). Owner's rules for this page: square corners (no pills), no italic
// emphasis, no numbered 01/02 labels, no monospace, no cream background. The hero still plays the
// real product tour (captions burned in, so it reads without sound).
//
// Languages (2026-10-04): Hebrew at "/" (and /landing), English at /en and Russian at /ru, for ads.
// Every visible string goes through t() with the page's own lang (src/i18n/dict/landing.ts); the
// Hebrew text is the key, so the Hebrew page renders exactly as before. Server components here
// translate with makeT(messagesFor(lang)); the client sections (FAQ, pricing, calculator) read the
// same lang from the ClientLangScope this page wraps itself in, never from the ui_lang cookie.

// The hero's tiles: what the product does, one line each (landing sketch 2, 2026-10-11).
const HERO_TILES = [
  { icon: "M4 5h16v11H8l-4 4zM9 9h6M9 12h4", text: "עוזר חכם שמשיב ללקוחות גם בלילה" },
  { icon: "M6 3h9l3 3v15H6zM9 13l2 2 4-4", text: "הצעת מחיר וחוזה בקישור אחד" },
  { icon: "M4 6h10M4 12h16M4 18h7M17 4v4M13 16v4", text: "תהליך עבודה לפי השיטה שלכם" },
  { icon: "M12 3v2M5 10a7 7 0 0 1 14 0v5l2 3H3l2-3zM10 21h4", text: "תזכורות תשלום וקבלות" },
  { icon: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6", text: "גלריה ועיצוב אלבום אוטומטי" },
  { icon: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4", text: "סנכרון עם יומן Google ו-Apple" },
];

// What waits on the phone after a wedding: the pain, in the clients' own words.
const NIGHT_MESSAGES = [
  { text: "היי, ה-14.12 עדיין פנוי? מחפשים צלם לבר מצווה", meta: "פנייה חדשה, לפני שעתיים" },
  { text: "אפשר לקבל את הצעת המחיר שוב? לא מוצאת אותה", meta: "לקוחה, אתמול" },
  { text: "מתי הגלריה מהחינה מוכנה? 🙏", meta: "לקוחה, לפני 3 ימים" },
];

const MORE = [
  { title: "לידים והצעות מחיר", icon: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5", text: "כל פנייה במקום אחד, והצעת מחיר בקישור שהלקוח מאשר בטלפון." },
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

// "**x**" in a translated line is set in the accent color, so the translations keep the emphasis.
function emphasized(text: string) {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <b key={i} className="font-semibold text-[var(--l-accent-light)]">
        {part}
      </b>
    ) : (
      part
    )
  );
}

function PrimaryCta({ lang, t, className = "" }: { lang: Lang; t: TFn; className?: string }) {
  return (
    <Link
      href={authHref("/signup", lang)}
      className={`h-14 px-7 rounded-[1px] inline-flex items-center justify-center gap-2.5 text-lg font-bold bg-[var(--l-accent)] text-[var(--l-on-accent)] ${className}`}
    >
      {t("להתחיל 14 ימי ניסיון חינם")}
      <Icon d="M19 12H5M11 6l-6 6 6 6" size={18} strokeWidth={2.2} className="ltr:rotate-180" />
    </Link>
  );
}

const CONTAINER = LANDING_CONTAINER;

// Metadata for each language's landing URL: the Hebrew page keeps its canonical "/", and all three
// point at each other (hreflang) so search engines show the right one. openGraph/twitter are set in
// full because a child's openGraph replaces the root layout's rather than merging into it.
// The link preview (WhatsApp, Facebook) is the landing hero itself with the logo small at the top
// left (owner, 2026-10-11), one image per language (public/og, made by scripts/landing-og). Only the
// landing routes get it: every other page keeps the root layout's app icon, so a quote or gallery
// link a photographer sends a client never previews as an ad.
export function landingMetadata(lang: Lang): Metadata {
  const t = makeT(messagesFor(lang));
  const title = t("גילברטו | ניהול תהליך צילום אירועים");
  const description = t("מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה");
  const languages = { he: "/", en: "/en", ru: "/ru" };
  const alternates = { canonical: landingHome(lang), languages };
  const image = {
    url: `/og/landing-${lang}.jpg`,
    width: 1200,
    height: 630,
    alt: `${t("צלמים, אתם מתמקדים בצילום,")} ${t("ואת הניהול אנחנו לוקחים על עצמנו.")}`,
  };
  return {
    // The Hebrew page's title/description stay the root layout's, exactly as before.
    ...(lang === "he" ? {} : { title, description }),
    alternates,
    openGraph: {
      type: "website",
      title,
      description,
      siteName: t("גילברטו"),
      locale: lang === "ru" ? "ru_RU" : lang === "en" ? "en_US" : "he_IL",
      url: landingHome(lang),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function LandingPage({ lang = "he" }: { lang?: Lang }) {
  const t = makeT(messagesFor(lang));
  return (
    // min-h-screen + the opaque wrapper paint over the app body's fixed glow gradients (and the
    // body:has(.landing-2026) rule in globals.css turns that fixed layer off on this page).
    <ClientLangScope lang={lang}>
    <div dir={dirOf(lang)} lang={lang} className="w-full min-h-screen landing-2026 font-sans">
      {/* HERO (navy) */}
      <section className="bg-[var(--l-navy)] text-[var(--l-on-navy)]">
        <div className={CONTAINER}>
          {/* Language switcher: its own thin row above the header, so the Hebrew header keeps its
              layout on a 390px phone. */}
          <div className="h-9 flex items-center justify-end">
            <LandingLangSwitch lang={lang} />
          </div>
          <header className="h-16 lg:h-[88px] flex items-center justify-between border-b border-[var(--l-navy-line)]">
            <Link href={landingHome(lang)} className="flex items-center gap-2.5 text-[var(--l-on-navy)]">
              <span className="w-8 h-8 lg:w-9 lg:h-9 rounded-[8px] bg-[var(--l-accent)] text-[var(--l-on-accent)] flex items-center justify-center">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span className="font-display text-[19px] lg:text-[21px] font-bold tracking-tight">{t("גילברטו")}</span>
            </Link>
            <nav className="flex items-center gap-4 lg:gap-8 text-[15px] lg:text-base">
              <a href="#features" className="hidden lg:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                {t("איך זה עובד")}
              </a>
              <a href="#pricing" className="hidden sm:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                {t("מחירים")}
              </a>
              <a href="#faq" className="hidden lg:inline text-[var(--l-on-navy-soft)] hover:text-[var(--l-on-navy)]">
                {t("שאלות")}
              </a>
              <Link href={authHref("/login", lang)} className="text-[var(--l-on-navy)]">
                {t("התחברות")}
              </Link>
              <Link href={authHref("/signup", lang)} className="h-11 px-4 lg:px-5 rounded-[10px] inline-flex items-center font-bold bg-[var(--l-on-navy)] text-[var(--l-navy)]">
                {t("הרשמה")}
              </Link>
            </nav>
          </header>

          {/* Landing sketch 2 (owner, 2026-10-11), the first of its three headlines: the photographer
              shoots, the system takes the management. The founder's quote and a night of client
              messages sit beside it (the product tour video moved out with that sketch). */}
          <div className="pt-10 pb-14 lg:pt-16 lg:pb-24 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14 lg:items-start">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-on-navy-soft)]">
                <span className="w-2 h-2 shrink-0 rounded-[2px] bg-[var(--l-accent)]" />
                {t("מערכת ניהול לצלמי אירועים, שפותחה בידי צלם אירועים")}
              </div>
              <h1 className="font-display mt-5 mb-0 text-[40px] sm:text-6xl lg:text-[70px] leading-[1.06] font-bold tracking-[-0.03em] text-white text-balance">
                {t("צלמים, אתם מתמקדים בצילום,")} <span className="text-[var(--l-accent-light)]">{t("ואת הניהול אנחנו לוקחים על עצמנו.")}</span>
              </h1>
              <div className="mt-5 lg:mt-6 flex flex-col gap-3 text-[17px] lg:text-xl leading-[1.6] lg:max-w-[640px]">
                <p className="m-0 font-semibold text-white">
                  {t("הפכתם לצלמים מתוך אהבה לצילום ומתוך כישרון אמיתי, ולא כדי להעביר את הערבים בהודעות וואטסאפ, בחוזים ובתזכורות תשלום.")}
                </p>
                <p className="m-0 text-[var(--l-on-navy-soft)]">
                  {emphasized(
                    t(
                      "אך מאחורי כל אירוע מסתתרות **כארבע וחצי שעות של עבודה מנהלית**, מהפנייה הראשונה ועד מסירת האלבום. צלם שמצלם שישה אירועים בחודש מאבד כך **יותר מ-40 ימי עבודה בשנה**. גילברטו לוקחת על עצמה את רוב העבודה הזו, כדי שתוכלו לחזור לעיסוק שבשבילו פתחתם את העסק."
                    )
                  )}
                </p>
              </div>
              <div className="mt-7 flex flex-col sm:flex-row sm:flex-wrap gap-2.5 sm:gap-3">
                <PrimaryCta lang={lang} t={t} />
                <a
                  href="#calc"
                  className="min-h-[52px] sm:min-h-14 px-6 py-2 rounded-[1px] inline-flex items-center justify-center text-center border border-[var(--l-navy-border)] text-[var(--l-on-navy)] text-[17px] sm:text-lg font-semibold"
                >
                  {t("כמה זמן אתם משקיעים בעבודה מנהלית?")}
                </a>
              </div>
              <p className="mt-3 mb-0 text-sm text-[var(--l-on-navy-mute)]">
                {t("ללא כרטיס אשראי. החישוב: כ-270 דקות של עבודה מנהלית לאירוע (הפירוט בהמשך העמוד), שישה אירועים בחודש ויום עבודה בן שמונה שעות.")}
              </p>

              <ul aria-label={t("מה המערכת עושה")} className="mt-7 mb-0 p-0 list-none grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {HERO_TILES.map((tile) => (
                  <li key={tile.text} className="min-w-0 flex flex-col gap-2 rounded-[12px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] p-3">
                    <Icon d={tile.icon} size={22} className="text-[var(--l-accent-light)]" />
                    <span className="text-[13.5px] font-semibold leading-snug">{t(tile.text)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              <figure className="m-0 flex gap-4 items-start rounded-[14px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/founder.jpg" alt="" className="w-20 h-[94px] shrink-0 object-cover rounded-[2px] border border-[var(--l-navy-border)]" />
                <div className="min-w-0">
                  <blockquote className="m-0 text-lg leading-normal font-semibold text-white">
                    {lang === "he" ? "״" : lang === "ru" ? "«" : "“"}
                    {t("פיתחתי את גילברטו משום שאחרי כל אירוע חיכו לי עוד שעות ארוכות של הודעות, קבצים ותזכורות. היום כל אלה מסודרים ומוכנים מראש, ואני מתפנה לצלם.")}
                    {lang === "he" ? "״" : lang === "ru" ? "»" : "”"}
                  </blockquote>
                  <figcaption className="mt-2.5 text-sm text-[var(--l-on-navy-soft)]">{t("רועי גלברט, צלם אירועים ומייסד גילברטו")}</figcaption>
                </div>
              </figure>
              <div role="group" aria-label={t("דוגמה להודעות שמחכות אחרי אירוע")} className="flex flex-col gap-2 rounded-[14px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] p-4">
                <span className="text-xs text-[var(--l-on-navy-mute)]">{t("01:12, בדרך הביתה מחתונה")}</span>
                {NIGHT_MESSAGES.map((m) => (
                  <div key={m.text} className="max-w-[92%] rounded-[10px] rounded-ee-[2px] bg-[#1d2a40] px-3 py-2 text-sm text-[#e9edf5]">
                    {t(m.text)}
                    <small className="block mt-0.5 text-[11.5px] text-[var(--l-on-navy-mute)]">{t(m.meta)}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingPainSection lang={lang} />

      <LandingProcessSection lang={lang} />

      {/* Interactive time-savings calculator: the visitor's own numbers, not ours. */}
      <TimeSavingsCalculator />

      {/* The quote flow: link → approval → questionnaire → contract → event (owner, 2026-10-01). */}
      <LandingQuoteSection lang={lang} />

      {/* The automatic album designer (owner, 2026-09-30). */}

      {/* The magnet frame designer, its own section (owner, 2026-09-30). */}
      <LandingMagnetSection lang={lang} />

      {/* The intake assistant: a real recorded conversation with the test account's assistant
          (public/guides/intake-demo.mp4, recorded with the guide-video skill), and the FAQ it
          answers from. Plan limits mirror INTAKE_MONTHLY_CAP in lib/intakeAssistant.ts. */}
      <section id="assistant" className="bg-[var(--l-navy)] text-[var(--l-on-navy)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12 lg:gap-20`}>
          <div className="flex flex-col gap-6 lg:gap-7 lg:max-w-[640px]">
            <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-on-navy-soft)]">
              <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
              {t("עוזר פניות חכם")}
            </div>
            <h2 className="font-display m-0 text-4xl lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em] text-white text-balance">
              {t("לקוח כותב בשתיים בלילה. מישהו כבר עונה לו.")}
            </h2>
            <p className="m-0 text-[17px] lg:text-[19px] leading-relaxed text-[var(--l-on-navy-soft)]">
              {t("עוזר הפניות מדבר עם לקוחות חדשים כמו בן אדם, מהקישור בוואטסאפ או באתר שלכם. הוא בודק ביומן אם התאריך פנוי, שואל את השאלות הנכונות, ומעביר לכם ליד מסודר עם כל פרטי האירוע, במייל ובאופן אוטומטי במערכת.")}
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
                  {t(f.text)}
                </li>
              ))}
            </ul>

            {/* Behind the scenes: what the photographer writes in settings › התראות ואוטומציה. */}
            <div className="rounded-[14px] bg-[var(--l-navy-2)] border border-[var(--l-navy-line)] p-5 lg:p-6 flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-lg font-bold text-white">{t("מאחורי הקלעים: שאלות ותשובות משלכם")}</span>
                <span className="text-xs text-[var(--l-on-navy-mute)] whitespace-nowrap">{t("הגדרות › התראות ואוטומציה")}</span>
              </div>
              <p className="m-0 text-[15px] leading-relaxed text-[var(--l-on-navy-soft)]">
                {t("כותבים לעוזר את התשובות שלכם, והוא עונה לפיהן במקום להמציא. אפשר גם להוסיף שאלה משלכם שהוא ישאל כל לקוח.")}
              </p>
              {[
                { q: "מתי מקבלים את התמונות?", a: "גלריה ראשונה תוך שבוע, וכל התמונות תוך 45 יום." },
                { q: "מגיעים גם לצפון?", a: "כן, לכל הארץ. פרטי הנסיעה יופיעו בהצעת המחיר." },
              ].map((item) => (
                <div key={item.q} className="rounded-[10px] bg-[var(--l-navy)] border border-[var(--l-navy-line)] px-4 py-3 flex flex-col gap-1">
                  <span className="text-[15px] font-semibold text-white">{t(item.q)}</span>
                  <span className="text-sm text-[var(--l-on-navy-soft)]">{t(item.a)}</span>
                </div>
              ))}
              <span className="text-sm font-semibold text-[var(--l-accent)]">{t("+ שאלה חדשה")}</span>
            </div>
            <p className="m-0 text-sm text-[var(--l-on-navy-mute)]">{t("בכל המסלולים: פרו סטארט עד 100 שיחות בחודש, פרו עד 150, ופרו+ עד 200. צריכים יותר? מוסיפים חבילת שיחות, בלי להחליף מסלול.")}</p>
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
                aria-label={t("הדגמה: שיחה של לקוח עם עוזר הפניות")}
                className="block w-full aspect-[480/768] object-cover object-top rounded-[34px] bg-[var(--l-bg-alt)]"
              />
            </div>
            <p className="m-0 mt-3 text-center text-xs text-[var(--l-on-navy-mute)]">{t("שיחה אמיתית עם העוזר, מחשבון הדגמה")}</p>
          </div>
        </div>
      </section>

      {/* MORE (white, between the navy assistant and the grey pricing). */}
      <section className="bg-[var(--l-bg)]">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col gap-6 lg:gap-12`}>
          <h2 className="font-display m-0 text-3xl lg:text-5xl leading-[1.1] font-bold tracking-[-0.025em]">{t("ועוד דברים שתשתמשו בהם כל שבוע")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-4">
            {MORE.map((item) => (
              <div key={item.title} className="flex lg:flex-col gap-3.5 rounded-[16px] lg:rounded-[18px] bg-white border border-[var(--l-line)] p-5 lg:p-8 lg:min-h-[180px]">
                <Icon d={item.icon} size={28} className="shrink-0 text-[var(--l-accent)] w-6 h-6 lg:w-7 lg:h-7" />
                <span className="flex flex-col gap-1 lg:gap-3.5">
                  <span className="font-display text-lg lg:text-[22px] font-bold tracking-tight">{t(item.title)}</span>
                  <span className="text-[15px] lg:text-[17px] leading-relaxed text-[var(--l-ink-soft)]">{t(item.text)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-[var(--l-bg-alt)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col gap-6 lg:gap-10`}>
          <div className="flex flex-col gap-2.5 lg:gap-3.5 lg:items-center lg:text-center">
            <h2 className="font-display m-0 text-[34px] lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em]">{t("מחיר קבוע, בלי הפתעות")}</h2>
            <p className="m-0 text-base lg:text-[19px] text-[var(--l-ink-soft)]">{t("14 יום ניסיון חינם, בלי כרטיס אשראי. בלי עמלות נסתרות, וביטול בכל עת.")}</p>
          </div>
          <PricingToggle />
          <PlanComparison lang={lang} />
        </div>
      </section>

      <section id="faq" className="bg-[var(--l-bg)] scroll-mt-4">
        <div className={`${CONTAINER} py-16 lg:py-28 flex flex-col lg:flex-row gap-5 lg:gap-24`}>
          <div className="lg:w-[380px] shrink-0">
            <h2 className="font-display m-0 text-3xl lg:text-5xl leading-[1.1] font-bold tracking-[-0.025em]">{t("שאלות נפוצות")}</h2>
          </div>
          <div className="flex-1 min-w-0">
            <LandingFaq />
          </div>
        </div>
      </section>

      {/* Last call (landing sketch 2). */}
      <section className="bg-[var(--l-navy-2)] text-[var(--l-on-navy)] text-center">
        <div className={`${CONTAINER} py-16 lg:py-24 flex flex-col items-center`}>
          <h2 className="font-display m-0 text-[30px] lg:text-5xl leading-[1.12] font-bold tracking-[-0.025em] text-white text-balance">
            {t("השאירו לנו את הניהול, וחזרו לצלם")}
          </h2>
          <p className="mt-3 mb-0 text-base lg:text-lg text-[var(--l-on-navy-soft)]">{t("14 ימי ניסיון חינם עם כל האפשרויות, ללא כרטיס אשראי וללא התחייבות.")}</p>
          <PrimaryCta lang={lang} t={t} className="mt-6" />
        </div>
      </section>

      <LandingFooter lang={lang} />
    </div>
    </ClientLangScope>
  );
}
