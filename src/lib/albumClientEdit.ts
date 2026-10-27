import type { TFn } from "@/i18n/translate";
import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";

// The client changes the album design in the gallery's album view (owner, 2026-10-27): a tap on a
// photo marks it (a purple frame), a tap on another photo, on the same page or another one, swaps
// the two. A photo that doesn't fit the frame it moves into (a portrait one into a landscape frame)
// redesigns its page, after the client confirms; "עיצוב מחדש" then shows another design and "חזרה"
// goes back one, up to 3. Everything is saved by the server (api/gallery/[token]/album/edit,
// lib/albumAuto/clientEdits.ts), never from what the browser sends: the request only names the
// action. "עיצוב מחדש" works on any page but the cover, and "לעיצוב המקורי" returns one page to the
// photographer's design (owner, 2026-10-27). This file holds what the browser needs too, so it stays
// light (no layout engine).

// The most a photo may be cropped in the frame it moves into before its page is redesigned. A frame
// already cropping its photo more than this keeps doing so: only worse than before counts.
export const CLIENT_SWAP_MAX_CROP = 1.4;
// The designs "חזרה" can go back to, per page.
export const CLIENT_HISTORY_MAX = 3;

type Box = { xPct: number; yPct: number; widthPct: number; heightPct: number };
type PageSize = { widthCm: number; heightCm: number };

// How much a photo is cropped to fill a frame: 1 = not at all, 2 = half of it cut away.
export function cropOf(frame: Box, page: PageSize, imgAspect: number): number {
  const frameAspect = (frame.widthPct * page.widthCm) / (frame.heightPct * page.heightCm) || 1;
  const img = imgAspect > 0 ? imgAspect : frameAspect;
  return img >= frameAspect ? img / frameAspect : frameAspect / img;
}

// Whether a photo fits the frame it moves into, in place of the photo that was there.
export function fitsFrame(frame: Box, page: PageSize, incomingAspect: number, outgoingAspect: number): boolean {
  return cropOf(frame, page, incomingAspect) <= Math.max(CLIENT_SWAP_MAX_CROP, cropOf(frame, page, outgoingAspect) * 1.05);
}

export type SwapSide = { spreadId: string; frame: Box; page: PageSize; photoAspect: number };

// The pages a swap redesigns: each page whose incoming photo doesn't fit its frame (one page when
// both photos are on it).
export function swapRedesignPages(a: SwapSide, b: SwapSide): string[] {
  const aBad = !fitsFrame(a.frame, a.page, b.photoAspect, a.photoAspect);
  const bBad = !fitsFrame(b.frame, b.page, a.photoAspect, b.photoAspect);
  if (a.spreadId === b.spreadId) return aBad || bBad ? [a.spreadId] : [];
  return [...(aBad ? [a.spreadId] : []), ...(bBad ? [b.spreadId] : [])];
}

// A page as saved: its elements and blurred background photo.
export type PageState = { elements: AlbumElement[]; background_photo_id: string | null };
// The page as the photographer sent it, with its red dots (gallery_album_spreads.marked_frames).
export type OriginalPage = PageState & { marked_frames: string[] | null };

// The columns the client's changes live in (migration 0202), on a gallery_album_spreads row.
export type ClientEditColumns = { client_original?: OriginalPage | null; client_history?: PageState[] | null; client_edited_at?: string | null };

export function pushHistory(history: readonly PageState[] | null | undefined, state: PageState): PageState[] {
  return [...(history ?? []), state].slice(-CLIENT_HISTORY_MAX);
}

// Key order differs between an object built here and the same one back from jsonb.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function samePage(a: PageState, b: PageState): boolean {
  return a.background_photo_id === b.background_photo_id && canonical(a.elements) === canonical(b.elements);
}

// The frames the client changed: a photo frame that isn't on the photographer's page with the same
// photo in the same place. These get the photographer's red dot.
export function changedFrameIds(original: readonly AlbumElement[], current: readonly AlbumElement[]): string[] {
  const before = new Map(original.filter((el): el is AlbumPhotoElement => el.type === "photo").map((el) => [el.id, el] as const));
  const near = (x: number, y: number) => Math.abs(x - y) < 0.01;
  return current
    .filter((el): el is AlbumPhotoElement => el.type === "photo")
    .filter((el) => {
      const o = before.get(el.id);
      return !o || o.photoId !== el.photoId || !near(o.xPct, el.xPct) || !near(o.yPct, el.yPct) || !near(o.widthPct, el.widthPct) || !near(o.heightPct, el.heightPct);
    })
    .map((el) => el.id);
}

// Every photo on the page, once per frame (a multiset, sorted).
export function pagePhotoIds(elements: readonly AlbumElement[]): string[] {
  return elements
    .filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId)
    .map((el) => el.photoId as string)
    .sort();
}

export type ClientEditRequest =
  | { action: "swap"; a: { spreadId: string; elId: string }; b: { spreadId: string; elId: string }; redesign: boolean }
  | { action: "redesign"; spreadId: string; count: number; seen: string[] }
  | { action: "back"; spreadId: string }
  // One page back to how the photographer sent it, while it holds the photos it was sent with.
  | { action: "original"; spreadId: string }
  | { action: "reset" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const isElId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;

function pick(v: unknown): { spreadId: string; elId: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return isId(o.spreadId) && isElId(o.elId) ? { spreadId: o.spreadId, elId: o.elId } : null;
}

export function parseClientEditRequest(body: unknown): ClientEditRequest | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  switch (o.action) {
    case "swap": {
      const a = pick(o.a);
      const b = pick(o.b);
      if (!a || !b || (a.spreadId === b.spreadId && a.elId === b.elId)) return null;
      return { action: "swap", a, b, redesign: o.redesign === true };
    }
    case "redesign": {
      if (!isId(o.spreadId)) return null;
      const count = typeof o.count === "number" && Number.isInteger(o.count) && o.count >= -1 && o.count <= 100000 ? o.count : -1;
      const seen = Array.isArray(o.seen) ? o.seen.filter((s): s is string => typeof s === "string" && s.length <= 4000).slice(0, 300) : [];
      return { action: "redesign", spreadId: o.spreadId, count, seen };
    }
    case "back":
      return isId(o.spreadId) ? { action: "back", spreadId: o.spreadId } : null;
    case "original":
      return isId(o.spreadId) ? { action: "original", spreadId: o.spreadId } : null;
    case "reset":
      return { action: "reset" };
    default:
      return null;
  }
}

// Whether "לעיצוב המקורי" is offered on a page (owner, 2026-10-27): the client changed it, and it
// still holds the photos it was sent with (redesigns, swaps within the page). A page that swapped
// photos with another page doesn't: going back alone would show a photo twice and lose another.
export function canReturnToOriginal(original: Pick<PageState, "elements"> | null | undefined, elements: readonly AlbumElement[] | null | undefined): boolean {
  if (!original) return false;
  const a = pagePhotoIds(original.elements);
  const b = pagePhotoIds(elements ?? []);
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// The page numbers (1-based, in the album's order) the client changed, for the photographer's
// email and the event's log when the client approves or sends corrections.
export function clientChangedPages(spreads: readonly { client_edited_at?: string | null }[]): number[] {
  return spreads.flatMap((sp, i) => (sp.client_edited_at ? [i + 1] : []));
}

// Page 1 of an album is its cover (owner, 2026-10-27), so wherever pages are listed it's named so:
// "הכריכה, 3, 7".
export function pageList(numbers: readonly number[], cover: string): string {
  return numbers.map((n) => (n === 1 ? cover : String(n))).join(", ");
}

// The pages "ביטול כל השינויים שלי" returns, as a sentence.
export function resetPagesLine(numbers: readonly number[], t: TFn): string {
  const others = numbers.filter((n) => n !== 1);
  if (!numbers.includes(1)) {
    return others.length === 1
      ? t("עמוד {n} יחזור בדיוק לעיצוב שהצלם שלח.", { n: others[0] })
      : t("עמודים {pages} יחזרו בדיוק לעיצוב שהצלם שלח.", { pages: others.join(", ") });
  }
  if (!others.length) return t("הכריכה תחזור בדיוק לעיצוב שהצלם שלח.");
  return others.length === 1
    ? t("הכריכה ועמוד {n} יחזרו בדיוק לעיצוב שהצלם שלח.", { n: others[0] })
    : t("הכריכה ועמודים {pages} יחזרו בדיוק לעיצוב שהצלם שלח.", { pages: others.join(", ") });
}
