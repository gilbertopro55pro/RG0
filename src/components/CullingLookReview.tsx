"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BTN_PRESS } from "@/lib/viewTransition";
import { IconClose } from "@/components/icons/AlbumIcons";
import { useT } from "@/i18n/client";
import { saveLookCheck } from "@/lib/culling/labels";

// The check of the earlier "not looking" marks (owner, 2026-10-18: "מבט לא למצלמה צריך לתפוס רק
// בתמונות המבוימות ולא בתמונות הספונטניות"). The first 756 marks were made in candid photos too, so
// each one is looked at once: a grid of 12, a tap on a candid photo removes its mark, the rest keep
// it, and saving moves on. Whether a photo was posed shows at a glance, so a grid is many times
// faster than one photo at a time. A saved page can be opened again and changed.

type Photo = { id: string; original_filename: string };

const PAGE = 12;

export default function CullingLookReview({
  photos,
  galleryId,
  onChecked,
  onClose,
}: {
  photos: Photo[];
  galleryId: string;
  onChecked: (candid: string[], posed: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const pages = useMemo(() => {
    const out: Photo[][] = [];
    for (let i = 0; i < photos.length; i += PAGE) out.push(photos.slice(i, i + PAGE));
    return out;
  }, [photos]);
  const [page, setPage] = useState(0);
  // Candid photos (the mark comes off), by id; what was saved stays here for a page opened again.
  const [candid, setCandid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState<Photo | null>(null);
  const [totals, setTotals] = useState({ candid: 0, posed: 0 });
  // Pages saved so far (a page opened again doesn't lower it).
  const [furthest, setFurthest] = useState(0);

  const current = useMemo(() => pages[page] ?? [], [pages, page]);
  const finished = page >= pages.length;
  const thumb = (p: Photo, size: number) => `/api/galleries/${galleryId}/photos/${p.id}/image?size=${size}`;

  // The next page loads ahead.
  useEffect(() => {
    for (const p of pages[page + 1] ?? []) {
      const img = new Image();
      img.src = thumb(p, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages]);

  const toggle = (id: string) =>
    setCandid((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageCandid = current.filter((p) => candid.has(p.id)).length;
  const allCandid = current.length > 0 && pageCandid === current.length;
  const setAll = (on: boolean) =>
    setCandid((cur) => {
      const next = new Set(cur);
      for (const p of current) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });

  const save = useCallback(async () => {
    if (finished || saving) return;
    const c = current.filter((p) => candid.has(p.id)).map((p) => p.id);
    const k = current.filter((p) => !candid.has(p.id)).map((p) => p.id);
    setSaving(true);
    setError(false);
    const ok = await saveLookCheck(supabase, { candid: c, posed: k });
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    onChecked(c, k);
    const done = pages.slice(0, Math.max(page + 1, furthest)).flat();
    const cc = done.filter((p) => candid.has(p.id)).length;
    setTotals({ candid: cc, posed: done.length - cc });
    setFurthest((f) => Math.max(f, page + 1));
    setPage((n) => n + 1);
    window.scrollTo({ top: 0 });
  }, [finished, saving, current, candid, supabase, onChecked, pages, page, furthest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoom) setZoom(null);
        else onClose();
      } else if (e.key === "Enter" && !zoom) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, onClose, zoom]);

  const checked = Math.min(furthest * PAGE, photos.length);

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col select-none" role="dialog" aria-modal="true" aria-label={t("בדיקת הסימונים של מבט לא למצלמה")}>
      <div className="flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2 text-white">
        <button onClick={onClose} className={`h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center ${BTN_PRESS}`} aria-label={t("סגירה")}>
          <IconClose className="h-4 w-4" />
        </button>
        <div className="text-center min-w-0">
          <div className="text-sm font-semibold">{t("בדיקת הסימונים של מבט לא למצלמה")}</div>
          <div className="text-[11px] text-white/60 mt-0.5 font-data">
            {t("נבדקו {n} מתוך {total}", { n: checked, total: photos.length })}
          </div>
        </div>
        <div className="h-9 w-9 shrink-0" />
      </div>

      {finished ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-white px-6 gap-3">
          <p className="text-lg font-bold">{t("הבדיקה הושלמה")}</p>
          <p className="text-sm text-white/70">{t("{candid} סימונים הוסרו מתמונות ספונטניות, {posed} נשארו.", totals)}</p>
          <button onClick={onClose} className={`mt-2 h-12 px-6 rounded-2xl text-sm font-bold bg-white text-ink ${BTN_PRESS}`}>
            {t("סגירה")}
          </button>
        </div>
      ) : (
        <>
          <p className="px-4 pb-2 text-xs text-white/75 leading-relaxed text-center">
            {t("לחצו על כל תמונה ספונטנית (ריקודים, רגעים, אורחים מדברים), והסימון יוסר ממנה. תמונה מבוימת שמישהו בה לא מסתכל: לא לוחצים, והסימון נשאר.")}
          </p>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-5xl mx-auto">
              {current.map((p) => {
                const on = candid.has(p.id);
                return (
                  <div key={p.id} className="relative">
                    <button
                      onClick={() => toggle(p.id)}
                      aria-pressed={on}
                      className={`relative block w-full aspect-[4/3] rounded-xl overflow-hidden bg-white/5 border-[3px] ${on ? "border-rose" : "border-transparent"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb(p, 600)} alt={p.original_filename} draggable={false} className={`absolute inset-0 w-full h-full object-contain ${on ? "opacity-40" : ""}`} />
                      {on && (
                        <span className="absolute inset-x-2 bottom-2 rounded-lg bg-rose text-white text-[11px] font-semibold px-2 py-1 text-center">
                          {t("ספונטנית, הסימון יוסר")}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setZoom(p)}
                      className="absolute top-1.5 end-1.5 h-8 px-2.5 rounded-full bg-black/60 text-white text-[11px] font-semibold"
                      aria-label={t("הגדלה")}
                    >
                      {t("הגדלה")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)] space-y-2 max-w-5xl w-full mx-auto">
            {error && <p className="text-xs text-center text-rose">{t("השמירה נכשלה, נסו שוב.")}</p>}
            <button
              onClick={() => void save()}
              disabled={saving}
              className={`w-full h-14 rounded-2xl text-base font-bold text-white disabled:opacity-50 ${BTN_PRESS}`}
              style={{ background: "var(--color-sage)" }}
            >
              {saving
                ? t("שומר...")
                : t("שמירה והמשך: {candid} יוסרו, {posed} נשארים", { candid: pageCandid, posed: current.length - pageCandid })}
            </button>
            <div className="flex items-center justify-between text-xs text-white/70">
              <button onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={page === 0 || saving} className="px-2 py-1.5 disabled:opacity-30">
                {t("העמוד הקודם")}
              </button>
              <button onClick={() => setAll(!allCandid)} className="px-3 py-1.5 underline">
                {allCandid ? t("ניקוי הבחירה בעמוד") : t("כל העמוד ספונטני")}
              </button>
              <span className="px-2 py-1.5 font-data">{t("עמוד {n} מתוך {total}", { n: page + 1, total: pages.length })}</span>
            </div>
          </div>
        </>
      )}

      {zoom && (
        <button className="fixed inset-0 z-[71] bg-black flex items-center justify-center" onClick={() => setZoom(null)} aria-label={t("סגירה")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb(zoom, 2000)} alt={zoom.original_filename} className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}
