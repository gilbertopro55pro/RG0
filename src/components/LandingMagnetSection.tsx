import { LANDING_CONTAINER } from "@/components/LandingChrome";
import { type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// Landing section for the magnet frame designer (/magnet-frames), its own place on the page (owner,
// 2026-09-30). Every line is something the tool does today (see .claude/skills/magnet-frame-export):
// one design for both orientations, text/elements/textures incl. uploads, 300 DPI PNG with a
// transparent photo window. Plan: Pro and up (designToolsAllowed).

const FEATURES = [
  { icon: "M4 7V5h16v2M12 5v14M9 19h6", text: "טקסט חופשי בפונטים שונים, עם צבע, הדגשה וצל" },
  { icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z", text: "ספריית אלמנטים וטקסטורות, כולל ספרות מעוצבות" },
  { icon: "M12 16V4M7 9l5-5 5 5M4 20h16", text: "מעלים את הלוגו, האלמנטים והטקסטורות שלכם" },
  { icon: "M4 6h11v12H4zM15 9h5v9h-5", text: "עיצוב אחד לשני הכיוונים: 20×15 לרוחב ו-15×20 לאורך" },
  { icon: "M12 4v11M7 10l5 5 5-5M4 20h16", text: "קובץ PNG מוכן להדפסה ברזולוציה 300 DPI, עם חלון שקוף לתמונה" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Sizes ("20×15") and "300 DPI" in an RTL line render reversed unless isolated left-to-right.
const LTR = /(\d+×\d+|\d+ DPI)/;
function withLtrSizes(text: string) {
  return text.split(LTR).map((part, i) => (i % 2 === 1 ? <span key={i} dir="ltr">{part}</span> : part));
}

export default function LandingMagnetSection({ lang = "he" }: { lang?: Lang }) {
  const t = makeT(messagesFor(lang));
  return (
    <section id="magnets" className="bg-[var(--l-bg-alt)] scroll-mt-4">
      <div className={`${LANDING_CONTAINER} py-16 lg:py-28 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10 lg:gap-20`}>
        <div className="flex flex-col gap-5 lg:gap-6 lg:max-w-[560px]">
          <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-ink-soft)]">
            <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
            {t("עיצוב מסגרת מגנט")}
          </div>
          <h2 className="font-display m-0 text-4xl lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em] text-balance">
            {t("מסגרת מגנט משלכם, מוכנה להדפסה.")}
          </h2>
          <p className="m-0 text-[17px] lg:text-[19px] leading-relaxed text-[var(--l-ink-soft)]">
            {t("מעצבים פעם אחת את המסגרת של עמדת המגנטים, עם השמות, התאריך והלוגו, ומורידים קובץ שנכנס ישר למדפסת. בלי תוכנת עיצוב ובלי להתעסק עם מידות.")}
          </p>
          <p className="m-0 text-sm text-[var(--l-ink-soft)]">{t("במסלולי פרו ופרו+. בזמן הניסיון החינמי זה פתוח לכם.")}</p>
        </div>
        <ul className="m-0 p-0 list-none flex flex-col gap-3 lg:gap-4 lg:w-[520px] shrink-0">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3.5 rounded-[14px] bg-white border border-[var(--l-line)] px-4 py-3.5 lg:px-5 lg:py-4 text-base lg:text-[17px]">
              <span className="w-10 h-10 shrink-0 rounded-[10px] bg-[var(--l-navy)] text-[var(--l-accent)] flex items-center justify-center">
                <Icon d={f.icon} />
              </span>
              <span className="leading-snug">{withLtrSizes(t(f.text))}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
