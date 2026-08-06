import { smoothAreaPath, smoothLinePath, type Point } from "@/lib/smoothPath";
import { IconTrend } from "@/components/icons/NavIcons";

type TrailingMonth = { label: string; amount: number };

export default function DashboardHero({
  monthLabel,
  monthTotal,
  pendingTotal,
  trailing,
}: {
  monthLabel: string;
  monthTotal: number;
  pendingTotal: number;
  trailing: TrailingMonth[];
}) {
  const width = 480;
  const height = 120;
  const max = Math.max(1, ...trailing.map((m) => m.amount));
  const points: Point[] = trailing.map((m, i) => ({
    x: (i / Math.max(1, trailing.length - 1)) * width,
    y: height - (m.amount / max) * (height - 14) - 6,
  }));
  const areaPath = smoothAreaPath(points, height);
  const linePath = smoothLinePath(points);

  return (
    <div className="rounded-3xl p-5 mb-4 bg-card shadow-card">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[11px] tracking-wide text-ink-soft mb-1">הכנסות {monthLabel}</div>
          <div className="text-[34px] leading-none font-extrabold font-display tracking-tight">
            ₪{monthTotal.toLocaleString("he-IL")}
          </div>
        </div>
        <span
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, var(--color-coral), var(--color-coral-deep))", color: "#ffffff" }}
        >
          <IconTrend className="h-4 w-4" />
        </span>
      </div>

      <div className="h-[90px] -mx-1">
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

      <div className="flex items-center justify-between text-xs pt-3 mt-1 border-t border-line">
        <span className="text-ink-soft">ממתין לתשלום</span>
        <span className="font-data font-semibold">₪{pendingTotal.toLocaleString("he-IL")}</span>
      </div>
    </div>
  );
}
