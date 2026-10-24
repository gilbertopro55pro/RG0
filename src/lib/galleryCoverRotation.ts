import {
  mainPeopleGroups,
  pickCollagePhotos,
  sourceGroups,
  type CollageSource,
  type PhotoFacesFound,
  type PickableFolder,
  type PickablePhoto,
} from "@/lib/collage/pick";

// The client gallery's cover rotates (owner, 2026-10-24): the cover the photographer chose shows
// first, then every few seconds it dissolves into another photo of the event's main figures, by the
// collage's rules (lib/collage/pick.ts): the groom and the bride at a wedding or a henna, the child at
// a bar/bat mitzvah or עלייה לתורה, any photo in a photo session ("בוק"). Without a way to tell who
// they are (no owners' tab and no saved face detection), the cover stays as it was.

// A new photo starts every 3 seconds (the owner's number) and dissolves in over the first second.
export const COVER_ROTATION_INTERVAL_MS = 3000;
export const COVER_DISSOLVE_MS = 1000;
// The server hands the page this many candidates, so the page can keep the ones shaped like the cover
// box (portrait on a phone's full-screen cover, landscape on a computer) and still have enough.
export const COVER_ROTATION_CANDIDATES = 24;
// At most this many photos take turns, the chosen cover included.
export const COVER_ROTATION_SHOWN = 12;
// The photographer's focal point belongs to the chosen cover; the others keep the upper middle,
// where the faces usually are.
export const ROTATION_FOCAL = { x: 50, y: 33 };

// The photos in turn: the chosen cover first, then the main figures' photos (favorites first, spread
// over each owners' tab or over the gallery). Only the cover when there's nothing to rotate to.
export function coverRotationIds(args: {
  coverId: string;
  source: CollageSource;
  photos: PickablePhoto[];
  folders: PickableFolder[];
  // The saved face detection of a sample (faces source only).
  found?: PhotoFacesFound[] | null;
}): string[] {
  const { coverId, source, photos, folders, found } = args;
  let groups: PickablePhoto[][];
  let weights: number[] | undefined;
  if (source.mode === "faces") {
    const main = found && found.length > 0 ? mainPeopleGroups(found, source.people) : null;
    if (!main) return [coverId];
    const byId = new Map(photos.filter((p) => !p.rejected).map((p) => [p.id, p]));
    groups = main.groups.map((ids) => ids.map((id) => byId.get(id)).filter((p): p is PickablePhoto => !!p));
    weights = main.weights;
  } else {
    groups = sourceGroups(source, photos, folders);
  }
  const picked = pickCollagePhotos(groups, COVER_ROTATION_CANDIDATES, weights);
  return [coverId, ...picked.filter((id) => id !== coverId)];
}

export type CoverRotationPhoto = { url: string; aspect: number | null; focalX: number; focalY: number };

export type CoverOrientation = "landscape" | "portrait" | "any";

// A box at least a little wider than tall takes landscape photos; a tall one portrait ones; a square
// (a framed cover) any.
export function coverOrientation(boxAspect: number): CoverOrientation {
  if (boxAspect >= 1.15) return "landscape";
  if (boxAspect <= 0.87) return "portrait";
  return "any";
}

// The photos a box of this shape shows: the chosen cover always first, then those shaped like the box,
// when there are at least 3 of them (a portrait couple photo cut to a wide banner loses their heads,
// a landscape one on a phone's full screen loses one of them), else all of them.
export function rotationForBox<T extends { aspect: number | null }>(photos: T[], orientation: CoverOrientation, max = COVER_ROTATION_SHOWN): T[] {
  if (photos.length <= 1) return photos;
  const [first, ...rest] = photos;
  const fits = (a: number | null) =>
    orientation === "any" ? true : a != null && (orientation === "landscape" ? a >= 1.1 : a <= 0.9);
  const matching = rest.filter((p) => fits(p.aspect));
  const chosen = orientation === "any" || matching.length < 3 ? rest : matching;
  return [first, ...chosen.slice(0, Math.max(0, max - 1))];
}

// The width (CSS px) a photo is drawn at to cover a box (object-fit: cover): the box's width, or wider
// for a photo wider than the box, which is drawn to the box's height (a landscape photo on a phone's
// tall cover is drawn about three screens wide). Rounded up to 50px, so a small resize keeps it. The
// rotating cover's `sizes`: a file sized to the screen's width came out soft there.
export function coverDrawWidth(aspect: number, boxWidth: number, boxHeight: number): number {
  return Math.ceil(Math.max(boxWidth, boxHeight * aspect) / 50) * 50;
}
