"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { REEL_PLATFORMS, REEL_TEMPLATES, platformById, templateById, type ReelPlatformId, type ReelSettings, type ReelTextPosition } from "@/lib/reels/templates";
import { drawReelFrame, loadReelImage, reelFonts, reelTimeline, type ReelFonts, type ReelImage } from "@/lib/reels/render";
import { exportReelMp4, ReelCancelledError, ReelUnsupportedError } from "@/lib/reels/encode";
import { useBusy } from "@/lib/updateResume";

// Reels from a gallery (owner, 2026-10-07, admin only while it's polished): pick photos, a
// platform and a template, edit the text and speed, watch it live, and export a video file to
// download or share straight to Instagram / TikTok / Facebook from the phone. Everything happens
// in the browser (see src/lib/reels).

export type ReelBuilderPhoto = { id: string; thumbUrl: string; isFavorite: boolean };

const MAX_PHOTOS = 30;
const PREVIEW_W = 360;
const TEXT_COLORS = ["#ffffff", "#f4e7c8", "#1c1b19", "#c9a15a"];

export default function ReelBuilder({
  galleryId,
  galleryTitle,
  dateLabel,
  studioName,
  photos,
  initialSelection,
  onClose,
}: {
  galleryId: string;
  galleryTitle: string;
  dateLabel: string | null;
  studioName: string | null;
  photos: ReelBuilderPhoto[];
  initialSelection: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>(() => initialSelection.slice(0, MAX_PHOTOS));
  const [picking, setPicking] = useState(false);
  const [settings, setSettings] = useState<ReelSettings>(() => ({
    platform: "ig-reel",
    templateId: REEL_TEMPLATES[0].id,
    speed: 1,
    text: { title: galleryTitle, subtitle: dateLabel ?? "", ending: studioName ?? "", position: "bottom", color: "#ffffff", show: true },
  }));
  const [images, setImages] = useState<Map<string, ReelImage>>(new Map());
  const [fonts, setFonts] = useState<ReelFonts | null>(null);
  const [playing, setPlaying] = useState(true);
  const [exporting, setExporting] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef(0);
  // The preview's play position for the progress bar, refreshed a few times a second.
  const [previewTime, setPreviewTime] = useState(0);
  useBusy("reel-export", exporting !== null ? t("יצירת הרילס") : null);

  const platform = platformById(settings.platform);
  const tpl = templateById(settings.templateId);
  const readyImages = useMemo(() => selected.map((id) => images.get(id)).filter((x): x is ReelImage => !!x), [selected, images]);
  const timeline = useMemo(() => reelTimeline(readyImages.length, tpl, settings), [readyImages.length, tpl, settings]);

  useEffect(() => {
    reelFonts().then(setFonts);
  }, []);

  // Photos load as they're picked (same-origin, so the canvas stays exportable).
  useEffect(() => {
    let alive = true;
    for (const id of selected) {
      if (images.has(id)) continue;
      loadReelImage(`/api/galleries/${galleryId}/photos/${id}/image?size=1600`)
        .then((img) => {
          if (alive) setImages((prev) => new Map(prev).set(id, img));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [selected, galleryId, images]);

  // Live preview: the same frames as the export, drawn small.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !fonts) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let uiTick = 0;
    const loop = (now: number) => {
      // (A frame's timestamp can be a hair before `last`, so never step back in time.)
      if (playing && timeline.total > 0) timeRef.current = (timeRef.current + Math.max(0, now - last) / 1000) % timeline.total;
      last = now;
      drawReelFrame(ctx, canvas.width, canvas.height, timeRef.current, timeline, tpl, settings, readyImages, fonts);
      if (++uiTick % 6 === 0) setPreviewTime(timeRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fonts, playing, timeline, tpl, settings, readyImages]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const setText = (patch: Partial<ReelSettings["text"]>) => setSettings((s) => ({ ...s, text: { ...s.text, ...patch } }));
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_PHOTOS ? prev : [...prev, id]));
  const move = (id: string, dir: -1 | 1) =>
    setSelected((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const runExport = async () => {
    if (!fonts || readyImages.length === 0) return;
    setError(null);
    setResult(null);
    cancelRef.current = false;
    setExporting(0);
    setPlaying(false);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = platform.width;
      canvas.height = platform.height;
      const ctx = canvas.getContext("2d")!;
      const blob = await exportReelMp4({
        canvas,
        total: timeline.total,
        draw: (time) => drawReelFrame(ctx, canvas.width, canvas.height, time, timeline, tpl, settings, readyImages, fonts),
        onProgress: (f) => setExporting(f),
        isCancelled: () => cancelRef.current,
      });
      setResult({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      if (e instanceof ReelCancelledError) return;
      setError(e instanceof ReelUnsupportedError ? t("הדפדפן הזה לא תומך ביצירת וידאו. נסו בכרום או בספארי מעודכן.") : t("יצירת הרילס נכשלה, נסו שוב."));
    } finally {
      setExporting(null);
      setPlaying(true);
    }
  };

  const fileName = () => {
    const ext = result?.blob.type === "video/webm" ? "webm" : "mp4";
    return `reel-${settings.platform}.${ext}`;
  };
  const canShareFile = () => {
    if (!result || typeof navigator === "undefined" || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([result.blob], fileName(), { type: result.blob.type })] });
    } catch {
      return false;
    }
  };
  const share = async () => {
    if (!result) return;
    try {
      await navigator.share({ files: [new File([result.blob], fileName(), { type: result.blob.type })], title: galleryTitle });
    } catch {
      // Cancelled by the user.
    }
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs font-semibold border ${active ? "bg-amber-deep text-white border-amber-deep" : "bg-white border-line text-ink"}`;
  const previewH = Math.round((PREVIEW_W * platform.height) / platform.width);
  const thumbOf = new Map(photos.map((p) => [p.id, p.thumbUrl]));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4" style={{ background: "rgba(28, 27, 25, 0.7)" }} onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-full overflow-y-auto rounded-md bg-paper shadow-sheet p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold font-display">{t("יצירת רילס")}</h2>
            <p className="text-xs text-ink-soft">{t("בטא · זמין כרגע רק בחשבון האדמין")}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-white border border-line flex items-center justify-center" aria-label={t("סגירה")}>
            ✕
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-5 min-w-0 order-2 md:order-1">
            <section>
              <p className="text-xs font-bold text-ink-soft mb-2">{t("פלטפורמה")}</p>
              <div className="flex flex-wrap gap-1.5">
                {REEL_PLATFORMS.map((p) => (
                  <button key={p.id} onClick={() => setSettings((s) => ({ ...s, platform: p.id as ReelPlatformId }))} className={chip(settings.platform === p.id)}>
                    {t(p.label)} <span className="opacity-70 font-data">{p.note}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="text-xs font-bold text-ink-soft mb-2">{t("תבנית")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {REEL_TEMPLATES.map((tp) => {
                  const active = settings.templateId === tp.id;
                  return (
                    <button
                      key={tp.id}
                      onClick={() => {
                        setSettings((s) => ({ ...s, templateId: tp.id, text: { ...s.text, color: tp.accent } }));
                        timeRef.current = 0;
                      }}
                      className={`text-start rounded-md border p-2.5 ${active ? "border-amber-deep bg-amber-bg" : "border-line bg-white"}`}
                    >
                      <span className="block text-sm font-bold">{t(tp.label)}</span>
                      <span className="block text-[11px] text-ink-soft leading-snug mt-0.5">{t(tp.description)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-ink-soft">{t("תמונות ({n} מתוך {max})", { n: selected.length, max: MAX_PHOTOS })}</p>
                <button onClick={() => setPicking((v) => !v)} className="text-xs font-semibold text-amber-deep underline">
                  {picking ? t("סיום הבחירה") : t("בחירת תמונות")}
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {selected.map((id, i) => (
                  <div key={id} className="relative shrink-0 w-16">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbOf.get(id)} alt="" className="h-20 w-16 object-cover rounded-sm" />
                    <span className="absolute top-0.5 start-0.5 min-w-4 h-4 px-1 rounded-sm bg-black/70 text-white text-[10px] flex items-center justify-center font-data">{i + 1}</span>
                    <div className="flex justify-between mt-0.5">
                      <button onClick={() => move(id, -1)} disabled={i === 0} className="text-xs px-1 disabled:opacity-30" aria-label={t("הקדמה")}>
                        →
                      </button>
                      <button onClick={() => move(id, 1)} disabled={i === selected.length - 1} className="text-xs px-1 disabled:opacity-30" aria-label={t("דחייה")}>
                        ←
                      </button>
                    </div>
                  </div>
                ))}
                {selected.length === 0 && <p className="text-xs text-ink-soft py-6">{t("בחרו תמונות כדי להתחיל")}</p>}
              </div>
              {picking && (
                <div className="mt-2 grid grid-cols-5 sm:grid-cols-8 gap-1 max-h-64 overflow-y-auto">
                  {photos.map((p) => {
                    const order = selected.indexOf(p.id);
                    return (
                      <button key={p.id} onClick={() => toggle(p.id)} className="relative aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumbUrl} alt="" loading="lazy" className={`h-full w-full object-cover rounded-sm ${order >= 0 ? "ring-2 ring-amber-deep" : ""}`} />
                        {order >= 0 && (
                          <span className="absolute top-0.5 start-0.5 min-w-4 h-4 px-1 rounded-sm bg-amber-deep text-white text-[10px] flex items-center justify-center font-data">{order + 1}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-soft">{t("טקסט על הסרטון")}</span>
                <input type="checkbox" checked={settings.text.show} onChange={(e) => setText({ show: e.target.checked })} />
              </label>
              {settings.text.show && (
                <>
                  <input value={settings.text.title} onChange={(e) => setText({ title: e.target.value })} placeholder={t("כותרת")} className="w-full h-10 rounded-md border border-line bg-white px-3 text-sm" />
                  <input value={settings.text.subtitle} onChange={(e) => setText({ subtitle: e.target.value })} placeholder={t("שורה שנייה (תאריך, סוג האירוע)")} className="w-full h-10 rounded-md border border-line bg-white px-3 text-sm" />
                  <input value={settings.text.ending} onChange={(e) => setText({ ending: e.target.value })} placeholder={t("טקסט סיום (למשל שם הסטודיו)")} className="w-full h-10 rounded-md border border-line bg-white px-3 text-sm" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["top", "center", "bottom"] as ReelTextPosition[]).map((pos) => (
                      <button key={pos} onClick={() => setText({ position: pos })} className={chip(settings.text.position === pos)}>
                        {pos === "top" ? t("למעלה") : pos === "center" ? t("במרכז") : t("למטה")}
                      </button>
                    ))}
                    <span className="mx-1 h-5 w-px bg-line" />
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setText({ color: c })}
                        className="h-6 w-6 rounded-full"
                        style={{ background: c, boxShadow: settings.text.color === c ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            <section>
              <label className="block">
                <span className="text-xs font-bold text-ink-soft">{t("קצב")}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-ink-soft">{t("מהיר")}</span>
                  <input type="range" min={0.6} max={1.6} step={0.1} value={settings.speed} onChange={(e) => setSettings((s) => ({ ...s, speed: Number(e.target.value) }))} className="flex-1" style={{ accentColor: "var(--color-amber-deep)" }} />
                  <span className="text-[11px] text-ink-soft">{t("איטי")}</span>
                </div>
              </label>
            </section>
          </div>

          <div className="order-1 md:order-2 flex flex-col items-center gap-2">
            <canvas
              ref={previewRef}
              width={PREVIEW_W}
              height={previewH}
              className="bg-black rounded-sm shadow-card max-w-full"
              style={{ width: "min(300px, 70vw)", height: "auto", maxHeight: "62vh", objectFit: "contain" }}
            />
            <div className="flex items-center gap-2 text-xs text-ink-soft w-full max-w-[300px]">
              <button onClick={() => setPlaying((v) => !v)} className="h-8 w-8 rounded-full bg-white border border-line flex items-center justify-center" aria-label={playing ? t("עצירה") : t("ניגון")}>
                {playing ? "❚❚" : "▶"}
              </button>
              <div className="flex-1 h-1 bg-line rounded-sm overflow-hidden">
                <div className="h-full bg-amber-deep" style={{ width: `${timeline.total ? (Math.min(previewTime, timeline.total) / timeline.total) * 100 : 0}%` }} />
              </div>
              <span className="font-data">{timeline.total.toFixed(1)}s</span>
            </div>
            {readyImages.length < selected.length && <p className="text-[11px] text-ink-soft">{t("טוען תמונות…")}</p>}

            {exporting !== null ? (
              <div className="w-full max-w-[300px] rounded-md border border-line bg-white p-3 text-center">
                <div className="mx-auto mb-2 h-6 w-6 rounded-full border-2 border-line border-t-amber-deep animate-spin" />
                <p className="text-sm font-semibold">{t("יוצר את הסרטון… {pct}%", { pct: Math.round(exporting * 100) })}</p>
                <button onClick={() => (cancelRef.current = true)} className="mt-2 text-xs text-ink-soft underline">
                  {t("ביטול")}
                </button>
              </div>
            ) : (
              <button
                onClick={runExport}
                disabled={!fonts || readyImages.length === 0}
                className="w-full max-w-[300px] h-11 rounded-md bg-amber-deep text-white text-sm font-semibold disabled:opacity-50"
              >
                {t("יצירת הסרטון")}
              </button>
            )}
            {error && <p className="text-xs text-rose max-w-[300px] text-center">{error}</p>}
            {result && (
              <div className="w-full max-w-[300px] space-y-2">
                <video src={result.url} controls playsInline className="w-full rounded-sm bg-black" style={{ maxHeight: "40vh" }} />
                <div className="flex gap-2">
                  <a href={result.url} download={fileName()} className="flex-1 h-10 rounded-md bg-white border border-line text-sm font-semibold flex items-center justify-center">
                    {t("הורדה")}
                  </a>
                  {canShareFile() && (
                    <button onClick={share} className="flex-1 h-10 rounded-md bg-ink text-white text-sm font-semibold">
                      {t("שיתוף לרשתות")}
                    </button>
                  )}
                </div>
                {result.blob.type === "video/webm" && (
                  <p className="text-[11px] text-ink-soft">{t("הדפדפן הזה יצר קובץ WebM. לאינסטגרם ולטיקטוק עדיף ליצור את הסרטון בכרום או בספארי בטלפון, שמייצרים MP4.")}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
