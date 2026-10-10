"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { useT } from "@/i18n/client";

const UNCATEGORIZED = "__uncategorized__";
const PAGE_SIZE = 60;

type CategoryGroup = { key: string; label: string; count: number };
type CoverPhoto = { id: string; gallery_id: string };

// Lets the photographer see everything currently live on the public portfolio, grouped by
// category ("tab"), and remove a whole category from it (with confirmation) — the counterpart to
// the "add gallery to portfolio" quick action. A photo landing here (from any source: per-photo
// tagging, the bulk gallery add, or a direct upload) stays in the portfolio indefinitely; this is
// the only place it comes back out.
// Also where each tab's cover photo (its tile on the public page) is chosen — stored as a
// tab name → photo id map in photographers.portfolio_category_covers (migration 0158).
export default function PortfolioManagePanel({ photographerId }: { photographerId: string }) {
  const supabase = createClient();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // The saved choices, and what each tab's tile actually shows right now (the choice, or the
  // newest photo when there's none / it left the tab).
  const [coverMap, setCoverMap] = useState<Record<string, string>>({});
  const [covers, setCovers] = useState<Record<string, CoverPhoto>>({});
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [sheetPhotos, setSheetPhotos] = useState<CoverPhoto[]>([]);
  const [sheetHasMore, setSheetHasMore] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // Which tab the open sheet belongs to — a slow page from a sheet that was already closed must
  // not land in the next one (and get saved as the wrong tab's cover).
  const sheetKeyRef = useRef<string | null>(null);

  const resolveCovers = async (tabs: string[], map: Record<string, string>) => {
    const result: Record<string, CoverPhoto> = {};
    // A choice only counts while that photo is still in the portfolio under the same tab — the
    // same rule the public page applies.
    const chosenIds = tabs.map((k) => map[k]).filter((id): id is string => !!id);
    if (chosenIds.length > 0) {
      const { data } = await supabase
        .from("gallery_photos")
        .select("id, gallery_id, portfolio_category")
        .eq("photographer_id", photographerId)
        .eq("in_portfolio", true)
        .in("id", chosenIds)
        .returns<(CoverPhoto & { portfolio_category: string | null })[]>();
      for (const row of data ?? []) {
        if (row.portfolio_category && map[row.portfolio_category] === row.id) result[row.portfolio_category] = { id: row.id, gallery_id: row.gallery_id };
      }
    }
    await Promise.all(
      tabs
        .filter((k) => !result[k])
        .map(async (k) => {
          const { data } = await supabase
            .from("gallery_photos")
            .select("id, gallery_id")
            .eq("photographer_id", photographerId)
            .eq("in_portfolio", true)
            .eq("portfolio_category", k)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .returns<CoverPhoto[]>();
          if (data?.[0]) result[k] = data[0];
        })
    );
    setCovers(result);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Paginated — a single select is capped at the project's max-rows setting (1,000), which
      // silently undercounted every tab for a portfolio past that size (see paginatedFetch.ts).
      let fetchError: { message: string } | null = null;
      const [data, coversRes] = await Promise.all([
        fetchAllRows<{ portfolio_category: string | null }>(async (from, to) => {
          const res = await supabase
            .from("gallery_photos")
            .select("portfolio_category")
            .eq("photographer_id", photographerId)
            .eq("in_portfolio", true)
            .range(from, to);
          if (res.error) fetchError = res.error;
          return res;
        }),
        supabase.from("photographers").select("portfolio_category_covers").eq("id", photographerId).maybeSingle<{ portfolio_category_covers: Record<string, string> | null }>(),
      ]);
      if (fetchError) {
        setError((fetchError as { message: string }).message);
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
      const map = coversRes.data?.portfolio_category_covers ?? {};
      setCoverMap(map);
      setLoading(false);
      // The list shows right away; the thumbnails fill in once resolved. Uncategorized photos have
      // no tile on the public page, so no cover either.
      await resolveCovers(
        Array.from(counts.keys()).filter((k) => k !== UNCATEGORIZED),
        map
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Best effort: drop the removed tab's cover choice, so a tab re-created later under the same
    // name doesn't resurface an old photo. Harmless if it fails — a stale choice is ignored anyway.
    if (coverMap[confirmKey]) {
      const next = { ...coverMap };
      delete next[confirmKey];
      await supabase.from("photographers").update({ portfolio_category_covers: next }).eq("id", photographerId);
    }
    setConfirmKey(null);
    setRefreshTick((t) => t + 1);
  };

  const loadCoverPage = async (key: string, reset: boolean) => {
    setSheetLoading(true);
    const from = reset ? 0 : sheetPhotos.length;
    // Newest first, with id as a tie-break so pages stay stable (a batch upload can share created_at).
    const { data } = await supabase
      .from("gallery_photos")
      .select("id, gallery_id")
      .eq("photographer_id", photographerId)
      .eq("in_portfolio", true)
      .eq("portfolio_category", key)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .returns<CoverPhoto[]>();
    if (sheetKeyRef.current !== key) return;
    const rows = data ?? [];
    setSheetPhotos((prev) => (reset ? rows : [...prev, ...rows]));
    setSheetHasMore(rows.length === PAGE_SIZE);
    setSheetLoading(false);
  };

  const openCoverSheet = (key: string) => {
    sheetKeyRef.current = key;
    setCoverKey(key);
    setSheetPhotos([]);
    setSheetHasMore(false);
    setSheetError(null);
    loadCoverPage(key, true);
  };

  const closeCoverSheet = () => {
    sheetKeyRef.current = null;
    setCoverKey(null);
    setSheetLoading(false);
  };

  // `photo` null = back to the default (the tab's newest photo).
  const saveCover = async (photo: CoverPhoto | null) => {
    if (!coverKey) return;
    const key = coverKey;
    const next = { ...coverMap };
    if (photo) next[key] = photo.id;
    else delete next[key];
    setSavingCover(true);
    setSheetError(null);
    // .select() so an update that matched no row (nothing changed, no error) still counts as a failure.
    const { data, error: updateError } = await supabase.from("photographers").update({ portfolio_category_covers: next }).eq("id", photographerId).select("id");
    setSavingCover(false);
    if (updateError || !data?.length) {
      setSheetError(t("שגיאה בשמירה. נסו שוב"));
      return;
    }
    setCoverMap(next);
    // The sheet's first photo is the tab's newest — exactly what the default shows.
    const shown = photo ?? sheetPhotos[0];
    if (shown) setCovers((prev) => ({ ...prev, [key]: shown }));
    closeCoverSheet();
  };

  if (loading) return null;
  if (groups.length === 0) return null;

  const hasTabs = groups.some((g) => g.key !== UNCATEGORIZED);
  const coverName = coverKey ? groups.find((g) => g.key === coverKey)?.label ?? coverKey : "";
  // Only an explicit, still-valid choice is marked in the grid; otherwise the default option is.
  const chosen = coverKey ? coverMap[coverKey] : undefined;
  const chosenId = coverKey && chosen && covers[coverKey]?.id === chosen ? chosen : null;

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold mb-1">{t("ניהול הפורטפוליו")}</p>
      <p className="text-xs text-ink-soft mb-3">{t("התמונות נשארות בפורטפוליו הציבורי עד שתחליטו להסיר אותן.")}</p>
      {error && <p className="text-xs text-rose mb-2">{error}</p>}
      <div className="space-y-1.5">
        {groups.map((g) => {
          const isTab = g.key !== UNCATEGORIZED;
          const cover = covers[g.key];
          return (
            <div key={g.key} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-chip text-sm">
              {isTab ? (
                <button
                  type="button"
                  onClick={() => openCoverSheet(g.key)}
                  aria-label={t("תמונת השער של \"{name}\"", { name: g.label })}
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white border border-line"
                >
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/galleries/${cover.gallery_id}/photos/${cover.id}/preview`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </button>
              ) : (
                // Keeps the labels aligned with the tab rows, which have a thumbnail.
                hasTabs && <span className="h-10 w-10 shrink-0" aria-hidden />
              )}
              <span className="flex-1 min-w-0">
                {isTab ? g.label : t(g.label)} <span className="text-ink-soft font-data">({g.count})</span>
              </span>
              {isTab && (
                <button onClick={() => openCoverSheet(g.key)} className="text-xs font-semibold text-ink-soft">
                  {t("תמונת שער")}
                </button>
              )}
              <button onClick={() => setConfirmKey(g.key)} className="text-xs font-semibold text-rose">
                {t("הסרה")}
              </button>
            </div>
          );
        })}
      </div>

      {confirmKey && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmKey(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">{t("הסרה מהפורטפוליו")}</h2>
            <p className="text-xs text-ink-soft mb-4">
              {t("כל התמונות בנושא \"{name}\" יוסרו מעמוד הפורטפוליו הציבורי. אפשר להוסיף אותן שוב בכל שלב.", {
                name: confirmKey === UNCATEGORIZED ? t("כללי (ללא נושא)") : groups.find((g) => g.key === confirmKey)?.label ?? "",
              })}
            </p>
            <div className="flex gap-2">
              <button onClick={confirmRemove} disabled={removing} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-50">
                {removing ? t("מסיר...") : t("כן, הסרה")}
              </button>
              <button onClick={() => setConfirmKey(null)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {coverKey && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={closeCoverSheet}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">{t("תמונת השער של \"{name}\"", { name: coverName })}</h2>
            <p className="text-xs text-ink-soft mb-3">{t("התמונה שמופיעה על הלשונית בעמוד הפורטפוליו הציבורי. לחצו על תמונה כדי לבחור אותה.")}</p>

            <button
              type="button"
              onClick={() => saveCover(null)}
              disabled={savingCover || sheetPhotos.length === 0}
              aria-pressed={!chosenId}
              className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 mb-3 text-sm font-semibold bg-white border text-start disabled:opacity-60"
              style={{ borderColor: !chosenId ? "var(--color-brass)" : "var(--color-line)" }}
            >
              <span>{t("ברירת מחדל (התמונה האחרונה)")}</span>
              {!chosenId && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="var(--color-brass)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>

            {sheetError && <p className="text-xs text-rose mb-2">{sheetError}</p>}

            {sheetPhotos.length === 0 ? (
              <p className="text-xs text-ink-soft py-4 text-center">{sheetLoading ? t("טוען...") : t("אין תמונות כאן.")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {sheetPhotos.map((p) => {
                  const isChosen = p.id === chosenId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => saveCover(p)}
                      disabled={savingCover}
                      aria-pressed={isChosen}
                      aria-label={t("תמונת שער")}
                      className="relative aspect-square overflow-hidden rounded-md bg-chip disabled:opacity-60"
                      style={{ boxShadow: isChosen ? "0 0 0 2px var(--color-brass)" : undefined }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/galleries/${p.gallery_id}/photos/${p.id}/preview`} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {isChosen && (
                        <span className="absolute top-1 start-1 h-7 w-7 rounded-full flex items-center justify-center" style={{ background: "var(--color-brass)" }}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {sheetHasMore && (
              <button
                onClick={() => loadCoverPage(coverKey, false)}
                disabled={sheetLoading}
                className="w-full mt-2 rounded-lg py-2 text-xs font-semibold bg-chip text-ink-soft disabled:opacity-60"
              >
                {sheetLoading ? t("טוען...") : t("טעינת עוד תמונות")}
              </button>
            )}

            <button onClick={closeCoverSheet} className="w-full mt-3 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
              {t("סגירה")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
