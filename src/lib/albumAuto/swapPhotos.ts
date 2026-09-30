import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";

// Swapping two photos between album pages (the preview's swap mode, owner 2026-09-30): each photo
// takes the other's frame. The crop resets to a face-friendly upper-centre focal, and a page whose
// blurred background was the photo that left gets the one that came in, so the background still
// matches its page. Returns the patch per changed page, or null when there's nothing to swap.
export type SwapPick = { spreadId: string; elId: string };
type SpreadLike = { id: string; elements: AlbumElement[] | null; background_photo_id: string | null };

export function swapPhotoPatches(spreads: SpreadLike[], a: SwapPick, b: SwapPick): Map<string, { elements: AlbumElement[]; background_photo_id: string | null }> | null {
  const sa = spreads.find((sp) => sp.id === a.spreadId);
  const sb = spreads.find((sp) => sp.id === b.spreadId);
  const ea = sa?.elements?.find((el): el is AlbumPhotoElement => el.id === a.elId && el.type === "photo");
  const eb = sb?.elements?.find((el): el is AlbumPhotoElement => el.id === b.elId && el.type === "photo");
  if (!sa || !sb || !ea || !eb || ea.photoId === eb.photoId) return null;
  const pa = ea.photoId;
  const pb = eb.photoId;
  const reset = { focalX: 50, focalY: 40, zoom: 100 };
  const out = new Map<string, { elements: AlbumElement[]; background_photo_id: string | null }>();
  for (const sp of sa.id === sb.id ? [sa] : [sa, sb]) {
    const elements = (sp.elements ?? []).map((el) => {
      if (sp.id === a.spreadId && el.id === a.elId) return { ...el, photoId: pb, ...reset } as AlbumElement;
      if (sp.id === b.spreadId && el.id === b.elId) return { ...el, photoId: pa, ...reset } as AlbumElement;
      return el;
    });
    const bg = sp.background_photo_id;
    const background_photo_id = sa.id === sb.id ? bg : sp.id === a.spreadId && bg === pa ? pb : sp.id === b.spreadId && bg === pb ? pa : bg;
    out.set(sp.id, { elements, background_photo_id });
  }
  return out;
}
