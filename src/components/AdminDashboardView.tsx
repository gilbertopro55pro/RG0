import type { AdminPhotographerRow } from "@/app/admin/page";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  trialing: "בתקופת ניסיון",
  past_due: "תשלום מאוחר",
  canceled: "בוטל",
  incomplete: "לא הושלם",
};

const STATUS_COLORS: Record<string, string> = {
  active: "var(--color-sage)",
  trialing: "var(--color-amber-deep)",
  past_due: "var(--color-peach)",
  canceled: "var(--color-rose)",
  incomplete: "var(--color-ink-soft)",
};

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-xs text-ink-soft mb-1">{label}</div>
      <div className="text-xl font-bold font-display">{value}</div>
      {sub && <div className="text-xs mt-1 text-ink-soft">{sub}</div>}
    </div>
  );
}

export default function AdminDashboardView({ photographers }: { photographers: AdminPhotographerRow[] }) {
  const total = photographers.length;
  const monthly = photographers.filter((p) => p.plan === "monthly").length;
  const annual = photographers.filter((p) => p.plan === "annual").length;
  const basic = photographers.filter((p) => SUBSCRIPTION_PLANS[p.plan].tier === "basic").length;
  const studioPro = photographers.filter((p) => SUBSCRIPTION_PLANS[p.plan].tier === "studio_pro").length;
  const activeCount = photographers.filter(
    (p) => p.subscription_status === "active" || p.subscription_status === "trialing"
  ).length;

  const statusCounts = photographers.reduce<Record<string, number>>((acc, p) => {
    acc[p.subscription_status] = (acc[p.subscription_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <h1 className="text-[22px] font-bold mb-1 font-display">לוח בקרה — מנהל</h1>
      <p className="text-xs mb-5 text-ink-soft">נתוני משתמשים בכל המערכת. מוצג רק לחשבון המנהל.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile label="סה״כ צלמים רשומים" value={total} />
        <StatTile label="מנויים פעילים" value={activeCount} />
        <StatTile label="מסלול חודשי" value={monthly} />
        <StatTile label="מסלול שנתי" value={annual} />
        <StatTile label="פרו סטארט" value={basic} />
        <StatTile label="פרו+" value={studioPro} />
      </div>

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3">סטטוס מנויים</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span
              key={status}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.5)", color: STATUS_COLORS[status] ?? "var(--color-ink-soft)" }}
            >
              {STATUS_LABELS[status] ?? status}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3">כל הצלמים ({total})</div>

        {photographers.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">אין עדיין צלמים רשומים.</p>}

        {/* Narrow screens: one stacked card per photographer — a 5-column table has no width left
            to give on an actual phone screen, so this avoids horizontal scrolling entirely instead
            of just trying to squeeze the table into less room. */}
        {photographers.length > 0 && (
          <div className="space-y-2 lg:hidden">
            {photographers.map((p) => (
              <div key={p.id} className="rounded-xl px-3.5 py-2.5 bg-chip">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span
                    className="text-xs font-semibold shrink-0"
                    style={{ color: STATUS_COLORS[p.subscription_status] ?? "var(--color-ink-soft)" }}
                  >
                    {STATUS_LABELS[p.subscription_status] ?? p.subscription_status}
                  </span>
                </div>
                <div className="text-xs text-ink-soft break-all mb-1">{p.email}</div>
                <div className="flex items-center justify-between text-xs text-ink-soft">
                  <span>מסלול {SUBSCRIPTION_PLANS[p.plan].label}</span>
                  <span className="font-data">{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Wider screens: the full table, plenty of room to show every column at once. */}
        {photographers.length > 0 && (
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-right text-xs text-ink-soft border-b border-line">
                  <th className="py-2 font-medium">שם</th>
                  <th className="py-2 font-medium">אימייל</th>
                  <th className="py-2 font-medium">מסלול</th>
                  <th className="py-2 font-medium">סטטוס</th>
                  <th className="py-2 font-medium">נרשם בתאריך</th>
                </tr>
              </thead>
              <tbody>
                {photographers.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-ink-soft">{p.email}</td>
                    <td className="py-2">{SUBSCRIPTION_PLANS[p.plan].label}</td>
                    <td className="py-2">
                      <span style={{ color: STATUS_COLORS[p.subscription_status] ?? "var(--color-ink-soft)" }}>
                        {STATUS_LABELS[p.subscription_status] ?? p.subscription_status}
                      </span>
                    </td>
                    <td className="py-2 text-ink-soft">{new Date(p.created_at).toLocaleDateString("he-IL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
