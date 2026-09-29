import type { AlbumElement } from "@/lib/types";

// Auto album design (admin only while it's being polished, 2026-09-29): the photographer picks the
// album and cover size and a style, marks reference photos for the family (four cells), and the
// tool lays out the whole book. Order of the book (owner's spec):
//   1. the event owners (couple / bar-bat mitzvah child / the celebrant)
//   2. the nuclear family (parents, then siblings)
//   3. the extended family (grandparents)
//   4. the event stages, in shooting order (EXIF time, else file-name order)
// This file is the contract between the planner (planner.ts), the layouts (layouts.ts) and the UI
// (components/AlbumAutoDesigner.tsx).

export type AutoStyleId = "clean" | "catalog" | "scribble" | "modern";

export const AUTO_STYLES: { id: AutoStyleId; name: string; description: string }[] = [
  { id: "clean", name: "קו נקי", description: "רקע לבן, מרווחים נדיבים, בלי מסגרות וצללים" },
  { id: "catalog", name: "קטלוג", description: "רשת מסודרת של תמונות בגודל אחיד, כמו מגזין" },
  { id: "scribble", name: "מקושקש", description: "תמונות מוטות עם מסגרת לבנה, מפוזרות כמו אלבום הדבקות" },
  { id: "modern", name: "מודרני", description: "תמונה גדולה עד הקצה לצד בלוקים א־סימטריים וקווים דקים" },
];

// What kind of event: decides the cell labels (who "the owners" are).
export type EventKind = "wedding" | "henna" | "bar_mitzvah" | "bat_mitzvah" | "birthday" | "other";

// The four cells the photographer fills before designing. Each is optional.
export type FamilyCellId = "parents" | "owners" | "siblings" | "grandparents";

export type FamilyCell = {
  id: FamilyCellId;
  // The reference photo the photographer marked for this cell (a gallery photo id).
  photoId: string | null;
  // Who is in it, free text ("אמא רחל, אבא דוד"). The number of names is used as a hint for how
  // many faces in the reference photo belong to this cell (the largest N faces).
  names: string;
};

// A candidate photo for the book.
export type AutoPhoto = {
  id: string;
  aspect: number; // width / height (gallery_photos.preview_aspect_ratio, 1.5 if unknown)
  takenAt: number | null; // ms since epoch, from EXIF; null when unknown
  filename: string; // original_filename, for the natural-order fallback ("RG-2" before "RG-10")
};

// Faces found in one photo: 128-d descriptors (see lib/faceRecognition.ts) with their box area as a
// fraction of the photo (0-1), so a close-up face counts more than a small background one.
export type PhotoFaces = { photoId: string; faces: { descriptor: number[]; area: number }[] };

// Each cell's reference people, after picking the right faces from its reference photo.
export type CellPeople = { id: FamilyCellId; descriptors: number[][] };

export type SectionKind = "owners" | "parents" | "siblings" | "grandparents" | "event";

// One spread (a full double page) of the plan. heroId, when set, is the photo the layout should
// make the largest on that spread.
export type PlannedSpread = { section: SectionKind; photoIds: string[]; heroId?: string };

export type AlbumPlan = { coverPhotoId: string | null; spreads: PlannedSpread[] };

export type PlanOptions = {
  style: AutoStyleId;
  // null = decide from the photo count. Otherwise the book aims for about this many spreads
  // (it never repeats a photo; with too few photos it uses fewer spreads).
  targetSpreads: number | null;
};

// Input to one spread's layout.
export type LayoutInput = {
  style: AutoStyleId;
  photos: { id: string; aspect: number }[]; // in reading order, 1..~8 photos
  heroId?: string;
  section: SectionKind;
  spreadIndex: number; // 0-based position in the book (for variety between consecutive spreads)
  // Physical spread size in cm (album width_cm/height_cm). width/height >= 1.6 means a double
  // page with a fold at 50%: layouts keep faces and frame edges off the fold.
  widthCm: number;
  heightCm: number;
};

// Output: elements in percent of the whole spread (0-100), same model the editor uses
// (AlbumPhotoElement etc. in lib/types.ts). Photo elements carry their photoId already. The UI
// then fits them into the safe margin (fitFramesToSafeArea) before saving.
export type LayoutOutput = { elements: AlbumElement[] };

export type CoverInput = {
  style: AutoStyleId;
  photo: { id: string; aspect: number } | null;
  title: string; // the event / gallery name
  widthCm: number;
  heightCm: number;
};
