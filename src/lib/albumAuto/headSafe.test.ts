import { describe, expect, it } from "vitest";
import { headSafeElements, type HeadSafeOptions, type HeadSafePage } from "@/lib/albumAuto/headSafe";
import { facesFindings } from "@/lib/albumAuto/qualityCheck";
import type { FaceRect } from "@/lib/albumAuto/swapPhotos";
import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";

// The auto designer's head-safe pass (owner, 2026-10-27): a crop that cuts a head is moved by the
// faces, the frame never moves, and only when that fixes it without making anything worse.
// A 60×30 double page with a 0.9 cm safe margin.

const PAGE = { widthCm: 60, heightCm: 30 };

const photoEl = (id: string, photoId: string, box: [number, number, number, number], extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement => ({
  id,
  type: "photo",
  photoId,
  xPct: box[0],
  yPct: box[1],
  widthPct: box[2],
  heightPct: box[3],
  focalX: 50,
  focalY: 50,
  zoom: 100,
  ...extra,
});

function run(elements: AlbumElement[], aspects: Record<string, number>, faces: Record<string, FaceRect[]>, bleedIds: string[] = [], fold = true) {
  const page: HeadSafePage = { elements, bleedIds, ...PAGE };
  const opts: HeadSafeOptions = { safeMarginCm: 0.9, fold, aspectOf: (id) => aspects[id] ?? null, facesOf: (id) => faces[id] };
  return headSafeElements(page, opts);
}

// A portrait photo (2:3) in a wide frame (about 1.5:1 on paper): less than half its height shows.
// Centred, the window starts at ~28% of the photo's height, and the face sitting at 22%–36% loses
// its forehead.
const WIDE_FRAME: [number, number, number, number] = [10, 10, 30, 40];
const HIGH_FACE: FaceRect[] = [{ x: 0.4, y: 0.22, width: 0.14, height: 0.14 }];

describe("headSafeElements", () => {
  it("moves the crop so a head cut by the frame shows whole, and leaves the frame where it was", () => {
    const el = photoEl("a", "p", WIDE_FRAME);
    const before = facesFindings(el, PAGE, 2 / 3, HIGH_FACE, { margin: { x: 1.5, y: 3 }, fold: true });
    expect(before.map((f) => f.kind)).toContain("head-cut");

    const out = run([el], { p: 2 / 3 }, { p: HIGH_FACE });
    const moved = out[0] as AlbumPhotoElement;
    expect(moved.focalY).toBeLessThan(50);
    expect([moved.xPct, moved.yPct, moved.widthPct, moved.heightPct]).toEqual(WIDE_FRAME);
    expect(moved.photoId).toBe("p");
    const after = facesFindings(moved, PAGE, 2 / 3, HIGH_FACE, { margin: { x: 1.5, y: 3 }, fold: true });
    expect(after.map((f) => f.kind)).not.toContain("head-cut");
  });

  it("leaves a crop that moving can't fix as it was", () => {
    // A landscape photo in a tall, narrow frame shows a sixth of its width; two faces side by side
    // don't both fit whatever the crop, so moving it only trades one cut head for another.
    const el = photoEl("a", "p", [10, 10, 10, 80], { focalX: 42 });
    const faces = [
      { x: 0.3, y: 0.3, width: 0.1, height: 0.1 },
      { x: 0.45, y: 0.3, width: 0.1, height: 0.1 },
    ];
    expect(facesFindings(el, PAGE, 1.5, faces, { margin: { x: 1.5, y: 3 }, fold: true }).map((f) => f.kind)).toContain("head-cut");
    const elements = [el];
    const out = run(elements, { p: 1.5 }, { p: faces });
    expect(out).toBe(elements);
  });

  it("leaves photos without known faces, and pages with nothing cut, untouched", () => {
    const el = photoEl("a", "p", WIDE_FRAME);
    const elements = [el];
    expect(run(elements, { p: 2 / 3 }, {})).toBe(elements);
    expect(run(elements, { p: 2 / 3 }, { p: [] })).toBe(elements);
    // The face well inside what shows.
    expect(run(elements, { p: 2 / 3 }, { p: [{ x: 0.4, y: 0.45, width: 0.12, height: 0.12 }] })).toBe(elements);
  });

  it("never moves masked, rotated or locked frames", () => {
    for (const extra of [{ maskId: "fade-25-right" }, { rotation: 4 }, { locked: true }] as Partial<AlbumPhotoElement>[]) {
      const elements = [photoEl("a", "p", WIDE_FRAME, extra)];
      expect(run(elements, { p: 2 / 3 }, { p: HIGH_FACE })).toBe(elements);
    }
  });

  it("never moves a frame with something drawn over it: a photo of a grid, a title, a filled band", () => {
    const hero = photoEl("hero", "p", WIDE_FRAME);
    const gridOnTop = photoEl("cell", "q", [30, 20, 15, 20]);
    const withGrid = [hero, gridOnTop];
    expect(run(withGrid, { p: 2 / 3, q: 1.5 }, { p: HIGH_FACE })).toBe(withGrid);

    const title: AlbumElement = { id: "t", type: "text", text: "רון ונויה", xPct: 12, yPct: 30, widthPct: 20, heightPct: 10, fontSize: 60, color: "#fff", align: "center" };
    const withTitle = [hero, title];
    expect(run(withTitle, { p: 2 / 3 }, { p: HIGH_FACE })).toBe(withTitle);

    // A photo under the frame (earlier in the list) doesn't hold it.
    const under = photoEl("bg", "q", [0, 0, 50, 100]);
    const out = run([under, hero], { p: 2 / 3, q: 1.5 }, { p: HIGH_FACE });
    expect((out[1] as AlbumPhotoElement).focalY).toBeLessThan(50);
    expect(out[0]).toBe(under);
  });
});
