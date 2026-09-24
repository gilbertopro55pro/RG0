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
  { label: "נפח אחסון", basic: "100GB", flow: "750GB", frame: "ללא הגבלה" },
  { label: "שמירת גלריה", basic: "עד 14 יום", flow: "עד 90 יום", frame: "עד שנה" },
  { label: "חברי צוות", basic: "עד 1", flow: "עד 2", frame: "עד 3" },
  { label: "מיתוג מלא: לוגו וצבע מותג בכל הגלריות", basic: false, flow: false, frame: true },
  { label: "FTP Live: העלאה חיה מהמצלמה באירוע", basic: false, flow: false, frame: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
      >
        ✓
      </span>
    );
  }
  if (value === false) {
    return <span className="text-ink-soft text-sm">—</span>;
  }
  return <span className="text-[11px] font-semibold whitespace-nowrap">{value}</span>;
}

export default function PlanComparison() {
  return (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-right border-b border-line">
            <th className="py-2.5 font-medium text-[11px] text-ink-soft">כלול במסלול</th>
            <th className="py-2.5 font-semibold font-display text-center w-11">פרו סטארט</th>
            <th className="py-2.5 font-semibold font-display text-center w-11">פרו</th>
            <th className="py-2.5 font-semibold font-display text-center w-11">פרו+</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-0">
              <td className="py-2.5 pl-1.5">{row.label}</td>
              <td className="py-2.5 text-center">
                <Cell value={row.basic} />
              </td>
              <td className="py-2.5 text-center">
                <Cell value={row.flow} />
              </td>
              <td className="py-2.5 text-center">
                <Cell value={row.frame} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
