"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { detectEventKind } from "@/lib/albumAuto/planner";
import type { EventKind } from "@/lib/albumAuto/types";
import { collageLayout, type CollageFace, type CollageLayout, type CollageStyle } from "@/lib/collage/layout";
import {
  collageSource,
  faceSample,
  mainPeopleGroups,
  pickCollagePhotos,
  pickPhase,
  sourceGroups,
  type CollageSource,
  type PhotoFacesFound,
  type PickablePhoto,
} from "@/lib/collage/pick";
import {
  COLLAGE_COUNT_RANGE,
  COLLAGE_SIZES,
  DEFAULT_COLLAGE_COUNT,
  DEFAULT_COLLAGE_SIZE,
  DESKTOP_MAX_PIXELS,
  MOBILE_MAX_PIXELS,
  collageFileName,
  collagePixels,
  jpegWithDpi,
} from "@/lib/collage/output";
import { drawCollageCell } from "@/lib/collage/draw";
import { detectFaceBoxes, detectFacesInImageUrl } from "@/lib/faceRecognition";
import { useBusy } from "@/lib/updateResume";

// Automatic collage from a gallery (admin, 2026-10-23, "עדכון אדמין"): the event's main figures
// (lib/collage/pick.ts) laid across a landscape print (lib/collage/layout.ts), previewed on a canvas
// and exported in the browser from the original files, at 300 DPI when the device can draw that many
// pixels. A photo is replaced by tapping it; "עיצוב אחר" and "תמונות אחרות" try again.

export type CollageBuilderPhoto = {
  id: string;
  storage_path: string;
  is_favorite: boolean;
  preview_aspect_ratio: number | null;
  folder_id: string | null;
  culling_status?: string | null;
  thumbUrl: string;
};

type SourceChoice = "auto" | "favorites" | "all" | `tab:${string}`;
type Result = { blob: Blob; url: string; width: number; height: number; dpi: number };

const KINDS: { id: EventKind; label: string }[] = [
  { id: "wedding", label: "חתונה" },
  { id: "henna", label: "חינה" },
  { id: "bar_mitzvah", label: "בר מצווה / עלייה לתורה" },
  { id: "bat_mitzvah", label: "בת מצווה" },
  { id: "book", label: "בוק בר/בת מצווה" },
  { id: "other", label: "אירוע אחר" },
];
const STYLES: { id: CollageStyle | "auto"; label: string }[] = [
  { id: "auto", label: "אוטומטי" },
  { id: "hero", label: "תמונה גדולה בצד" },
  { id: "rows", label: "שורות" },
  { id: "columns", label: "טורים" },
];
const FACE_SAMPLE = 60;
const previewSrc = (galleryId: string, photoId: string) => `/api/galleries/${galleryId}/photos/${photoId}/image?size=1200&fast=1`;

export default function CollageBuilder({
  galleryId,
  galleryTitle,
  eventType,
  photos,
  folders,
  onClose,
}: {
  galleryId: string;
  galleryTitle: string;
  eventType: string | null;
  photos: CollageBuilderPhoto[];
  folders: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useT();
  // Detected from the event type (it arrives after the window opens) and the title, until the
  // photographer picks another.
  const [kindChoice, setKind] = useState<EventKind | null>(null);
  const kind = kindChoice ?? detectEventKind(galleryTitle, eventType);
  const [choice, setChoice] = useState<SourceChoice>("auto");
  const [count, setCount] = useState(DEFAULT_COLLAGE_COUNT);
  const [size, setSize] = useState(DEFAULT_COLLAGE_SIZE);
  const [custom, setCustom] = useState(false);
  const [style, setStyle] = useState<CollageStyle | "auto">("auto");
  const [gapMm, setGapMm] = useState(4);
  const [background, setBackground] = useState<"#ffffff" | "#111111">("#ffffff");
  const [variant, setVariant] = useState(0);
  const [round, setRound] = useState(0);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const pickable: PickablePhoto[] = useMemo(
    () => photos.map((p) => ({ id: p.id, favorite: p.is_favorite, folderId: p.folder_id, rejected: p.culling_status === "rejected" })),
    [photos]
  );
  const usedFolders = useMemo(() => folders.filter((f) => photos.some((p) => p.folder_id === f.id)), [folders, photos]);

  // Where the photos come from: the event's main figures (auto), a tab, the favorites or everything.
  const source: CollageSource | { mode: "favorites" } = useMemo(() => {
    if (choice === "auto") return collageSource(kind, usedFolders, pickable);
    if (choice === "favorites") return { mode: "favorites" };
    if (choice === "all") return { mode: "all" };
    return { mode: "tabs", folderIds: [choice.slice(4)] };
  }, [choice, kind, usedFolders, pickable]);

  // ── The main people by their faces (no owners' tab): the gallery's saved detection, else a sample.
  const [found, setFound] = useState<PhotoFacesFound[] | null>(null);
  const [faceRun, setFaceRun] = useState<{ status: "idle" | "running" | "done"; done: number; total: number }>({ status: "idle", done: 0, total: 0 });
  const skipFacesRef = useRef(false);
  const needsFaces = source.mode === "faces";
  useEffect(() => {
    if (!needsFaces || found || faceRun.status !== "idle") return;
    let cancelled = false;
    skipFacesRef.current = false;
    (async () => {
      const supabase = createClient();
      const saved = new Map<string, PhotoFacesFound>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("gallery_photo_faces")
          .select("photo_id, box_x, box_y, box_width, box_height, descriptor")
          .eq("gallery_id", galleryId)
          .order("id")
          .range(from, from + 999)
          .returns<{ photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number; descriptor: number[] }[]>();
        if (error || !data) break;
        for (const r of data) {
          if (!Array.isArray(r.descriptor)) continue;
          const entry = saved.get(r.photo_id) ?? { photoId: r.photo_id, faces: [] };
          entry.faces.push({ descriptor: r.descriptor.map(Number), box: { x: r.box_x, y: r.box_y, width: r.box_width, height: r.box_height } });
          saved.set(r.photo_id, entry);
        }
        if (data.length < 1000) break;
      }
      if (cancelled) return;
      if (saved.size >= 20) {
        // In gallery order, like a sample.
        setFound(photos.filter((p) => saved.has(p.id)).map((p) => saved.get(p.id)!));
        setFaceRun({ status: "done", done: saved.size, total: saved.size });
        return;
      }
      const sample = faceSample(pickable, FACE_SAMPLE);
      const results: PhotoFacesFound[] = [];
      setFaceRun({ status: "running", done: 0, total: sample.length });
      for (let i = 0; i < sample.length; i++) {
        if (cancelled) return;
        if (skipFacesRef.current) break;
        try {
          const faces = await detectFacesInImageUrl(`/api/galleries/${galleryId}/photos/${sample[i]}/image?size=900`);
          results.push({ photoId: sample[i], faces: faces.map((f) => ({ descriptor: f.descriptor, box: f.box })) });
        } catch {
          // One unreadable photo doesn't stop the search.
        }
        setFaceRun({ status: "running", done: i + 1, total: sample.length });
      }
      if (cancelled) return;
      setFound(results);
      setFaceRun({ status: "done", done: results.length, total: sample.length });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per window, when faces are first needed
  }, [needsFaces]);

  // The groups to pick from, and what the photographer is told about where they came from.
  const { groups, weights, note } = useMemo((): { groups: PickablePhoto[][] | null; weights?: number[]; note: string } => {
    const toPickable = (ids: string[]) => ids.map((id) => pickable.find((p) => p.id === id)).filter((p): p is PickablePhoto => !!p);
    if (source.mode === "favorites") return { groups: [pickable.filter((p) => p.favorite)], note: t("מהתמונות שהלקוח סימן כמועדפות") };
    if (source.mode === "faces") {
      if (!found) return { groups: null, note: "" };
      const people = mainPeopleGroups(found, source.people);
      if (!people) return { groups: sourceGroups({ mode: "all" }, pickable, usedFolders), note: t("לא נמצאו פרצופים שחוזרים בתמונות, ולכן התמונות מכל הגלריה") };
      return {
        groups: people.groups.map(toPickable),
        weights: people.weights,
        note: source.people === 2 ? t("לפי הפרצופים: שני האנשים שמופיעים הכי הרבה, ביחד ולבד") : t("לפי הפרצופים: מי שמופיע הכי הרבה"),
      };
    }
    const g = sourceGroups(source, pickable, usedFolders);
    if (source.mode === "tabs") {
      const names = source.folderIds.map((id) => usedFolders.find((f) => f.id === id)?.name).filter(Boolean);
      return { groups: g, note: t("מהלשונית: {tabs}", { tabs: names.join(", ") }) };
    }
    return { groups: g, note: kind === "book" ? t("חלוקה חופשית מכל הגלריה") : t("מכל הגלריה") };
  }, [source, found, pickable, usedFolders, kind, t]);

  const poolIds = useMemo(() => (groups ? groups.flat().map((p) => p.id) : []), [groups]);
  const autoPicked = useMemo(() => (groups ? pickCollagePhotos(groups, count, weights, pickPhase(round)) : []), [groups, weights, count, round]);
  // A photo replaced by hand keeps its cell: the photos and layout as they were then, for as long as
  // the settings that made them stay the same (another pick, size, design or gap starts over).
  const pickKey = `${choice}|${kind}|${count}|${round}|${found ? found.length : -1}|${photos.length}`;

  // ── The layout: from the picked photos, or `frozen` after a photo was replaced by hand.
  const [manual, setManual] = useState<{ pickKey: string; layoutKey: string; picked: string[]; layout: CollageLayout } | null>(null);
  const picked = manual && manual.pickKey === pickKey ? manual.picked : autoPicked;
  const pageAspect = size.w / size.h;
  const gap = gapMm / 10 / size.w;
  const layoutKey = `${pickKey}|${size.w}x${size.h}|${gapMm}|${style}|${variant}`;
  const computed: CollageLayout | null = useMemo(() => {
    const list = picked.map((id) => byId.get(id)).filter((p): p is CollageBuilderPhoto => !!p);
    return collageLayout(
      list.map((p) => ({ id: p.id, aspect: p.preview_aspect_ratio && p.preview_aspect_ratio > 0 ? p.preview_aspect_ratio : 1.5 })),
      { aspect: pageAspect, gap, style, variant }
    );
  }, [picked, byId, pageAspect, gap, style, variant]);
  const layout = manual && manual.layoutKey === layoutKey ? manual.layout : computed;

  // ── Faces for the crops: known from the search, else found in the photo's small preview.
  const facesRef = useRef(new Map<string, CollageFace[]>());
  const [facesVersion, setFacesVersion] = useState(0);
  useEffect(() => {
    for (const f of found ?? []) if (!facesRef.current.has(f.photoId)) facesRef.current.set(f.photoId, f.faces.map((x) => x.box));
    let cancelled = false;
    (async () => {
      for (const id of picked) {
        if (cancelled) return;
        if (facesRef.current.has(id)) continue;
        try {
          facesRef.current.set(id, await detectFaceBoxes(`/api/galleries/${galleryId}/photos/${id}/image?size=640&fast=1`));
        } catch {
          facesRef.current.set(id, []);
        }
        if (!cancelled) setFacesVersion((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picked, galleryId, found]);

  // ── The preview canvas.
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [imagesVersion, setImagesVersion] = useState(0);
  useEffect(() => {
    for (const cell of layout?.cells ?? []) {
      if (imagesRef.current.has(cell.photoId)) continue;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => setImagesVersion((v) => v + 1);
      img.src = previewSrc(galleryId, cell.photoId);
      imagesRef.current.set(cell.photoId, img);
    }
  }, [layout, galleryId]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !boxWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(boxWidth * dpr);
    const h = Math.round(w / pageAspect);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    for (const cell of layout?.cells ?? []) {
      const img = imagesRef.current.get(cell.photoId);
      if (img && img.complete && img.naturalWidth > 0) drawCollageCell(ctx, cell, w, h, img, img.naturalWidth, img.naturalHeight, facesRef.current.get(cell.photoId));
      else {
        ctx.fillStyle = background === "#ffffff" ? "#ece8e1" : "#2a2826";
        const x = Math.round(cell.x * w);
        const y = Math.round(cell.y * h);
        ctx.fillRect(x, y, Math.round((cell.x + cell.w) * w) - x, Math.round((cell.y + cell.h) * h) - y);
      }
    }
  }, [layout, boxWidth, pageAspect, background, imagesVersion, facesVersion]);

  // ── Replacing one photo: tap it, pick another.
  const [replacing, setReplacing] = useState<string | null>(null);
  const [replaceFromAll, setReplaceFromAll] = useState(false);
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const cell = layout.cells.find((c) => fx >= c.x && fx <= c.x + c.w && fy >= c.y && fy <= c.y + c.h);
    if (cell) {
      setReplacing(cell.photoId);
      setReplaceFromAll(false);
    }
  };
  const replaceWith = (id: string) => {
    if (!replacing || !layout) return;
    const old = replacing;
    setManual({
      pickKey,
      layoutKey,
      picked: picked.map((x) => (x === old ? id : x)),
      layout: { ...layout, cells: layout.cells.map((c) => (c.photoId === old ? { ...c, photoId: id } : c)) },
    });
    setReplacing(null);
  };
  const candidates = useMemo(() => {
    const ids = replaceFromAll ? photos.filter((p) => p.culling_status !== "rejected").map((p) => p.id) : poolIds;
    const inUse = new Set(picked);
    return ids.filter((id) => !inUse.has(id)).slice(0, 400);
  }, [replaceFromAll, photos, poolIds, picked]);

  // ── The file.
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  useBusy("collage-export", exporting ? t("יצירת הקולאז'") : null);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);
  const isTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const pixels = collagePixels(size.w, size.h, isTouch ? MOBILE_MAX_PIXELS : DESKTOP_MAX_PIXELS);
  const fileName = collageFileName(galleryTitle, t("קולאז'"));

  async function loadOriginal(p: CollageBuilderPhoto): Promise<ImageBitmap> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/storage/download-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: "galleries", path: p.storage_path }),
        });
        const { url } = (await res.json()) as { url?: string };
        if (!url) throw new Error("url");
        const file = await fetch(url);
        if (!file.ok) throw new Error(String(file.status));
        return await createImageBitmap(await file.blob(), { imageOrientation: "from-image" });
      } catch {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    // The original didn't come: a 2000px copy through our server (enough for a small print).
    const res = await fetch(`/api/galleries/${galleryId}/photos/${p.id}/image?size=2000`);
    if (!res.ok) throw new Error(`photo ${res.status}`);
    return createImageBitmap(await res.blob());
  }

  async function exportCollage() {
    if (!layout || exporting) return;
    setExportError(null);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    const { width, height, dpi } = pixels;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setExportError(t("הדפדפן לא הצליח ליצור את הקובץ בגודל הזה. נסו גודל קטן יותר."));
      return;
    }
    try {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high";
      for (let i = 0; i < layout.cells.length; i++) {
        setExporting({ done: i, total: layout.cells.length });
        const cell = layout.cells[i];
        const photo = byId.get(cell.photoId);
        if (!photo) continue;
        const bmp = await loadOriginal(photo);
        try {
          drawCollageCell(ctx, cell, width, height, bmp, bmp.width, bmp.height, facesRef.current.get(cell.photoId));
        } finally {
          bmp.close();
        }
      }
      setExporting({ done: layout.cells.length, total: layout.cells.length });
      const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!jpeg) throw new Error("toBlob");
      const blob = new Blob([jpegWithDpi(new Uint8Array(await jpeg.arrayBuffer()), dpi) as BlobPart], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setResult({ blob, url, width, height, dpi });
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setExportError(t("יצירת הקובץ נכשלה. בדקו את החיבור ונסו שוב."));
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      setExporting(null);
    }
  }

  const canShare = (() => {
    if (!result || typeof navigator === "undefined" || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([result.blob], fileName, { type: "image/jpeg" })] });
    } catch {
      return false;
    }
  })();
  const share = async () => {
    if (!result) return;
    try {
      await navigator.share({ files: [new File([result.blob], fileName, { type: "image/jpeg" })], title: galleryTitle });
    } catch {
      // Cancelled.
    }
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${active ? "bg-ink text-white border-ink" : "bg-white border-line text-ink hover:border-amber-deep"}`;
  const sectionTitle = "font-display text-[15px] font-semibold text-ink mb-1";
  const sectionHint = "text-[11px] text-ink-soft mb-2.5 leading-relaxed";
  const thumbOf = (id: string) => byId.get(id)?.thumbUrl ?? "";
  const fewer = groups && poolIds.length > 0 && poolIds.length < count;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4" style={{ background: "rgba(20, 18, 15, 0.78)" }} onClick={onClose}>
      <div className="w-full max-w-5xl max-h-full overflow-y-auto rounded-md bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-line">
          <div>
            <h2 className="text-xl font-semibold font-display tracking-tight">{t("קולאז' אוטומטי")}</h2>
            <p className="text-[11px] text-ink-soft mt-0.5">{t("בטא · זמין כרגע רק בחשבון האדמין")}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-white border border-line flex items-center justify-center text-ink-soft" aria-label={t("סגירה")}>
            ✕
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] p-4 sm:p-6">
          {/* The preview first on a phone, the settings beside it on a computer. */}
          <div className="min-w-0 space-y-3">
            <div ref={boxRef} className="w-full">
              <canvas
                ref={canvasRef}
                onClick={onCanvasClick}
                className="block w-full cursor-pointer shadow-sheet"
                style={{ aspectRatio: `${size.w} / ${size.h}` }}
                aria-label={t("תצוגה מקדימה של הקולאז'")}
              />
            </div>
            {faceRun.status === "running" && needsFaces && (
              <div className="rounded-md border border-line bg-white p-3 text-xs space-y-2">
                <p className="font-semibold">{t("מחפש את בעלי השמחה לפי הפרצופים ({n} מתוך {total})", { n: faceRun.done, total: faceRun.total })}</p>
                <div className="h-1.5 rounded-full bg-line overflow-hidden">
                  <div className="h-full bg-amber-deep transition-all" style={{ width: `${faceRun.total ? (faceRun.done / faceRun.total) * 100 : 0}%` }} />
                </div>
                <p className="text-ink-soft">{t("אין בגלריה לשונית של בעלי השמחה (למשל \"חתן\"), ולכן הם מזוהים לפי הפנים. עם לשונית כזו זה מיידי.")}</p>
                <button onClick={() => (skipFacesRef.current = true)} className="underline text-ink-soft">
                  {t("לעצור ולהשתמש במה שנמצא עד עכשיו")}
                </button>
              </div>
            )}
            {note && <p className="text-xs text-ink-soft">{note}</p>}
            {fewer && <p className="text-xs text-amber-deep">{t("יש רק {n} תמונות מתאימות, וכולן בקולאז'.", { n: poolIds.length })}</p>}
            {groups && poolIds.length === 0 && <p className="text-xs text-amber-deep">{t("אין תמונות במקור הזה. בחרו מקור אחר.")}</p>}
            {layout && <p className="text-[11px] text-ink-soft">{t("לחיצה על תמונה מחליפה אותה.")}</p>}

            {replacing && (
              <div className="rounded-md border border-line bg-white p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold">{t("בחירת תמונה במקומה")}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setReplaceFromAll((v) => !v)} className={chip(replaceFromAll)}>
                      {t("מכל הגלריה")}
                    </button>
                    <button onClick={() => setReplacing(null)} className="h-7 w-7 rounded-full border border-line text-ink-soft" aria-label={t("סגירה")}>
                      ✕
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-72 overflow-y-auto">
                  {candidates.map((id) => (
                    <button key={id} onClick={() => replaceWith(id)} className="relative aspect-square overflow-hidden bg-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbOf(id)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
                    </button>
                  ))}
                  {candidates.length === 0 && <p className="col-span-full text-xs text-ink-soft">{t("אין עוד תמונות במקור הזה.")}</p>}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setVariant((v) => v + 1)} disabled={!layout} className="px-3 py-2 rounded-md border border-line bg-white text-sm font-semibold disabled:opacity-50">
                {t("עיצוב אחר")}
              </button>
              <button onClick={() => setRound((r) => r + 1)} disabled={!groups} className="px-3 py-2 rounded-md border border-line bg-white text-sm font-semibold disabled:opacity-50">
                {t("תמונות אחרות")}
              </button>
              <button onClick={exportCollage} disabled={!layout || !!exporting} className="px-4 py-2 rounded-md bg-ink text-white text-sm font-semibold disabled:opacity-50">
                {exporting ? t("מכין את הקובץ ({n} מתוך {total})", { n: exporting.done, total: exporting.total }) : t("הורדת הקולאז'")}
              </button>
              {canShare && (
                <button onClick={share} className="px-3 py-2 rounded-md border border-line bg-white text-sm font-semibold">
                  {t("שיתוף")}
                </button>
              )}
            </div>
            <p className="text-[11px] text-ink-soft font-data" dir="ltr">
              {pixels.width}×{pixels.height} px · {pixels.dpi} DPI
            </p>
            {pixels.dpi < 300 && (
              <p className="text-[11px] text-amber-deep">
                {t("במכשיר הזה הקובץ יוצא ב-{dpi} DPI. ב-300 DPI אפשר ליצור אותו במחשב.", { dpi: pixels.dpi })}
              </p>
            )}
            {exportError && <p className="text-xs text-[var(--tone-attention-ink,#b42318)]">{exportError}</p>}
            {result && (
              <p className="text-xs text-ink-soft">
                {t("הקובץ ירד.")}{" "}
                <a href={result.url} download={fileName} className="underline">
                  {t("להורדה שוב")}
                </a>
              </p>
            )}
          </div>

          <div className="space-y-5">
            <section>
              <p className={sectionTitle}>{t("סוג האירוע")}</p>
              <p className={sectionHint}>{t("קובע מי בקולאז': החתן והכלה, חתן או כלת השמחה, ובבוק תמונות מכל הגלריה.")}</p>
              <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)} className="w-full rounded-md border border-line bg-white px-2 py-2 text-sm">
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {t(k.label)}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <p className={sectionTitle}>{t("מאיפה התמונות")}</p>
              <select value={choice} onChange={(e) => setChoice(e.target.value as SourceChoice)} className="w-full rounded-md border border-line bg-white px-2 py-2 text-sm">
                <option value="auto">{t("אוטומטי: הדמות המרכזית")}</option>
                {usedFolders.map((f) => (
                  <option key={f.id} value={`tab:${f.id}`}>
                    {t("לשונית: {name}", { name: f.name })}
                  </option>
                ))}
                {photos.some((p) => p.is_favorite) && <option value="favorites">{t("המועדפות של הלקוח")}</option>}
                <option value="all">{t("כל הגלריה")}</option>
              </select>
            </section>

            <section>
              <p className={sectionTitle}>{t("מספר תמונות")}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setCount((c) => Math.max(COLLAGE_COUNT_RANGE.min, c - 1))} className="h-8 w-8 rounded-md border border-line bg-white" aria-label="-">
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={COLLAGE_COUNT_RANGE.min}
                  max={COLLAGE_COUNT_RANGE.max}
                  value={count}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n)) setCount(Math.min(COLLAGE_COUNT_RANGE.max, Math.max(COLLAGE_COUNT_RANGE.min, n)));
                  }}
                  className="w-16 rounded-md border border-line bg-white px-2 py-1.5 text-center font-data"
                />
                <button onClick={() => setCount((c) => Math.min(COLLAGE_COUNT_RANGE.max, c + 1))} className="h-8 w-8 rounded-md border border-line bg-white" aria-label="+">
                  +
                </button>
              </div>
            </section>

            <section>
              <p className={sectionTitle}>{t("גודל (ס\"מ, לרוחב)")}</p>
              <div className="flex flex-wrap gap-1.5">
                {COLLAGE_SIZES.map((s) => (
                  <button
                    key={`${s.w}x${s.h}`}
                    onClick={() => {
                      setCustom(false);
                      setSize(s);
                    }}
                    className={chip(!custom && size.w === s.w && size.h === s.h)}
                  >
                    <span dir="ltr" className="font-data">
                      {s.w}×{s.h}
                    </span>
                  </button>
                ))}
                <button onClick={() => setCustom(true)} className={chip(custom)}>
                  {t("גודל אחר")}
                </button>
              </div>
              {custom && <CustomSize size={size} onChange={setSize} />}
            </section>

            <section>
              <p className={sectionTitle}>{t("עיצוב")}</p>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setStyle(s.id);
                      setVariant(0);
                    }}
                    className={chip(style === s.id)}
                  >
                    {t(s.label)}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className={sectionTitle}>{t("מרווח בין התמונות")}</p>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={15} step={1} value={gapMm} onChange={(e) => setGapMm(Number(e.target.value))} className="flex-1" />
                <span className="text-xs font-data w-12 text-end">{t("{n} מ\"מ", { n: gapMm })}</span>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setBackground("#ffffff")} className={chip(background === "#ffffff")}>
                  {t("רקע לבן")}
                </button>
                <button onClick={() => setBackground("#111111")} className={chip(background === "#111111")}>
                  {t("רקע שחור")}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// A size of the photographer's own, kept across (the longer side is the width).
function CustomSize({ size, onChange }: { size: { w: number; h: number }; onChange: (s: { w: number; h: number }) => void }) {
  const t = useT();
  const [w, setW] = useState(String(size.w));
  const [h, setH] = useState(String(size.h));
  const apply = (ws: string, hs: string) => {
    const a = parseFloat(ws);
    const b = parseFloat(hs);
    if (!(a >= 10 && a <= 300 && b >= 10 && b <= 300)) return;
    onChange({ w: Math.max(a, b), h: Math.min(a, b) });
  };
  return (
    <div className="flex items-center gap-2 mt-2" dir="ltr">
      <input
        value={w}
        inputMode="decimal"
        onChange={(e) => {
          setW(e.target.value);
          apply(e.target.value, h);
        }}
        className="w-16 rounded-md border border-line bg-white px-2 py-1.5 text-center font-data"
        aria-label={t("רוחב")}
      />
      <span>×</span>
      <input
        value={h}
        inputMode="decimal"
        onChange={(e) => {
          setH(e.target.value);
          apply(w, e.target.value);
        }}
        className="w-16 rounded-md border border-line bg-white px-2 py-1.5 text-center font-data"
        aria-label={t("גובה")}
      />
      <span className="text-xs text-ink-soft">{t("ס\"מ")}</span>
    </div>
  );
}
