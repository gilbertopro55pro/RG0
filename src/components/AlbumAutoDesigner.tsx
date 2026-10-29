"use client";

import { folderLabel } from "@/lib/galleryFolders";
import { useBusy } from "@/lib/updateResume";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resizedPhotoUrl } from "@/lib/galleryPhotoUrls";
import { detectFaceBoxes, detectFacesInImageUrl, type DetectedFace } from "@/lib/faceRecognition";
import LiquidProgressBar from "@/components/LiquidProgressBar";
import { AUTO_STYLES, type AutoPhoto, type AutoStyleId, type CellPeople, type EventKind, type FamilyCellId, type LayoutPhoto, type PhotoFaces } from "@/lib/albumAuto/types";
import { bleedIdsOf, bookPagesWithoutCover, fadeOwnHeroes, fillBookTemplate, frameElements, ownTemplatePlan, tidyOwnFrames } from "@/lib/albumAuto/templateFill";
import type { AlbumBookTemplateRow, AlbumTemplateRow } from "@/lib/types";
import {
  CELL_ORDER,
  cellFaceUses,
  cellLabel,
  cellPeopleFromReferences,
  cellsFor,
  combinedCoverLines,
  combinedParts,
  countNames,
  coverTitleLines,
  detectEventKind,
  followsTabs,
  ownersCountFor,
  planAlbum,
  planCombined,
  tabLabel,
  tabRoles,
  type CellFaceUse,
  type CellReference,
  type NamesOrder,
} from "@/lib/albumAuto/planner";
import { layoutCover, layoutOpener, layoutSpread } from "@/lib/albumAuto/layouts";
import { headSafeElements } from "@/lib/albumAuto/headSafe";
import { isDoublePage } from "@/lib/albumAuto/qualityCheck";
import { endAutoDesignSession, getAutoDesignSession, mountAutoDesigner, useSessionState, waitForAutoDesigner } from "@/lib/albumAuto/session";
import type { AlbumElement } from "@/lib/types";
import { useLang, useT } from "@/i18n/client";

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

// A gallery tab; parent_id is its main tab when it is a sub-tab (lib/galleryFolders.ts).
export type AutoDesignerFolder = { id: string; name: string; parent_id?: string | null };

type AlbumSize = { width: number; height: number; margin: number };

export type AutoDesignResult = {
  size: AlbumSize;
  style: AutoStyleId;
  // bleedIds: elements that run to the page edge on purpose; the parent must not fit them into
  // the safe margin (see LayoutOutput in lib/albumAuto/types.ts).
  cover: { widthCm: number; heightCm: number; elements: AlbumElement[]; bleedIds: string[]; background?: { photoId: string; blur: number; opacity?: number } } | null;
  // background: the spread's blurred background photo (clean style), saved on the spread row.
  spreads: { elements: AlbumElement[]; bleedIds: string[]; background?: { photoId: string; blur: number; opacity?: number } }[];
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

// The event kinds the photographer can pick when the detected one (from the event type and the
// gallery title) is wrong. The kind sets the owners' label and the book order: a "בוק" (photo
// session) has no family sections, only shooting time (owner, 2026-10-20).
const KIND_OPTIONS: { id: EventKind; label: string }[] = [
  { id: "wedding", label: "חתונה" },
  { id: "henna", label: "חינה" },
  { id: "bar_mitzvah", label: "בר מצווה / עלייה לתורה" },
  { id: "bat_mitzvah", label: "בת מצווה" },
  { id: "book", label: "בוק בר/בת מצווה" },
  { id: "birthday", label: "יום הולדת" },
  { id: "other", label: "אחר" },
];

const PICKER_PAGE = 120;
const PAGE_SIZE = 1000;

const emptyCell = (): CellState => ({ photoId: null, names: "", faces: null, detecting: false, error: null });

// A reference photo's faces are found once, from the moment it's chosen (owner, 2026-10-21: the cell
// then shows each face with the name written for it), and the design's first step waits for any
// still on the way. Kept by photo across designer sessions: the same photo always has the same faces.
const cellFaceJobs = new Map<string, Promise<DetectedFace[]>>();
function cellFacesOf(galleryId: string, photoId: string): Promise<DetectedFace[]> {
  const key = `${galleryId}:${photoId}`;
  let job = cellFaceJobs.get(key);
  if (!job) {
    job = detectFacesInImageUrl(`/api/galleries/${galleryId}/photos/${photoId}/image?size=${CELL_IMAGE_SIZE}`);
    job.catch(() => cellFaceJobs.delete(key));
    cellFaceJobs.set(key, job);
  }
  return job;
}

// A reference face as the planner reads it: its centre across the photo tells the names' order.
const refFace = (f: DetectedFace) => ({ descriptor: f.descriptor, area: f.box.width * f.box.height, x: f.box.x + f.box.width / 2 });

class CancelledError extends Error {}

export default function AlbumAutoDesigner({
  galleryId,
  galleryTitle,
  eventType,
  eventDate = null,
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
  // The event's day (YYYY-MM-DD) for the cover's small line, "עלייה לתורה | 5.10.2026".
  eventDate?: string | null;
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
  // A gallery of two events in two main tabs, a "בוק" and the event (owner, 2026-10-28): the combined
  // album, on unless the photographer turns it off, and the book's share of the pages ("" = by the
  // photo counts).
  const [combinedOn, setCombinedOn] = useSessionState(session, "combined", true);
  const [bookSpreads, setBookSpreads] = useSessionState(session, "bookSpreads", "");
  const [cellStates, setCells] = useSessionState<Record<FamilyCellId, CellState>>(
    session,
    "cells",
    () => Object.fromEntries(CELL_ORDER.map((id) => [id, emptyCell()])) as Record<FamilyCellId, CellState>
  );
  const cells = useMemo(() => {
    const all = { ...cellStates };
    for (const id of CELL_ORDER) all[id] ??= emptyCell();
    return all;
  }, [cellStates]);
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

  const detectedKind = useMemo(() => detectEventKind(galleryTitle, eventType), [galleryTitle, eventType]);
  // The photographer's own choice, when the detected kind is wrong (null = the detected one).
  const [kindChoice, setKindChoice] = useSessionState<EventKind | null>(session, "kind", null);
  const favorites = useMemo(() => photos.filter((p) => p.is_favorite), [photos]);
  const candidates = favorites.length > 0 ? favorites : photos;
  // Each photo's gallery tab and main tab, for the planner: the book follows the tabs when the photos
  // are sorted into them (owner, 2026-10-21; see followsTabs in planner.ts), and two main tabs, a book
  // and the event, make the combined album (combinedParts).
  const tabOf = useMemo(() => {
    const byId = new Map(folders.map((f, i) => [f.id, { key: f.id, name: f.name, order: i }] as const));
    return (p: AutoDesignerPhoto) => (p.folder_id ? (byId.get(p.folder_id) ?? null) : null);
  }, [folders]);
  const mainOf = useMemo(() => {
    const byId = new Map(folders.map((f, i) => [f.id, { key: f.id, name: f.name, order: i, parent: f.parent_id ?? null }] as const));
    return (p: AutoDesignerPhoto) => {
      const f = p.folder_id ? byId.get(p.folder_id) : undefined;
      const main = f?.parent ? (byId.get(f.parent) ?? f) : f;
      return main ? { key: main.key, name: main.name, order: main.order } : null;
    };
  }, [folders]);
  const autoLike = useMemo(
    () => candidates.map((p): AutoPhoto => ({ id: p.id, aspect: 1.5, takenAt: null, filename: "", tab: tabOf(p), main: mainOf(p) })),
    [candidates, tabOf, mainOf]
  );
  const parts = useMemo(() => combinedParts(autoLike, detectedKind), [autoLike, detectedKind]);
  const combined = combinedOn && parts ? parts : null;
  // In the combined album the kind is the second event's (its tab's name tells it), and the cells
  // are that event's family.
  // (A "book" picked before the combined album was on isn't the second event's kind.)
  const eventKind = combined ? (kindChoice && kindChoice !== "book" ? kindChoice : combined.event.kind) : (kindChoice ?? detectedKind);
  // A photo-book session: no family cells, the whole book by shooting time.
  const isBook = eventKind === "book" && !combined;
  // The cells shown for the kind (two parents' cells at a wedding, none in a book): only these count.
  const shownCells = useMemo(() => cellsFor(eventKind), [eventKind]);
  // The names are written in the order the people stand: right to left in Hebrew, left to right in
  // English and Russian.
  const lang = useLang();
  const namesOrder: NamesOrder = lang === "he" ? "rtl" : "ltr";
  const cellRefs = (ids: FamilyCellId[]): CellReference[] =>
    ids.filter((id) => cells[id].photoId && (cells[id].faces?.length ?? 0) > 0).map((id) => ({ id, faces: (cells[id].faces as DetectedFace[]).map(refFace), names: cells[id].names }));
  // What became of each face in the cells (the same reading the design uses), for the cells' faces row.
  const faceUses = useMemo(
    () => new Map(cellFaceUses(cellRefs(shownCells), eventKind, namesOrder).map((c) => [c.id, c.faces] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cellRefs reads only these
    [cells, shownCells, eventKind, namesOrder]
  );
  const hasUnfiled = folders.length > 0 && photos.some((p) => !p.folder_id);
  const pickerPhotos = useMemo(
    () => (pickerTab === "all" ? photos : pickerTab === "none" ? photos.filter((p) => !p.folder_id) : photos.filter((p) => p.folder_id === pickerTab)),
    [photos, pickerTab]
  );
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  // The tabs the book (in the combined album, its second event) will follow, in its order (the
  // atmosphere last), or null when it won't.
  const tabOrder = useMemo(() => {
    const inPart = combined ? new Set(combined.event.ids) : null;
    const auto = autoLike.filter((p) => !inPart || inPart.has(p.id));
    if (!followsTabs(auto)) return null;
    const used = folders.filter((f) => auto.some((p) => p.tab?.key === f.id));
    const roles = tabRoles(used.map((f) => f.name));
    return {
      main: used.filter((_, i) => roles[i] !== "atmosphere").map((f) => tabLabel(f.name)),
      last: used.filter((_, i) => roles[i] === "atmosphere").map((f) => tabLabel(f.name)),
    };
  }, [autoLike, combined, folders]);

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

  const updateCell = (id: FamilyCellId, patch: Partial<CellState>) => setCells((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyCell()), ...patch } }));

  // Finds a cell's faces (once per photo, see cellFacesOf) and keeps them on the cell while it still
  // holds that photo. Resolves to null when detection failed.
  const detectCell = async (cellId: FamilyCellId, photoId: string): Promise<DetectedFace[] | null> => {
    updateCell(cellId, { detecting: true, error: null });
    try {
      const faces = await cellFacesOf(galleryId, photoId);
      setCells((prev) => (prev[cellId]?.photoId === photoId ? { ...prev, [cellId]: { ...prev[cellId], faces, detecting: false } } : prev));
      return faces;
    } catch {
      setCells((prev) =>
        prev[cellId]?.photoId === photoId ? { ...prev, [cellId]: { ...prev[cellId], detecting: false, error: "לא הצלחנו לזהות פרצופים בתמונה הזו" } } : prev
      );
      return null;
    }
  };

  // There's still no separate face button (owner, 2026-09-29: one button): choosing a photo starts
  // finding its faces in the background, so the cell can show who is who, and the design's first
  // step only waits for what isn't in yet.
  const choosePhoto = (cellId: FamilyCellId, photoId: string) => {
    setPickerFor(null);
    updateCell(cellId, { photoId, faces: null, detecting: false, error: null });
    void detectCell(cellId, photoId);
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
      const toDetect = shownCells.filter((id) => cells[id].photoId);
      setProgress("cells", 0, toDetect.length ? t("{n} מתוך {total} תאים", { n: 0, total: toDetect.length }) : "");
      for (let i = 0; i < toDetect.length; i++) {
        checkCancel();
        const cellId = toDetect[i];
        const cell = cells[cellId];
        const faces = cell.faces ?? (await detectCell(cellId, cell.photoId as string));
        if (faces) cellFaces.set(cellId, faces);
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

      // Reference people per cell (an earlier cell's people in a later cell's reference photo are
      // left out of it — see cellPeopleFromReferences).
      const cellPeople: CellPeople[] = cellPeopleFromReferences(
        shownCells.filter((id) => cells[id].photoId && (cellFaces.get(id)?.length ?? 0) > 0).map((id) => ({
          id,
          faces: (cellFaces.get(id) as DetectedFace[]).map(refFace),
          names: cells[id].names,
        })),
        eventKind,
        namesOrder
      );

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
      // Every photo's face boxes, with or without the family cells (owner, 2026-10-27: heads were cut
      // in albums designed without cells, since the boxes were only read for the cells' matching,
      // while "עיצוב מחדש" crops by the stored ones). The descriptors are only needed to match the
      // cells' people.
      const withCells = cellPeople.length > 0;
      setProgress("faces", 0, t("טוען זיהוי קודם"));
      const candidateIds = new Set(candidates.map((p) => p.id));
      // Photos with stored boxes, and (with cells) those with stored descriptors too.
      const boxedIds = new Set<string>();
      const describedIds = new Set<string>();
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("gallery_photo_faces")
          .select(withCells ? "id, photo_id, box_x, box_y, box_width, box_height, descriptor" : "id, photo_id, box_x, box_y, box_width, box_height")
          .eq("gallery_id", galleryId)
          .order("id")
          .range(from, from + PAGE_SIZE - 1)
          .returns<{ id: string; photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number; descriptor?: number[] }[]>();
        if (error) break; // no cache is fine, everything just gets detected below
        for (const row of data ?? []) {
          if (!candidateIds.has(row.photo_id)) continue;
          boxedIds.add(row.photo_id);
          addBox(row.photo_id, { x: row.box_x, y: row.box_y, width: row.box_width, height: row.box_height });
          if (!withCells || !Array.isArray(row.descriptor)) continue;
          describedIds.add(row.photo_id);
          const list = facesByPhoto.get(row.photo_id) ?? [];
          list.push({ descriptor: row.descriptor.map(Number), area: row.box_width * row.box_height });
          facesByPhoto.set(row.photo_id, list);
        }
        if (!data || data.length < PAGE_SIZE) break;
      }
      if (withCells) {
        // The cells' matching needs descriptors: the full detection, whose boxes replace any stored.
        const toDetect = candidates.filter((p) => !describedIds.has(p.id));
        for (let i = 0; i < toDetect.length; i++) {
          checkCancel();
          if (skipFacesRef.current) break;
          setProgress("faces", i / toDetect.length, t("{n} מתוך {total} תמונות", { n: i, total: toDetect.length }));
          try {
            const faces = await detectFacesInImageUrl(`/api/galleries/${galleryId}/photos/${toDetect[i].id}/image?size=${PHOTO_IMAGE_SIZE}`);
            if (faces.length > 0) facesByPhoto.set(toDetect[i].id, faces.map((f) => ({ descriptor: f.descriptor, area: f.box.width * f.box.height })));
            boxesByPhoto.delete(toDetect[i].id);
            for (const f of faces) addBox(toDetect[i].id, f.box);
          } catch {
            // One unreadable photo shouldn't stop the whole design.
          }
        }
      } else {
        // Only where the heads are: the light box detector on the small preview (as the admin's
        // swap does), two photos at a time. A photo it can't read keeps no faces (the crop then
        // leans to the upper middle, as before).
        const toDetect = candidates.filter((p) => !boxedIds.has(p.id));
        let next = 0;
        let done = 0;
        const worker = async () => {
          while (next < toDetect.length) {
            if (cancelRef.current || skipFacesRef.current) return;
            const id = toDetect[next++].id;
            try {
              for (const box of await detectFaceBoxes(`/api/galleries/${galleryId}/photos/${id}/image?size=640&fast=1`)) addBox(id, box);
            } catch {
              // One unreadable photo shouldn't stop the whole design.
            }
            done++;
            setProgress("faces", done / toDetect.length, t("{n} מתוך {total} תמונות", { n: done, total: toDetect.length }));
          }
        };
        await Promise.all([worker(), worker()]);
      }
      setProgress("faces", 1);
      checkCancel();

      for (const id of shownCells) {
        const cell = cells[id];
        const faces = cellFaces.get(id);
        if (cell.photoId && faces && !boxesByPhoto.has(cell.photoId)) for (const f of faces) addBox(cell.photoId, f.box);
      }

      // (c) The plan.
      setProgress("plan", 0);
      await nextFrame();
      const autoPhotos: AutoPhoto[] = candidates.map((p) => ({
        id: p.id,
        aspect: p.preview_aspect_ratio && p.preview_aspect_ratio > 0 ? p.preview_aspect_ratio : 1.5,
        takenAt: takenAt.get(p.id) ?? null,
        filename: p.original_filename ?? "",
        tab: tabOf(p),
        main: mainOf(p),
        faceArea: Math.max(0, ...(boxesByPhoto.get(p.id) ?? []).map((b) => b.width * b.height)),
      }));
      const photoFaces: PhotoFaces[] = [...facesByPhoto.entries()].map(([photoId, faces]) => ({ photoId, faces }));
      const target = parseInt(spreadCount, 10);
      const referencePhotos = shownCells.filter((id) => cells[id].photoId).map((id) => ({ id, photoId: cells[id].photoId }));
      const planOpts = { style, targetSpreads: Number.isFinite(target) && target > 0 ? Math.min(30, target) : null, hasCover: coverMode === "on", kind: eventKind };
      // The combined album (owner, 2026-10-28): the book, an opening page and the event, each by its
      // own rules (planCombined).
      const runParts = combinedOn ? combinedParts(autoPhotos, detectedKind) : null;
      const bookTarget = parseInt(bookSpreads, 10);
      const plan = runParts
        ? planCombined(
            autoPhotos,
            photoFaces,
            cellPeople,
            { ...runParts, event: { ...runParts.event, kind: eventKind } },
            { ...planOpts, bookSpreads: Number.isFinite(bookTarget) && bookTarget > 0 ? bookTarget : null },
            referencePhotos
          )
        : planAlbum(autoPhotos, photoFaces, cellPeople, planOpts, referencePhotos);
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
              // Centred, with near edges lined up, as the owner corrected them (tidyOwnFrames).
              pageTemplates
                .map((tpl) => tpl.frames)
                .filter((f) => Array.isArray(f) && f.length > 0)
                .map(tidyOwnFrames),
              size.width,
              size.height,
              { marginCm: size.margin }
            );
            return plan.spreads.map((s, i) => {
              if (s.opener) {
                // The combined album's opening page for its second event: its photo and its name.
                const out = layoutOpener({ style, photo: layoutPhoto(s.photoIds[0]), title: s.opener.title, spreadIndex: i, widthCm: size.width, heightCm: size.height });
                return { elements: out.elements, bleedIds: out.bleedIds ?? [], ...(out.background ? { background: out.background } : {}) };
              }
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
              const placed = frameElements(own, [...new Set(s.photoIds)].map(layoutPhoto), size.width, size.height, `own-${i}`);
              // A main photo that ends just at the frames beside it fades into them (fadeOwnHeroes), in
              // the two styles whose main photos fade.
              const photoEls = style === "clean" || style === "modern" ? fadeOwnHeroes(placed) : placed;
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
                  lines: runParts ? combinedCoverLines(galleryTitle, runParts, eventDate) : coverTitleLines(galleryTitle, eventDate),
                  widthCm: coverSize.width,
                  heightCm: coverSize.height,
                });
                return { elements: out.elements, bleedIds: out.bleedIds ?? [], ...(out.background ? { background: out.background } : {}) };
              })(),
            }
          : null;
      // No head cut by a frame: a crop that cuts one is moved by the faces, where that fixes it
      // (headSafeElements, the quality check's own safe fix).
      const facesOf = (id: string) => boxesByPhoto.get(id);
      const aspectOfPhoto = (id: string) => aspectOf.get(id) ?? null;
      const safeOpts = { safeMarginCm: size.margin, aspectOf: aspectOfPhoto, facesOf };
      const fold = isDoublePage({ id: "", elements: null, width_cm: null, height_cm: null }, { width_cm: size.width, height_cm: size.height });
      const safeSpreads = spreads.map((s) => ({
        ...s,
        elements: headSafeElements({ elements: s.elements, bleedIds: s.bleedIds, widthCm: size.width, heightCm: size.height }, { ...safeOpts, fold }),
      }));
      const safeCover = cover
        ? { ...cover, elements: headSafeElements({ elements: cover.elements, bleedIds: cover.bleedIds, widthCm: cover.widthCm, heightCm: cover.heightCm }, { ...safeOpts, fold: false }) }
        : null;
      setProgress("layout", 1, t("{n} עמודים", { n: spreads.length + (cover ? 1 : 0) }));
      checkCancel();

      // (e) Save — the parent creates the album and opens it (this component unmounts then).
      setProgress("save", 0.3);
      // Through the parent mounted NOW (the one that started may be gone after a rotation); a design
      // that finished in portrait waits until the phone is turned back.
      await waitForAutoDesigner(session);
      checkCancel();
      await (session.onCreate as (r: AutoDesignResult) => Promise<void>)({ size, style, cover: safeCover, spreads: safeSpreads });
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

  const filledCells = shownCells.filter((id) => cells[id].photoId).length;

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

            {parts && (
              // The combined album (owner, 2026-10-28): the gallery's two main tabs, the book and the
              // event, in one album, each part by its own rules.
              <div className="rounded-lg border border-line bg-chip p-3 space-y-2.5">
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" checked={combinedOn} onChange={(e) => setCombinedOn(e.target.checked)} className="mt-0.5" />
                  <span className="text-sm font-semibold">{t("אלבום משולב: {book} ו{event}", { book: tabLabel(parts.book.name), event: tabLabel(parts.event.name) })}</span>
                </label>
                {combinedOn ? (
                  <>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {t("קודם {book}, לפי המקומות שצולמו. אחריו דף פתיחה ל{event}, עם תמונה גדולה והשם, ואז {event} לפי הלשוניות שלו. הכריכה מהבוק.", {
                        book: tabLabel(parts.book.name),
                        event: tabLabel(parts.event.name),
                      })}
                    </p>
                    <label className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        min={1}
                        max={28}
                        inputMode="numeric"
                        value={bookSpreads}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setBookSpreads(v && parseInt(v, 10) > 28 ? "28" : v);
                        }}
                        placeholder={t("אוטומטי")}
                        className="w-24 rounded-lg border border-line px-2.5 py-2 text-sm text-center bg-white"
                      />
                      <span className="text-xs text-ink-soft">{t("עמודים לבוק (ריק: לפי כמות התמונות בכל חלק)")}</span>
                    </label>
                  </>
                ) : (
                  <p className="text-xs text-ink-soft leading-relaxed">{t("האלבום ייבנה מכל הלשוניות כאלבום אחד.")}</p>
                )}
              </div>
            )}
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
              {t("תמונה לתא {n}: {label}", { n: shownCells.indexOf(pickerFor) + 1, label: t(cellLabel(pickerFor, eventKind)) })}
            </p>
            <button type="button" onClick={() => setPickerFor(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-white border border-line text-ink-soft">
              {t("ביטול")}
            </button>
          </div>
          <p className="text-xs text-ink-soft">{t("בחרו תמונה שבה רואים את הפנים בבירור.")}</p>
          {folders.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { id: "all", name: t("הכל") },
                // A main tab whose photos are all in its sub-tabs has nothing to pick from.
                ...folders.filter((f) => photos.some((p) => p.folder_id === f.id)).map((f) => ({ id: f.id, name: folderLabel(folders, f) })),
                ...(hasUnfiled ? [{ id: "none", name: t("ללא לשונית") }] : []),
              ].map((tab) => (
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
                {/* The whole photo, not a square crop: a crop of a portrait photo cut the heads off,
                    and the point of the pick is seeing the faces (owner, 2026-10-22). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbOf(p)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
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
          <section className="rounded-lg border border-line bg-white p-3.5 space-y-2">
            <label className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{combined ? t("סוג האירוע בחלק השני") : t("סוג האירוע")}</span>
              <select
                value={eventKind}
                onChange={(e) => setKindChoice(e.target.value as EventKind)}
                className="min-w-0 rounded-lg border border-line px-2.5 py-2 text-sm bg-white"
              >
                {KIND_OPTIONS.filter((k) => !combined || k.id !== "book").map((k) => (
                  <option key={k.id} value={k.id}>
                    {t(k.label)}
                  </option>
                ))}
              </select>
            </label>
            {combined && (
              <p className="text-xs text-ink-soft leading-relaxed">
                {t("האלבום משולב: קודם {book}, אחריו דף פתיחה, ואז {event}. התאים למטה הם של {event}.", {
                  book: tabLabel(combined.book.name),
                  event: tabLabel(combined.event.name),
                })}
              </p>
            )}
            <p className="text-xs text-ink-soft leading-relaxed">
              {isBook
                ? t("בבוק אין חלקי משפחה: כל התמונות נכנסות לאלבום לפי שעת הצילום.")
                : tabOrder
                  ? combined
                    ? t("החלק של {event} נבנה לפי הלשוניות שלו, בסדר שלהן: {tabs}. בכל לשונית התמונות לפי שעת הצילום.", { event: tabLabel(combined.event.name), tabs: tabOrder.main.join(", ") })
                    : t("האלבום נבנה לפי הלשוניות בגלריה, בסדר שלהן: {tabs}. בכל לשונית התמונות לפי שעת הצילום.", { tabs: tabOrder.main.join(", ") })
                  : t("סדר האלבום: {owners}, ההורים, אחים ואחיות, סבא וסבתא, ואז שאר התמונות לפי שעת הצילום.", { owners: t(cellLabel("owners", eventKind)) })}
              {!isBook && tabOrder && tabOrder.last.length > 0 && <> {t("{tabs} בדף האחרון.", { tabs: tabOrder.last.join(", ") })}</>}
            </p>
            {!isBook && tabOrder && (
              <p className="text-xs text-ink-soft leading-relaxed">{t("עם לשוניות, התאים למטה רק מסדרים את לשונית המשפחה: הורים, אחים ואחיות, ואז סבא וסבתא.")}</p>
            )}
          </section>
          {!isBook && (
          <>
          <p className="text-xs text-ink-soft leading-relaxed">
            {t("סמנו לכל תא תמונה אחת שבה רואים את האנשים, וכתבו מי בתמונה. כל התאים לא חובה, אבל ככל שתמלאו יותר תאים, סדר האלבום יהיה מדויק יותר.")}{" "}
            {namesOrder === "rtl"
              ? t("כתבו את השמות לפי הסדר שבו האנשים עומדים בתמונה, מימין לשמאל, וכך כל פרצוף מקבל את השם שלו. מי שכבר בתא קודם (השם שכתבתם שם, או \"הילד\", \"החתן\") לא נספר בתא הזה.")
              : t("כתבו את השמות לפי הסדר שבו האנשים עומדים בתמונה, משמאל לימין, וכך כל פרצוף מקבל את השם שלו. מי שכבר בתא קודם (השם שכתבתם שם, או \"הילד\", \"החתן\") לא נספר בתא הזה.")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {shownCells.map((id, i) => {
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
                        <img src={thumbOf(photo)} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="px-1 text-center leading-snug">{t("בחירת תמונה")}</span>
                      )}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <NamesField
                        value={cell.names}
                        onChange={(names) => updateCell(id, { names })}
                        prefix={namesOrder === "rtl" ? t("מימין לשמאל:") : t("משמאל לימין:")}
                        placeholder={t("אמא רחל, אבא דוד")}
                      />
                      <FaceHint
                        cell={cell}
                        maxPeople={id === "owners" ? ownersCountFor(eventKind) : undefined}
                        uses={faceUses.get(id)}
                        order={namesOrder}
                        imageUrl={cell.photoId ? `/api/galleries/${galleryId}/photos/${cell.photoId}/image?size=640&fast=1` : null}
                        aspect={photo?.preview_aspect_ratio ?? null}
                        labelOf={(c) => t(cellLabel(c, eventKind))}
                      />
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
              {t("הפרצופים בכל תא מזוהים מיד כשבוחרים את התמונה, ומתחת לתמונה רואים איזה שם קיבל כל פרצוף. פרצוף שקוף לא נספר בתא.")}
            </p>
          )}
          </>
          )}
          {runError && <p className="text-xs text-rose">{runError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
            >
              {filledCells === 0 && !isBook ? t("התחלת עיצוב (בלי תאי משפחה)") : t("התחלת עיצוב")}
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

// The names field: opens with the order the names are written in ("מימין לשמאל:", owner 2026-10-21),
// so the photographer describes the people as they stand and each face gets its name. The prefix
// isn't part of the value: the first line is indented by its width.
function NamesField({ value, onChange, prefix, placeholder }: { value: string; onChange: (v: string) => void; prefix: string; placeholder: string }) {
  const [indent, setIndent] = useState(0);
  const prefixRef = useRef<HTMLSpanElement>(null);
  // Measured, and again when its width changes (the font loading, another language).
  useEffect(() => {
    const el = prefixRef.current;
    if (!el) return;
    const measure = () => setIndent(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="relative">
      <span
        ref={prefixRef}
        className="pointer-events-none absolute top-2 start-2.5 text-sm leading-snug font-semibold text-ink-soft"
      >
        {prefix}
      </span>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={prefix}
        style={{ textIndent: indent ? indent + 5 : undefined }}
        className="w-full resize-none rounded-lg border border-line px-2.5 py-2 text-sm leading-snug bg-white"
      />
    </div>
  );
}

function FaceHint({
  cell,
  maxPeople,
  uses,
  order,
  imageUrl,
  aspect,
  labelOf,
}: {
  cell: CellState;
  maxPeople?: number;
  uses?: CellFaceUse[];
  order: NamesOrder;
  imageUrl: string | null;
  aspect: number | null;
  labelOf: (cell: FamilyCellId) => string;
}) {
  const t = useT();
  if (!cell.photoId) return null;
  if (cell.detecting) return <p className="text-[11px] text-ink-soft">{t("מזהה פרצופים...")}</p>;
  if (cell.error) return <p className="text-[11px] text-rose">{t(cell.error)}</p>;
  if (!cell.faces) return <p className="text-[11px] text-ink-soft">{t("הפרצופים יזוהו בתחילת העיצוב")}</p>;
  const found = cell.faces.length;
  if (found === 0) return <p className="text-[11px] text-rose">{t("לא זוהו פרצופים בתמונה הזו, כדאי לבחור תמונה אחרת")}</p>;
  const names = countNames(cell.names);
  let extra = "";
  if (names > found) extra = t(", אבל כתבתם {n} שמות", { n: names });
  else if (!uses && names > 0 && names < found) extra = t(", ישמשו {n} הפרצופים הגדולים בתמונה", { n: names });
  // No names: the owners' cell uses at most the kind's head count (pickCellFaces).
  else if (!uses && names === 0 && maxPeople && maxPeople < found) extra = t(", ישמשו {n} הפרצופים הגדולים בתמונה", { n: maxPeople });
  // The faces in the order the names are written (the row's own direction lays them out as they stand).
  const faces = cell.faces
    .map((f, i) => ({ f, use: uses?.[i] }))
    .sort((a, b) => (order === "rtl" ? b.f.box.x - a.f.box.x : a.f.box.x - b.f.box.x))
    .slice(0, 10);
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-ink-soft">
        {found === 1 ? t("זוהה פרצוף אחד") : t("זוהו {n} פרצופים", { n: found })}
        {extra}
      </p>
      {uses && imageUrl && (
        <div className="flex flex-wrap gap-1.5">
          {faces.map(({ f, use }, k) => {
            const status = use?.status ?? "unused";
            const label =
              status === "known" ? (use?.name ? use.name : labelOf(use?.knownCell as FamilyCellId)) : status === "unused" ? t("לא בתא") : (use?.name ?? "");
            const title =
              status === "known"
                ? t("{name}: כבר בתא \"{cell}\", לא נספר כאן", { name: use?.name ?? t("פרצוף"), cell: labelOf(use?.knownCell as FamilyCellId) })
                : status === "unused"
                  ? t("פרצוף ברקע, לא נספר בתא")
                  : (use?.name ?? "");
            return (
              <div key={k} className="w-12 flex flex-col items-center gap-0.5" title={title}>
                <FaceCrop url={imageUrl} box={f.box} aspect={aspect} className={status === "cell" ? "ring-2 ring-ink" : status === "known" ? "ring-1 ring-ink-soft opacity-50" : "opacity-30"} />
                <span className={`w-full truncate text-center text-[10px] leading-tight ${status === "cell" ? "text-ink font-semibold" : "text-ink-soft line-through"}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One face of a reference photo, cropped from the small preview into a circle.
function FaceCrop({ url, box, aspect, className }: { url: string; box: DetectedFace["box"]; aspect: number | null; className: string }) {
  const SIZE = 36;
  const a = aspect && aspect > 0 ? aspect : 1.5;
  // The face (with a little room around it) fills the circle.
  const side = Math.max(box.width, box.height / a) * 1.35;
  const w = SIZE / side;
  const h = w / a;
  const left = SIZE / 2 - (box.x + box.width / 2) * w;
  const top = SIZE / 2 - (box.y + box.height / 2) * h;
  return (
    <div className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-chip ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="absolute max-w-none" style={{ width: w, height: h, left, top }} />
    </div>
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
  return resizedPhotoUrl(p, 384);
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
