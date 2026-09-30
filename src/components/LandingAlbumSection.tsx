import { LANDING_CONTAINER } from "@/components/LandingChrome";

// Landing section for the automatic album designer (owner, 2026-09-30: market it to new visitors).
// Text only — the owner dropped the drawn style illustration. Plan: Pro and up, same gate as the
// album editor (nonBasicTierAllowed).

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function LandingAlbumSection() {
  return (
    <section id="album" className="bg-[var(--l-bg)] scroll-mt-4">
      <div className={`${LANDING_CONTAINER} py-16 lg:py-28 flex flex-col gap-10 lg:gap-16`}>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-16">
          <div className="flex flex-col gap-4 lg:max-w-[640px]">
            <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-ink-soft)]">
              <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
              עיצוב אלבום אוטומטי
            </div>
            <h2 className="font-display m-0 text-4xl lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em] text-balance">
              האלבום כולו מעוצב, בזמן שאתם שותים קפה.
            </h2>
          </div>
          <p className="m-0 text-[17px] lg:text-[19px] leading-relaxed text-[var(--l-ink-soft)] lg:max-w-[520px]">
            בוחרים מידות, כריכה וסגנון, ומסמנים תמונה אחת של בעלי השמחה, ההורים, האחים והסבים. גילברטו מזהה את הפרצופים, מסדרת את
            התמונות שהלקוח בחר לפי המשפחה ולפי סדר האירוע, ומעצבת את כל העמודים.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-4">
          {[
            "ארבעה סגנונות שונים לגמרי, או תבנית אלבום שמורה משלכם",
            "סדר משפחתי: קודם בעלי השמחה, אחר כך ההורים, האחים והסבים, ואז האירוע לפי סדר הצילום",
            "זיהוי הפרצופים רץ במכשיר שלכם, והתמונות לא נשלחות לשום שירות חיצוני",
            "לא אהבתם עמוד? \"עיצוב מחדש\" נותן פריסה אחרת לאותן תמונות, בלי לחזור על עצמו",
            "מחליפים תמונות בין עמודים בשתי לחיצות, ומכוונים כל פרט בעורך החופשי",
            "ייצוא ל-PDF, JPG או PSD, ושליחה ישירה לבית הדפוס",
          ].map((text) => (
            <p key={text} className="m-0 flex items-start gap-3 text-base lg:text-[17px] leading-relaxed">
              <span className="mt-0.5 shrink-0 text-[var(--l-accent)]">
                <Check />
              </span>
              {text}
            </p>
          ))}
        </div>
        {/* The other design tool, magnet frames (/magnet-frames), same plans. */}
        <div className="flex items-start gap-4 rounded-[14px] bg-[var(--l-bg-alt)] px-5 py-5 lg:px-7 lg:py-6">
          <span className="w-11 h-11 shrink-0 rounded-[10px] bg-[var(--l-navy)] text-[var(--l-accent)] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 4.5v7a6.5 6.5 0 0 0 13 0v-7M9.5 4.5v7a2.5 2.5 0 0 0 5 0v-7M5.5 4.5h4M14.5 4.5h4M5.5 8h4M14.5 8h4" />
            </svg>
          </span>
          <span className="flex flex-col gap-1">
            <span className="font-display text-lg lg:text-xl font-bold tracking-tight">וגם: מסגרות מגנט לאירוע</span>
            <span className="text-[15px] lg:text-[17px] leading-relaxed text-[var(--l-ink-soft)]">
              מעצבים מסגרת למגנטים עם בסיס לבן, טקסט ואלמנטים, ומורידים קובץ מוכן להדפסה, <span dir="ltr">20×15</span> לרוחב או <span dir="ltr">15×20</span> לאורך.
            </span>
          </span>
        </div>
        <p className="m-0 text-sm text-[var(--l-ink-soft)]">העיצוב האוטומטי ומסגרות המגנט במסלולי פרו ופרו+. בזמן הניסיון החינמי הם פתוחים לכם.</p>
      </div>
    </section>
  );
}
