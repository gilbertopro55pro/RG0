import type { AlbumElement, AlbumFrame, AlbumPhotoElement } from "@/lib/types";
import { fitFramesToSafeArea } from "@/lib/albumSafeArea";
import { fitPhotoInFrame, type FaceRect } from "@/lib/albumAuto/swapPhotos";
import { frameElements, rankTemplates, templatesForCount, type FrameFinish } from "@/lib/albumAuto/templateFill";
import type { LayoutPhoto } from "@/lib/albumAuto/types";

// The album selection (owner, 2026-10-27): inside the favorites view the photographer narrows the
// client's favorites down ("סינון נוסף"), for a client who picked more photos than the album holds.
// The confirmed selection (galleries.album_selection) is what the album tools offer; without one,
// the favorites are. The picks being made are kept as a draft (galleries.album_picks) until
// "אישור בחירה סופית". Both live on the gallery row, not on the photos, so the client's own page
// (which gets the photo rows) never sees them.
//
// Changing the selection of a gallery that already has an album changes the album: each photo that
// left the selection leaves its frame, and a photo that joined takes one (selectionPlan). When the
// counts differ, the photographer chooses (owner, same day) what happens to the frames left over
// (an empty frame, the page redesigned for its new count, or the frame deleted) or to the photos
// left over (a new page at the end, or the pages redesigned for their new count). Every frame that
// got a new photo, or was left empty, is marked (gallery_album_spreads.marked_frames) with a red dot
// in the album preview and the editor until that page is saved in the editor. The mark is its own
// column, never part of the elements, so no export draws it.

export type AlbumSelectionFields = {
  album_picks?: string[] | null;
  album_selection?: string[] | null;
  album_selection_at?: string | null;
};
export type SpreadMarkFields = { marked_frames?: string[] | null };

// What the album tools offer: the confirmed selection, or else the favorites. In gallery order.
export function albumPoolIds(photos: readonly { id: string; is_favorite: boolean }[], selection: readonly string[] | null | undefined): string[] {
  if (selection) {
    const chosen = new Set(selection);
    return photos.filter((p) => chosen.has(p.id)).map((p) => p.id);
  }
  return photos.filter((p) => p.is_favorite).map((p) => p.id);
}

export type SelectionSpread = {
  id: string;
  sort_order: number;
  elements: AlbumElement[] | null;
  background_photo_id: string | null;
  width_cm: number | null;
  height_cm: number | null;
  marked_frames?: string[] | null;
};
export type SelectionPhoto = { id: string; folder_id: string | null; aspect: number; faces?: FaceRect[] };
export type Slot = { spreadId: string; elId: string; photoId: string };

// A frame whose photo left the selection, and the photos that joined it. Only photos that were on
// offer before count as leaving (one the photographer placed from "all photos" stays), and a photo
// already somewhere in the album doesn't join again. The first selection of a gallery whose album
// was built from the favorites is measured against the album itself: every picked photo that isn't
// in it joins (owner's example: the album holds 1-6, the picks are 1-4, 7, 8, so 7 and 8 take the
// frames of 5 and 6). A later change is measured against the previous selection, so a photo of it
// the photographer kept out of the album on purpose doesn't come back.
export function selectionDiff(
  spreads: readonly SelectionSpread[],
  previousPool: ReadonlySet<string>,
  next: readonly string[],
  firstSelection = false
): { removed: Slot[]; added: string[] } {
  const nextSet = new Set(next);
  const placed = new Set<string>();
  const removed: Slot[] = [];
  for (const sp of [...spreads].sort((a, b) => a.sort_order - b.sort_order)) {
    for (const el of sp.elements ?? []) {
      if (el.type !== "photo" || !el.photoId) continue;
      placed.add(el.photoId);
      if (previousPool.has(el.photoId) && !nextSet.has(el.photoId)) removed.push({ spreadId: sp.id, elId: el.id, photoId: el.photoId });
    }
  }
  const added = next.filter((id) => (firstSelection || !previousPool.has(id)) && !placed.has(id));
  return { removed, added };
}

export type LeftoverFrames = "empty" | "redesign" | "remove";
export type LeftoverPhotos = "newPage" | "redesign";

export type SelectionPlanInput = {
  spreads: readonly SelectionSpread[];
  removed: readonly Slot[];
  added: readonly string[];
  photos: readonly SelectionPhoto[]; // the whole gallery, in its order
  album: { width_cm: number; height_cm: number; safe_margin_cm?: number };
  userTemplates?: AlbumFrame[][];
  leftoverFrames?: LeftoverFrames; // when more photos left than joined
  leftoverPhotos?: LeftoverPhotos; // when more joined than left
  idPrefix: string; // for the ids of new frames, unique per change
};

export type SpreadPatch = { elements: AlbumElement[]; background_photo_id: string | null; marked_frames: string[] };
export type SelectionPlan = {
  patches: Map<string, SpreadPatch>;
  deleted: string[]; // pages left without a photo
  newPages: { elements: AlbumElement[]; marked_frames: string[] }[];
  replaced: number;
  emptied: number;
  removedFrames: number;
  redesigned: number;
};

const PER_NEW_PAGE = 8;

// Which joined photo takes which freed frame: the same tab first, then the nearest in the gallery's
// order, then the shape that crops least. Greedy over every pair, cheapest first.
export function matchSlots(
  slots: readonly Slot[],
  added: readonly string[],
  photos: readonly SelectionPhoto[],
  frameAspect: (slot: Slot) => number
): Map<number, string> {
  const index = new Map(photos.map((p, i) => [p.id, i] as const));
  const byId = new Map(photos.map((p) => [p.id, p] as const));
  const n = Math.max(1, photos.length);
  const pairs: { s: number; a: string; cost: number }[] = [];
  slots.forEach((slot, s) => {
    const was = byId.get(slot.photoId);
    const fa = frameAspect(slot);
    for (const a of added) {
      const p = byId.get(a);
      const tab = was && p && was.folder_id !== p.folder_id ? 4 : 0;
      const order = (Math.abs((index.get(a) ?? 0) - (index.get(slot.photoId) ?? 0)) / n) * 2;
      const aspect = p && p.aspect > 0 && fa > 0 ? Math.abs(Math.log(p.aspect / fa)) * 1.5 : 0;
      pairs.push({ s, a, cost: tab + order + aspect });
    }
  });
  pairs.sort((x, y) => x.cost - y.cost);
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const { s, a } of pairs) {
    if (out.has(s) || used.has(a)) continue;
    out.set(s, a);
    used.add(a);
    if (out.size === Math.min(slots.length, added.length)) break;
  }
  return out;
}

const pageOf = (sp: SelectionSpread, album: SelectionPlanInput["album"]) => ({ widthCm: sp.width_cm ?? album.width_cm, heightCm: sp.height_cm ?? album.height_cm });
const bleeds = (el: AlbumPhotoElement) => el.xPct <= 0.5 || el.yPct <= 0.5 || el.xPct + el.widthPct >= 99.5 || el.yPct + el.heightPct >= 99.5;

// The finish of a page's framed photos (not the ones running to the edge), as "עיצוב מחדש" keeps it.
function pageFinish(photoEls: AlbumPhotoElement[]): FrameFinish {
  const inner = photoEls.filter((el) => !bleeds(el));
  const src = inner.find((el) => el.borderWidth || el.shadow) ?? inner[0];
  if (!src) return { borderWidth: 3, borderColor: "#ffffff", shadow: 35 };
  return { ...(src.borderWidth ? { borderWidth: src.borderWidth, borderColor: src.borderColor ?? "#ffffff" } : {}), ...(src.shadow ? { shadow: src.shadow } : {}) };
}

// A page laid out again for these photos: the library template that crops them least, inside the
// print-safe area, with the page's frame finish. Everything that isn't a photo (text, shapes,
// ornaments) stays where it was.
export function relayoutPage(
  elements: readonly AlbumElement[],
  photoIds: readonly string[],
  photos: ReadonlyMap<string, SelectionPhoto>,
  page: { widthCm: number; heightCm: number },
  album: SelectionPlanInput["album"],
  userTemplates: AlbumFrame[][],
  idPrefix: string
): AlbumElement[] {
  const layoutPhotos: LayoutPhoto[] = photoIds.map((id) => {
    const p = photos.get(id);
    return { id, aspect: p && p.aspect > 0 ? p.aspect : 1.5, ...(p?.faces?.length ? { faces: p.faces } : {}) };
  });
  const frames = rankTemplates(templatesForCount(layoutPhotos.length, userTemplates), layoutPhotos, page.widthCm, page.heightCm)[0] ?? [];
  const marginCm = album.safe_margin_cm ?? 0.5;
  const inset = page.widthCm > 0 && page.heightCm > 0 ? { x: (marginCm / page.widthCm) * 100, y: (marginCm / page.heightCm) * 100 } : null;
  const finish = pageFinish(elements.filter((el): el is AlbumPhotoElement => el.type === "photo"));
  const placed = frameElements(fitFramesToSafeArea(frames, inset), layoutPhotos, page.widthCm, page.heightCm, idPrefix, finish);
  const rest = elements.filter((el) => el.type !== "photo");
  return [...rest.filter((el) => el.type === "shape"), ...placed, ...rest.filter((el) => el.type !== "shape")];
}

export function selectionPlan(input: SelectionPlanInput): SelectionPlan {
  const { spreads, removed, added, photos, album, idPrefix } = input;
  const userTemplates = input.userTemplates ?? [];
  const byId = new Map(photos.map((p) => [p.id, p] as const));
  const order = new Map(photos.map((p, i) => [p.id, i] as const));
  const spreadById = new Map(spreads.map((sp) => [sp.id, sp] as const));
  const frameAspect = (slot: Slot) => {
    const sp = spreadById.get(slot.spreadId);
    const el = sp?.elements?.find((x): x is AlbumPhotoElement => x.id === slot.elId && x.type === "photo");
    if (!sp || !el) return 1;
    const page = pageOf(sp, album);
    return (el.widthPct * page.widthCm) / (el.heightPct * page.heightCm) || 1;
  };
  const match = matchSlots(removed, added, photos, frameAspect);
  const extra = added.filter((id) => ![...match.values()].includes(id));

  // Per page: frame id -> the photo it now holds (null = left empty, undefined key = deleted).
  type Work = { elements: AlbumElement[]; background: string | null; marks: Set<string>; newPhotos: Set<string>; relayout: boolean; touched: boolean };
  const work = new Map<string, Work>();
  const workOf = (id: string): Work => {
    let w = work.get(id);
    if (!w) {
      const sp = spreadById.get(id)!;
      w = {
        elements: [...(sp.elements ?? [])],
        background: sp.background_photo_id,
        marks: new Set(sp.marked_frames ?? []),
        newPhotos: new Set(),
        relayout: false,
        touched: false,
      };
      work.set(id, w);
    }
    return w;
  };
  const isCover = (id: string) => spreadById.get(id)?.width_cm != null;
  let replaced = 0;
  let emptied = 0;
  let removedFrames = 0;
  const leaving = new Set(removed.map((s) => s.photoId));

  removed.forEach((slot, i) => {
    const w = workOf(slot.spreadId);
    w.touched = true;
    const at = w.elements.findIndex((el) => el.id === slot.elId);
    if (at < 0) return;
    const el = w.elements[at] as AlbumPhotoElement;
    const incoming = match.get(i);
    if (incoming) {
      const sp = spreadById.get(slot.spreadId)!;
      const fit = fitPhotoInFrame(el, pageOf(sp, album), byId.get(incoming)?.aspect ?? 0, byId.get(incoming)?.faces ?? [], false);
      w.elements[at] = { ...el, photoId: incoming, focalX: fit.focalX, focalY: fit.focalY, zoom: 100 };
      w.marks.add(el.id);
      w.newPhotos.add(incoming);
      if (w.background === slot.photoId) w.background = incoming;
      replaced++;
      return;
    }
    const mode = input.leftoverFrames ?? "empty";
    if (mode === "redesign" && !isCover(slot.spreadId)) {
      w.elements.splice(at, 1);
      w.relayout = true;
    } else if (mode === "remove") {
      w.elements.splice(at, 1);
      w.marks.delete(el.id);
      removedFrames++;
    } else {
      w.elements[at] = { ...el, photoId: null, focalX: 50, focalY: 50, zoom: 100 };
      w.marks.add(el.id);
      emptied++;
    }
  });

  // Photos with no freed frame of their own.
  const newPages: SelectionPlan["newPages"] = [];
  if (extra.length) {
    if ((input.leftoverPhotos ?? "newPage") === "redesign") {
      // Each goes to the page whose photos sit nearest it in the gallery: one of the pages that lost
      // a photo when there are any, otherwise any page but the cover.
      const lost = [...new Set(removed.map((s) => s.spreadId))].filter((id) => !isCover(id));
      const pool = lost.length ? lost : spreads.filter((sp) => sp.width_cm == null && (sp.elements ?? []).some((el) => el.type === "photo" && el.photoId)).map((sp) => sp.id);
      for (const id of extra) {
        const at = order.get(id) ?? 0;
        let best: string | null = null;
        let bestCost = Infinity;
        for (const spId of pool) {
          const ids = (workOf(spId).elements.filter((el) => el.type === "photo" && el.photoId) as AlbumPhotoElement[]).map((el) => el.photoId!);
          const was = removed.filter((s) => s.spreadId === spId).map((s) => s.photoId);
          const near = [...ids, ...was].map((p) => Math.abs((order.get(p) ?? 0) - at));
          const cost = near.length ? Math.min(...near) : Infinity;
          if (cost < bestCost) {
            bestCost = cost;
            best = spId;
          }
        }
        if (!best) {
          newPages.push(...pagesFor([id]));
          continue;
        }
        const w = workOf(best);
        w.touched = true;
        w.relayout = true;
        w.newPhotos.add(id);
        w.elements.push({ id: `${idPrefix}-x-${id}`, type: "photo", photoId: id, xPct: 0, yPct: 0, widthPct: 10, heightPct: 10, focalX: 50, focalY: 50, zoom: 100 });
      }
    } else newPages.push(...pagesFor(extra));
  }

  function pagesFor(ids: string[]) {
    const out: SelectionPlan["newPages"] = [];
    const count = Math.ceil(ids.length / PER_NEW_PAGE);
    let from = 0;
    for (let k = 0; k < count; k++) {
      const size = Math.ceil((ids.length - from) / (count - k));
      const chunk = ids.slice(from, from + size);
      from += size;
      const elements = relayoutPage([], chunk, byId, { widthCm: album.width_cm, heightCm: album.height_cm }, album, userTemplates, `${idPrefix}-new${newPages.length + out.length}`);
      out.push({ elements, marked_frames: elements.filter((el) => el.type === "photo").map((el) => el.id) });
    }
    return out;
  }

  const patches = new Map<string, SpreadPatch>();
  const deleted: string[] = [];
  let redesigned = 0;
  for (const [id, w] of work) {
    if (!w.touched) continue;
    const sp = spreadById.get(id)!;
    let elements = w.elements;
    let marks = w.marks;
    const photoIds = (elements.filter((el) => el.type === "photo" && el.photoId) as AlbumPhotoElement[]).map((el) => el.photoId!);
    const hadPhotos = (sp.elements ?? []).some((el) => el.type === "photo");
    const framesLeft = elements.some((el) => el.type === "photo");
    if (hadPhotos && !framesLeft) {
      deleted.push(id);
      continue;
    }
    if (w.relayout) {
      if (!photoIds.length) {
        deleted.push(id);
        continue;
      }
      // The new frames get the marks: this change's new photos, and the photos still marked from
      // an earlier change (not seen in the editor yet).
      const stillMarked = new Set(
        (w.elements.filter((el) => el.type === "photo" && el.photoId && w.marks.has(el.id)) as AlbumPhotoElement[]).map((el) => el.photoId!)
      );
      elements = relayoutPage(elements, [...new Set(photoIds)], byId, pageOf(sp, album), album, userTemplates, `${idPrefix}-${sp.sort_order}`);
      marks = new Set(
        elements
          .filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId && (w.newPhotos.has(el.photoId) || stillMarked.has(el.photoId)))
          .map((el) => el.id)
      );
      redesigned++;
    }
    const remaining = new Set((elements.filter((el) => el.type === "photo" && el.photoId) as AlbumPhotoElement[]).map((el) => el.photoId!));
    let background = w.background;
    if (background && (leaving.has(background) || !remaining.size) && !remaining.has(background)) background = [...remaining][0] ?? null;
    const ids = new Set(elements.map((el) => el.id));
    patches.set(id, { elements, background_photo_id: background, marked_frames: [...marks].filter((m) => ids.has(m)) });
  }
  return { patches, deleted, newPages, replaced, emptied, removedFrames, redesigned };
}
