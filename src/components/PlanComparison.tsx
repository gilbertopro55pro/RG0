// A straight list of what's actually gated by tier in the code (storage cap, gallery retention,
// team member cap, branding, FTP Live) alongside the core features all tiers share in full — not
// marketing copy invented separately from what the app enforces.
const ROWS: { label: string; basic: string | boolean; flow: string | boolean; frame: string | boolean }[] = [
  { label: "ניהול אירועים, לידים והצעות מחיר", basic: true, flow: true, frame: true },
  { label: "גלריות מאובטחות ללקוחות, 5 ערכות עיצוב", basic: true, flow: true, frame: true },
  { label: "חוזים דיגיטליים לחתימה מרחוק", basic: true, flow: true, frame: true },
  { label: "תזכורות תשלום בזמן, מוכנות לשליחה בוואטסאפ", basic: true, flow: true, frame: true },
  { label: "סנכרון יומן (Google / Apple)", basic: true, flow: true, frame: true },
  { label: "עורך אלבומים מובנה", basic: false, flow: true, frame: true },
  { label: "וידאו בגלריה: גודל קובץ מקסימלי", basic: false, flow: "300MB", frame: "500MB" },
  { label: "פורטפוליו ציבורי", basic: false, flow: true, frame: true },
  // INTAKE_MONTHLY_CAP in lib/intakeAssistant.ts.
  { label: "עוזר פניות חכם: שיחות בחודש", basic: false, flow: "100", frame: "200" },
  { label: "נפח אחסון", basic: "100GB", flow: "750GB", frame: "ללא הגבלה" },
  { label: "שמירת גלריה", basic: "עד 14 יום", flow: "עד 90 יום", frame: "עד שנה" },
  { label: "חברי צוות", basic: "עד 1", flow: "עד 2", frame: "עד 3" },
  { label: "מיתוג מלא: לוגו וצבע מותג בכל הגלריות", basic: false, flow: false, frame: true },
  { label: "FTP Live: העלאה חיה מהמצלמה באירוע", basic: false, flow: false, frame: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--l-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="כלול"
        className="inline-block h-[18px] w-[18px]"
      >
        <path d="M5 12l5 5 9-10" />
      </svg>
    );
  }
  if (value === false) {
    return (
      <span className="text-[var(--l-line)] text-base" aria-label="לא כלול">
        —
      </span>
    );
  }
  return <span className="text-[13px] font-semibold whitespace-nowrap text-[var(--l-ink)]">{value}</span>;
}

export default function PlanComparison() {
  return (
    <div className="mt-10 sm:mt-12 overflow-x-auto rounded-[16px] border border-[var(--l-line)] bg-[var(--l-bg)] shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
      <table className="w-full min-w-[520px] text-sm text-[var(--l-ink)]">
        <thead>
          <tr className="text-right border-b border-[var(--l-line)]">
            <th className="py-4 px-4 sm:px-6 font-bold text-[var(--l-ink)]">כלול במסלול</th>
            <th className="py-4 px-3 font-display font-bold text-center whitespace-nowrap">פרו סטארט</th>
            <th className="py-4 px-3 font-display font-bold text-center whitespace-nowrap">פרו</th>
            <th className="py-4 px-3 font-display font-bold text-center whitespace-nowrap">פרו+</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-[var(--l-line)] last:border-0">
              <td className="py-3 px-4 sm:px-6 text-[var(--l-ink-soft)] leading-snug">{row.label}</td>
              <td className="py-3 px-3 text-center">
                <Cell value={row.basic} />
              </td>
              <td className="py-3 px-3 text-center">
                <Cell value={row.flow} />
              </td>
              <td className="py-3 px-3 text-center">
                <Cell value={row.frame} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
