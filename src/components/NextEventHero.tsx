import Link from "next/link";

export type NextEventHeroData = {
  id: string;
  clientName: string;
  eventType: string | null;
  location: string | null;
  eventDate: string; // YYYY-MM-DD
  daysUntil: number;
  amountDue: number;
  nextStage: string | null;
};

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function whenLabel(days: number) {
  if (days <= 0) return "הצילום הבא, היום";
  if (days === 1) return "הצילום הבא, מחר";
  return `הצילום הבא, בעוד ${days} ימים`;
}

// The home screen's leading element (design stage 5): the next shoot, because that's what a
// photographer opens the app to know. The only surface on the screen with lift (.surface-hero);
// everything around it is flat.
export default function NextEventHero({ event }: { event: NextEventHeroData }) {
  const [y, m, d] = event.eventDate.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const subtitle = [event.eventType?.trim(), event.location?.trim()].filter(Boolean).join(", ");

  return (
    <section aria-label="האירוע הבא" className="surface-hero p-[18px] pb-4 mb-5">
      <div className="flex items-stretch gap-4">
        <div className="w-[74px] shrink-0 flex flex-col items-center justify-center border-e border-line pe-3.5 box-content">
          <span className="text-[56px] leading-none font-extrabold font-data" style={{ color: "var(--color-brass)" }}>
            {d}
          </span>
          <span className="text-sm font-semibold mt-1">{MONTHS[m - 1]}</span>
          <span className="text-xs text-ink-soft">{weekday}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <span className="text-[22px] leading-tight font-extrabold truncate">{event.clientName}</span>
          {subtitle && <span className="text-sm text-ink-soft truncate">{subtitle}</span>}
          <span className="text-[13px] font-bold mt-0.5" style={{ color: "var(--color-amber-deep)" }}>
            {whenLabel(event.daysUntil)}
          </span>
        </div>
      </div>

      {(event.amountDue > 0 || event.nextStage) && (
        <dl className="mt-3.5 border-t border-line text-sm">
          {event.amountDue > 0 && (
            <div className="flex items-center justify-between py-2.5 border-b border-line last:border-b-0">
              <dt className="text-ink-soft">נשאר לגבות</dt>
              <dd className="font-bold font-data">₪{event.amountDue.toLocaleString("he-IL")}</dd>
            </div>
          )}
          {event.nextStage && (
            <div className="flex items-center justify-between py-2.5 border-b border-line last:border-b-0">
              <dt className="text-ink-soft">השלב הבא</dt>
              <dd className="font-bold">{event.nextStage}</dd>
            </div>
          )}
        </dl>
      )}

      <Link
        href={`/events/${event.id}`}
        className="mt-2 h-11 rounded-xl border border-line flex items-center justify-center text-sm font-bold"
        style={{ background: "var(--color-input-bg)" }}
      >
        פתיחת האירוע
      </Link>
    </section>
  );
}
