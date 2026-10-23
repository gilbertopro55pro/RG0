import { describe, expect, it } from "vitest";
import {
  checkAlbumQuality,
  cropOf,
  applyUndo,
  issuesByPage,
  photoWindow,
  qualityFixPatches,
  textInkBox,
  undoRecord,
  type QualityInput,
  type QualityIssue,
  type QualityPhoto,
  type QualitySpread,
} from "@/lib/albumAuto/qualityCheck";
import { computePhotoFraming } from "@/lib/albumRender";
import { fitPhotoInFrame, type FaceRect } from "@/lib/albumAuto/swapPhotos";
import type { AlbumElement, AlbumPhotoElement, AlbumTextElement } from "@/lib/types";

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

  it("measures the crop by the frame's shape alone (a zoom is set on purpose)", () => {
    expect(cropOf(photoEl("a", "p", [10, 10, 30, 60]), PAGE, 1.5)).toBeCloseTo(1.5, 6);
    expect(cropOf(photoEl("a", "p", [10, 10, 30, 60], { zoom: 120 }), PAGE, 1)).toBeCloseTo(1, 6);
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
    expect(cut[0].fix?.patches).toEqual([{ elementId: "a", patch: { focalX: 50, focalY: 0, zoom: 100 } }]);
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
  it("warns above 1.6 and errs above 1.8; the owner's own templates (up to ~1.55) pass", () => {
    const issues = run(
      [
        spread("s1", [
          photoEl("tpl", "a", [10, 10, 30, 60]), // 1.5 photo in a square: 1.5
          photoEl("mid", "b", [50, 10, 40, 60]), // 24×18 (1.33) for a portrait: 2.0
          photoEl("warn", "c", [10, 75, 20, 20]), // 12×6 (2) for 1.2: 1.67
        ]),
      ],
      { a: { aspect: 1.5 }, b: { aspect: 2 / 3 }, c: { aspect: 1.2 } }
    );
    expect(issues.map((i) => [i.elementId, i.severity, i.params.crop])).toEqual([
      ["mid", "error", 2],
      ["warn", "warning", 1.67],
    ]);
  });

  it("leaves the zoom out: someone set it on purpose", () => {
    expect(run([spread("s1", [photoEl("a", "p", [10, 10, 30, 40], { zoom: 250 })])], { p: { aspect: 1.5 } })).toEqual([]);
    expect(cropOf({ widthPct: 30, heightPct: 40 }, PAGE, 1.5)).toBe(1);
  });

  it("never changes a frame: the fix swaps the photo with another frame's on the same page", () => {
    // A portrait in a wide cell, a landscape in a tall one: they trade places, the frames stay.
    const wide = photoEl("wide", "portrait", [10, 10, 40, 40], { borderWidth: 3 }); // 24×12
    const tall = photoEl("tall", "landscape", [60, 10, 15, 60], { borderWidth: 3 }); // 9×18
    const page = [wide, tall];
    const photos = { portrait: { aspect: 2 / 3 }, landscape: { aspect: 1.5 } };
    const issues = run([spread("s1", page)], photos);
    expect(issues.map((i) => i.elementId)).toEqual(["wide", "tall"]);
    const fix = issues[0].fix!;
    expect(fix.patches.map((p) => [p.elementId, p.patch.photoId])).toEqual([
      ["wide", "landscape"],
      ["tall", "portrait"],
    ]);
    const fixed = qualityFixPatches([spread("s1", page)], issues).get("s1")!;
    // Same box, border and everything else: only the photo and where it sits in the frame change.
    const frameOf = (el: AlbumElement) => Object.fromEntries(Object.entries(el).filter(([k]) => !["photoId", "focalX", "focalY", "zoom"].includes(k)));
    fixed.forEach((el, i) => expect(frameOf(el)).toEqual(frameOf(page[i])));
    expect(run([spread("s1", fixed)], photos)).toEqual([]);
  });

  it("swaps only when both frames end within the warning, and never with a faded hero or a locked frame", () => {
    const wide = photoEl("wide", "portrait", [10, 10, 40, 40]);
    // The only other photo is a portrait too: swapping fixes nothing.
    expect(run([spread("s1", [wide, photoEl("b", "p2", [60, 10, 15, 60])])], { portrait: { aspect: 2 / 3 }, p2: { aspect: 2 / 3 } })[0].fix).toBeUndefined();
    const photos = { portrait: { aspect: 2 / 3 }, landscape: { aspect: 1.5 } };
    expect(run([spread("s1", [wide, photoEl("hero", "landscape", [55, 0, 45, 100], { maskId: "fade-left-25" })])], photos)[0].fix).toBeUndefined();
    expect(run([spread("s1", [wide, photoEl("b", "landscape", [60, 10, 15, 60], { locked: true })])], photos)[0].fix).toBeUndefined();
  });

  it("leaves faded heroes alone", () => {
    expect(run([spread("s1", [photoEl("a", "p", [55, 0, 45, 100], { maskId: "fade-left-25" })])], { p: { aspect: 0.5 } })).toEqual([]);
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

  it("never wraps a line longer than its box: it runs past the box's sides, as every renderer draws it", () => {
    // 60 letters at 40pt: 60 × 0.6 × 2.5% = 90% wide, centred on the box's 40%: from -5% to 85%.
    const long = textEl("t", "א".repeat(60), [30, 40, 20, 6], { align: "center" });
    const ink = textInkBox(long, { widthCm: 60, heightCm: 30 })!;
    expect(ink.x0).toBeCloseTo(-5, 6);
    expect(ink.x1).toBeCloseTo(85, 6);
    expect(run([spread("s1", [long])], {}).map((i) => i.params)).toEqual([{ fold: 0 }]);
  });

  it("stacks the photographer's own lines: taller, as wide as the longest line", () => {
    // 40pt on 60×30: one em is 2.5% of the width, 5% of the height. Three lines: 2 × 1.2 + 1 = 3.4 em.
    const page = { widthCm: 60, heightCm: 30 };
    const one = textInkBox(textEl("t", "אאאא", [10, 40, 30, 20]), page)!;
    const three = textInkBox(textEl("t", "אא\nאאאא\nא", [10, 40, 30, 20]), page)!;
    expect(three.x1 - three.x0).toBeCloseTo(one.x1 - one.x0, 6);
    expect(one.y1 - one.y0).toBeCloseTo(5, 6);
    expect(three.y1 - three.y0).toBeCloseTo(17, 6);
    // Centred on the box's middle (50%).
    expect((three.y0 + three.y1) / 2).toBeCloseTo(50, 6);
    // Two lines in a 6%-high box at the top margin's edge spill into it, one doesn't.
    expect(run([spread("s1", [textEl("t", "דנה", [10, 3, 30, 6])])], {})).toEqual([]);
    expect(run([spread("s1", [textEl("t", "דנה\nויוסי", [10, 3, 30, 6])])], {}).map((i) => i.params)).toEqual([{ fold: 0 }]);
  });

  it("checks a turned text by its turned extent", () => {
    // 30×20 single page, 0.5 cm margin (2.5% of the height). 20 letters at 40pt: 9 cm wide, 0.75 cm
    // high, centred 3 cm from the top. Upright it's well inside; turned 90° it stands 9 cm tall
    // around that same point and runs off the top.
    const album = { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5 };
    const line = textEl("t", "א".repeat(20), [10, 10, 80, 10]);
    expect(run([spread("s1", [line])], {}, {}, album)).toEqual([]);
    expect(run([spread("s1", [{ ...line, rotation: 90 }])], {}, {}, album).map((i) => i.params)).toEqual([{ fold: 0 }]);
    // A small turn keeps it inside.
    expect(run([spread("s1", [{ ...line, rotation: 5 }])], {}, {}, album)).toEqual([]);
  });
});

describe("textInkBox with a turn", () => {
  const page = { widthCm: 30, heightCm: 20 };
  const line = textEl("t", "א".repeat(20), [10, 10, 80, 10]);
  const cm = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ w: ((b.x1 - b.x0) / 100) * page.widthCm, h: ((b.y1 - b.y0) / 100) * page.heightCm });

  it("no turn (missing, 0 or not a number) is the upright box", () => {
    const upright = textInkBox(line, page);
    expect(textInkBox({ ...line, rotation: 0 }, page)).toEqual(upright);
    expect(textInkBox({ ...line, rotation: Number.NaN }, page)).toEqual(upright);
  });

  it("turns in cm, not in %: 90° swaps the printed width and height around the box's center", () => {
    const upright = textInkBox(line, page)!;
    const turned = textInkBox({ ...line, rotation: 90 }, page)!;
    expect(cm(turned).w).toBeCloseTo(cm(upright).h, 6);
    expect(cm(turned).h).toBeCloseTo(cm(upright).w, 6);
    // Same center: the box's (50%, 15%).
    expect((turned.x0 + turned.x1) / 2).toBeCloseTo(50, 6);
    expect((turned.y0 + turned.y1) / 2).toBeCloseTo(15, 6);
  });

  it("turns clockwise around the box's center, not the ink's", () => {
    // Left-aligned, the ink runs 3–12 cm across, 3–12 cm left of the box's center (15 cm, 3 cm). A
    // clockwise quarter turn stands it 3–12 cm above that center: from -9 cm to 0 cm (-45% to 0%),
    // 0.75 cm wide around x = 15 cm.
    const left = { ...line, align: "left" as const };
    const turned = textInkBox({ ...left, rotation: 90 }, page)!;
    expect(turned.y0).toBeCloseTo(-45, 6);
    expect(turned.y1).toBeCloseTo(0, 6);
    expect(turned.x0).toBeCloseTo(50 - 1.25, 6);
    expect(turned.x1).toBeCloseTo(50 + 1.25, 6);
    // Counter-clockwise takes it below: 6–15 cm.
    const back = textInkBox({ ...left, rotation: -90 }, page)!;
    expect(back.y0).toBeCloseTo(30, 6);
    expect(back.y1).toBeCloseTo(75, 6);
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
      { a: { aspect: 1.7 } }
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
  it("applies the swaps first, a frame takes one fix, and only the pages it changes", () => {
    const a = photoEl("a", "p", [10, 10, 30, 60], { focalY: 100 });
    const b = photoEl("b", "q", [50, 10, 30, 60]);
    const spreads = [spread("s1", [a, b, textEl("t", "x", [60, 10, 10, 10])]), spread("s2", [photoEl("c", "r", [10, 10, 30, 40])])];
    const issues: QualityIssue[] = [
      { id: "h", kind: "head-cut", severity: "error", spreadId: "s1", pageIndex: 0, elementId: "a", params: {}, fix: { patches: [{ elementId: "a", patch: { focalY: 0 } }] } },
      {
        id: "c",
        kind: "heavy-crop",
        severity: "warning",
        spreadId: "s1",
        pageIndex: 0,
        elementId: "a",
        params: {},
        fix: { patches: [{ elementId: "a", patch: { photoId: "q", focalY: 40 } }, { elementId: "b", patch: { photoId: "p", focalY: 40 } }] },
      },
      { id: "gone", kind: "head-cut", severity: "error", spreadId: "s1", pageIndex: 0, elementId: "zz", params: {}, fix: { patches: [{ elementId: "zz", patch: { focalY: 0 } }] } },
    ];
    const out = qualityFixPatches(spreads, issues);
    expect([...out.keys()]).toEqual(["s1"]);
    expect(out.get("s1")![0]).toEqual({ ...a, photoId: "q", focalY: 40 });
    expect(out.get("s1")![1]).toEqual({ ...b, photoId: "p", focalY: 40 });
    expect(out.get("s1")![2]).toBe(spreads[0].elements![2]);
  });
});

describe("undo (owner 2026-10-21: \"תוסיף אפשרות לביטול השינויים\")", () => {
  const a = photoEl("a", "p", [10, 10, 30, 60], { focalY: 100 });
  const b = photoEl("b", "q", [50, 10, 30, 60]);
  const before = [spread("s1", [a, b]), spread("s2", [photoEl("c", "r", [10, 10, 30, 40])])];
  const patched = new Map([["s1", [{ ...a, focalY: 0 }, { ...b, photoId: "z" }]]]);
  const after = [spread("s1", patched.get("s1")!), before[1]];

  it("puts back every frame the fixes changed", () => {
    const record = undoRecord(before, patched, 1);
    expect(record.frames.map((f) => f.after.id)).toEqual(["a", "b"]);
    const { patched: undone, restored, kept } = applyUndo(after, record);
    expect(undone.get("s1")).toEqual([a, b]);
    expect([restored, kept]).toEqual([2, 0]);
  });

  it("keeps a frame edited since the fix, and undoes the rest", () => {
    const record = undoRecord(before, patched, 1);
    const edited = [spread("s1", [{ ...a, focalY: 0, xPct: 12 }, { ...b, photoId: "z" }]), before[1]];
    const { patched: undone, restored, kept } = applyUndo(edited, record);
    expect(undone.get("s1")).toEqual([{ ...a, focalY: 0, xPct: 12 }, b]);
    expect([restored, kept]).toEqual([1, 1]);
  });

  it("counts a frame deleted since as kept, and changes nothing when there's nothing to undo", () => {
    const record = undoRecord(before, patched, 1);
    const { patched: undone, restored, kept } = applyUndo([spread("s1", []), before[1]], record);
    expect(undone.size).toBe(0);
    expect([restored, kept]).toEqual([0, 2]);
  });
});
