import Link from "next/link";
import { smoothAreaPath, smoothLinePath, type Point } from "@/lib/smoothPath";
import { IconTrend } from "@/components/icons/NavIcons";

type TrailingMonth = { label: string; amount: number };

export default function DashboardHero({
  monthLabel,
  monthTotal,
  pendingTotal,
  trailing,
  registeredUsersCount,
}: {
  monthLabel: string;
  monthTotal: number;
  pendingTotal: number;
  trailing: TrailingMonth[];
  // Admin-only — see src/lib/admin.ts. null for every other account, so the layout below never
  // reserves space for it and the chart keeps the full row.
  registeredUsersCount?: number | null;
}) {
  const width = 480;
  const height = 76;
  const max = Math.max(1, ...trailing.map((m) => m.amount));
  const points: Point[] = trailing.map((m, i) => ({
    x: (i / Math.max(1, trailing.length - 1)) * width,
    y: height - (m.amount / max) * (height - 10) - 5,
  }));
  const areaPath = smoothAreaPath(points, height);
  const linePath = smoothLinePath(points);

  return (
    <div className="rounded-3xl p-3.5 mb-4 bg-card shadow-card">
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <div className="text-[10px] tracking-wide text-ink-soft mb-0.5">הכנסות {monthLabel}</div>
          <div className="text-[24px] leading-none font-extrabold font-display tracking-tight">
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
        <div className="h-[56px] -mx-1 flex-1 min-w-0">
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <linearGradient id="heroAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-amber-deep)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--color-amber-deep)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#heroAreaFill)" />
            <path d={linePath} fill="none" stroke="var(--color-amber-deep)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        {registeredUsersCount != null && (
          <Link
            href="/admin"
            className="shrink-0 h-[56px] w-[64px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-center"
            style={{ background: "var(--color-chip)" }}
            title="סה״כ צלמים רשומים — מעבר ללוח הבקרה"
          >
            <span className="text-base leading-none font-extrabold font-display">
              {registeredUsersCount.toLocaleString("he-IL")}
            </span>
            <span className="text-[9px] leading-tight text-ink-soft px-0.5">משתמשים רשומים</span>
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between text-xs pt-2 mt-0.5 border-t border-line">
        <span className="text-ink-soft">ממתין לתשלום</span>
        <span className="font-data font-semibold">₪{pendingTotal.toLocaleString("he-IL")}</span>
      </div>
    </div>
  );
}
