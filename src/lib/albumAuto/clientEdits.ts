import type { AlbumElement, AlbumFrame, AlbumPhotoElement } from "@/lib/types";
import { marginInsetPctFor } from "@/lib/albumSafeArea";
import {
  changedFrameIds,
  pagePhotoIds,
  pushHistory,
  samePage,
  swapRedesignPages,
  type ClientEditRequest,
  type OriginalPage,
  type PageState,
} from "@/lib/albumClientEdit";
import { fitPhotoInFrame, swapPhotoPatches, type FaceRect } from "./swapPhotos";
import { chooseRedesign, designShape, engineLayouts, redesignDesigns } from "./redesign";
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
  marked_frames: string[] | null;
  client_original: OriginalPage | null;
  client_history: PageState[] | null;
  edited: boolean;
  layout?: "custom";
};

// Where "עיצוב מחדש" stopped on a page, so the next click shows the next design.
export type RedesignCycle = { count: number; seen: string[] };

export type ClientEditOutcome =
  | { ok: true; updates: SpreadUpdate[]; cycles: Record<string, RedesignCycle> }
  | { ok: false; status: number; error: string; code?: "needs_redesign" | "cover" | "no_design" | "no_history"; pages?: string[] };

const isCover = (sp: EditSpread) => sp.width_cm != null;
const stateOf = (sp: EditSpread): PageState => ({ elements: sp.elements ?? [], background_photo_id: sp.background_photo_id });
const photoEl = (sp: EditSpread, elId: string) =>
  (sp.elements ?? []).find((el): el is AlbumPhotoElement & { photoId: string } => el.id === elId && el.type === "photo" && !!el.photoId);

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
    marked_frames: marks && marks.length ? marks : null,
    client_original: edited ? original : null,
    client_history: history && history.length ? history : null,
    edited,
    ...(redesigned ? { layout: "custom" as const } : {}),
  };
}

// The page's next design for its photos (lib/albumAuto/redesign.ts), as the photographer's own
// "עיצוב מחדש" picks it.
function redesignPage(ctx: ClientEditContext, sp: EditSpread, elements: AlbumElement[], cycle: RedesignCycle): { elements: AlbumElement[] | null } & RedesignCycle {
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
  const designs = redesignDesigns({ engine, photos, userTemplates: ctx.userTemplates, widthCm: page.widthCm, heightCm: page.heightCm, inset, elements, idPrefix: ctx.idPrefix });
  if (designs.length === 0) return { elements: null, ...cycle };
  const at = ctx.spreads.findIndex((s) => s.id === sp.id);
  const neighbours = new Set(
    [ctx.spreads[at - 1], ctx.spreads[at + 1]]
      .filter((s): s is EditSpread => !!s)
      .map((s) => designShape((s.elements ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo")))
  );
  const choice = chooseRedesign(designs, { current: designShape(photoEls), seen: new Set(cycle.seen), neighbours, count: cycle.count });
  return { elements: choice.design ? choice.design.build() : null, count: choice.count, seen: [...choice.seen] };
}

const sameSet = (a: string[], b: string[]) => {
  const x = [...new Set(a)];
  const y = new Set(b);
  return x.length === y.size && x.every((id) => y.has(id));
};

export function applyClientEdit(ctx: ClientEditContext, req: ClientEditRequest): ClientEditOutcome {
  const byId = new Map(ctx.spreads.map((sp) => [sp.id, sp] as const));
  const notFound: ClientEditOutcome = { ok: false, status: 404, error: "העמוד לא נמצא" };

  if (req.action === "reset") {
    const updates = ctx.spreads
      .filter((sp) => sp.client_original)
      .map((sp): SpreadUpdate => {
        const o = sp.client_original as OriginalPage;
        return {
          id: sp.id,
          elements: o.elements,
          background_photo_id: o.background_photo_id,
          marked_frames: o.marked_frames,
          client_original: null,
          client_history: null,
          edited: false,
        };
      });
    return { ok: true, updates, cycles: {} };
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
    const fit = fitPhotoInFrame(el, pageOf(ctx, byId.get(spreadId) as EditSpread), aspectOf(ctx, photoId), ctx.photos.get(photoId)?.faces ?? [], false);
    return { focalX: fit.focalX, focalY: fit.focalY, zoom: 100 };
  });
  if (!patches) return { ok: false, status: 422, error: "ההחלפה לא אפשרית" };

  const cycles: Record<string, RedesignCycle> = {};
  for (const id of need) {
    const patch = patches.get(id);
    if (!patch) continue;
    const next = redesignPage(ctx, byId.get(id) as EditSpread, patch.elements, { count: -1, seen: [] });
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
