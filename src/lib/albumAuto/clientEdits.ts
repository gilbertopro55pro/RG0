import type { AlbumElement, AlbumFrame, AlbumPhotoElement } from "@/lib/types";
import { marginInsetPctFor } from "@/lib/albumSafeArea";
import {
  canReturnToOriginal,
  changedFrameIds,
  cropOf,
  pagePhotoIds,
  pushHistory,
  samePage,
  swapRedesignPages,
  type ClientEditRequest,
  type OriginalPage,
  type PageState,
} from "@/lib/albumClientEdit";
import { fitPhotoInFrame, swapPhotoPatches, type FaceRect } from "./swapPhotos";
import { chooseRedesign, collageTemplates, designShape, engineLayouts, redesignDesigns, type RedesignDesign } from "./redesign";
import { AUTO_STYLES, type AutoStyleId, type LayoutPhoto } from "./types";

// The server's side of the client's changes to the album design (lib/albumClientEdit.ts): what a
// swap, a redesign, "back" or "undo all my changes" does to the album's pages. Pure: the route
// (api/gallery/[token]/album/edit) loads the album and saves what this returns.
//
// - A swap puts each photo in the other's frame, its crop following the faces (fitPhotoInFrame). A
//   page whose new photo doesn't fit its frame is redesigned, only when the client confirmed it
//   ("redesign": true), and never the cover (its own size): a photo for it must fit its frame.
// - "back" returns to the page's previous design. Designs of the same photos only: a swap between
//   pages starts both pages' history over.
// - "original" returns one page to the photographer's design, only while it holds the photos it was
//   sent with: after a swap with another page it isn't offered (owner, 2026-10-27).
// - Every page keeps how the photographer sent it (client_original) until the client's page is the
//   same again; the frames the client changed get the photographer's red dot.

export type EditSpread = {
  id: string;
  elements: AlbumElement[] | null;
  background_photo_id: string | null;
  width_cm: number | string | null;
  height_cm: number | string | null;
  marked_frames: string[] | null;
  client_original: OriginalPage | null;
  client_history: PageState[] | null;
};
export type EditAlbum = { width_cm: number | string; height_cm: number | string; safe_margin_cm: number | string | null; auto_style?: string | null };
export type EditPhoto = { aspect: number; faces?: FaceRect[] };

export type ClientEditContext = {
  album: EditAlbum;
  spreads: EditSpread[]; // the album's pages, in order
  photos: ReadonlyMap<string, EditPhoto>;
  userTemplates: AlbumFrame[][];
  idPrefix: string; // new frames' ids
};

export type SpreadUpdate = PageState & {
  id: string;
  // Never null: the column is NOT NULL (an empty list = no red dots).
  marked_frames: string[];
  client_original: OriginalPage | null;
  client_history: PageState[] | null;
  edited: boolean;
  // "לעיצוב המקורי" is offered (canReturnToOriginal).
  canOriginal: boolean;
  layout?: "custom";
};

// Where "עיצוב מחדש" stopped on a page, so the next click shows the next design.
export type RedesignCycle = { count: number; seen: string[] };

export type ClientEditOutcome =
  | { ok: true; updates: SpreadUpdate[]; cycles: Record<string, RedesignCycle> }
  | { ok: false; status: number; error: string; code?: "needs_redesign" | "cover" | "no_design" | "no_history" | "photos_moved" | "unchanged"; pages?: string[] };

// How much a client's redesign may crop a photo: up to the album quality check's warning line
// (qualityCheck.ts), and up to its error line only to have a few designs to choose from.
export const CLIENT_DESIGN_MAX_CROP = 1.6;
export const CLIENT_DESIGN_LIMIT_CROP = 1.8;
const CLIENT_DESIGN_CHOICES = 4;

const isCover = (sp: EditSpread) => sp.width_cm != null;

// The most any photo of a page is cropped in its frame.
export function worstCrop(elements: readonly AlbumElement[], page: { widthCm: number; heightCm: number }, aspect: (photoId: string) => number): number {
  return Math.max(
    1,
    ...elements.filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId).map((el) => cropOf(el, page, aspect(el.photoId as string)))
  );
}
const stateOf = (sp: EditSpread): PageState => ({ elements: sp.elements ?? [], background_photo_id: sp.background_photo_id });
const photoEl = (sp: EditSpread, elId: string) =>
  (sp.elements ?? []).find((el): el is AlbumPhotoElement & { photoId: string } => el.id === elId && el.type === "photo" && !!el.photoId);

type Box = { xPct: number; yPct: number; widthPct: number; heightPct: number };
const sameBox = (a: Box, b: Box) =>
  Math.abs(a.xPct - b.xPct) < 0.01 && Math.abs(a.yPct - b.yPct) < 0.01 && Math.abs(a.widthPct - b.widthPct) < 0.01 && Math.abs(a.heightPct - b.heightPct) < 0.01;

function pageOf(ctx: ClientEditContext, sp: EditSpread) {
  return { widthCm: Number(sp.width_cm ?? ctx.album.width_cm), heightCm: Number(sp.height_cm ?? ctx.album.height_cm) };
}

function aspectOf(ctx: ClientEditContext, photoId: string): number {
  const a = ctx.photos.get(photoId)?.aspect;
  return a && a > 0 ? a : 1.5;
}

// The page saved with its new state: still "edited" only while it differs from the photographer's.
function finalize(sp: EditSpread, next: PageState, history: PageState[] | null, redesigned = false): SpreadUpdate {
  const original: OriginalPage = sp.client_original ?? { ...stateOf(sp), marked_frames: sp.marked_frames };
  const edited = !samePage(original, next);
  const marks = edited ? [...new Set([...(original.marked_frames ?? []), ...changedFrameIds(original.elements, next.elements)])] : original.marked_frames;
  return {
    id: sp.id,
    elements: next.elements,
    background_photo_id: next.background_photo_id,
    marked_frames: marks ?? [],
    client_original: edited ? original : null,
    client_history: history && history.length ? history : null,
    edited,
    canOriginal: edited && canReturnToOriginal(original, next.elements),
    ...(redesigned ? { layout: "custom" as const } : {}),
  };
}

// The page's next design for its photos (lib/albumAuto/redesign.ts), as the photographer's own
// "עיצוב מחדש" picks it.
function redesignPage(
  ctx: ClientEditContext,
  sp: EditSpread,
  elements: AlbumElement[],
  cycle: RedesignCycle,
  opts: { newPhotos?: boolean } = {}
): { elements: AlbumElement[] | null } & RedesignCycle {
  const photoEls = elements.filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId);
  const ids = [...new Set(photoEls.map((el) => el.photoId as string))];
  if (ids.length === 0) return { elements: null, ...cycle };
  const page = pageOf(ctx, sp);
  const photos: LayoutPhoto[] = ids.map((id) => {
    const faces = ctx.photos.get(id)?.faces;
    return { id, aspect: aspectOf(ctx, id), ...(faces?.length ? { faces } : {}) };
  });
  const style = AUTO_STYLES.some((st) => st.id === ctx.album.auto_style) ? (ctx.album.auto_style as AutoStyleId) : "clean";
  const pageIndex = Math.max(0, ctx.spreads.filter((s) => !isCover(s)).findIndex((s) => s.id === sp.id));
  const inset = marginInsetPctFor({
    width_cm: page.widthCm,
    height_cm: page.heightCm,
    ...(ctx.album.safe_margin_cm != null ? { safe_margin_cm: Number(ctx.album.safe_margin_cm) } : {}),
  });
  const engine = engineLayouts({ style, photos, pageIndex, widthCm: page.widthCm, heightCm: page.heightCm, inset });
  const marginCm = ctx.album.safe_margin_cm != null ? Number(ctx.album.safe_margin_cm) : 0.5;
  const all = redesignDesigns({
    engine,
    photos,
    userTemplates: ctx.userTemplates,
    widthCm: page.widthCm,
    heightCm: page.heightCm,
    inset,
    elements,
    idPrefix: ctx.idPrefix,
    extraTemplates: collageTemplates(photos, page.widthCm, page.heightCm, marginCm),
  });
  const designs = clientDesigns(all, page, (id) => aspectOf(ctx, id));
  if (designs.length === 0) return { elements: null, ...cycle };
  const at = ctx.spreads.findIndex((s) => s.id === sp.id);
  const neighbours = new Set(
    [ctx.spreads[at - 1], ctx.spreads[at + 1]]
      .filter((s): s is EditSpread => !!s)
      .map((s) => designShape((s.elements ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo")))
  );
  // After a swap the page holds other photos than its design was made for: the same shape, laid out
  // again for them, is a new design too.
  const current = opts.newPhotos ? "" : designShape(photoEls);
  const choice = chooseRedesign(designs, { current, seen: new Set(cycle.seen), neighbours, count: cycle.count });
  return { elements: choice.design ? choice.design.build() : null, count: choice.count, seen: [...choice.seen] };
}

// A double page with a framed photo across its fold (at least 15% of it on each side), where the
// binding swallows it: the library's templates don't know about the fold. Faded photos and photos
// running to the page's edge cross it on purpose.
function onFold(elements: readonly AlbumElement[], page: { widthCm: number; heightCm: number }): boolean {
  if (page.widthCm / page.heightCm < 1.6) return false;
  return elements.some((el) => {
    if (el.type !== "photo" || el.maskId) return false;
    if (el.xPct <= 0.5 || el.yPct <= 0.5 || el.xPct + el.widthPct >= 99.5 || el.yPct + el.heightPct >= 99.5) return false;
    const side = 0.15 * el.widthPct;
    return el.xPct < 50 - side && el.xPct + el.widthPct > 50 + side;
  });
}

// The designs a client cycles through, none with a photo on the fold. The client's page can go to
// print without the photographer seeing it, and a portrait photo in a landscape frame cuts heads;
// with photos of both orientations most library templates crop that much (the collage layouts and
// the engine's designs fit). So: the designs within the warning line, in their varied order; when
// they hold fewer than 4 different shapes, the least cropping ones up to the error line join, one per
// new shape; when nothing is within it, the least cropping design alone.
export function clientDesigns(all: readonly RedesignDesign[], page: { widthCm: number; heightCm: number }, aspect: (photoId: string) => number): RedesignDesign[] {
  const scored = all
    .map((d) => {
      const els = d.build();
      return { d, crop: worstCrop(els, page, aspect), fold: !d.engine && onFold(els, page) };
    })
    .filter((x) => !x.fold);
  const out = scored.filter((x) => x.crop <= CLIENT_DESIGN_MAX_CROP).map((x) => x.d);
  const shapes = new Set(out.map((d) => designShape(d.rects)));
  const byCrop = [...scored].sort((a, b) => a.crop - b.crop);
  for (const { d, crop } of byCrop) {
    if (shapes.size >= CLIENT_DESIGN_CHOICES || crop > CLIENT_DESIGN_LIMIT_CROP) break;
    if (crop <= CLIENT_DESIGN_MAX_CROP) continue;
    const shape = designShape(d.rects);
    if (shapes.has(shape)) continue;
    shapes.add(shape);
    out.push(d);
  }
  return out.length ? out : byCrop.slice(0, 1).map((x) => x.d);
}

const sameSet = (a: string[], b: string[]) => {
  const x = [...new Set(a)];
  const y = new Set(b);
  return x.length === y.size && x.every((id) => y.has(id));
};

// The page as the photographer sent it, the client's columns cleared.
function restored(sp: EditSpread): SpreadUpdate {
  const o = sp.client_original as OriginalPage;
  return { id: sp.id, elements: o.elements, background_photo_id: o.background_photo_id, marked_frames: o.marked_frames ?? [], client_original: null, client_history: null, edited: false, canOriginal: false };
}

export function applyClientEdit(ctx: ClientEditContext, req: ClientEditRequest): ClientEditOutcome {
  const byId = new Map(ctx.spreads.map((sp) => [sp.id, sp] as const));
  const notFound: ClientEditOutcome = { ok: false, status: 404, error: "העמוד לא נמצא" };

  if (req.action === "reset") {
    return { ok: true, updates: ctx.spreads.filter((sp) => sp.client_original).map(restored), cycles: {} };
  }

  if (req.action === "original") {
    const sp = byId.get(req.spreadId);
    if (!sp) return notFound;
    if (!sp.client_original) return { ok: false, status: 409, error: "העמוד כבר בעיצוב המקורי", code: "unchanged" };
    if (!canReturnToOriginal(sp.client_original, sp.elements)) {
      return { ok: false, status: 409, error: "בעמוד הזה הוחלפו תמונות עם עמוד אחר", code: "photos_moved" };
    }
    // The original is one more design of the same photos, and "back" returns from it.
    const o = sp.client_original;
    const update = finalize(sp, { elements: o.elements, background_photo_id: o.background_photo_id }, pushHistory(sp.client_history, stateOf(sp)));
    return { ok: true, updates: [update], cycles: {} };
  }

  if (req.action === "back") {
    const sp = byId.get(req.spreadId);
    if (!sp) return notFound;
    const history = sp.client_history ?? [];
    const prev = history[history.length - 1];
    // A design of other photos (the page changed some other way since) can't come back.
    if (!prev || !sameSet(pagePhotoIds(prev.elements), pagePhotoIds(sp.elements ?? []))) {
      return { ok: false, status: 409, error: "אין עיצוב קודם לחזור אליו", code: "no_history" };
    }
    return { ok: true, updates: [finalize(sp, prev, history.slice(0, -1))], cycles: {} };
  }

  if (req.action === "redesign") {
    const sp = byId.get(req.spreadId);
    if (!sp) return notFound;
    if (isCover(sp)) return { ok: false, status: 422, error: "הכריכה לא מעוצבת מחדש", code: "cover" };
    const next = redesignPage(ctx, sp, sp.elements ?? [], { count: req.count, seen: req.seen });
    if (!next.elements) return { ok: false, status: 409, error: "אין עיצוב אחר לעמוד הזה", code: "no_design" };
    const update = finalize(sp, { elements: next.elements, background_photo_id: sp.background_photo_id }, pushHistory(sp.client_history, stateOf(sp)), true);
    return { ok: true, updates: [update], cycles: { [sp.id]: { count: next.count, seen: next.seen } } };
  }

  // A swap.
  const sa = byId.get(req.a.spreadId);
  const sb = byId.get(req.b.spreadId);
  if (!sa || !sb) return notFound;
  const ea = photoEl(sa, req.a.elId);
  const eb = photoEl(sb, req.b.elId);
  if (!ea || !eb) return { ok: false, status: 404, error: "התמונה לא נמצאה" };
  if (ea.photoId === eb.photoId) return { ok: false, status: 422, error: "זו אותה תמונה" };

  const need = swapRedesignPages(
    { spreadId: sa.id, frame: ea, page: pageOf(ctx, sa), photoAspect: aspectOf(ctx, ea.photoId) },
    { spreadId: sb.id, frame: eb, page: pageOf(ctx, sb), photoAspect: aspectOf(ctx, eb.photoId) }
  );
  if (need.some((id) => isCover(byId.get(id) as EditSpread))) {
    return { ok: false, status: 422, error: "התמונה לא מתאימה למסגרת בכריכה", code: "cover", pages: need };
  }
  if (need.length > 0 && !req.redesign) {
    return { ok: false, status: 409, error: "ההחלפה תעצב את הדף מחדש", code: "needs_redesign", pages: need };
  }

  const patches = swapPhotoPatches([sa, sb], req.a, req.b, (el, spreadId, photoId) => {
    const sp = byId.get(spreadId) as EditSpread;
    // A photo going back to the frame it was sent in takes back the photographer's crop, so swapping
    // back leaves the page as sent, not "changed" by a refit the eye can't see.
    const sent = (sp.client_original?.elements ?? sp.elements ?? []).find((x): x is AlbumPhotoElement => x.id === el.id && x.type === "photo");
    if (sent?.photoId === photoId && sameBox(sent, el)) return { focalX: sent.focalX ?? 50, focalY: sent.focalY ?? 50, zoom: sent.zoom ?? 100 };
    const fit = fitPhotoInFrame(el, pageOf(ctx, sp), aspectOf(ctx, photoId), ctx.photos.get(photoId)?.faces ?? [], false);
    return { focalX: fit.focalX, focalY: fit.focalY, zoom: 100 };
  });
  if (!patches) return { ok: false, status: 422, error: "ההחלפה לא אפשרית" };

  const cycles: Record<string, RedesignCycle> = {};
  for (const id of need) {
    const patch = patches.get(id);
    if (!patch) continue;
    const next = redesignPage(ctx, byId.get(id) as EditSpread, patch.elements, { count: -1, seen: [] }, { newPhotos: true });
    if (next.elements) {
      patch.elements = next.elements;
      cycles[id] = { count: next.count, seen: next.seen };
    }
  }
  // On one page the photos stay the same, so its previous design is still one "back" can show.
  const samePageSwap = sa.id === sb.id;
  const updates = [...patches].map(([id, patch]) => {
    const sp = byId.get(id) as EditSpread;
    return finalize(sp, patch, samePageSwap ? pushHistory(sp.client_history, stateOf(sp)) : null, !!cycles[id]);
  });
  return { ok: true, updates, cycles };
}
