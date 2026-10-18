"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { useT } from "@/i18n/client";
import { FLAGS, LABEL_COLUMNS, LABEL_VERSION, NO_FLAGS, fromRow, saveCullingLabel, toRow, type LabelRow, type PhotoLabel } from "@/lib/culling/labels";
import { ENGINE_VERSION, analyzePhoto, isCurrentResult, loadCullingModels } from "@/lib/culling/engine";
import {
  benchReport,
  decide,
  mistakeKinds,
  type BenchItem,
  type CullFeatures,
  type CullVerdict,
  type MistakeKind,
  type Rate,
} from "@/lib/culling/verdict";

// Photo culling, round 1 (owner, 2026-10-16; app/admin/culling?tab=bench): runs the culling engine
// on the test gallery in this browser and measures it against the owner's labels. Only the numbers
// are saved (culling_results, migration 0179); the decision is recomputed from them on every render,
// so a threshold change re-scores everything without running again. A run resumes where it stopped:
// photos already measured with this engine version (or an earlier one that measures them the same)
// are skipped. A label can be corrected from the photo's card, and the numbers follow at once.

type Photo = { id: string; folder_id: string | null; original_filename: string; storage_path: string };
type Result = { features: CullFeatures | null; error: string | null; version: string };
// unsaved: measured but the write failed; the next run measures those again (it skips only what's saved).
type Progress = { done: number; total: number; ms: number[]; errors: number; unsaved: number; current: string };

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };

const LOOK_TEXT = { at: "מסתכלים למצלמה", away: "מבט לא למצלמה", unsure: "מבט: לבדיקה", none: "" } as const;
// Why the look wasn't judged (posed photos only, owner 2026-10-18).
const SCENE_TEXT = { posed: "", candid: "ספונטנית, המבט לא נבדק", single: "פרצוף אחד, המבט לא נבדק", none: "" } as const;
const LOOK_COLOR = { away: "rose", unsure: "amber-deep" } as const;

const VERDICT_TEXT: Record<CullVerdict, string> = {
  ok: "תקינה",
  blurry: "לא בפוקוס",
  eyes_closed: "עיניים עצומות",
  both: "גם וגם",
  review: "לבדיקה",
};
const MISTAKE_TEXT: Record<MistakeKind, string> = {
  missedBlur: "לא בפוקוס שלא נתפסה",
  falseBlur: "סומנה לא בפוקוס בטעות",
  missedEyes: "עיניים עצומות שלא נתפסו",
  falseEyes: "סומנה עיניים עצומות בטעות",
  missedLook: "מבט לא למצלמה שלא נתפס",
  falseLook: "סומנה מבט לא למצלמה בטעות",
  review: "לבדיקה",
};

const pct = (r: Rate) => (r.of ? Math.round((r.hit / r.of) * 100) : null);
// A measured number inside a Hebrew line: isolated, so a minus stays in front of it.
const num = (v: number, digits = 2) => `\u2066${v.toFixed(digits)}\u2069`;
// The face behind the eyes call, by what it says: closed, review, open.
const EYES_COLOR = { closed: "rose", unsure: "amber-deep", open: "sage", none: "sage" } as const;

export default function CullingBench({
  userId,
  galleries,
  initialGalleryId,
}: {
  userId: string;
  galleries: { id: string; title: string }[];
  initialGalleryId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const t = useT();
  const [galleryId, setGalleryId] = useState(initialGalleryId);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [labels, setLabels] = useState<Map<string, LabelRow>>(new Map());
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"labeled" | "all">("labeled");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [models, setModels] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [runError, setRunError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MistakeKind>("missedBlur");
  // Cards whose label was corrected while this group is shown: they stay in place (and say they're
  // no longer a mistake) until another group is picked, instead of jumping out from under the click.
  const [kept, setKept] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!galleryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [photoRows, labelRows, resultRows] = await Promise.all([
        fetchAllRows<Photo>((from, to) =>
          supabase.from("gallery_photos").select("id, folder_id, original_filename, storage_path").eq("gallery_id", galleryId).order("id").range(from, to).returns<Photo[]>()
        ),
        fetchAllRows<LabelRow>((from, to) =>
          supabase.from("culling_labels").select(LABEL_COLUMNS).eq("gallery_id", galleryId).order("photo_id").range(from, to).returns<LabelRow[]>()
        ),
        fetchAllRows<{ photo_id: string; engine_version: string; features: CullFeatures | null; error: string | null }>((from, to) =>
          supabase
            .from("culling_results")
            .select("photo_id, engine_version, features, error")
            .eq("gallery_id", galleryId)
            .order("photo_id")
            .range(from, to)
            .returns<{ photo_id: string; engine_version: string; features: CullFeatures | null; error: string | null }[]>()
        ),
      ]);
      if (cancelled) return;
      setPhotos(photoRows ?? []);
      // Only labels made with all four problems on screen: the owner labels again from scratch
      // (2026-10-16), and the earlier ones aren't the same question.
      setLabels(new Map((labelRows ?? []).filter((r) => r.labeled_v === LABEL_VERSION).map((r) => [r.photo_id, r])));
      setResults(new Map((resultRows ?? []).map((r) => [r.photo_id, { features: r.features, error: r.error, version: r.engine_version }])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, supabase]);

  const inScope = useMemo(() => (scope === "labeled" ? photos.filter((p) => labels.has(p.id) && labels.get(p.id)!.label !== "skip") : photos), [photos, labels, scope]);
  const pending = useMemo(() => inScope.filter((p) => !isCurrentResult(results.get(p.id)?.version, results.get(p.id)?.features)), [inScope, results]);
  // Of those, measured before by an earlier engine (the photos with 6 faces or more, for engine 3).
  const remeasure = useMemo(() => pending.filter((p) => results.get(p.id)?.features).length, [pending, results]);

  async function download(p: Photo): Promise<{ blob: Blob; source: CullFeatures["source"]; ms: number }> {
    const t0 = performance.now();
    // The original, three tries: a passing network error shouldn't cost the full-resolution measure.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/storage/download-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: "galleries", path: p.storage_path }),
        });
        const { url } = await res.json();
        const file = await fetch(url);
        if (!file.ok) throw new Error(String(file.status));
        return { blob: await file.blob(), source: "original", ms: performance.now() - t0 };
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    // Still nothing from storage: a 2000px copy via our server, counted on screen as such.
    const file = await fetch(`/api/galleries/${galleryId}/photos/${p.id}/image?size=2000`);
    if (!file.ok) throw new Error(`download ${file.status}`);
    return { blob: await file.blob(), source: "proxy", ms: performance.now() - t0 };
  }

  async function run() {
    if (!galleryId || progress) return;
    setRunError(null);
    cancelRef.current = false;
    setModels("loading");
    try {
      await loadCullingModels();
      setModels("ready");
    } catch (e) {
      setModels("failed");
      setRunError(String(e));
      return;
    }
    const queue = [...pending];
    const state: Progress = { done: 0, total: queue.length, ms: [], errors: 0, unsaved: 0, current: "" };
    setProgress({ ...state });
    // A run of 1,500 photos takes over an hour (owner, 2026-10-18): keep the screen, and so the
    // computer, awake for it. The browser drops the lock when the tab is hidden, so it's taken again
    // when the tab is back.
    let wakeLock: WakeLockSentinelLike | null = null;
    const lockScreen = async () => {
      try {
        wakeLock = (await (navigator as WakeLockNavigator).wakeLock?.request("screen")) ?? null;
      } catch {
        // Not supported, or refused (battery saver): the run goes on without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void lockScreen();
    };
    await lockScreen();
    document.addEventListener("visibilitychange", onVisible);
    // The next photo downloads while this one is measured.
    let next = queue.length ? download(queue[0]) : null;
    for (let i = 0; i < queue.length && !cancelRef.current; i++) {
      const p = queue[i];
      state.current = p.original_filename;
      setProgress({ ...state });
      const current = next!;
      next = i + 1 < queue.length ? download(queue[i + 1]) : null;
      next?.catch(() => {});
      let row: Result;
      try {
        const { blob, source, ms } = await current;
        const features = await analyzePhoto(blob, source, ms);
        state.ms.push(features.ms.total);
        row = { features, error: null, version: ENGINE_VERSION };
      } catch (e) {
        state.errors++;
        row = { features: null, error: String(e).slice(0, 300), version: ENGINE_VERSION };
      }
      const record = {
        photo_id: p.id,
        photographer_id: userId,
        gallery_id: galleryId,
        engine_version: ENGINE_VERSION,
        features: row.features,
        error: row.error,
        updated_at: new Date().toISOString(),
      };
      // One more try on a passing network error; a write that still fails isn't shown as measured.
      let saved = false;
      for (let attempt = 0; attempt < 2 && !saved; attempt++) {
        const { error } = await supabase.from("culling_results").upsert(record, { onConflict: "photo_id" });
        saved = !error;
        if (!saved && attempt === 0) await new Promise((r) => setTimeout(r, 1500));
      }
      if (saved) setResults((cur) => new Map(cur).set(p.id, row));
      else state.unsaved++;
      state.done++;
      setProgress({ ...state });
    }
    document.removeEventListener("visibilitychange", onVisible);
    await (wakeLock as WakeLockSentinelLike | null)?.release().catch(() => {});
    setProgress(null);
  }

  const items: BenchItem[] = useMemo(() => {
    const out: BenchItem[] = [];
    for (const p of photos) {
      const row = labels.get(p.id);
      const f = results.get(p.id)?.features;
      // Measurements from an earlier engine count until the photo is measured again: the decision
      // is computed the same way from both.
      if (!row || row.label === "skip" || !f) continue;
      out.push({
        photoId: p.id,
        label: row.label,
        notLooking: row.not_looking,
        lookChecked: !!row.look_checked_at,
        unflattering: row.unflattering,
        v: row.labeled_v,
        decision: decide(f),
      });
    }
    return out;
  }, [photos, labels, results]);
  const report = useMemo(() => benchReport(items), [items]);

  const measured = useMemo(() => photos.filter((p) => results.get(p.id)?.features), [photos, results]);
  const timing = useMemo(() => {
    const ms = measured.map((p) => results.get(p.id)!.features!.ms.total).sort((a, b) => a - b);
    const dl = measured.map((p) => results.get(p.id)!.features!.ms.download);
    const proxy = measured.filter((p) => results.get(p.id)!.features!.source === "proxy").length;
    return {
      avg: ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 0,
      p90: ms.length ? ms[Math.floor(ms.length * 0.9)] : 0,
      download: dl.length ? dl.reduce((s, v) => s + v, 0) / dl.length : 0,
      proxy,
    };
  }, [measured, results]);
  const allVerdicts = useMemo(() => {
    const c: Record<CullVerdict, number> = { ok: 0, blurry: 0, eyes_closed: 0, both: 0, review: 0 };
    for (const p of measured) c[decide(results.get(p.id)!.features!).verdict]++;
    return c;
  }, [measured, results]);

  const mistakes = useMemo(() => items.filter((it) => kept.has(it.photoId) || mistakeKinds(it).includes(filter)), [items, filter, kept]);
  const mistakeCounts = useMemo(() => {
    const c: Record<MistakeKind, number> = { missedBlur: 0, falseBlur: 0, missedEyes: 0, falseEyes: 0, missedLook: 0, falseLook: 0, review: 0 };
    for (const it of items) for (const k of mistakeKinds(it)) c[k]++;
    return c;
  }, [items]);
  const errors = useMemo(() => photos.filter((p) => !results.get(p.id)?.features && results.get(p.id)?.error).length, [photos, results]);

  // A label corrected from a card: saved as a full label (all four problems on screen), and the
  // report and groups recomputed from it.
  async function relabel(photoId: string, label: PhotoLabel): Promise<boolean> {
    if (!galleryId) return false;
    const ok = await saveCullingLabel(supabase, { photoId, userId, galleryId, label });
    if (!ok) return false;
    setLabels((cur) => new Map(cur).set(photoId, { photo_id: photoId, ...toRow(label), labeled_v: LABEL_VERSION, look_checked_at: new Date().toISOString() }));
    setKept((cur) => new Set(cur).add(photoId));
    return true;
  }

  const eta = progress && progress.ms.length ? ((progress.total - progress.done) * (progress.ms.reduce((s, v) => s + v, 0) / progress.ms.length + timing.download * 0.2)) / 1000 : null;

  return (
    <div>
      <h1 className="text-[22px] font-bold mb-1 font-display">{t("מדידת מנוע הסינון")}</h1>
      <p className="text-sm text-ink-soft mb-4 leading-relaxed">
        {t("המנוע רץ כאן בדפדפן, על התמונות המקוריות, ושומר רק את המדידות. התוצאות מושוות לסימונים שלך. אפשר לעצור ולהמשיך מאותה נקודה. כדאי להשאיר את הלשונית פתוחה ומוצגת בזמן ההרצה.")}
      </p>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          value={galleryId ?? ""}
          onChange={(e) => setGalleryId(e.target.value || null)}
          aria-label={t("גלריה")}
          className="rounded-lg px-3 py-2 text-sm border border-line bg-white"
          disabled={!!progress}
        >
          <option value="">{t("בחירת גלריה")}</option>
          {galleries.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "labeled" | "all")}
          aria-label={t("על אילו תמונות")}
          className="rounded-lg px-3 py-2 text-sm border border-line bg-white"
          disabled={!!progress}
        >
          <option value="labeled">{t("רק תמונות שסימנתי")}</option>
          <option value="all">{t("כל התמונות בגלריה")}</option>
        </select>
      </div>

      {!galleryId ? null : loading ? (
        <p className="text-sm text-ink-soft">{t("טוען...")}</p>
      ) : (
        <>
          <div className="rounded-2xl bg-card p-4 mb-4">
            {progress ? (
              <>
                <div className="flex items-center justify-between text-sm font-semibold mb-1.5">
                  <span>{t("מודד {done} מתוך {total}", { done: progress.done, total: progress.total })}</span>
                  <button onClick={() => (cancelRef.current = true)} className="text-xs underline text-ink-soft">
                    {t("עצירה")}
                  </button>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mb-1.5">
                  <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-ink-soft truncate">
                  {progress.current}
                  {eta !== null && ` · ${t("נשארו כ-{min} דקות", { min: Math.max(1, Math.round(eta / 60)) })}`}
                  {progress.errors > 0 && ` · ${t("{n} שגיאות", { n: progress.errors })}`}
                  {progress.unsaved > 0 && ` · ${t("{n} לא נשמרו ויימדדו שוב בהרצה הבאה", { n: progress.unsaved })}`}
                </p>
                <p className="text-[11px] text-ink-soft mt-1">{t("המסך לא ייכבה בזמן ההרצה. אם עוצרים או סוגרים, ההרצה הבאה ממשיכה מאותה נקודה.")}</p>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void run()}
                  disabled={!pending.length || models === "loading"}
                  className="h-11 px-5 rounded-xl text-sm font-semibold bg-ink text-white disabled:opacity-40"
                >
                  {models === "loading" ? t("טוען את המודלים...") : t("הרצת המנוע על {n} תמונות", { n: pending.length })}
                </button>
                <span className="text-xs text-ink-soft">
                  {t("נמדדו {n} מתוך {total} בהיקף הזה", { n: inScope.length - pending.length, total: inScope.length })}
                  {errors > 0 && ` · ${t("{n} שגיאות", { n: errors })}`}
                </span>
                {remeasure > 0 && (
                  <p className="basis-full text-xs text-ink-soft leading-relaxed">
                    {t("{n} מהן כבר נמדדו, ויימדדו שוב: המנוע בודק עכשיו את כל הפרצופים בתמונה ולא רק את 6 הגדולים. עד אז הן נספרות לפי המדידה הקודמת.", { n: remeasure })}
                  </p>
                )}
              </div>
            )}
            {runError && <p className="text-xs text-rose mt-2 break-all">{t("טעינת המודלים נכשלה:")} {runError}</p>}
          </div>

          {measured.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                <Stat label={t("עיניים עצומות: דיוק")} rate={report.eyesPrecision} target={90} />
                <Stat label={t("לא בפוקוס: נתפסו")} rate={report.blurRecall} target={85} />
                <Stat label={t("לא בפוקוס: דיוק")} rate={report.blurPrecision} target={80} />
                <Stat label={t("עיניים עצומות: נתפסו")} rate={report.eyesRecall} target={null} />
                <Stat label={t("מבט לא למצלמה: דיוק")} rate={report.lookPrecision} target={null} />
                <Stat label={t("מבט לא למצלמה: נתפסו")} rate={report.lookRecall} target={null} />
              </div>
              <p className="text-xs text-ink-soft mb-1 leading-relaxed">
                {t("מבט לא למצלמה נבדק רק בתמונות מבוימות: שני פרצופים או יותר, ולפחות חצי מהם מסתכלים למצלמה. בתמונה עם פרצוף אחד המבט לא נבדק.")}
              </p>
              {report.lookUnchecked > 0 && (
                <p className="text-xs text-rose mb-1 leading-relaxed">
                  {t("{n} סימונים של מבט לא למצלמה מלפני ההגדרה החדשה מחכים לבדיקה בלשונית \"סימון\". עד שהבדיקה תסתיים, הם לא נספרים, והמספרים של המבט חלקיים.", { n: report.lookUnchecked })}
                </p>
              )}
              <p className="text-xs text-ink-soft mb-1 leading-relaxed">
                {t("{n} תמונות מסומנות נמדדו. לבדיקה: {review}. זמן עיבוד לתמונה: {avg} שניות בממוצע, {p90} ב-90% מהתמונות (בלי ההורדה, {dl} שניות).", {
                  n: report.n,
                  review: report.review,
                  avg: (timing.avg / 1000).toFixed(1),
                  p90: (timing.p90 / 1000).toFixed(1),
                  dl: (timing.download / 1000).toFixed(1),
                })}
              </p>
              <p className="text-xs text-ink-soft mb-1">
                {t("לא מחמיא: {n} תמונות מסומנות. המנוע עוד לא מזהה את זה, והסימונים נשמרים כדי ללמוד מהם בהמשך.", { n: report.unflattering })}
              </p>
              {timing.proxy > 0 && (
                <p className="text-xs text-rose mb-1">{t("{n} תמונות נמדדו מעותק של 2000 פיקסלים ולא מהמקור, ולכן מדידת הפוקוס בהן פחות מדויקת.", { n: timing.proxy })}</p>
              )}
              <p className="text-xs text-ink-soft mb-4">
                {t("בכל התמונות שנמדדו ({n}):", { n: measured.length })}{" "}
                {(Object.keys(allVerdicts) as CullVerdict[]).map((v) => `${t(VERDICT_TEXT[v])} ${allVerdicts[v]}`).join(" · ")}
              </p>

              {report.n > 0 && (
                <div className="rounded-2xl bg-card p-3 mb-4 overflow-x-auto">
                  <p className="text-xs font-semibold mb-2">{t("הסימון שלך (שורות) מול המנוע (עמודות)")}</p>
                  <table className="text-xs w-full font-data">
                    <thead>
                      <tr className="text-ink-soft">
                        <th />
                        {(Object.keys(VERDICT_TEXT) as CullVerdict[]).map((v) => (
                          <th key={v} className="px-2 py-1 font-semibold text-center">
                            {t(VERDICT_TEXT[v])}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(report.matrix) as (keyof typeof report.matrix)[]).map((l) => (
                        <tr key={l} className="border-t border-line">
                          <th className="px-2 py-1 text-start font-semibold whitespace-nowrap">{t(VERDICT_TEXT[l])}</th>
                          {(Object.keys(VERDICT_TEXT) as CullVerdict[]).map((v) => (
                            <td key={v} className={`px-2 py-1 text-center ${l === v && report.matrix[l][v] ? "text-sage font-bold" : ""}`}>
                              {report.matrix[l][v] || "·"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.n > 0 && (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(Object.keys(MISTAKE_TEXT) as MistakeKind[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          setFilter(k);
                          setKept(new Set());
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === k ? "bg-ink text-white border-ink" : "bg-white border-line text-ink-soft"}`}
                      >
                        {t(MISTAKE_TEXT[k])} ({mistakeCounts[k]})
                      </button>
                    ))}
                  </div>
                  {mistakes.length === 0 ? (
                    <p className="text-sm text-ink-soft">{t("אין תמונות בקבוצה הזו.")}</p>
                  ) : (
                    <>
                      <p className="text-xs text-ink-soft mb-2 leading-relaxed">
                        {t("אם הסימון שלך בתמונה לא נכון, אפשר לתקן אותו כאן בכרטיס. התיקון נשמר מיד, והמספרים למעלה מתעדכנים.")}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {mistakes.slice(0, 60).map((it) => (
                          <MistakeCard
                            key={it.photoId}
                            galleryId={galleryId}
                            item={it}
                            features={results.get(it.photoId)!.features!}
                            label={fromRow(labels.get(it.photoId)!)}
                            stillMistake={mistakeKinds(it).includes(filter)}
                            onRelabel={(l) => relabel(it.photoId, l)}
                          />
                        ))}
                      </div>
                      {mistakes.length > 60 && <p className="text-xs text-ink-soft mt-2">{t("מוצגות 60 מתוך {n}", { n: mistakes.length })}</p>}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, rate, target }: { label: string; rate: Rate; target: number | null }) {
  const t = useT();
  const v = pct(rate);
  const met = target !== null && v !== null && v >= target;
  return (
    <div className="rounded-xl bg-card p-3">
      <p className="text-[11px] text-ink-soft leading-tight mb-1">{label}</p>
      <p className={`text-xl font-bold font-data ${target === null || v === null ? "" : met ? "text-sage" : "text-rose"}`}>{v === null ? "—" : `${v}%`}</p>
      <p className="text-[11px] text-ink-soft font-data">
        {rate.hit}/{rate.of}
        {target !== null && ` · ${t("יעד {n}%", { n: target })}`}
      </p>
    </div>
  );
}

// One photo the engine got wrong. Every face found is outlined: the faces the decision counted in
// amber, the rest faint, and the face behind the eyes call with its score (red when it says closed).
// In a posed photo looking away, the face furthest from the camera is dashed. Below, the eyes face's
// eyes up close, the numbers, and the owner's label, which can be corrected here.
function MistakeCard({
  galleryId,
  item,
  features,
  label,
  stillMistake,
  onRelabel,
}: {
  galleryId: string;
  item: BenchItem;
  features: CullFeatures;
  label: PhotoLabel;
  stillMistake: boolean;
  onRelabel: (label: PhotoLabel) => Promise<boolean>;
}) {
  const t = useT();
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const d = item.decision;
  const main = features.main >= 0 ? features.faces[features.main] : null;
  const eyesFace = d.eyesFace >= 0 ? features.faces[d.eyesFace] : null;
  const zoomFace = eyesFace ?? main;
  const src = `/api/galleries/${galleryId}/photos/${item.photoId}/image?size=2000`;
  const box = (b: [number, number, number, number], cls: string, key?: number) => (
    <span key={key} className={`absolute ${cls}`} style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }} />
  );
  const set = async (next: PhotoLabel) => {
    setSaving("saving");
    setSaving((await onRelabel(next)) ? "saved" : "failed");
  };
  const fine = !label.skip && !FLAGS.some((f) => label.flags[f.key]);
  const chip = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold border disabled:opacity-50 ${on ? "bg-ink text-white border-ink" : "bg-white border-line text-ink-soft"}`;
  return (
    <div className="rounded-2xl bg-card p-3">
      <div className="relative bg-black/90 rounded-lg overflow-hidden" style={{ aspectRatio: `${features.w} / ${features.h}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full" />
        {features.faces.map((f, i) =>
          i === d.eyesFace ? null : box(f.box, d.counted.includes(i) ? "border-2 border-amber-deep" : "border border-white/50", i)
        )}
        {d.lookFace >= 0 && (d.look === "away" || d.look === "unsure") && (
          <span
            className="absolute border-[3px] border-dashed"
            style={{
              left: `${features.faces[d.lookFace].box[0] * 100}%`,
              top: `${features.faces[d.lookFace].box[1] * 100}%`,
              width: `${features.faces[d.lookFace].box[2] * 100}%`,
              height: `${features.faces[d.lookFace].box[3] * 100}%`,
              borderColor: `var(--color-${LOOK_COLOR[d.look]})`,
            }}
          />
        )}
        {eyesFace && (
          <span
            className="absolute border-[3px]"
            style={{
              left: `${eyesFace.box[0] * 100}%`,
              top: `${eyesFace.box[1] * 100}%`,
              width: `${eyesFace.box[2] * 100}%`,
              height: `${eyesFace.box[3] * 100}%`,
              borderColor: `var(--color-${EYES_COLOR[d.eyes]})`,
            }}
          >
            {d.eyesValue !== null && (
              <span
                className="absolute top-0 start-0 text-white text-[10px] font-data px-1 rounded-sm whitespace-nowrap"
                style={{ background: `var(--color-${EYES_COLOR[d.eyes]})` }}
              >
                {d.eyesValue.toFixed(2)}
              </span>
            )}
          </span>
        )}
        {!main && box(features.scene.bestBox, "border-2 border-sage border-dashed")}
      </div>
      {zoomFace && (
        <div className="relative mt-2 rounded-lg overflow-hidden bg-black" style={{ aspectRatio: `${(zoomFace.eyes[2] * features.w) / (zoomFace.eyes[3] * features.h)}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            className="absolute max-w-none"
            style={{ width: `${100 / zoomFace.eyes[2]}%`, left: `${(-zoomFace.eyes[0] / zoomFace.eyes[2]) * 100}%`, top: `${(-zoomFace.eyes[1] / zoomFace.eyes[3]) * 100}%` }}
          />
        </div>
      )}
      <p className="text-xs mt-2 leading-relaxed">
        {t("המנוע:")} <b>{t(VERDICT_TEXT[d.verdict])}</b>
        {d.look !== "none" && ` · ${t(LOOK_TEXT[d.look])}`}
        {d.look === "none" && SCENE_TEXT[d.lookScene] && ` · ${t(SCENE_TEXT[d.lookScene])}`}
      </p>
      <p className="text-[11px] text-ink-soft font-data leading-relaxed">
        {d.focusFrom === "face"
          ? t("חדות הפרצוף הראשי {v}", { v: d.focusValue === null ? "—" : num(d.focusValue) })
          : t("בלי פרצוף, חדות הסצנה {v}", { v: d.focusValue ?? "—" })}
        {d.eyesValue !== null &&
          ` · ${t("עיניים {v} (עצימה {b}, מבט למטה {down})", { v: num(d.eyesValue), b: num(d.blinkValue ?? 0), down: num(d.downValue ?? 0) })}`}
        {d.lookValue !== null &&
          ` · ${t("מבט {v} בפרצוף הכי רחוק מהמצלמה (ראש {yaw}°, אישונים {gaze}), {looking} מתוך {faces} מסתכלים", {
            v: num(d.lookValue),
            yaw: Math.round(d.yawValue ?? 0),
            gaze: num(d.gazeValue ?? 0),
            looking: d.lookingFaces,
            faces: d.lookFaces,
          })}`}
        {` · ${t("{n} פרצופים", { n: features.faces.length })}`}
        {main && ` · ${t("מרחק עיניים {n}px", { n: main.iod })}`}
      </p>
      <div className="mt-2 pt-2 border-t border-line">
        <p className="text-[11px] text-ink-soft mb-1.5">
          {t("הסימון שלך:")}
          {saving === "saving" && ` ${t("שומר...")}`}
          {saving === "saved" && ` ${t("נשמר")}`}
          {saving === "failed" && <span className="text-rose"> {t("שמירת הסימון נכשלה, נסו שוב.")}</span>}
          {!stillMistake && <span className="text-sage font-semibold"> · {t("כבר לא טעות בקבוצה הזו")}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button disabled={saving === "saving"} onClick={() => void set({ skip: false, flags: { ...NO_FLAGS }, v: LABEL_VERSION })} className={chip(fine)}>
            {t("תקינה")}
          </button>
          {FLAGS.map((f) => (
            <button
              key={f.key}
              disabled={saving === "saving"}
              onClick={() => void set({ skip: false, flags: { ...(label.skip ? NO_FLAGS : label.flags), [f.key]: !label.flags[f.key] }, v: LABEL_VERSION })}
              className={chip(!label.skip && label.flags[f.key])}
            >
              {t(f.text)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
