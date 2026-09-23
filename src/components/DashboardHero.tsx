import Link from "next/link";
import { IconTrend } from "@/components/icons/NavIcons";

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
  const forecastRatio = monthForecast > 0 ? Math.min(1, monthTotal / monthForecast) : 1;
  const stillDue = Math.max(0, monthForecast - monthTotal);

  return (
    <div className="rounded-3xl p-3.5 mb-4 bg-card shadow-card">
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <div className="text-[10px] text-ink-soft mb-0.5">הכנסות {monthLabel}</div>
          <div className="text-[24px] leading-none font-extrabold font-display tracking-tight text-brass">
            ₪{monthTotal.toLocaleString("he-IL")}
          </div>
        </div>
        <span
          className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, var(--color-coral), var(--color-coral-deep))", color: "#ffffff" }}
        >
          <IconTrend className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0 py-1">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-ink-soft">צפי הכנסות ל־{monthLabel}</span>
            <span className="font-data font-semibold text-ink">₪{monthForecast.toLocaleString("he-IL")}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-chip)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${forecastRatio * 100}%`, background: "var(--color-amber-deep)" }}
            />
          </div>
          {stillDue > 0 && (
            <div className="text-[10px] mt-1 text-ink-soft">עוד ₪{stillDue.toLocaleString("he-IL")} צפוי החודש</div>
          )}
        </div>
        {registeredUsersCount != null && (
          <Link
            href="/admin"
            className="shrink-0 h-[56px] w-[64px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-center"
            style={{ background: "var(--color-chip)" }}
            title="סה״כ צלמים רשומים, מעבר ללוח הבקרה"
          >
            <span className="text-base leading-none font-extrabold font-display">
              {registeredUsersCount.toLocaleString("he-IL")}
            </span>
            <span className="text-[9px] leading-tight text-ink-soft px-0.5">משתמשים רשומים</span>
          </Link>
        )}
      </div>
    </div>
  );
}
