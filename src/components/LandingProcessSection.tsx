import { LANDING_CONTAINER } from "@/components/LandingChrome";
import { type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// "A system that adapts to your process" (landing sketch 2, 2026-10-11): a custom package the way the
// package editor builds it. The first two stages are fixed in every package (lib/stages.ts,
// FIXED_STAGES), the rest are the photographer's own.
const STAGES = [
  { name: "סגירת האירוע", mine: false },
  { name: "יום הצילום", mine: false },
  { name: "העלאת גלריה", mine: true },
  { name: "בחירת תמונות לאלבום", mine: true },
  { name: "עיצוב ואישור אלבום", mine: true },
];

const POINTS = [
  { title: "החבילות והמחירים שלכם", text: "חבילות ללא הגבלה, כל אחת עם השלבים המתאימים לה." },
  { title: "ההודעות ללקוח בניסוח שלכם", text: "בסיום כל שלב, ההודעה ללקוח כבר כתובה וממתינה לשליחה בוואטסאפ, במילים שבחרתם." },
  { title: "תמונת מצב מלאה של העסק", text: "במסך הבית מוצגים הצילום הקרוב, הסכומים שנותרו לגבייה והמצב של כל אירוע." },
];

export default function LandingProcessSection({ lang = "he" }: { lang?: Lang }) {
  const t = makeT(messagesFor(lang));
  return (
    <section className="bg-[var(--l-bg-alt)]">
      <div className={`${LANDING_CONTAINER} py-16 lg:py-28`}>
        <div className="flex flex-col gap-3 max-w-[760px]">
          <span className="text-sm font-bold text-[var(--l-accent)]">{t("מהפנייה הראשונה ועד המסירה")}</span>
          <h2 className="font-display m-0 text-[30px] lg:text-5xl leading-[1.12] font-bold tracking-[-0.025em] text-balance">
            {t("מערכת שמתאימה את עצמה לתהליך שלכם")}
          </h2>
          <p className="m-0 text-[17px] lg:text-lg leading-relaxed text-[var(--l-ink-soft)]">
            {t("אין צורך לשנות את הדרך שבה אתם עובדים. בונים את החבילות ואת שלבי העבודה כפי שאתם רגילים, ובכל אירוע רואים מהו הצעד הבא.")}
          </p>
        </div>

        <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12 items-start">
          <div role="group" aria-label={t("דוגמה לחבילה מותאמת")} className="rounded-[16px] bg-white border border-[var(--l-line)] p-[18px] flex flex-col gap-2">
            <div className="mb-1 text-[13px] text-[var(--l-ink-soft)]">{t("החבילה שלכם, ״חתונה מלאה״")}</div>
            {STAGES.map((stage, i) => (
              <div
                key={stage.name}
                className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[15px] font-semibold ${
                  stage.mine ? "bg-white border border-dashed border-[var(--l-accent)]" : "bg-[var(--l-bg-alt)]"
                }`}
              >
                <span className="w-5 text-center text-[13px] font-normal tabular-nums text-[var(--l-ink-soft)]">{i + 1}</span>
                {t(stage.name)}
                <span className={`ms-auto text-xs font-medium ${stage.mine ? "text-[var(--l-accent)]" : "text-[var(--l-ink-soft)]"}`}>
                  {t(stage.mine ? "שלב שלכם" : "קבוע בכל חבילה")}
                </span>
              </div>
            ))}
            <div className="px-0.5 py-1 text-sm font-bold text-[var(--l-accent)]">{t("+ שלב משלכם")}</div>
          </div>

          <div className="flex flex-col gap-5">
            {POINTS.map((point) => (
              <div key={point.title}>
                <b className="block font-display text-[17px] lg:text-lg">{t(point.title)}</b>
                <span className="text-base leading-relaxed text-[var(--l-ink-soft)]">{t(point.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
