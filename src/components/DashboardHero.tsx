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

  // Design stage 5: no longer the screen's lead (the next event is) — a single flat line under
  // it. The "big number + small label + bar" card was the generic dashboard treatment.
  return (
    <div className="mb-5 px-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-soft">הכנסות ב{monthLabel}</span>
        <div className="flex items-baseline gap-3">
          {registeredUsersCount != null && (
            <Link href="/admin" className="text-xs text-ink-soft underline underline-offset-2" title="מעבר ללוח הבקרה">
              <span className="font-data">{registeredUsersCount.toLocaleString("he-IL")}</span> משתמשים
            </Link>
          )}
          <span className="text-lg font-extrabold font-data">₪{monthTotal.toLocaleString("he-IL")}</span>
        </div>
      </div>
      <div className="h-1 rounded-full overflow-hidden mt-2 mb-1.5" style={{ background: "var(--color-chip)" }}>
        <div className="gf-grow h-full rounded-full" style={{ width: `${forecastRatio * 100}%`, background: "var(--color-brass)" }} />
      </div>
      <div className="text-xs text-ink-soft">
        {stillDue > 0 ? (
          <>
            עוד <span className="font-data">₪{stillDue.toLocaleString("he-IL")}</span> צפויים החודש
          </>
        ) : monthForecast > 0 ? (
          "כל הצפי לחודש התקבל"
        ) : (
          "אין עדיין תשלומים צפויים החודש"
        )}
      </div>
    </div>
  );
}
