"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const UNCATEGORIZED = "__uncategorized__";

type CategoryGroup = { key: string; label: string; count: number };

// Lets the photographer see everything currently live on the public portfolio, grouped by
// category ("tab"), and remove a whole category from it (with confirmation) — the counterpart to
// the "add gallery to portfolio" quick action. A photo landing here (from any source: per-photo
// tagging, the bulk gallery add, or a direct upload) stays in the portfolio indefinitely; this is
// the only place it comes back out.
export default function PortfolioManagePanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("gallery_photos")
        .select("portfolio_category")
        .eq("photographer_id", photographerId)
        .eq("in_portfolio", true);
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const key = row.portfolio_category ?? UNCATEGORIZED;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      setGroups(
        Array.from(counts.entries())
          .map(([key, count]) => ({ key, label: key === UNCATEGORIZED ? "כללי (ללא נושא)" : key, count }))
          .sort((a, b) => a.label.localeCompare(b.label, "he"))
      );
      setLoading(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [photographerId, refreshTick]);

  const confirmRemove = async () => {
    if (!confirmKey) return;
    setRemoving(true);
    setError(null);
    let query = supabase.from("gallery_photos").update({ in_portfolio: false, portfolio_category: null }).eq("photographer_id", photographerId);
    query = confirmKey === UNCATEGORIZED ? query.is("portfolio_category", null) : query.eq("portfolio_category", confirmKey);
    const { error: updateError } = await query;
    setRemoving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setConfirmKey(null);
    setRefreshTick((t) => t + 1);
  };

  if (loading) return null;
  if (groups.length === 0) return null;

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold tracking-wide mb-1">ניהול הפורטפוליו</p>
      <p className="text-xs text-ink-soft mb-3">התמונות נשארות בפורטפוליו הציבורי עד שתחליטו להסיר אותן.</p>
      {error && <p className="text-xs text-rose mb-2">{error}</p>}
      <div className="space-y-1.5">
        {groups.map((g) => (
          <div key={g.key} className="flex items-center justify-between rounded-lg px-3 py-2 bg-chip text-sm">
            <span>
              {g.label} <span className="text-ink-soft font-data">· {g.count}</span>
            </span>
            <button onClick={() => setConfirmKey(g.key)} className="text-xs font-semibold text-rose">
              הסרה
            </button>
          </div>
        ))}
      </div>

      {confirmKey && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.45)" }} onClick={() => setConfirmKey(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">הסרה מהפורטפוליו</h2>
            <p className="text-xs text-ink-soft mb-4">
              כל התמונות בנושא &quot;{groups.find((g) => g.key === confirmKey)?.label}&quot; יוסרו מעמוד הפורטפוליו הציבורי. אפשר להוסיף
              אותן שוב בכל שלב.
            </p>
            <div className="flex gap-2">
              <button onClick={confirmRemove} disabled={removing} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-50">
                {removing ? "מסיר..." : "כן, הסרה"}
              </button>
              <button onClick={() => setConfirmKey(null)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
