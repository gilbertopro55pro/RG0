import { LANDING_CONTAINER } from "@/components/LandingChrome";

// Landing section for the automatic album designer (owner, 2026-09-30: market it to new visitors).
// The four spreads are drawn, not screenshots — each one is the style's real structure (see
// lib/albumAuto/layouts.ts): clean = a faded hero with the grid over its faded strip; catalog = a
// framed hero and exact rows, nothing bleeds; scribble = tilted taped photos on kraft; modern =
// bare photos on charcoal with thin gold lines. Warm gradients stand in for photos (no client
// photos on a public page). Plan: Pro and up, same gate as the album editor (nonBasicTierAllowed).

const PHOTO = [
  "linear-gradient(135deg,#d9b99b,#a77b5b)",
  "linear-gradient(135deg,#c7cfd9,#7d8ca3)",
  "linear-gradient(135deg,#e6cfb8,#b98c6a)",
  "linear-gradient(135deg,#b9c4b1,#7a8c70)",
  "linear-gradient(135deg,#e2c6c0,#b3837a)",
  "linear-gradient(135deg,#d3c3a4,#9c8660)",
];

type Box = { x: number; y: number; w: number; h: number };

function Photo({ b, i, frame, tilt = 0, className = "" }: { b: Box; i: number; frame?: string; tilt?: number; className?: string }) {
  return (
    <span
      className={`absolute ${className}`}
      style={{
        left: `${b.x}%`,
        top: `${b.y}%`,
        width: `${b.w}%`,
        height: `${b.h}%`,
        background: PHOTO[i % PHOTO.length],
        border: frame,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        boxShadow: frame ? "0 2px 6px rgba(20,24,40,0.28)" : undefined,
      }}
    />
  );
}

function Spread({ label, children, bg }: { label: string; children: React.ReactNode; bg: string }) {
  return (
    <figure className="m-0 flex flex-col gap-2.5">
      <div className="relative w-full aspect-[2/1] overflow-hidden rounded-[2px] border border-[var(--l-line)] shadow-[0_18px_40px_rgba(15,23,42,0.12)]" style={{ background: bg }}>
        {children}
        {/* the fold */}
        <span aria-hidden="true" className="absolute top-0 bottom-0 left-1/2 w-px bg-black/10" />
      </div>
      <figcaption className="text-[15px] font-semibold text-[var(--l-ink)]">{label}</figcaption>
    </figure>
  );
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const WHITE = "2px solid #fff";

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8">
          <Spread label="קו נקי" bg="#f7f5f2">
            <span
              className="absolute"
              style={{ left: 0, top: 0, width: "68%", height: "100%", background: PHOTO[0], WebkitMaskImage: "linear-gradient(to right,#000 70%,transparent)", maskImage: "linear-gradient(to right,#000 70%,transparent)" }}
            />
            <Photo b={{ x: 56, y: 9, w: 17.5, h: 38 }} i={1} frame={WHITE} />
            <Photo b={{ x: 75.5, y: 9, w: 17.5, h: 38 }} i={2} frame={WHITE} />
            <Photo b={{ x: 56, y: 51, w: 37, h: 40 }} i={3} frame={WHITE} />
          </Spread>
          <Spread label="קטלוג" bg="#f4f1ec">
            <Photo b={{ x: 3, y: 6, w: 44, h: 88 }} i={4} frame={WHITE} />
            <Photo b={{ x: 53, y: 8, w: 13.5, h: 40 }} i={0} frame={WHITE} />
            <Photo b={{ x: 68, y: 8, w: 13.5, h: 40 }} i={2} frame={WHITE} />
            <Photo b={{ x: 83, y: 8, w: 13.5, h: 40 }} i={5} frame={WHITE} />
            <Photo b={{ x: 53, y: 52, w: 21, h: 40 }} i={1} frame={WHITE} />
            <Photo b={{ x: 76, y: 52, w: 20.5, h: 40 }} i={3} frame={WHITE} />
          </Spread>
          <Spread label="מקושקש" bg="linear-gradient(135deg,#d8bf97,#c7a77a)">
            <Photo b={{ x: 6, y: 12, w: 34, h: 56 }} i={2} frame="3px solid #fff" tilt={-4} />
            <Photo b={{ x: 26, y: 46, w: 22, h: 42 }} i={0} frame="3px solid #fff" tilt={5} />
            <Photo b={{ x: 56, y: 10, w: 22, h: 44 }} i={4} frame="3px solid #fff" tilt={3} />
            <Photo b={{ x: 70, y: 44, w: 24, h: 46 }} i={1} frame="3px solid #fff" tilt={-3} />
            <span className="absolute" style={{ left: "16%", top: "8%", width: "10%", height: "7%", background: "rgba(255,250,235,0.7)", transform: "rotate(-8deg)" }} />
            <span className="absolute" style={{ left: "62%", top: "6%", width: "9%", height: "7%", background: "rgba(255,250,235,0.7)", transform: "rotate(6deg)" }} />
          </Spread>
          <Spread label="מודרני" bg="#23262b">
            <Photo b={{ x: 0, y: 0, w: 50, h: 100 }} i={5} />
            <Photo b={{ x: 55, y: 10, w: 19.5, h: 38 }} i={1} />
            <Photo b={{ x: 75.5, y: 10, w: 19.5, h: 38 }} i={3} />
            <Photo b={{ x: 55, y: 49.5, w: 40, h: 40 }} i={0} />
            <span className="absolute" style={{ left: "55%", top: "94%", width: "40%", height: "1px", background: "#c9a75e" }} />
            <span className="absolute" style={{ left: "55%", top: "5%", width: "12%", height: "1px", background: "#c9a75e" }} />
          </Spread>
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
