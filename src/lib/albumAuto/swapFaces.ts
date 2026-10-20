import type { AlbumElement } from "@/lib/types";
import type { FaceRect, SwapFit, SwapPick } from "@/lib/albumAuto/swapPhotos";

// The pieces that keep the admin's photo swap instant (owner 2026-10-20: "עובדת אבל לאט מאוד, זה
// צריך להיות מהיר מאוד"), kept out of GalleryManageView so they can be tested: the faces of each
// photo found once and shared, a short wait for faces still being found, the refit once they
// arrive, and saves that run one after another.

export type FaceCache = {
  // Faces already known for this photo (stored detection, or found earlier), or undefined.
  known(photoId: string): FaceRect[] | undefined;
  // Faces from the gallery's stored face detection; never overrides faces already known.
  seed(photoId: string, faces: FaceRect[]): void;
  // The photo's faces, finding them once (every caller shares the same search). null when they
  // can't be found: nothing is remembered then, so the next call tries again.
  facesOf(photoId: string): Promise<FaceRect[] | null>;
  // facesOf, but no longer than `ms`: null when they aren't in by then (the search carries on).
  within(photoId: string, ms: number): Promise<FaceRect[] | null>;
};

export function createFaceCache(detect: (photoId: string) => Promise<FaceRect[]>): FaceCache {
  const found = new Map<string, FaceRect[]>();
  const pending = new Map<string, Promise<FaceRect[] | null>>();
  const facesOf = (photoId: string): Promise<FaceRect[] | null> => {
    const known = found.get(photoId);
    if (known) return Promise.resolve(known);
    let p = pending.get(photoId);
    if (!p) {
      p = detect(photoId).then(
        (faces) => {
          found.set(photoId, faces);
          pending.delete(photoId);
          return faces;
        },
        () => {
          pending.delete(photoId);
          return null;
        }
      );
      pending.set(photoId, p);
    }
    return p;
  };
  return {
    known: (photoId) => found.get(photoId),
    seed: (photoId, faces) => {
      if (!found.has(photoId)) found.set(photoId, faces);
    },
    facesOf,
    within: (photoId, ms) => Promise.race([facesOf(photoId), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]),
  };
}

type SpreadLike = { id: string; elements: AlbumElement[] | null };

// The page's elements with one photo refitted now that its faces are in, or null when there's
// nothing to do: the frame no longer holds that photo, or it changed since the swap placed it
// (`placed`, the very element object the swap put there — another swap or an edit replaces it).
export function refitAfterFaces(spreads: SpreadLike[], pick: SwapPick, photoId: string, placed: AlbumElement | undefined, fit: SwapFit): AlbumElement[] | null {
  const sp = spreads.find((x) => x.id === pick.spreadId);
  const el = sp?.elements?.find((x) => x.id === pick.elId);
  if (!sp || !el || el !== placed || el.type !== "photo" || el.photoId !== photoId) return null;
  const fitted = { ...el, ...fit(el, sp.id, photoId) };
  return (sp.elements ?? []).map((x) => (x.id === el.id ? fitted : x));
}

// Runs tasks one after another, in the order they were added; a failing task doesn't stop the rest.
export function createSerialQueue(): (task: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}
