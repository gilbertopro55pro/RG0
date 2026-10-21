import { describe, expect, it } from "vitest";
import {
  checkAlbumQuality,
  cropOf,
  issuesByPage,
  photoWindow,
  qualityFixPatches,
  type QualityInput,
  type QualityIssue,
  type QualityPhoto,
  type QualitySpread,
} from "@/lib/albumAuto/qualityCheck";
import { computePhotoFraming } from "@/lib/albumRender";
import { fitPhotoInFrame, type FaceRect } from "@/lib/albumAuto/swapPhotos";
import type { AlbumElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "@/lib/types";

// The album's quality check (admin, 2026-10-21): what would come out wrong in print, page by page,
// with a safe fix where there is one. Album 60×30 with a 0.9 cm safe margin (the owner's album
// "עלייה לתורה - אורי"): the margin is 1.5% of the width and 3% of the height, the fold at 50%.

const ALBUM = { width_cm: 60, height_cm: 30, safe_margin_cm: 0.9 };
const PAGE = { widthCm: 60, heightCm: 30 };

const photoEl = (id: string, photoId: string | null, box: [number, number, number, number], extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement => ({
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

const textEl = (id: string, text: string, box: [number, number, number, number], extra: Partial<AlbumTextElement> = {}): AlbumTextElement => ({
  id,
  type: "text",
  text,
  xPct: box[0],
  yPct: box[1],
  widthPct: box[2],
  heightPct: box[3],
  fontSize: 40,
  color: "white",
  align: "center",
  ...extra,
});

const spread = (id: string, elements: AlbumElement[], extra: Partial<QualitySpread> = {}): QualitySpread => ({ id, elements, width_cm: null, height_cm: null, background_photo_id: null, ...extra });

function run(spreads: QualitySpread[], photos: Record<string, Partial<QualityPhoto>>, faces: Record<string, FaceRect[]> = {}, album: QualityInput["album"] = ALBUM) {
  const map = new Map(Object.entries(photos).map(([id, p]) => [id, { aspect: p.aspect ?? 1.5, fileSizeBytes: p.fileSizeBytes ?? 5_000_000 }]));
  return checkAlbumQuality({ album, spreads, photos: map, faces: (id) => faces[id] });
}

const kinds = (issues: QualityIssue[]) => issues.map((i) => `${i.kind}/${i.severity}`);
const only = (issues: QualityIssue[], kind: QualityIssue["kind"]) => issues.filter((i) => i.kind === kind);

describe("photoWindow (what shows of the photo, matching computePhotoFraming)", () => {
  it("reads computePhotoFraming's rendered box back as a window of the image", () => {
    // A 3:2 photo in a square frame (18×18 cm on the 60×30 page) shows two thirds of its width.
    const el = photoEl("a", "p", [10, 10, 30, 60], { focalX: 0 });
    expect(photoWindow(el, PAGE, 1.5).window).toEqual({ x0: 0, y0: 0, x1: expect.closeTo(2 / 3, 6), y1: 1 });
    expect(photoWindow({ ...el, focalX: 100 }, PAGE, 1.5).window.x0).toBeCloseTo(1 / 3, 6);
    // Zoom grows from the focal point: at 200% centred, a third of the width, starting at a third.
    const zoomed = photoWindow({ ...el, zoom: 200, focalX: 50, focalY: 50 }, PAGE, 1.5).window;
    expect(zoomed.x0).toBeCloseTo(1 / 3, 6);
    expect(zoomed.x1 - zoomed.x0).toBeCloseTo(1 / 3, 6);
    expect(zoomed.y0).toBeCloseTo(0.25, 6);
    expect(zoomed.y1 - zoomed.y0).toBeCloseTo(0.5, 6);
    // Same numbers straight from the renderers' function.
    const f = computePhotoFraming(1.5, 1, 200, 50, 50);
    expect(zoomed.x0).toBeCloseTo(-f.leftPct / f.widthPct, 6);
    expect(zoomed.y0).toBeCloseTo(-f.topPct / f.heightPct, 6);
  });

  it("cuts the window at the page edge for a frame that runs off the page", () => {
    // 70% wide from -20%: the first 20/70 of the frame (and of the photo, which fits it exactly) is off the page.
    const el = photoEl("a", "p", [-20, 0, 70, 100]);
    const { window } = photoWindow(el, PAGE, 1.4);
    expect(window.x0).toBeCloseTo(20 / 70, 6);
    expect(window.x1).toBeCloseTo(1, 6);
  });

  it("measures the crop as shape × zoom", () => {
    expect(cropOf(photoEl("a", "p", [10, 10, 30, 60]), PAGE, 1.5)).toBeCloseTo(1.5, 6);
    expect(cropOf(photoEl("a", "p", [10, 10, 30, 60], { zoom: 120 }), PAGE, 1)).toBeCloseTo(1.2, 6);
    // Below 100% the renderers don't shrink the photo either.
    expect(cropOf(photoEl("a", "p", [10, 10, 30, 60], { zoom: 80 }), PAGE, 1)).toBeCloseTo(1, 6);
  });
});

describe("empty frames", () => {
  it("reports a frame without a photo, and one whose photo was deleted from the gallery", () => {
    const issues = run([spread("s1", [photoEl("a", null, [10, 10, 30, 60]), photoEl("b", "gone", [50, 10, 30, 60])])], {});
    expect(kinds(issues)).toEqual(["empty-frame/error", "empty-frame/error"]);
    expect(issues.map((i) => i.params.missing)).toEqual([0, 1]);
    expect(issues.every((i) => !i.fix)).toBe(true);
  });
});

describe("heads cut", () => {
  // A square photo in a 15.6×12 cm frame (aspect 1.3): 77% of its height shows.
  const box: [number, number, number, number] = [55, 10, 26, 40];
  const face: FaceRect = { x: 0.4, y: 0.15, width: 0.2, height: 0.2 };

  it("reports a head cut by the crop as an error, with a fix that moves the crop", () => {
    // Crop at the bottom: the window starts at 23% of the height, through the face.
    const issues = run([spread("s1", [photoEl("a", "p", box, { focalY: 100 })])], { p: { aspect: 1 } }, { p: [face] });
    const cut = only(issues, "head-cut");
    expect(cut).toHaveLength(1);
    expect(cut[0]).toMatchObject({ severity: "error", elementId: "a", photoId: "p", params: { faces: 1, outside: 40 } });
    expect(cut[0].fix?.patch).toEqual({ focalX: 50, focalY: 0, zoom: 100 });
    // After the fix the head is whole.
    const fixed = qualityFixPatches([spread("s1", [photoEl("a", "p", box, { focalY: 100 })])], cut);
    expect(only(run([spread("s1", fixed.get("s1")!)], { p: { aspect: 1 } }, { p: [face] }), "head-cut")).toEqual([]);
  });

  it("warns when only the top of the head (the hair above the face) is cut", () => {
    // Window from 13% of the height: the face (from 15%) shows, most of the hair above it doesn't.
    const focalY = (0.13 / (1 - 1 / 1.3)) * 100;
    const cut = only(run([spread("s1", [photoEl("a", "p", box, { focalY })])], { p: { aspect: 1 } }, { p: [face] }), "head-cut");
    expect(cut.map((i) => i.severity)).toEqual(["warning"]);
    expect(cut[0].params.outside).toBe(0);
    expect(cut[0].fix).toBeDefined();
  });

  it("leaves a head the photo itself cuts at its top edge (nothing to fix)", () => {
    const atTop: FaceRect = { x: 0.4, y: 0.02, width: 0.2, height: 0.2 };
    expect(only(run([spread("s1", [photoEl("a", "p", box, { focalY: 0 })])], { p: { aspect: 1 } }, { p: [atTop] }), "head-cut")).toEqual([]);
  });

  it("ignores small faces in the background and faces whose centre is outside the frame", () => {
    const background: FaceRect = { x: 0.02, y: 0.1, width: 0.05, height: 0.05 }; // far smaller than the main face
    const outside: FaceRect = { x: 0.4, y: 0.0, width: 0.2, height: 0.2 }; // centre at 10%, above the window at 23%
    const issues = run([spread("s1", [photoEl("a", "p", box, { focalY: 100 })])], { p: { aspect: 1 } }, { p: [{ x: 0.4, y: 0.5, width: 0.2, height: 0.2 }, background, outside] });
    expect(only(issues, "head-cut")).toEqual([]);
  });

  it("reports a head cut by the page edge, and offers no fix when the crop has no room to move", () => {
    // A 70%-wide hero from -20%, the photo exactly its shape: the face at 25–35% of its width is
    // half off the page, and moving the crop can't bring it back.
    const el = photoEl("a", "p", [-20, 0, 70, 100]);
    const cut = only(run([spread("s1", [el])], { p: { aspect: 1.4 } }, { p: [{ x: 0.25, y: 0.3, width: 0.1, height: 0.15 }] }), "head-cut");
    expect(cut.map((i) => i.severity)).toEqual(["error"]);
    expect(cut[0].fix).toBeUndefined();
  });

  it("checks a tilted frame's crop (the tilt turns the whole frame, the same part of the photo shows)", () => {
    const issues = run([spread("s1", [photoEl("a", "p", box, { focalY: 100, rotation: -6 })])], { p: { aspect: 1 } }, { p: [face] });
    expect(only(issues, "head-cut").map((i) => i.severity)).toEqual(["error"]);
  });

  it("waits for the faces: no face problems while they aren't known, the rest at once", () => {
    const issues = run([spread("s1", [photoEl("a", "p", box, { focalY: 100 }), photoEl("b", null, [5, 5, 20, 20])])], { p: { aspect: 1 } });
    expect(kinds(issues)).toEqual(["empty-frame/error"]);
  });

  // The check and fitPhotoInFrame (the admin's swap, and this check's fix) agree: whenever the
  // faces fit in what shows, a photo fitted by fitPhotoInFrame has no head cut.
  it("finds no head cut in any frame fitted by fitPhotoInFrame (faces that fit)", () => {
    const frames: [number, number, number, number][] = [
      [10, 10, 18, 60], // 0.6
      [10, 10, 24, 60], // 0.8
      [10, 10, 30, 60], // 1
      [10, 20, 26, 40], // 1.3
      [55, 20, 32, 40], // 1.6
      [52, 30, 44, 40], // 2.2
    ];
    const groups: FaceRect[][] = [
      [{ x: 0.1, y: 0.1, width: 0.12, height: 0.15 }],
      [{ x: 0.45, y: 0.2, width: 0.12, height: 0.15 }],
      [{ x: 0.7, y: 0.6, width: 0.12, height: 0.15 }],
      [{ x: 0.2, y: 0.75, width: 0.12, height: 0.15 }],
      [
        { x: 0.3, y: 0.3, width: 0.1, height: 0.12 },
        { x: 0.42, y: 0.34, width: 0.1, height: 0.12 },
      ],
    ];
    let checked = 0;
    for (const frame of frames) {
      for (const aspect of [2 / 3, 1, 1.5]) {
        for (const faces of groups) {
          // Start from a crop that cuts (zoomed, pushed to a corner), then fit.
          const el = photoEl("a", "p", frame, { focalX: 100, focalY: 100, zoom: 160 });
          const fitted = fitPhotoInFrame(el, PAGE, aspect, faces, false);
          const after = { ...el, focalX: fitted.focalX, focalY: fitted.focalY, zoom: fitted.zoom };
          const issues = run([spread("s1", [after])], { p: { aspect } }, { p: faces });
          expect(only(issues, "head-cut"), `frame ${frame} aspect ${aspect} faces ${JSON.stringify(faces)}`).toEqual([]);
          checked++;
        }
      }
    }
    expect(checked).toBe(90);
  });
});

describe("faces in the safe margin", () => {
  // A hero on the left half, running off the page (30×30 cm), with a 1.3 photo: 77% of its width shows.
  const hero = (focalX: number) => photoEl("a", "p", [0, 0, 50, 100], { focalX });

  it("warns about a face partly in the band trimmed in print, and fixes it when moving the crop takes it out", () => {
    // Crop to the right: the face at the window's left edge, in the 1.5% band.
    const face: FaceRect = { x: 0.232, y: 0.4, width: 0.06, height: 0.12 };
    const issues = run([spread("s1", [hero(100)])], { p: { aspect: 1.3 } }, { p: [face] });
    const margin = only(issues, "face-in-margin");
    expect(margin).toHaveLength(1);
    expect(margin[0].severity).toBe("warning");
    expect(margin[0].fix).toBeDefined();
    const fixed = qualityFixPatches([spread("s1", [hero(100)])], margin);
    expect(run([spread("s1", fixed.get("s1")!)], { p: { aspect: 1.3 } }, { p: [face] })).toEqual([]);
  });

  it("offers no fix when the face is at the photo's own edge", () => {
    const face: FaceRect = { x: 0, y: 0.4, width: 0.08, height: 0.12 };
    const margin = only(run([spread("s1", [hero(0)])], { p: { aspect: 1.3 } }, { p: [face] }), "face-in-margin");
    expect(margin).toHaveLength(1);
    expect(margin[0].fix).toBeUndefined();
  });

  it("doesn't count a face well inside the safe area", () => {
    const face: FaceRect = { x: 0.4, y: 0.4, width: 0.06, height: 0.12 };
    expect(run([spread("s1", [hero(100)])], { p: { aspect: 1.3 } }, { p: [face] })).toEqual([]);
  });
});

describe("faces on the fold", () => {
  // A hero from 25% to the right edge, 45×30 cm, the photo its exact shape: the fold at a third of its width.
  const hero = photoEl("a", "p", [25, 0, 75, 100]);

  it("warns about a face crossed by the fold of a double page, with no automatic fix", () => {
    const issues = run([spread("s1", [hero])], { p: { aspect: 1.5 } }, { p: [{ x: 0.3, y: 0.3, width: 0.07, height: 0.12 }] });
    expect(kinds(issues)).toEqual(["face-on-fold/warning"]);
    expect(issues[0].fix).toBeUndefined();
  });

  it("ignores the fold on a page with its own size (the cover), a face too small on paper, and an ear touching the fold", () => {
    const face = { x: 0.3, y: 0.3, width: 0.07, height: 0.12 };
    expect(run([spread("cover", [hero], { width_cm: 60, height_cm: 30 })], { p: { aspect: 1.5 } }, { p: [face] })).toEqual([]);
    // 4% of 30 cm = 1.2 cm high.
    expect(run([spread("s1", [hero])], { p: { aspect: 1.5 } }, { p: [{ x: 0.31, y: 0.3, width: 0.03, height: 0.04 }] })).toEqual([]);
    // From 49.75% to 55%: a quarter of a percent over the fold.
    expect(run([spread("s1", [hero])], { p: { aspect: 1.5 } }, { p: [{ x: 0.33, y: 0.3, width: 0.07, height: 0.12 }] })).toEqual([]);
  });

  it("has no fold on a single-page album (30×20)", () => {
    const album = { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5 };
    const el = photoEl("a", "p", [10, 10, 80, 80]); // 24×16 cm, 3:2
    expect(run([spread("s1", [el])], { p: { aspect: 1.5 } }, { p: [{ x: 0.45, y: 0.3, width: 0.1, height: 0.15 }] }, album)).toEqual([]);
  });
});

describe("heavy crops", () => {
  it("warns above 1.35 and errs above 1.8", () => {
    const issues = run(
      [
        spread("s1", [
          photoEl("ok", "a", [10, 10, 30, 60]), // 1.5 photo in a square: 1.5
          photoEl("mid", "b", [50, 10, 40, 60]), // 24×18 (1.33) for a portrait: 2.0
          photoEl("fine", "c", [10, 75, 15, 20]), // 9×6 for 3:2: 1
        ]),
      ],
      { a: { aspect: 1.5 }, b: { aspect: 2 / 3 }, c: { aspect: 1.5 } }
    );
    expect(issues.map((i) => [i.elementId, i.severity, i.params.crop])).toEqual([
      ["mid", "error", 2],
      ["ok", "warning", 1.5],
    ]);
  });

  it("fixes a free frame by giving it the photo's shape inside its old box", () => {
    const el = photoEl("a", "p", [10, 10, 30, 60], { borderWidth: 3 });
    const [issue] = run([spread("s1", [el])], { p: { aspect: 1.5 } });
    // The square 18×18 becomes 18×12, centred where it was.
    expect(issue.fix?.patch).toEqual({ xPct: 10, yPct: 20, widthPct: 30, heightPct: 40, focalX: 50, focalY: 50, zoom: 100 });
    const fixed = qualityFixPatches([spread("s1", [el])], [issue]).get("s1")!;
    expect(fixed[0]).toEqual({ ...el, yPct: 20, heightPct: 40 });
    expect(run([spread("s1", fixed)], { p: { aspect: 1.5 } })).toEqual([]);
  });

  it("counts the zoom, and fixes a zoom-only crop by dropping the zoom, the frame kept", () => {
    const el = photoEl("a", "p", [0, 0, 50, 100], { zoom: 150 }); // a hero off the page, the photo its shape
    const [issue] = run([spread("s1", [el])], { p: { aspect: 1 } });
    expect(issue).toMatchObject({ kind: "heavy-crop", params: { crop: 1.5 } });
    expect(issue.fix?.patch).toEqual({ focalX: 50, focalY: 50, zoom: 100 });
  });

  it("leaves faded heroes alone, and won't reshape a frame that runs off the page, is tilted, locked, or has the cover's band and title over it", () => {
    expect(run([spread("s1", [photoEl("a", "p", [55, 0, 45, 100], { maskId: "fade-left-25" })])], { p: { aspect: 0.5 } })).toEqual([]);
    const cases: AlbumElement[][] = [
      [photoEl("a", "p", [0, 10, 30, 60])],
      [photoEl("a", "p", [10, 10, 30, 60], { rotation: 4 })],
      [photoEl("a", "p", [10, 10, 30, 60], { locked: true })],
      [
        photoEl("a", "p", [5.6, 5.6, 88.7, 88.7]),
        { id: "band", type: "shape", xPct: 5.6, yPct: 70.8, widthPct: 88.7, heightPct: 23.6, color: "#fff", opacity: 45 } as AlbumShapeElement,
        textEl("title", "עלייה לתורה - אורי", [10.4, 77.9, 79.3, 6.4]),
      ],
    ];
    for (const elements of cases) {
      const issue = only(run([spread("s1", elements, elements.length > 1 ? { width_cm: 32, height_cm: 32 } : {})], { p: { aspect: 1.5 } }), "heavy-crop")[0];
      expect(issue, elements[0].id).toBeDefined();
      expect(issue.fix, JSON.stringify(elements[0])).toBeUndefined();
    }
  });

  it("still reshapes a frame with the clean line's panel behind it", () => {
    const panel = { id: "panel", type: "shape", xPct: 0, yPct: 16, widthPct: 100, heightPct: 67, color: "#fff", opacity: 45 } as AlbumShapeElement;
    const [issue] = run([spread("s1", [panel, photoEl("a", "p", [10, 10, 30, 60])])], { p: { aspect: 1.5 } });
    expect(issue.fix?.patch.heightPct).toBe(40);
  });
});

describe("duplicates", () => {
  it("reports a photo placed twice, on the later page, naming the first", () => {
    const issues = run(
      [spread("s1", [photoEl("a", "p", [10, 10, 30, 40])]), spread("s2", [photoEl("b", "q", [10, 10, 30, 40])]), spread("s3", [photoEl("c", "p", [10, 10, 30, 40])])],
      { p: {}, q: {} }
    );
    expect(issues).toEqual([expect.objectContaining({ kind: "duplicate", severity: "warning", spreadId: "s3", pageIndex: 2, elementId: "c", params: { otherPage: 1, samePage: 0 } })]);
  });

  it("tells when both are on the same page", () => {
    const issues = run([spread("s1", [photoEl("a", "p", [10, 10, 30, 40]), photoEl("b", "p", [50, 10, 30, 40])])], { p: {} });
    expect(issues.map((i) => [i.elementId, i.params.samePage])).toEqual([["b", 1]]);
  });

  it("ignores the cover (its photo appears inside on purpose) and the blurred backgrounds", () => {
    const issues = run(
      [
        spread("cover", [photoEl("a", "p", [5, 5, 90, 90])], { width_cm: 32, height_cm: 32, background_photo_id: "p" }),
        spread("s1", [photoEl("b", "p", [10, 10, 30, 40])], { background_photo_id: "p" }),
        spread("s2", [photoEl("c", "q", [10, 10, 30, 40])], { background_photo_id: "p" }),
      ],
      { p: { aspect: 1 }, q: {} }
    );
    expect(only(issues, "duplicate")).toEqual([]);
  });
});

describe("text outside the safe margin", () => {
  it("warns about text whose printed extent goes into the margin", () => {
    // Left-aligned from 0.5%, the margin is 1.5%.
    const issues = run([spread("s1", [textEl("t", "שלום", [0.5, 10, 40, 6], { align: "left" })])], {});
    expect(issues).toEqual([expect.objectContaining({ kind: "text-outside-margin", severity: "warning", elementId: "t", params: { fold: 0 } })]);
  });

  it("measures the text, not its box: a short centred line in a full-width box is fine on a single page", () => {
    const album = { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5 };
    expect(run([spread("s1", [textEl("t", "דנה ויוסי", [0, 40, 100, 10])])], {}, {}, album)).toEqual([]);
    // Right-aligned, the same text ends at the box's right edge, inside the margin.
    expect(run([spread("s1", [textEl("t", "דנה ויוסי", [0, 40, 100, 10], { align: "right" })])], {}, {}, album)).toHaveLength(1);
  });

  it("warns about text across the fold of a double page, not on the cover", () => {
    const title = textEl("t", "דנה ויוסי", [20, 40, 60, 10]);
    expect(run([spread("s1", [title])], {}).map((i) => i.params)).toEqual([{ fold: 1 }]);
    expect(run([spread("cover", [title], { width_cm: 60, height_cm: 30 })], {})).toEqual([]);
  });

  it("checks the owner's real cover title: inside the margin", () => {
    const cover = textEl("auto-cover-title", "עלייה לתורה - אורי", [10.3625, 77.923675, 79.275, 6.44109375], { fontSize: 78, fontFamily: "assistant" });
    expect(run([spread("cover", [cover], { width_cm: 32, height_cm: 32 })], {})).toEqual([]);
  });

  it("wraps a line longer than its box onto more lines (taller text)", () => {
    // 60 letters in a 20%-wide box at 40pt: ~4 lines of 2.5% em × 2 (page aspect) = 20% high, in a 6% box at 4%.
    const long = textEl("t", "א".repeat(60), [30, 4, 20, 6], { align: "center" });
    expect(run([spread("s1", [long])], {}).map((i) => i.params)).toEqual([{ fold: 0 }]);
  });
});

describe("small files", () => {
  it("warns about a small original in a big frame, a proxy for a photo too small to print sharp", () => {
    const issues = run(
      [spread("s1", [photoEl("big", "small", [10, 10, 30, 60]), photoEl("tiny", "small2", [50, 10, 10, 20]), photoEl("unknown", "zero", [10, 75, 30, 60])])],
      { small: { aspect: 1, fileSizeBytes: 500 * 1024 }, small2: { aspect: 1, fileSizeBytes: 500 * 1024 }, zero: { aspect: 1, fileSizeBytes: 0 } }
    );
    // 30% of 60 cm = 18 cm long side; the 6 cm frame and the file of unknown size aren't reported.
    expect(only(issues, "small-file").map((i) => [i.elementId, i.params])).toEqual([["big", { kb: 500, cm: 18 }]]);
  });
});

describe("the list", () => {
  it("orders by page, then errors first", () => {
    const issues = run(
      [spread("s1", [photoEl("w", "a", [10, 10, 30, 60]), photoEl("e", null, [50, 10, 30, 60])]), spread("s2", [photoEl("x", null, [10, 10, 30, 60])])],
      { a: { aspect: 1.5 } }
    );
    expect(issues.map((i) => [i.pageIndex, i.kind, i.severity])).toEqual([
      [0, "empty-frame", "error"],
      [0, "heavy-crop", "warning"],
      [1, "empty-frame", "error"],
    ]);
    expect([...issuesByPage(issues)]).toEqual([
      ["s1", { errors: 1, warnings: 1 }],
      ["s2", { errors: 1, warnings: 0 }],
    ]);
  });
});

describe("qualityFixPatches", () => {
  it("applies one fix per photo, the reshaping one first, and only on the pages it changes", () => {
    const el = photoEl("a", "p", [10, 10, 30, 60], { focalY: 100 });
    const spreads = [spread("s1", [el, textEl("t", "x", [60, 10, 10, 10])]), spread("s2", [photoEl("b", "q", [10, 10, 30, 40])])];
    const issues: QualityIssue[] = [
      { id: "h", kind: "head-cut", severity: "error", spreadId: "s1", pageIndex: 0, elementId: "a", params: {}, fix: { elementId: "a", patch: { focalY: 0 } } },
      { id: "c", kind: "heavy-crop", severity: "warning", spreadId: "s1", pageIndex: 0, elementId: "a", params: {}, fix: { elementId: "a", patch: { yPct: 20, heightPct: 40, focalY: 50 } } },
      { id: "gone", kind: "head-cut", severity: "error", spreadId: "s1", pageIndex: 0, elementId: "zz", params: {}, fix: { elementId: "zz", patch: { focalY: 0 } } },
    ];
    const out = qualityFixPatches(spreads, issues);
    expect([...out.keys()]).toEqual(["s1"]);
    expect(out.get("s1")![0]).toEqual({ ...el, yPct: 20, heightPct: 40, focalY: 50 });
    expect(out.get("s1")![1]).toBe(spreads[0].elements![1]);
  });
});
