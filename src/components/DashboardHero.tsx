import Link from "next/link";

export default function DashboardHero({
  monthLabel,
  monthTotal,
  monthForecast,
  registeredUsersCount,
}: {
  monthLabel: string;
  monthTotal: number;
  // Revenue actually received this month, plus whatever's still unpaid but due within this same
  // month (see page.tsx's own comment on how this is computed) — always >= monthTotal, so the
  // progress bar below can only ever fill up as the month goes, never overflow past full. No
  // separate global "ממתין לתשלום" figure is shown alongside it anymore — a second, differently-
  // scoped (all-time, not this-month) pending number next to a month-scoped forecast read as two
  // conflicting totals rather than two distinct metrics.
  monthForecast: number;
  // Admin-only — see src/lib/admin.ts. null for every other account, so the layout below never
  // reserves space for it and the forecast bar keeps the full row.
  registeredUsersCount?: number | null;
}) {
  // No forecast at all (nothing received, nothing due) used to draw a FULL bar next to ₪0 —
  // an empty month now reads as an empty bar.
  const forecastRatio = monthForecast > 0 ? Math.min(1, monthTotal / monthForecast) : 0;
  const stillDue = Math.max(0, monthForecast - monthTotal);

  return (
    <div className="rounded-2xl p-4 mb-6 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-ink-soft">הכנסות {monthLabel}</div>
          <div className="text-[30px] leading-tight font-bold font-data">₪{monthTotal.toLocaleString("he-IL")}</div>
        </div>
        {registeredUsersCount != null && (
          <Link
            href="/admin"
            className="shrink-0 rounded-xl px-3 py-2 text-center bg-chip"
            title="סה״כ צלמים רשומים, מעבר ללוח הבקרה"
          >
            <span className="block text-base leading-none font-bold font-data">{registeredUsersCount.toLocaleString("he-IL")}</span>
            <span className="block text-[10px] leading-tight text-ink-soft mt-1">משתמשים רשומים</span>
          </Link>
        )}
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mt-3.5 mb-2" style={{ background: "var(--color-chip)" }}>
        <div className="h-full rounded-full" style={{ width: `${forecastRatio * 100}%`, background: "var(--color-brass)" }} />
      </div>
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>
          צפי לחודש: <span className="font-data font-semibold text-ink">₪{monthForecast.toLocaleString("he-IL")}</span>
        </span>
        {stillDue > 0 ? (
          <span className="font-data">עוד ₪{stillDue.toLocaleString("he-IL")} צפוי</span>
        ) : (
          monthForecast > 0 && <span className="font-data">{Math.round(forecastRatio * 100)}%</span>
        )}
      </div>
    </div>
  );
}
