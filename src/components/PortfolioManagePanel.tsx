"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { getUploadsSnapshot, isUploadActive, subscribeUploads } from "@/lib/galleryUploads";
import PortfolioTabDropZone from "@/components/PortfolioTabDropZone";
import BodyPortal from "@/components/BodyPortal";
import { useT } from "@/i18n/client";

const UNCATEGORIZED = "__uncategorized__";
const PAGE_SIZE = 60;
// Ids per update request — keeps the `id=in.(...)` query string well under URL length limits.
const BATCH_SIZE = 200;

type SubTab = { name: string; count: number };
type CategoryGroup = { key: string; label: string; count: number; subs: SubTab[] };
type CoverPhoto = { id: string; gallery_id: string };
type PickerPhoto = CoverPhoto & { portfolio_subcategory: string | null };
// The open sub-tab sheet: naming a new sub-tab, choosing photos for one (the second step of a new
// sub-tab, or "add photos" on an existing one — the same picker), renaming, or confirming removal.
type SubSheet =
  | { mode: "name"; tab: string }
  | { mode: "photos"; tab: string; sub: string }
  | { mode: "rename"; tab: string; sub: string }
  | { mode: "remove"; tab: string; sub: string };

// Lets the photographer see everything currently live on the public portfolio, grouped by
// category ("tab"), and remove a whole category from it (with confirmation) — the counterpart to
// the "add gallery to portfolio" quick action. A photo landing here (from any source: per-photo
// tagging, the bulk gallery add, or a direct upload) stays in the portfolio indefinitely; this is
// the only place it comes back out.
// Also where each tab's cover photo (its tile on the public page) is chosen — stored as a
// tab name → photo id map in photographers.portfolio_category_covers (migration 0158).
// And where a tab's sub-tabs are managed (gallery_photos.portfolio_subcategory, migration 0159):
// a sub-tab has no row of its own — it exists only through the photos that carry it, so creating
// one means tagging photos with its name, and removing one means clearing that name (the photos
// stay in the tab).
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
  // Sub-tab sheets (one open at a time, so they share the busy flag, error and name input).
  const [subSheet, setSubSheet] = useState<SubSheet | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [pickerPhotos, setPickerPhotos] = useState<PickerPhoto[]>([]);
  const [pickerHasMore, setPickerHasMore] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  // Changes against what's saved, rather than the full selection: photos already in the sub-tab
  // may sit on pages that were never loaded, and must stay in it. `added` = photos joining it,
  // `unmarked` = photos already in it that the photographer took out.
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [unmarked, setUnmarked] = useState<Set<string>>(new Set());
  // The sub-tab's size when the picker opened (a snapshot, so a refresh after a failed save can't
  // count the same photos twice).
  const [pickerBase, setPickerBase] = useState(0);
  // Bumped on every open/close, so a slow page from an earlier picker is dropped.
  const pickerTokenRef = useRef(0);

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
      // No setLoading(true) here: only the first load hides the panel. A refresh after a change
      // keeps the current list (and any open sheet) on screen until the new counts arrive.
      // Paginated — a single select is capped at the project's max-rows setting (1,000), which
      // silently undercounted every tab for a portfolio past that size (see paginatedFetch.ts).
      let fetchError: { message: string } | null = null;
      const [data, coversRes] = await Promise.all([
        fetchAllRows<{ portfolio_category: string | null; portfolio_subcategory: string | null }>(async (from, to) => {
          const res = await supabase
            .from("gallery_photos")
            .select("portfolio_category, portfolio_subcategory")
            .eq("photographer_id", photographerId)
            .eq("in_portfolio", true)
            // A stable order, so consecutive pages neither skip nor repeat rows.
            .order("id")
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
      const subCounts = new Map<string, Map<string, number>>();
      for (const row of data ?? []) {
        const key = row.portfolio_category ?? UNCATEGORIZED;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        // The DB trigger already clears a sub-tab without a tab; the check just keeps it explicit.
        if (row.portfolio_category && row.portfolio_subcategory) {
          const subs = subCounts.get(key) ?? new Map<string, number>();
          subs.set(row.portfolio_subcategory, (subs.get(row.portfolio_subcategory) ?? 0) + 1);
          subCounts.set(key, subs);
        }
      }
      setGroups(
        Array.from(counts.entries())
          .map(([key, count]) => ({
            key,
            label: key === UNCATEGORIZED ? "כללי (ללא נושא)" : key,
            count,
            subs: Array.from(subCounts.get(key)?.entries() ?? [])
              .map(([name, n]) => ({ name, count: n }))
              .sort((a, b) => a.name.localeCompare(b.name, "he")),
          }))
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

  // The counts follow a portfolio upload (each tab's drop zone, or the upload panel above) when it ends.
  useEffect(() => {
    let wasActive = isUploadActive(getUploadsSnapshot().find((u) => u.kind === "portfolio") ?? null);
    return subscribeUploads(() => {
      const nowActive = isUploadActive(getUploadsSnapshot().find((u) => u.kind === "portfolio") ?? null);
      if (wasActive && !nowActive) setRefreshTick((n) => n + 1);
      wasActive = nowActive;
    });
  }, []);

  // Photos dropped just outside a drop zone would make the browser open the file instead (leaving
  // the page, and the upload with it): on this screen a stray file drop does nothing.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

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

  const loadPickerPage = async (tab: string, reset: boolean, token: number) => {
    setPickerLoading(true);
    const from = reset ? 0 : pickerPhotos.length;
    // Same order as the cover picker: newest first, id as the tie-break.
    const { data, error: loadError } = await supabase
      .from("gallery_photos")
      .select("id, gallery_id, portfolio_subcategory")
      .eq("photographer_id", photographerId)
      .eq("in_portfolio", true)
      .eq("portfolio_category", tab)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .returns<PickerPhoto[]>();
    if (pickerTokenRef.current !== token) return;
    setPickerLoading(false);
    if (loadError) {
      setSubError(t("שגיאה בטעינת התמונות. נסו שוב"));
      return;
    }
    const rows = data ?? [];
    setPickerPhotos((prev) => (reset ? rows : [...prev, ...rows]));
    setPickerHasMore(rows.length === PAGE_SIZE);
  };

  const openSubSheet = (next: SubSheet) => {
    const token = ++pickerTokenRef.current;
    setSubSheet(next);
    setSubError(null);
    setPickerLoading(false);
    setNameDraft(next.mode === "rename" ? next.sub : "");
    if (next.mode === "photos") {
      setPickerPhotos([]);
      setPickerHasMore(false);
      setAdded(new Set());
      setUnmarked(new Set());
      setPickerBase(groups.find((g) => g.key === next.tab)?.subs.find((s) => s.name === next.sub)?.count ?? 0);
      loadPickerPage(next.tab, true, token);
    }
  };

  const closeSubSheet = () => {
    pickerTokenRef.current += 1;
    setSubSheet(null);
    setPickerLoading(false);
  };

  const togglePick = (photo: PickerPhoto, sub: string) => {
    const flip = (prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    };
    if (photo.portfolio_subcategory === sub) setUnmarked(flip);
    else setAdded(flip);
  };

  // Runs `update` over `ids` in batches; false on the first failed batch. Re-running after a
  // partial failure is safe — every batch is idempotent.
  const updateInBatches = async (ids: string[], update: (batch: string[]) => PromiseLike<{ error: unknown }>) => {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const { error: batchError } = await update(ids.slice(i, i + BATCH_SIZE));
      if (batchError) return false;
    }
    return true;
  };

  const savePicker = async () => {
    if (subSheet?.mode !== "photos") return;
    const { tab, sub } = subSheet;
    setSubSaving(true);
    setSubError(null);
    // Scoped to the same tab: the DB trigger keeps a sub-tab only while its photo stays in the
    // portfolio under a tab, and a photo that moved elsewhere in the meantime is left alone.
    const ok =
      (await updateInBatches(Array.from(added), (batch) =>
        supabase
          .from("gallery_photos")
          .update({ portfolio_subcategory: sub })
          .eq("photographer_id", photographerId)
          .eq("in_portfolio", true)
          .eq("portfolio_category", tab)
          .in("id", batch)
      )) &&
      (await updateInBatches(Array.from(unmarked), (batch) =>
        supabase
          .from("gallery_photos")
          .update({ portfolio_subcategory: null })
          .eq("photographer_id", photographerId)
          .eq("portfolio_category", tab)
          .eq("portfolio_subcategory", sub)
          .in("id", batch)
      ));
    setSubSaving(false);
    // Refresh either way — a partial failure may still have moved some photos.
    setRefreshTick((n) => n + 1);
    if (!ok) {
      setSubError(t("שגיאה בשמירה. נסו שוב"));
      return;
    }
    closeSubSheet();
  };

  const saveRename = async () => {
    if (subSheet?.mode !== "rename") return;
    const { tab, sub } = subSheet;
    const next = nameDraft.trim();
    if (!next || next === sub) return;
    setSubSaving(true);
    setSubError(null);
    // Renaming onto another sub-tab's name merges the two — the same as adding photos to it.
    const { error: updateError } = await supabase
      .from("gallery_photos")
      .update({ portfolio_subcategory: next })
      .eq("photographer_id", photographerId)
      .eq("portfolio_category", tab)
      .eq("portfolio_subcategory", sub);
    setSubSaving(false);
    if (updateError) {
      setSubError(t("שגיאה בשמירה. נסו שוב"));
      return;
    }
    closeSubSheet();
    setRefreshTick((n) => n + 1);
  };

  const confirmRemoveSub = async () => {
    if (subSheet?.mode !== "remove") return;
    const { tab, sub } = subSheet;
    setSubSaving(true);
    setSubError(null);
    const { error: updateError } = await supabase
      .from("gallery_photos")
      .update({ portfolio_subcategory: null })
      .eq("photographer_id", photographerId)
      .eq("portfolio_category", tab)
      .eq("portfolio_subcategory", sub);
    setSubSaving(false);
    if (updateError) {
      setSubError(t("שגיאה בשמירה. נסו שוב"));
      return;
    }
    closeSubSheet();
    setRefreshTick((n) => n + 1);
  };

  if (loading) return null;
  if (groups.length === 0) return null;

  const hasTabs = groups.some((g) => g.key !== UNCATEGORIZED);
  const coverName = coverKey ? groups.find((g) => g.key === coverKey)?.label ?? coverKey : "";
  // Only an explicit, still-valid choice is marked in the grid; otherwise the default option is.
  const chosen = coverKey ? coverMap[coverKey] : undefined;
  const chosenId = coverKey && chosen && covers[coverKey]?.id === chosen ? chosen : null;
  const subTabSubs = subSheet ? groups.find((g) => g.key === subSheet.tab)?.subs ?? [] : [];
  const draft = nameDraft.trim();
  // Typing an existing sub-tab's name (a new one, or a rename) joins that sub-tab.
  const draftExists = subSheet?.mode !== "photos" && !!draft && subTabSubs.some((s) => s.name === draft && !(subSheet?.mode === "rename" && s.name === subSheet.sub));
  const pickerDirty = added.size + unmarked.size > 0;

  return (
    <div className="mt-3.5 pt-3.5 border-t border-line">
      <p className="text-sm font-semibold mb-1">{t("ניהול הפורטפוליו")}</p>
      <p className="text-xs text-ink-soft mb-1">{t("התמונות נשארות בפורטפוליו הציבורי עד שתחליטו להסיר אותן.")}</p>
      <p className="text-xs text-ink-soft mb-3">
        {t("בכל לשונית יש אזור גרירה: בוחרים לאן (הלשונית עצמה או תת-לשונית) וגוררים תמונות. תיקייה שנגררת הופכת לתת-לשונית בשם שלה.")}
      </p>
      {error && <p className="text-xs text-rose mb-2">{error}</p>}
      <div className="space-y-1.5">
        {groups.map((g) => {
          const isTab = g.key !== UNCATEGORIZED;
          const cover = covers[g.key];
          return (
            <div key={g.key} className="rounded-lg bg-chip text-sm">
              {/* From sm up the tab's drop zone sits in the row between its name and its buttons; on a
                  phone it wraps to a full-width line under them. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
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
                <span className={`min-w-0 ${isTab ? "flex-1 sm:flex-none sm:max-w-[35%]" : "flex-1"}`}>
                  {isTab ? g.label : t(g.label)} <span className="text-ink-soft font-data">({g.count})</span>
                </span>
                {isTab && <PortfolioTabDropZone photographerId={photographerId} tab={g.key} subs={g.subs.map((s) => s.name)} />}
                {isTab && (
                  <button onClick={() => openCoverSheet(g.key)} className="text-xs font-semibold text-ink-soft">
                    {t("תמונת שער")}
                  </button>
                )}
                <button onClick={() => setConfirmKey(g.key)} className="text-xs font-semibold text-rose">
                  {t("הסרה")}
                </button>
              </div>
              {isTab && (
                // Indented under the tab's label (past the thumbnail) from sm up; full width on a phone.
                <div className="ps-3 sm:ps-16 pe-3 pb-2 space-y-1">
                  {g.subs.map((s) => (
                    <div key={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-paper px-2.5 py-1.5 text-xs">
                      <span className="flex-1 min-w-[6rem] flex items-center gap-1">
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 text-ink-soft font-data">({s.count})</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <button onClick={() => openSubSheet({ mode: "photos", tab: g.key, sub: s.name })} className="font-semibold text-ink-soft">
                          {t("הוספת תמונות")}
                        </button>
                        <button onClick={() => openSubSheet({ mode: "rename", tab: g.key, sub: s.name })} className="font-semibold text-ink-soft">
                          {t("שינוי שם")}
                        </button>
                        <button onClick={() => openSubSheet({ mode: "remove", tab: g.key, sub: s.name })} className="font-semibold text-rose">
                          {t("הסרה")}
                        </button>
                      </span>
                    </div>
                  ))}
                  <button onClick={() => openSubSheet({ mode: "name", tab: g.key })} className="py-0.5 text-xs font-semibold text-ink-soft">
                    {t("+ תת-לשונית")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmKey && (
        <BodyPortal><div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmKey(null)}>
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
        </div></BodyPortal>
      )}

      {coverKey && (
        <BodyPortal><div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={closeCoverSheet}>
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
        </div></BodyPortal>
      )}

      {(subSheet?.mode === "name" || subSheet?.mode === "rename") && (
        <BodyPortal><div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={closeSubSheet}>
          <form
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (subSheet.mode === "rename") saveRename();
              else if (draft) openSubSheet({ mode: "photos", tab: subSheet.tab, sub: draft });
            }}
          >
            <h2 className="text-base font-bold mb-1 font-display">{subSheet.mode === "rename" ? t("שינוי שם תת-הלשונית") : t("תת-לשונית חדשה")}</h2>
            <p className="text-xs text-ink-soft mb-3">
              {subSheet.mode === "rename"
                ? t("השם החדש יופיע בעמוד הפורטפוליו הציבורי, בתוך הלשונית \"{tab}\".", { tab: subSheet.tab })
                : t("תת-לשונית מחלקת את הלשונית \"{tab}\" לקבוצות, לדוגמה: הכנות, חופה, ריקודים. אחרי השם בוחרים את התמונות שייכנסו אליה.", { tab: subSheet.tab })}
            </p>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t("שם תת-הלשונית החדשה, לדוגמה: הכנות")}
              maxLength={60}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-2"
            />
            {draftExists && <p className="text-xs text-ink-soft mb-2">{t("כבר יש תת-לשונית בשם הזה, והתמונות יצורפו אליה.")}</p>}
            {subError && <p className="text-xs text-rose mb-2">{subError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                type="submit"
                disabled={!draft || subSaving || (subSheet.mode === "rename" && draft === subSheet.sub)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {subSheet.mode === "rename" ? (subSaving ? t("שומר...") : t("שמירה")) : t("המשך")}
              </button>
              <button type="button" onClick={closeSubSheet} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                {t("ביטול")}
              </button>
            </div>
          </form>
        </div></BodyPortal>
      )}

      {subSheet?.mode === "photos" && (
        <BodyPortal><div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={closeSubSheet}>
          {/* A column with only the grid scrolling, so the save button stays in reach under a long grid. */}
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">{t("תמונות לתת-הלשונית \"{name}\"", { name: subSheet.sub })}</h2>
            <p className="text-xs text-ink-soft mb-3">
              {t("לחצו על תמונות מהלשונית \"{tab}\" כדי לסמן אותן. תמונה שכבר בתת-לשונית אחרת תעבור לזו.", { tab: subSheet.tab })}
            </p>

            {subError && <p className="text-xs text-rose mb-2">{subError}</p>}

            {/* The padding keeps the selected ring of the edge tiles clear of the scroll clip. */}
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 py-0.5">
              {pickerPhotos.length === 0 ? (
                <p className="text-xs text-ink-soft py-4 text-center">{pickerLoading ? t("טוען...") : t("אין תמונות כאן.")}</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {pickerPhotos.map((p) => {
                    const inSub = p.portfolio_subcategory === subSheet.sub;
                    const marked = inSub ? !unmarked.has(p.id) : added.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePick(p, subSheet.sub)}
                        disabled={subSaving}
                        aria-pressed={marked}
                        aria-label={t("בחירת תמונה")}
                        className="relative aspect-square overflow-hidden rounded-md bg-chip disabled:opacity-60"
                        style={{ boxShadow: marked ? "0 0 0 2px var(--color-brass)" : undefined }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/galleries/${p.gallery_id}/photos/${p.id}/preview`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {marked ? (
                          <span className="absolute top-1 start-1 h-7 w-7 rounded-full flex items-center justify-center" style={{ background: "var(--color-brass)" }}>
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          </span>
                        ) : (
                          // An empty circle, so it reads as a multi-select grid (unlike the cover picker).
                          <span className="absolute top-1 start-1 h-7 w-7 rounded-full border-2 border-white" style={{ background: "rgba(28, 27, 25, 0.25)" }} aria-hidden />
                        )}
                        {p.portfolio_subcategory && (
                          // The sub-tab the photo is in now — struck through when it's being taken out of this one.
                          <span
                            className="absolute bottom-1 inset-x-1 truncate rounded px-1 py-0.5 text-[10px] font-semibold text-white text-center"
                            style={{ background: "rgba(28, 27, 25, 0.6)", textDecoration: inSub && !marked ? "line-through" : undefined }}
                          >
                            {p.portfolio_subcategory}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {pickerHasMore && (
                <button
                  onClick={() => loadPickerPage(subSheet.tab, false, pickerTokenRef.current)}
                  disabled={pickerLoading}
                  className="w-full mt-2 rounded-lg py-2 text-xs font-semibold bg-chip text-ink-soft disabled:opacity-60"
                >
                  {pickerLoading ? t("טוען...") : t("טעינת עוד תמונות")}
                </button>
              )}
            </div>

            <p className="text-xs text-ink-soft mt-3">{t("{n} תמונות מסומנות", { n: Math.max(0, pickerBase - unmarked.size + added.size) })}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={savePicker} disabled={!pickerDirty || subSaving} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {subSaving ? t("שומר...") : t("שמירה")}
              </button>
              <button onClick={closeSubSheet} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div></BodyPortal>
      )}

      {subSheet?.mode === "remove" && (
        <BodyPortal><div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={closeSubSheet}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">{t("הסרת תת-לשונית")}</h2>
            <p className="text-xs text-ink-soft mb-4">
              {t("תת-הלשונית \"{name}\" תוסר. התמונות יישארו בלשונית \"{tab}\" ובפורטפוליו.", { name: subSheet.sub, tab: subSheet.tab })}
            </p>
            {subError && <p className="text-xs text-rose mb-2">{subError}</p>}
            <div className="flex gap-2">
              <button onClick={confirmRemoveSub} disabled={subSaving} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-50">
                {subSaving ? t("מסיר...") : t("כן, הסרה")}
              </button>
              <button onClick={closeSubSheet} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div></BodyPortal>
      )}
    </div>
  );
}
