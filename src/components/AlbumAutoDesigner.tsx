"use client";

import { useBusy } from "@/lib/updateResume";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import { detectFacesInImageUrl, type DetectedFace } from "@/lib/faceRecognition";
import LiquidProgressBar from "@/components/LiquidProgressBar";
import { AUTO_STYLES, type AutoPhoto, type AutoStyleId, type CellPeople, type FamilyCellId, type LayoutPhoto, type PhotoFaces } from "@/lib/albumAuto/types";
import { bleedIdsOf, bookPagesWithoutCover, fillBookTemplate, frameElements, ownTemplatePlan } from "@/lib/albumAuto/templateFill";
import type { AlbumBookTemplateRow, AlbumTemplateRow } from "@/lib/types";
import { CELL_ORDER, cellLabel, countNames, detectEventKind, pickCellFaces, planAlbum } from "@/lib/albumAuto/planner";
import { layoutCover, layoutSpread } from "@/lib/albumAuto/layouts";
import { endAutoDesignSession, getAutoDesignSession, mountAutoDesigner, useSessionState, waitForAutoDesigner } from "@/lib/albumAuto/session";
import type { AlbumElement } from "@/lib/types";
import { useT } from "@/i18n/client";

// Auto album design (admin only while it's being polished, 2026-09-29): the photographer picks the
// album + cover size and a style, marks up to four family reference photos, and the whole book is
// planned (lib/albumAuto/planner.ts) and laid out (lib/albumAuto/layouts.ts) in the browser. The
// parent (GalleryManageView) saves the result as a normal album and opens it in the editor.

export type AutoDesignerPhoto = {
  id: string;
  is_favorite: boolean;
  preview_aspect_ratio: number | null;
  original_filename: string | null;
  url: string;
  previewUrl?: string | null;
  folder_id?: string | null;
};

export type AutoDesignerFolder = { id: string; name: string };

type AlbumSize = { width: number; height: number; margin: number };

export type AutoDesignResult = {
  size: AlbumSize;
  style: AutoStyleId;
  // bleedIds: elements that run to the page edge on purpose; the parent must not fit them into
  // the safe margin (see LayoutOutput in lib/albumAuto/types.ts).
  cover: { widthCm: number; heightCm: number; elements: AlbumElement[]; bleedIds: string[] } | null;
  // background: the spread's blurred background photo (clean style), saved on the spread row.
  spreads: { elements: AlbumElement[]; bleedIds: string[]; background?: { photoId: string; blur: number } }[];
};

type CellState = {
  photoId: string | null;
  names: string;
  faces: DetectedFace[] | null;
  detecting: boolean;
  error: string | null;
};

type Phase = "cells" | "times" | "faces" | "plan" | "layout" | "save";

const PHASES: { id: Phase; label: string }[] = [
  { id: "cells", label: "מזהה פרצופים בתאים" },
  { id: "times", label: "קורא את שעות הצילום" },
  { id: "faces", label: "מזהה פרצופים" },
  { id: "plan", label: "מתכנן את האלבום" },
  { id: "layout", label: "מעצב את העמודים" },
  { id: "save", label: "שומר ופותח את האלבום בעורך" },
];

// Share of the overall bar each phase fills (face detection is by far the slowest).
const PHASE_SPAN: Record<Phase, [number, number]> = {
  cells: [0, 8],
  times: [8, 20],
  faces: [20, 80],
  plan: [80, 85],
  layout: [85, 90],
  save: [90, 100],
};

// Face detection resolution: each family member's reference face is what every other photo is
// compared against, so the (at most four) reference photos get the most pixels; the book's photos
// get more than the gallery's 900px default so faces in group shots stay recognizable.
const CELL_IMAGE_SIZE = 1600;
const PHOTO_IMAGE_SIZE = 1280;

const PICKER_PAGE = 120;
const PAGE_SIZE = 1000;

const emptyCell = (): CellState => ({ photoId: null, names: "", faces: null, detecting: false, error: null });

class CancelledError extends Error {}

export default function AlbumAutoDesigner({
  galleryId,
  galleryTitle,
  eventType,
  photos,
  folders = [],
  defaultSize,
  sizePresets,
  onCreate,
  onCancel,
}: {
  galleryId: string;
  galleryTitle: string;
  eventType: string | null;
  photos: AutoDesignerPhoto[];
  folders?: AutoDesignerFolder[];
  defaultSize: AlbumSize;
  sizePresets: { label: string; width: number; height: number; margin: number }[];
  onCreate: (result: AutoDesignResult) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const supabase = createClient();
  // Everything the photographer filled in and a running design's progress live in the session
  // (lib/albumAuto/session.ts), so turning the phone doesn't wipe them.
  const session = getAutoDesignSession(galleryId);
  useEffect(() => mountAutoDesigner(session, onCreate as (result: never) => Promise<void>), [session, onCreate]);
  const [step, setStep] = useSessionState<1 | 2 | 3>(session, "step", 1);
  const [size, setSize] = useSessionState<AlbumSize>(session, "size", defaultSize);
  const [coverMode, setCoverMode] = useSessionState<"on" | "none">(session, "coverMode", "on");
  const [coverSize, setCoverSize] = useSessionState(session, "coverSize", () => singlePageOf(defaultSize));
  const [coverTouched, setCoverTouched] = useSessionState(session, "coverTouched", false);
  // The dropdown's choice: "style:<id>" (an auto style) or "tpl:<id>" (a saved book template, whose
  // pages are filled with the photos — owner, 2026-09-30).
  const [choice, setChoice] = useSessionState<string>(session, "choice", "style:clean");
  const style: AutoStyleId = choice.startsWith("style:") ? (choice.slice(6) as AutoStyleId) : "clean";
  const [bookTemplates, setBookTemplates] = useState<AlbumBookTemplateRow[]>([]);
  const [pageTemplates, setPageTemplates] = useState<AlbumTemplateRow[]>([]);
  useEffect(() => {
    supabase
      .from("album_book_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AlbumBookTemplateRow[]>()
      .then(({ data }) => setBookTemplates((data ?? []).filter((tpl) => Array.isArray(tpl.pages) && tpl.pages.some((pg) => pg.length > 0))));
    supabase
      .from("album_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AlbumTemplateRow[]>()
      .then(({ data }) => setPageTemplates(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);
  const chosenTemplate = choice.startsWith("tpl:") ? bookTemplates.find((tpl) => tpl.id === choice.slice(4)) ?? null : null;
  const [spreadCount, setSpreadCount] = useSessionState(session, "spreadCount", "");
  const [cells, setCells] = useSessionState<Record<FamilyCellId, CellState>>(session, "cells", () => ({
    parents: emptyCell(),
    owners: emptyCell(),
    siblings: emptyCell(),
    grandparents: emptyCell(),
  }));
  const [pickerFor, setPickerFor] = useState<FamilyCellId | null>(null);
  const [pickerLimit, setPickerLimit] = useState(PICKER_PAGE);
  // The picker shows the gallery as it is: its own order, split by its tabs (folders) when it has them.
  const [pickerTab, setPickerTab] = useState<string>("all");

  const [running, setRunning] = useSessionState(session, "running", false);
  const [phase, setPhase] = useSessionState<Phase>(session, "phase", "times");
  // A design in progress can't survive the update's reload: the update waits for it.
  useBusy("album-auto-design", running ? t("העיצוב האוטומטי של האלבום") : null);
  const [phaseDetail, setPhaseDetail] = useSessionState(session, "phaseDetail", "");
  const [pct, setPct] = useSessionState(session, "pct", 0);
  const [runError, setRunError] = useSessionState<string | null>(session, "runError", null);
  const { cancelRef, skipFacesRef } = session;

  const eventKind = useMemo(() => detectEventKind(galleryTitle, eventType), [galleryTitle, eventType]);
  const favorites = useMemo(() => photos.filter((p) => p.is_favorite), [photos]);
  const candidates = favorites.length > 0 ? favorites : photos;
  const hasUnfiled = folders.length > 0 && photos.some((p) => !p.folder_id);
  const pickerPhotos = useMemo(
    () => (pickerTab === "all" ? photos : pickerTab === "none" ? photos.filter((p) => !p.folder_id) : photos.filter((p) => p.folder_id === pickerTab)),
    [photos, pickerTab]
  );
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const singlePage = singlePageOf(size);
  const coverPresets = useMemo(() => {
    const list = [{ label: t("כמו עמוד ({size})", { size: `${fmt(singlePage.width)}×${fmt(singlePage.height)}` }), width: singlePage.width, height: singlePage.height }];
    for (const [w, h] of [
      [30, 30],
      [25, 25],
      [20, 30],
      [30, 20],
    ]) {
      if (!list.some((p) => p.width === w && p.height === h)) list.push({ label: `${w}×${h}`, width: w, height: h });
    }
    return list;
  }, [singlePage.width, singlePage.height, t]);

  const setAlbumSize = (next: AlbumSize) => {
    setSize(next);
    // Until the photographer set the cover explicitly, it follows the album's single page.
    if (!coverTouched) setCoverSize(singlePageOf(next));
  };

  const updateCell = (id: FamilyCellId, patch: Partial<CellState>) => setCells((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // Choosing a photo only marks it; the cells' faces are detected when the design starts, the
  // first step of run() (owner's request, 2026-09-29: one button instead of a separate one).
  const choosePhoto = (cellId: FamilyCellId, photoId: string) => {
    setPickerFor(null);
    updateCell(cellId, { photoId, faces: null, detecting: false, error: null });
  };

  const sizeValid = size.width > 0 && size.height > 0 && (coverMode === "none" || (coverSize.width > 0 && coverSize.height > 0));

  const setProgress = (p: Phase, fraction: number, detail = "") => {
    const [from, to] = PHASE_SPAN[p];
    setPhase(p);
    setPhaseDetail(detail);
    setPct(from + (to - from) * Math.max(0, Math.min(1, fraction)));
  };

  const checkCancel = () => {
    if (cancelRef.current) throw new CancelledError();
  };

  const run = async () => {
    if (session.values.get("running") || candidates.length === 0) return;
    cancelRef.current = false;
    skipFacesRef.current = false;
    setRunError(null);
    setRunning(true);
    setStep(3);
    try {
      // (0) Faces in the cells' reference photos, one cell after another (already detected ones —
      // from an earlier run — are kept). A cell whose detection fails is left out of the design.
      const cellFaces = new Map<FamilyCellId, DetectedFace[]>();
      const toDetect = CELL_ORDER.filter((id) => cells[id].photoId);
      setProgress("cells", 0, toDetect.length ? t("{n} מתוך {total} תאים", { n: 0, total: toDetect.length }) : "");
      for (let i = 0; i < toDetect.length; i++) {
        checkCancel();
        const cellId = toDetect[i];
        const cell = cells[cellId];
        const photoId = cell.photoId as string;
        if (cell.faces) cellFaces.set(cellId, cell.faces);
        else {
          updateCell(cellId, { detecting: true, error: null });
          try {
            const faces = await detectFacesInImageUrl(`/api/galleries/${galleryId}/photos/${photoId}/image?size=${CELL_IMAGE_SIZE}`);
            cellFaces.set(cellId, faces);
            setCells((prev) => (prev[cellId].photoId === photoId ? { ...prev, [cellId]: { ...prev[cellId], faces, detecting: false } } : prev));
          } catch {
            setCells((prev) =>
              prev[cellId].photoId === photoId ? { ...prev, [cellId]: { ...prev[cellId], detecting: false, error: "לא הצלחנו לזהות פרצופים בתמונה הזו" } } : prev
            );
          }
        }
        setProgress("cells", (i + 1) / toDetect.length, t("{n} מתוך {total} תאים", { n: i + 1, total: toDetect.length }));
      }
      checkCancel();

      // (a) Shooting times from EXIF — the route reads a batch per call until nothing is left. Only
      // the photos the book is built from: the favorites when there are any, not the whole gallery.
      const favoritesOnly = favorites.length > 0;
      setProgress("times", 0);
      let checkedSoFar = 0;
      for (let guard = 0; guard < 500; guard++) {
        checkCancel();
        const res = await fetch(`/api/galleries/${galleryId}/photos/capture-times`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favoritesOnly }),
        });
        if (!res.ok) throw new Error("times");
        const data = (await res.json()) as { checked: number; withDate: number; remaining: number };
        checkedSoFar += data.checked;
        const total = checkedSoFar + data.remaining;
        setProgress("times", total > 0 ? checkedSoFar / total : 1, t("{n} מתוך {total}", { n: checkedSoFar, total }));
        if (data.remaining <= 0 || data.checked <= 0) break;
      }
      const takenAt = new Map<string, number>();
      for (let from = 0; ; from += PAGE_SIZE) {
        let timesQuery = supabase.from("gallery_photos").select("id, taken_at").eq("gallery_id", galleryId);
        if (favoritesOnly) timesQuery = timesQuery.eq("is_favorite", true);
        const { data, error } = await timesQuery
          .order("id")
          .range(from, from + PAGE_SIZE - 1)
          .returns<{ id: string; taken_at: string | null }[]>();
        if (error) throw new Error("times");
        for (const row of data ?? []) {
          const ts = row.taken_at ? Date.parse(row.taken_at) : NaN;
          if (Number.isFinite(ts)) takenAt.set(row.id, ts);
        }
        if (!data || data.length < PAGE_SIZE) break;
      }
      checkCancel();

      // Reference people per cell.
      const cellPeople: CellPeople[] = [];
      for (const id of CELL_ORDER) {
        const cell = cells[id];
        const faces = cellFaces.get(id);
        if (!cell.photoId || !faces || faces.length === 0) continue;
        const descriptors = pickCellFaces(
          faces.map((f) => ({ descriptor: f.descriptor, area: f.box.width * f.box.height })),
          cell.names
        ).filter((d) => d.length > 0);
        if (descriptors.length > 0) cellPeople.push({ id, descriptors });
      }

      // (b) Faces in the candidate photos: the gallery's cached detection first, then detect the
      // rest in memory only (gallery_photo_faces' clusters drive the face filter, so never write).
      const facesByPhoto = new Map<string, { descriptor: number[]; area: number }[]>();
      // Face boxes per photo, so the layouts can crop without cutting heads.
      const boxesByPhoto = new Map<string, { x: number; y: number; width: number; height: number }[]>();
      const addBox = (photoId: string, box: { x: number; y: number; width: number; height: number }) => {
        const list = boxesByPhoto.get(photoId) ?? [];
        list.push(box);
        boxesByPhoto.set(photoId, list);
      };
      if (cellPeople.length > 0) {
        setProgress("faces", 0, t("טוען זיהוי קודם"));
        const candidateIds = new Set(candidates.map((p) => p.id));
        const cachedIds = new Set<string>();
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from("gallery_photo_faces")
            .select("id, photo_id, box_x, box_y, box_width, box_height, descriptor")
            .eq("gallery_id", galleryId)
            .order("id")
            .range(from, from + PAGE_SIZE - 1)
            .returns<{ id: string; photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number; descriptor: number[] }[]>();
          if (error) break; // no cache is fine, everything just gets detected below
          for (const row of data ?? []) {
            if (!candidateIds.has(row.photo_id) || !Array.isArray(row.descriptor)) continue;
            cachedIds.add(row.photo_id);
            addBox(row.photo_id, { x: row.box_x, y: row.box_y, width: row.box_width, height: row.box_height });
            const list = facesByPhoto.get(row.photo_id) ?? [];
            list.push({ descriptor: row.descriptor.map(Number), area: row.box_width * row.box_height });
            facesByPhoto.set(row.photo_id, list);
          }
          if (!data || data.length < PAGE_SIZE) break;
        }
        const toDetect = candidates.filter((p) => !cachedIds.has(p.id));
        for (let i = 0; i < toDetect.length; i++) {
          checkCancel();
          if (skipFacesRef.current) break;
          setProgress("faces", i / toDetect.length, t("{n} מתוך {total} תמונות", { n: i, total: toDetect.length }));
          try {
            const faces = await detectFacesInImageUrl(`/api/galleries/${galleryId}/photos/${toDetect[i].id}/image?size=${PHOTO_IMAGE_SIZE}`);
            if (faces.length > 0) facesByPhoto.set(toDetect[i].id, faces.map((f) => ({ descriptor: f.descriptor, area: f.box.width * f.box.height })));
            for (const f of faces) addBox(toDetect[i].id, f.box);
          } catch {
            // One unreadable photo shouldn't stop the whole design.
          }
        }
      }
      setProgress("faces", 1);
      checkCancel();

      for (const id of CELL_ORDER) {
        const cell = cells[id];
        if (cell.photoId && cell.faces && !boxesByPhoto.has(cell.photoId)) for (const f of cell.faces) addBox(cell.photoId, f.box);
      }

      // (c) The plan.
      setProgress("plan", 0);
      await nextFrame();
      const autoPhotos: AutoPhoto[] = candidates.map((p) => ({
        id: p.id,
        aspect: p.preview_aspect_ratio && p.preview_aspect_ratio > 0 ? p.preview_aspect_ratio : 1.5,
        takenAt: takenAt.get(p.id) ?? null,
        filename: p.original_filename ?? "",
      }));
      const photoFaces: PhotoFaces[] = [...facesByPhoto.entries()].map(([photoId, faces]) => ({ photoId, faces }));
      const target = parseInt(spreadCount, 10);
      const referencePhotos = CELL_ORDER.filter((id) => cells[id].photoId).map((id) => ({ id, photoId: cells[id].photoId }));
      const plan = planAlbum(
        autoPhotos,
        photoFaces,
        cellPeople,
        { style, targetSpreads: Number.isFinite(target) && target > 0 ? Math.min(30, target) : null, hasCover: coverMode === "on" },
        referencePhotos
      );
      if (plan.spreads.length === 0) throw new Error("empty");
      setProgress("plan", 1);
      checkCancel();

      // (d) The layouts.
      setProgress("layout", 0);
      await nextFrame();
      const aspectOf = new Map(autoPhotos.map((p) => [p.id, p.aspect]));
      const layoutPhoto = (id: string): LayoutPhoto => ({ id, aspect: aspectOf.get(id) ?? 1.5, faces: boxesByPhoto.get(id) });
      const spreads: AutoDesignResult["spreads"] = chosenTemplate
        ? // A saved book template: the photos in the planned book order (owners, family, event
          // stages), page after page into the template's frames (see fillBookTemplate's rules).
          fillBookTemplate(coverMode === "on" ? bookPagesWithoutCover(chosenTemplate.pages) : chosenTemplate.pages, plan.spreads.flatMap((s) => s.photoIds).map(layoutPhoto), {
            maxSpreads: (Number.isFinite(target) && target > 0 ? Math.min(30, target) : 30) - (coverMode === "on" ? 1 : 0),
            widthCm: size.width,
            heightCm: size.height,
            userTemplates: pageTemplates.map((tpl) => tpl.frames),
          }).map((elements) => ({ elements, bleedIds: bleedIdsOf(elements) }))
        : (() => {
            // Mostly the photographer's own page templates (70%), the style's layout for the rest
            // (owner, 2026-10-06) — see ownTemplatePlan.
            const ownPlan = ownTemplatePlan(
              plan.spreads.map((s) => [...new Set(s.photoIds)].map(layoutPhoto)),
              pageTemplates.map((tpl) => tpl.frames).filter((f) => Array.isArray(f) && f.length > 0),
              size.width,
              size.height
            );
            return plan.spreads.map((s, i) => {
              const out = layoutSpread({
                style,
                photos: s.photoIds.map(layoutPhoto),
                heroId: s.heroId,
                section: s.section,
                spreadIndex: i,
                widthCm: size.width,
                heightCm: size.height,
              });
              const background = out.background ? { background: out.background } : {};
              const own = ownPlan[i];
              if (!own) return { elements: out.elements, bleedIds: out.bleedIds ?? [], ...background };
              // The style's page colour (a full-page shape) and blurred background stay, so own pages
              // sit in the same book; the photos take the template's frames and its own finish.
              const pageShapes = out.elements.filter((e) => e.type === "shape" && e.xPct <= 0.5 && e.yPct <= 0.5 && e.widthPct >= 99.5 && e.heightPct >= 99.5);
              const photoEls = frameElements(own, [...new Set(s.photoIds)].map(layoutPhoto), size.width, size.height, `own-${i}`);
              return { elements: [...pageShapes, ...photoEls], bleedIds: [...pageShapes.map((e) => e.id), ...bleedIdsOf(photoEls)], ...background };
            });
          })();
      const cover =
        coverMode === "on"
          ? {
              widthCm: coverSize.width,
              heightCm: coverSize.height,
              ...(() => {
                const out = layoutCover({
                  style,
                  photo: plan.coverPhotoId ? layoutPhoto(plan.coverPhotoId) : null,
                  title: galleryTitle,
                  widthCm: coverSize.width,
                  heightCm: coverSize.height,
                });
                return { elements: out.elements, bleedIds: out.bleedIds ?? [] };
              })(),
            }
          : null;
      setProgress("layout", 1, t("{n} עמודים", { n: spreads.length + (cover ? 1 : 0) }));
      checkCancel();

      // (e) Save — the parent creates the album and opens it (this component unmounts then).
      setProgress("save", 0.3);
      // Through the parent mounted NOW (the one that started may be gone after a rotation); a design
      // that finished in portrait waits until the phone is turned back.
      await waitForAutoDesigner(session);
      checkCancel();
      await (session.onCreate as (r: AutoDesignResult) => Promise<void>)({ size, style, cover, spreads });
      setProgress("save", 1);
      endAutoDesignSession(galleryId);
    } catch (e) {
      if (e instanceof CancelledError) {
        setStep(2);
      } else {
        const msg = e instanceof Error ? e.message : "";
        setRunError(
          msg === "times"
            ? t("לא הצלחנו לקרוא את שעות הצילום של התמונות.")
            : msg === "empty"
              ? t("לא נמצאו תמונות לעיצוב האלבום.")
              : t("משהו השתבש בעיצוב האלבום.")
        );
      }
    } finally {
      setRunning(false);
    }
  };

  const filledCells = CELL_ORDER.filter((id) => cells[id].photoId).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-amber bg-amber-bg p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-base font-bold text-amber-deep">{t("עיצוב אוטומטי של כל האלבום")}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-3" aria-hidden>
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-amber-deep" : "bg-white/70"}`} />
          ))}
        </div>
        <p className="text-xs text-ink mt-2">
          {step === 1 && t("שלב 1 מתוך 3: מידות וסגנון")}
          {step === 2 && t("שלב 2 מתוך 3: המשפחה")}
          {step === 3 && t("שלב 3 מתוך 3: עיצוב")}
        </p>
      </div>

      {step === 1 && (
        <>
          {/* One section, one row: the album's size on the right (first in RTL), the cover's in the
              middle, the style (or a saved template) on the left. */}
          <section className="rounded-lg border border-line bg-white p-3.5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            <div className="space-y-3 min-w-0">
              <p className="text-sm font-semibold">{t("מידות האלבום (ס״מ)")}</p>
              <div className="space-y-2">
                <label className="block min-w-0">
                  <span className="block text-xs text-ink-soft mb-1.5">{t("מידה נפוצה")}</span>
                  <select
                    value={sizePresets.find((p) => p.width === size.width && p.height === size.height)?.label ?? ""}
                    onChange={(e) => {
                      const preset = sizePresets.find((p) => p.label === e.target.value);
                      if (preset) setAlbumSize({ width: preset.width, height: preset.height, margin: preset.margin });
                    }}
                    className="w-full min-w-0 rounded-lg border border-line px-2.5 py-2 text-sm bg-white"
                  >
                    <option value="">{t("בחירה...")}</option>
                    {sizePresets.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label={t("רוחב")} value={size.width} onChange={(v) => setAlbumSize({ ...size, width: v })} />
                  <NumberField label={t("גובה")} value={size.height} onChange={(v) => setAlbumSize({ ...size, height: v })} />
                  <NumberField label={t("שוליים")} value={size.margin} step={0.1} min={0} onChange={(v) => setSize({ ...size, margin: v })} />
                </div>
              </div>
            </div>

            <div className="space-y-3 min-w-0 border-t border-line pt-4 sm:border-t-0 sm:pt-0 sm:border-s sm:ps-3 lg:ps-4">
              <p className="text-sm font-semibold">{t("מידות הכריכה (ס״מ)")}</p>
              <div className="space-y-2">
                <label className="block min-w-0">
                  <span className="block text-xs text-ink-soft mb-1.5">{t("מידה")}</span>
                  <select
                    value={
                      coverMode === "none"
                        ? "none"
                        : (coverPresets.find((p) => p.width === coverSize.width && p.height === coverSize.height)?.label ?? "")
                    }
                    onChange={(e) => {
                      setCoverTouched(true);
                      if (e.target.value === "none") {
                        setCoverMode("none");
                        return;
                      }
                      setCoverMode("on");
                      const preset = coverPresets.find((p) => p.label === e.target.value);
                      if (preset) setCoverSize({ width: preset.width, height: preset.height });
                    }}
                    className="w-full min-w-0 rounded-lg border border-line px-2.5 py-2 text-sm bg-white"
                  >
                    <option value="">{t("מידה אחרת")}</option>
                    {coverPresets.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label}
                      </option>
                    ))}
                    <option value="none">{t("בלי כריכה")}</option>
                  </select>
                </label>
                {coverMode === "on" && (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label={t("רוחב")}
                      value={coverSize.width}
                      onChange={(v) => {
                        setCoverTouched(true);
                        setCoverSize({ ...coverSize, width: v });
                      }}
                    />
                    <NumberField
                      label={t("גובה")}
                      value={coverSize.height}
                      onChange={(v) => {
                        setCoverTouched(true);
                        setCoverSize({ ...coverSize, height: v });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 min-w-0 border-t border-line pt-4 sm:border-t-0 sm:pt-0 sm:border-s sm:ps-3 lg:ps-4">
              <p className="text-sm font-semibold">{t("סגנון")}</p>
              <label className="block min-w-0">
                <span className="block text-xs text-ink-soft mb-1.5">{t("סגנון או תבנית שמורה")}</span>
                <select
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  className="w-full rounded-lg border border-line px-2.5 py-2 text-sm bg-white"
                >
                  <optgroup label={t("סגנונות")}>
                    {AUTO_STYLES.map((st) => (
                      <option key={st.id} value={`style:${st.id}`}>
                        {t(st.name)}
                      </option>
                    ))}
                  </optgroup>
                  {bookTemplates.length > 0 && (
                    <optgroup label={t("התבניות השמורות שלי")}>
                      {bookTemplates.map((tpl) => (
                        <option key={tpl.id} value={`tpl:${tpl.id}`}>
                          {tpl.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <p className="text-xs text-ink-soft leading-relaxed">
                {chosenTemplate
                  ? t("התמונות ייכנסו לפי התבנית ({n} עמודים). עמודים עודפים יימחקו, והעמוד האחרון יותאם לתמונות שנשארו.", { n: chosenTemplate.pages.filter((pg) => pg.length > 0).length })
                  : t(AUTO_STYLES.find((st) => st.id === style)?.description ?? "")}
              </p>
            </div>
          </div>

            <label className="flex items-center gap-2 flex-wrap pt-1">
              <input
                type="number"
                min={2}
                max={30}
                inputMode="numeric"
                value={spreadCount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setSpreadCount(v && parseInt(v, 10) > 30 ? "30" : v);
                }}
                placeholder={t("אוטומטי")}
                className="w-24 rounded-lg border border-line px-2.5 py-2 text-sm text-center bg-white"
              />
              <span className="text-xs text-ink-soft">{t("מספר עמודים רצוי באלבום, כולל הכריכה (ריק: אוטומטי, עד 30)")}</span>
            </label>
          </section>

          <p className="text-xs text-ink-soft">
            {favorites.length > 0
              ? t("האלבום ייבנה מ־{n} התמונות שסומנו בלב.", { n: favorites.length })
              : t("לא סומנו תמונות בלב, אז האלבום ייבנה מכל {n} התמונות בגלריה.", { n: photos.length })}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!sizeValid || candidates.length === 0}
              className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
            >
              {t("המשך")}
            </button>
            <button
              type="button"
              onClick={() => {
                endAutoDesignSession(galleryId);
                onCancel();
              }}
              className="rounded-lg px-4 py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
              {t("חזרה")}
            </button>
          </div>
        </>
      )}

      {step === 2 && pickerFor && (
        <section className="rounded-lg border border-line bg-white p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {t("תמונה לתא {n}: {label}", { n: CELL_ORDER.indexOf(pickerFor) + 1, label: t(cellLabel(pickerFor, eventKind)) })}
            </p>
            <button type="button" onClick={() => setPickerFor(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-white border border-line text-ink-soft">
              {t("ביטול")}
            </button>
          </div>
          <p className="text-xs text-ink-soft">{t("בחרו תמונה שבה רואים את הפנים בבירור.")}</p>
          {folders.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[{ id: "all", name: t("הכל") }, ...folders, ...(hasUnfiled ? [{ id: "none", name: t("ללא לשונית") }] : [])].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPickerTab(tab.id);
                    setPickerLimit(PICKER_PAGE);
                  }}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold border ${pickerTab === tab.id ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-line"}`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          )}
          {/* The scroll box and the grid are separate elements: a grid that is itself height-capped
              squeezes its rows into thin strips instead of scrolling. */}
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-1.5">
            {pickerPhotos.length === 0 && <p className="col-span-full py-6 text-center text-xs text-ink-soft">{t("אין תמונות בלשונית הזו.")}</p>}
            {pickerPhotos.slice(0, pickerLimit).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choosePhoto(pickerFor, p.id)}
                className={`relative block w-full pt-[100%] rounded-md overflow-hidden bg-chip ${cells[pickerFor].photoId === p.id ? "ring-2 ring-ink" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbOf(p)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                {p.is_favorite && (
                  <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center text-[11px] text-rose" aria-hidden>
                    ♥
                  </span>
                )}
              </button>
            ))}
            </div>
          </div>
          {pickerPhotos.length > pickerLimit && (
            <button
              type="button"
              onClick={() => setPickerLimit((n) => n + PICKER_PAGE)}
              className="w-full rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
            >
              {t("הצגת עוד תמונות")}
            </button>
          )}
        </section>
      )}

      {step === 2 && !pickerFor && (
        <>
          <p className="text-xs text-ink-soft leading-relaxed">
            {t("סמנו לכל תא תמונה אחת שבה רואים את האנשים, וכתבו מי בתמונה. כל התאים לא חובה, אבל ככל שתמלאו יותר תאים, סדר האלבום יהיה מדויק יותר.")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CELL_ORDER.map((id, i) => {
              const cell = cells[id];
              const photo = cell.photoId ? photoById.get(cell.photoId) : undefined;
              return (
                <div key={id} className="rounded-lg border border-line bg-white p-3 space-y-2.5">
                  <p className="text-sm font-semibold">
                    {i + 1}. {t(cellLabel(id, eventKind))}
                  </p>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPickerLimit(PICKER_PAGE);
                        setPickerFor(id);
                      }}
                      className="h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-chip border border-line flex items-center justify-center text-xs text-ink-soft"
                    >
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbOf(photo)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="px-1 text-center leading-snug">{t("בחירת תמונה")}</span>
                      )}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <textarea
                        rows={2}
                        value={cell.names}
                        onChange={(e) => updateCell(id, { names: e.target.value })}
                        placeholder={t("מי בתמונה? (למשל: אמא רחל, אבא דוד)")}
                        className="w-full resize-none rounded-lg border border-line px-2.5 py-2 text-sm leading-snug bg-white"
                      />
                      <FaceHint cell={cell} />
                      {photo && (
                        <button
                          type="button"
                          onClick={() => updateCell(id, emptyCell())}
                          className="text-[11px] text-ink-soft underline underline-offset-2"
                        >
                          {t("ניקוי התא")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {filledCells > 0 && (
            <p className="rounded-lg bg-chip p-3 text-xs text-ink-soft leading-relaxed">
              {t("הפרצופים בתאים מזוהים אוטומטית בשלב הראשון של העיצוב, תא אחרי תא.")}
            </p>
          )}
          {runError && <p className="text-xs text-rose">{runError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
            >
              {filledCells === 0 ? t("התחלת עיצוב (בלי תאי משפחה)") : t("התחלת עיצוב")}
            </button>
            <button type="button" onClick={() => setStep(1)} className="rounded-lg px-4 py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
              {t("חזרה")}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <section className="rounded-lg border border-line bg-white p-3.5 space-y-3.5">
          <div className="h-2.5">
            <LiquidProgressBar pct={pct} />
          </div>
          <ol className="space-y-2">
            {PHASES.map((p) => {
              const idx = PHASES.findIndex((x) => x.id === phase);
              const mine = PHASES.findIndex((x) => x.id === p.id);
              const state = runError && mine === idx ? "error" : mine < idx || (mine === idx && pct >= 100) ? "done" : mine === idx ? "active" : "todo";
              return (
                <li key={p.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[11px] ${
                      state === "done"
                        ? "bg-ink text-white"
                        : state === "active"
                          ? "border-2 border-ink border-t-transparent animate-spin"
                          : state === "error"
                            ? "bg-rose text-white"
                            : "border border-line"
                    }`}
                    aria-hidden
                  >
                    {state === "done" ? "✓" : state === "error" ? "!" : ""}
                  </span>
                  <span className={state === "todo" ? "text-ink-soft" : "text-ink"}>{t(p.label)}</span>
                  {state === "active" && phaseDetail && <span className="text-xs text-ink-soft">({phaseDetail})</span>}
                </li>
              );
            })}
          </ol>
          {runError ? (
            <>
              <p className="text-xs text-rose">{runError}</p>
              <div className="flex gap-2">
                <button type="button" onClick={run} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                  {t("לנסות שוב")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRunError(null);
                    setStep(2);
                  }}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
                >
                  {t("חזרה")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {phase === "faces" && running && (
                <button
                  type="button"
                  onClick={() => {
                    skipFacesRef.current = true;
                  }}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-white border border-line text-ink"
                >
                  {t("דילוג: להמשיך עם מה שכבר זוהה")}
                </button>
              )}
              {running && phase !== "save" && (
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                >
                  {t("ביטול")}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FaceHint({ cell }: { cell: CellState }) {
  const t = useT();
  if (!cell.photoId) return null;
  if (cell.detecting) return <p className="text-[11px] text-ink-soft">{t("מזהה פרצופים...")}</p>;
  if (cell.error) return <p className="text-[11px] text-rose">{t(cell.error)}</p>;
  if (!cell.faces) return <p className="text-[11px] text-ink-soft">{t("הפרצופים יזוהו בתחילת העיצוב")}</p>;
  const found = cell.faces.length;
  if (found === 0) return <p className="text-[11px] text-rose">{t("לא זוהו פרצופים בתמונה הזו, כדאי לבחור תמונה אחרת")}</p>;
  const names = countNames(cell.names);
  let extra = "";
  if (names > 0 && names < found) extra = t(", ישמשו {n} הפרצופים הגדולים בתמונה", { n: names });
  else if (names > found) extra = t(", אבל כתבתם {n} שמות", { n: names });
  return (
    <p className="text-[11px] text-ink-soft">
      {found === 1 ? t("זוהה פרצוף אחד") : t("זוהו {n} פרצופים", { n: found })}
      {extra}
    </p>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs text-ink-soft mb-1.5 truncate">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) onChange(v);
        }}
        className="w-full min-w-0 rounded-lg border border-line px-1.5 py-2 text-sm text-center bg-white"
      />
    </label>
  );
}

// One page of the album: a double spread (width/height >= 1.6, fold at 50%) halves the width.
function singlePageOf(size: { width: number; height: number }) {
  const isSpread = size.height > 0 && size.width / size.height >= 1.6;
  return { width: isSpread ? size.width / 2 : size.width, height: size.height };
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function thumbOf(p: AutoDesignerPhoto) {
  return p.previewUrl ?? optimizedImageUrl(p.url, 384);
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
