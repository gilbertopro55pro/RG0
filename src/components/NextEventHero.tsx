import Link from "next/link";
import { getLang, getT } from "@/i18n/server";
import { dateLocale, type Lang } from "@/i18n/config";
import type { TFn } from "@/i18n/translate";
import type { StageSegment } from "@/lib/homeVivid";

export type NextEventHeroData = {
  id: string;
  clientName: string;
  eventType: string | null;
  location: string | null;
  eventDate: string; // YYYY-MM-DD
  daysUntil: number;
  amountDue: number;
  nextStage: string | null;
  // The vivid look only (page.tsx fills them when it's on): the start time ("HH:MM:SS") and the
  // stage track (lib/homeVivid.ts stageTrack).
  startTime?: string | null;
  track?: { total: number; current: number | null; segments: StageSegment[] } | null;
};

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function whenLabel(days: number, t: TFn) {
  if (days <= 0) return t("הצילום הבא, היום");
  if (days === 1) return t("הצילום הבא, מחר");
  return t("הצילום הבא, בעוד {n} ימים", { n: days });
}

// The home screen's leading element (design stage 5): the next shoot, because that's what a
// photographer opens the app to know. The only surface on the screen with lift (.surface-hero);
// everything around it is flat.
export default async function NextEventHero({ event, vivid = false }: { event: NextEventHeroData; vivid?: boolean }) {
  const t = await getT();
  const lang = await getLang();
  const [y, m, d] = event.eventDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = lang === "he" ? WEEKDAYS[date.getUTCDay()] : date.toLocaleDateString(dateLocale(lang), { weekday: "long", timeZone: "UTC" });
  const monthName = lang === "he" ? MONTHS[m - 1] : date.toLocaleDateString(dateLocale(lang), { month: "long", timeZone: "UTC" });
  const subtitle = [event.eventType?.trim(), event.location?.trim()].filter(Boolean).join(", ");

  if (vivid) {
    return <VividNextEventHero event={event} t={t} lang={lang} day={d} monthName={monthName} weekday={weekday} subtitle={subtitle} />;
  }

  return (
    <section aria-label={t("האירוע הבא")} className="surface-hero p-[18px] pb-4 mb-5">
      <div className="flex items-stretch gap-4">
        <div className="w-[74px] shrink-0 flex flex-col items-center justify-center border-e border-line pe-3.5 box-content">
          <span className="text-[56px] leading-none font-extrabold font-data" style={{ color: "var(--color-brass)" }}>
            {d}
          </span>
          <span className="text-sm font-semibold mt-1">{monthName}</span>
          <span className="text-xs text-ink-soft">{weekday}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <span className="text-[22px] leading-tight font-extrabold break-words [overflow-wrap:anywhere]">{event.clientName}</span>
          {subtitle && <span className="text-sm text-ink-soft break-words [overflow-wrap:anywhere]">{subtitle}</span>}
          <span className="text-[13px] font-bold mt-0.5" style={{ color: "var(--color-amber-deep)" }}>
            {whenLabel(event.daysUntil, t)}
          </span>
        </div>
      </div>

      {(event.amountDue > 0 || event.nextStage) && (
        <dl className="mt-3.5 border-t border-line text-sm">
          {event.amountDue > 0 && (
            <div className="flex items-center justify-between py-2.5 border-b border-line last:border-b-0">
              <dt className="text-ink-soft">{t("נשאר לגבות")}</dt>
              <dd className="font-bold font-data">₪{event.amountDue.toLocaleString(dateLocale(lang))}</dd>
            </div>
          )}
          {event.nextStage && (
            <div className="flex items-center justify-between py-2.5 border-b border-line last:border-b-0">
              <dt className="text-ink-soft">{t("השלב הבא")}</dt>
              <dd className="font-bold">{t(event.nextStage)}</dd>
            </div>
          )}
        </dl>
      )}

      <Link
        href={`/events/${event.id}`}
        className="mt-2 h-11 rounded-xl border border-line flex items-center justify-center text-sm font-bold"
        style={{ background: "var(--color-input-bg)" }}
      >
        {t("פתיחת האירוע")}
      </Link>
    </section>
  );
}

// The vivid look (lib/tones.ts, admin only for now; sketch "גילברטו – עיצוב עם יותר חיים"): a dark
// card with gold, the same in both themes, so its text colors are fixed light tones on purpose
// (they sit on --vivid-hero-a/b, never on the page's own ground).
const HERO_INK = "#f4efe6";
const HERO_SOFT = "#c9c0b1";
const HERO_SUB = "#cfc7b8";
const HERO_LINE = "rgba(255, 255, 255, 0.12)";
const FOIL_RING = "color-mix(in srgb, var(--vivid-foil) 55%, transparent)";

function whenPill(days: number, t: TFn) {
  if (days <= 0) return t("היום");
  if (days === 1) return t("מחר");
  return t("בעוד {n} ימים", { n: days });
}

function VividNextEventHero({
  event,
  t,
  lang,
  day,
  monthName,
  weekday,
  subtitle,
}: {
  event: NextEventHeroData;
  t: TFn;
  lang: Lang;
  day: number;
  monthName: string;
  weekday: string;
  subtitle: string;
}) {
  const time = event.startTime ? event.startTime.slice(0, 5) : null;
  const track = event.track ?? null;
  return (
    <section
      aria-label={t("האירוע הבא")}
      className="rounded-[22px] p-[18px] mb-5"
      style={{
        color: HERO_INK,
        background:
          "radial-gradient(110% 80% at 100% 0%, color-mix(in srgb, var(--vivid-foil) 40%, transparent), transparent 55%), linear-gradient(160deg, var(--vivid-hero-a), var(--vivid-hero-b))",
        border: "1px solid color-mix(in srgb, var(--vivid-foil) 30%, transparent)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 22px 44px rgba(var(--shadow-tint), 0.26)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <span className="text-xs" style={{ color: HERO_SOFT }}>
          {t("הצילום הבא")}
        </span>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ border: `1px solid ${FOIL_RING}`, color: "var(--vivid-foil-text)" }}>
          {whenPill(event.daysUntil, t)}
        </span>
      </div>

      <div className="flex items-stretch gap-4">
        <div className="w-[74px] shrink-0 flex flex-col items-center justify-center pe-3.5 box-content" style={{ borderInlineEnd: `1px solid ${HERO_LINE}` }}>
          <span className="text-[58px] leading-none font-extrabold font-data" style={{ color: "var(--vivid-foil-text)" }}>
            {day}
          </span>
          <span className="text-sm font-semibold mt-1">{monthName}</span>
          <span className="text-xs text-center" style={{ color: HERO_SOFT }}>
            {time ? `${weekday}, ` : weekday}
            {time && <span className="font-data">{time}</span>}
          </span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <span className="text-2xl leading-[1.15] font-extrabold break-words [overflow-wrap:anywhere]">{event.clientName}</span>
          {subtitle && (
            <span className="text-sm break-words [overflow-wrap:anywhere]" style={{ color: HERO_SUB }}>
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {track && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 text-[13px] mb-2">
            {track.current === null ? (
              <span className="font-semibold" style={{ color: "var(--vivid-foil-text)" }}>
                {t("כל השלבים הושלמו")}
              </span>
            ) : (
              <>
                {/* The same number the event page shows: the position of the stage the event is at. */}
                <span className="font-data shrink-0" style={{ color: HERO_SOFT }}>
                  {t("שלב {n} מתוך {total}", { n: track.current, total: track.total })}
                </span>
                {event.nextStage && (
                  <span className="font-semibold text-end min-w-0 truncate" style={{ color: "var(--vivid-foil-text)" }}>
                    {t(event.nextStage)}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${track.total}, minmax(0, 1fr))` }} aria-hidden="true">
            {track.segments.map((seg, i) => (
              <span
                key={i}
                className="h-[5px] rounded-full"
                style={{
                  background:
                    seg === "done" ? "var(--vivid-foil)" : seg === "next" ? "color-mix(in srgb, var(--vivid-foil) 45%, transparent)" : HERO_LINE,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {event.amountDue > 0 && (
        <div className="flex items-center justify-between gap-3 mt-4 pt-3 text-sm" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <span style={{ color: HERO_SOFT }}>{t("נשאר לגבות")}</span>
          {/* The attention tone, lifted for the dark card (its light-theme ink is too dark on it). */}
          <span className="font-bold font-data" style={{ color: "color-mix(in srgb, var(--tone-attention) 42%, #ffffff)" }}>
            ₪{event.amountDue.toLocaleString(dateLocale(lang))}
          </span>
        </div>
      )}

      <Link
        href={`/events/${event.id}`}
        className="mt-3.5 h-[46px] rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold"
        style={{ background: "var(--vivid-foil)", color: "var(--vivid-hero-b)" }}
      >
        {t("פתיחת האירוע")}
        <span aria-hidden="true" className="inline-block ltr:rotate-180">
          ←
        </span>
      </Link>
    </section>
  );
}
