"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/paginatedFetch";
import { useT } from "@/i18n/client";
import { LABEL_COLUMNS, type LabelRow } from "@/lib/culling/labels";
import { ENGINE_VERSION, analyzePhoto, loadCullingModels } from "@/lib/culling/engine";
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
// photos already measured with this engine version are skipped.

type Photo = { id: string; folder_id: string | null; original_filename: string; storage_path: string };
type Result = { features: CullFeatures | null; error: string | null; version: string };
type Progress = { done: number; total: number; ms: number[]; errors: number; current: string };

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
      setLabels(new Map((labelRows ?? []).map((r) => [r.photo_id, r])));
      setResults(new Map((resultRows ?? []).map((r) => [r.photo_id, { features: r.features, error: r.error, version: r.engine_version }])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, supabase]);

  const inScope = useMemo(() => (scope === "labeled" ? photos.filter((p) => labels.has(p.id) && labels.get(p.id)!.label !== "skip") : photos), [photos, labels, scope]);
  const pending = useMemo(() => inScope.filter((p) => results.get(p.id)?.version !== ENGINE_VERSION || !results.get(p.id)?.features), [inScope, results]);

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
    const state: Progress = { done: 0, total: queue.length, ms: [], errors: 0, current: "" };
    setProgress({ ...state });
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
      await supabase.from("culling_results").upsert(
        {
          photo_id: p.id,
          photographer_id: userId,
          gallery_id: galleryId,
          engine_version: ENGINE_VERSION,
          features: row.features,
          error: row.error,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "photo_id" }
      );
      setResults((cur) => new Map(cur).set(p.id, row));
      state.done++;
      setProgress({ ...state });
    }
    setProgress(null);
  }

  const items: BenchItem[] = useMemo(() => {
    const out: BenchItem[] = [];
    for (const p of photos) {
      const row = labels.get(p.id);
      const f = results.get(p.id)?.features;
      if (!row || row.label === "skip" || !f || f.v !== ENGINE_VERSION) continue;
      out.push({ photoId: p.id, label: row.label, notLooking: row.not_looking, unflattering: row.unflattering, v: row.labeled_v, decision: decide(f) });
    }
    return out;
  }, [photos, labels, results]);
  const report = useMemo(() => benchReport(items), [items]);

  const measured = useMemo(() => photos.filter((p) => results.get(p.id)?.features?.v === ENGINE_VERSION), [photos, results]);
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

  const mistakes = useMemo(() => items.filter((it) => mistakeKinds(it).includes(filter)), [items, filter]);
  const mistakeCounts = useMemo(() => {
    const c: Record<MistakeKind, number> = { missedBlur: 0, falseBlur: 0, missedEyes: 0, falseEyes: 0, missedLook: 0, falseLook: 0, review: 0 };
    for (const it of items) for (const k of mistakeKinds(it)) c[k]++;
    return c;
  }, [items]);
  const errors = useMemo(() => photos.filter((p) => results.get(p.id)?.version === ENGINE_VERSION && results.get(p.id)?.error).length, [photos, results]);

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
                </p>
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
                        onClick={() => setFilter(k)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === k ? "bg-ink text-white border-ink" : "bg-white border-line text-ink-soft"}`}
                      >
                        {t(MISTAKE_TEXT[k])} ({mistakeCounts[k]})
                      </button>
                    ))}
                  </div>
                  {mistakes.length === 0 ? (
                    <p className="text-sm text-ink-soft">{t("אין תמונות בקבוצה הזו.")}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {mistakes.slice(0, 60).map((it) => (
                        <MistakeCard key={it.photoId} galleryId={galleryId} item={it} features={results.get(it.photoId)!.features!} />
                      ))}
                    </div>
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

// One photo the engine got wrong: the photo with the main face and the measured eye region marked,
// the eyes up close, and the numbers the decision rested on.
function MistakeCard({ galleryId, item, features }: { galleryId: string; item: BenchItem; features: CullFeatures }) {
  const t = useT();
  const main = features.main >= 0 ? features.faces[features.main] : null;
  const src = `/api/galleries/${galleryId}/photos/${item.photoId}/image?size=2000`;
  const d = item.decision;
  const box = (b: [number, number, number, number], cls: string) => (
    <span className={`absolute border-2 ${cls}`} style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }} />
  );
  return (
    <div className="rounded-2xl bg-card p-3">
      <div className="relative bg-black/90 rounded-lg overflow-hidden" style={{ aspectRatio: `${features.w} / ${features.h}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full" />
        {main && box(main.box, "border-amber-deep")}
        {main && box(main.eyes, "border-sage")}
        {!main && box(features.scene.bestBox, "border-sage border-dashed")}
      </div>
      {main && (
        <div className="relative mt-2 rounded-lg overflow-hidden bg-black" style={{ aspectRatio: `${(main.eyes[2] * features.w) / (main.eyes[3] * features.h)}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            className="absolute max-w-none"
            style={{ width: `${100 / main.eyes[2]}%`, left: `${(-main.eyes[0] / main.eyes[2]) * 100}%`, top: `${(-main.eyes[1] / main.eyes[3]) * 100}%` }}
          />
        </div>
      )}
      <p className="text-xs mt-2 leading-relaxed">
        {t("סימנת:")} <b>{t(VERDICT_TEXT[item.label as CullVerdict])}</b> · {t("המנוע:")} <b>{t(VERDICT_TEXT[d.verdict])}</b>
      </p>
      <p className="text-[11px] text-ink-soft font-data leading-relaxed">
        {d.focusFrom === "eyes" ? t("חדות העיניים {v}", { v: d.focusValue ?? "—" }) : t("בלי פרצוף, חדות הסצנה {v}", { v: d.focusValue ?? "—" })}
        {d.blinkValue !== null && ` · ${t("עצימת עיניים {v}", { v: d.blinkValue.toFixed(2) })}`}
        {d.earValue !== null && ` · ${t("פתיחת העין {v}", { v: d.earValue.toFixed(2) })}`}
        {d.yawValue !== null && ` · ${t("סיבוב הראש {v}°", { v: Math.round(d.yawValue) })}`}
        {d.gazeValue !== null && ` · ${t("מבט הצידה {v}", { v: d.gazeValue.toFixed(2) })}`}
        {` · ${t("{n} פרצופים", { n: features.faces.length })}`}
        {main && ` · ${t("מרחק עיניים {n}px", { n: main.iod })}`}
      </p>
    </div>
  );
}
