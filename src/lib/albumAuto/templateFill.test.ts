import { describe, expect, it } from "vitest";
import { fadeOwnHeroes, ownTemplatePlan, tidyOwnFrames } from "@/lib/albumAuto/templateFill";
import type { AlbumFrame, AlbumPhotoElement } from "@/lib/types";

// The photographer's own templates in the automatic design (owner, 2026-10-06: 70% theirs), and the
// 1.8 crop limit measured on the frames as printed: the album fits them into the safe margin, which
// on a 60×30 spread squeezes them 3% more in height than in width (the quality check found a 1.86
// crop, 2026-10-21).

// Two frames square on the 60×30 spread before the fit, with a border (so they're fitted, not bleed).
const square = (x: number, extra: Partial<AlbumFrame> = {}): AlbumFrame => ({ id: `f${x}`, xPct: x, yPct: 10, widthPct: 20, heightPct: 40, borderWidth: 3, ...extra });
const portraits = [
  { id: "a", aspect: 0.56 },
  { id: "b", aspect: 0.56 },
];

describe("ownTemplatePlan", () => {
  it("takes a template that crops 1.79 before the fit when there's no margin", () => {
    const tpl = [square(10), square(60)];
    expect(ownTemplatePlan([portraits], [tpl], 60, 30)).toEqual([tpl]);
  });

  it("leaves it out when the safe margin makes the crop 1.84, past the 1.8 limit", () => {
    const tpl = [square(10), square(60)];
    expect(ownTemplatePlan([portraits], [tpl], 60, 30, { marginCm: 0.9 })).toEqual([null]);
  });

  it("measures a frame that bleeds off the page as it is (it isn't fitted)", () => {
    const tpl = [square(0, { borderWidth: 0, yPct: 0 }), square(60, { borderWidth: 0, yPct: 60 })];
    expect(ownTemplatePlan([portraits], [tpl], 60, 30, { marginCm: 0.9 })).toEqual([tpl]);
  });

  it("keeps the 70% share", () => {
    const tpl = [square(10), square(60)];
    const pages = Array.from({ length: 10 }, () => portraits);
    expect(ownTemplatePlan(pages, [tpl, [square(15), square(55)]], 60, 30).filter(Boolean)).toHaveLength(7);
  });
});

// The owner's corrections to "עלייה לתורה - אורי" (2026-10-21), as rules on their own templates.
const fr = (id: string, x: number, y: number, w: number, h: number, extra: Partial<AlbumFrame> = {}): AlbumFrame => ({ id, xPct: x, yPct: y, widthPct: w, heightPct: h, borderWidth: 3, ...extra });
const box = (f: AlbumFrame) => [f.xPct, f.yPct, f.widthPct, f.heightPct].map((n) => Math.round(n * 100) / 100);

describe("tidyOwnFrames", () => {
  // Page 12 as the engine made it: a tall photo on the right, the rest 3% from the top and 17.3% from
  // the bottom, the lower-left frame's left edge 1.5% inside the one above it.
  const page12 = [
    fr("a", 1.5, 3.0, 21.8, 43.5),
    fr("b", 24.0, 28.8, 13.4, 17.4),
    fr("c", 3.0, 47.6, 27.6, 35.1),
    fr("d", 31.3, 47.6, 13.4, 26.7),
    fr("tall", 65.0, 3.0, 33.8, 94.0),
  ];

  it("centres the block beside the tall photo and lines its left edge up, as the owner did", () => {
    const out = tidyOwnFrames(page12);
    // 7.15% down; the owner moved it 7.2% (their page: 10.2, 35.9, 54.8).
    expect(box(out[0])).toEqual([1.5, 10.15, 21.8, 43.5]);
    expect(box(out[1])).toEqual([24.0, 35.95, 13.4, 17.4]);
    // x 1.5 and width 29.1 as on the owner's page (the right edge stays at 30.6).
    expect(box(out[2])).toEqual([1.5, 54.75, 29.1, 35.1]);
    expect(box(out[3])).toEqual([31.3, 54.75, 13.4, 26.7]);
    expect(box(out[4])).toEqual([65.0, 3.0, 33.8, 94.0]);
  });

  it("leaves a block that's already centred, and a page the owner kept, alone", () => {
    const centred = [fr("a", 5, 6.4, 28.8, 55.8), fr("b", 35.6, 6.4, 28.8, 55.8), fr("c", 5, 64, 16.6, 29.6), fr("d", 23.4, 64, 16.6, 29.6)];
    expect(tidyOwnFrames(centred)).toEqual(centred);
  });

  it("lines up a bottom 0.8% short of the rest of its row (page 20)", () => {
    const out = tidyOwnFrames([fr("a", 4.4, 5.8, 38.6, 43.4), fr("b", 26.6, 51.4, 22.9, 42.8), fr("c", 4.4, 51.4, 21.5, 42.0)]);
    expect(box(out[2])).toEqual([4.4, 51.4, 21.5, 42.8]);
  });

  it("doesn't move a block held by a wide photo across the page", () => {
    const tpl = [fr("wide", 6.4, 2.7, 87.1, 72.6), fr("a", 6.2, 77.3, 11.5, 20), fr("b", 19.7, 77.3, 24, 20)];
    expect(tidyOwnFrames(tpl)).toEqual(tpl);
  });

  it("leaves an edge more than 1.6% in, or one with a frame beyond it", () => {
    const inset = [fr("a", 3, 5, 30, 40), fr("b", 5, 50, 28, 45)];
    expect(tidyOwnFrames(inset)).toEqual(inset);
    // "c" sits left of "b"'s left edge, so that edge is inside the block, not its outline.
    const inner = [fr("a", 3, 5, 30, 40), fr("b", 4, 50, 29, 45), fr("c", 3, 55, 0.9, 20)];
    expect(box(tidyOwnFrames(inner)[1])).toEqual([4, 50, 29, 45]);
  });

  it("leaves rotated frames out of the block", () => {
    // The tilted frame isn't full height, so it holds the block where it is too.
    const tpl = [fr("a", 10, 2, 30, 40, { rotation: 4 }), fr("b", 50, 2, 30, 40)];
    expect(tidyOwnFrames(tpl)).toEqual(tpl);
  });
});

describe("fadeOwnHeroes", () => {
  const el = (id: string, x: number, y: number, w: number, h: number, extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement => ({
    id,
    type: "photo",
    photoId: id,
    xPct: x,
    yPct: y,
    widthPct: w,
    heightPct: h,
    focalX: 50,
    focalY: 50,
    zoom: 100,
    ...extra,
  });
  const grid = (x: number) => el("g", x, 20, 17, 45, { borderWidth: 3 });

  it("fades a main photo the frames start just over (pages 2 and 5)", () => {
    const [left] = fadeOwnHeroes([el("h", 0, 0, 33.5, 100), grid(32.2)]);
    expect(left.maskId).toBe("fade-right-25");
    const [right] = fadeOwnHeroes([el("h", 68.2, 0, 31.8, 100), el("g", 50, 22.4, 19.5, 55.2, { borderWidth: 3 })]);
    expect(right.maskId).toBe("fade-left-25");
  });

  it("leaves a main photo the frames sit well over (pages 11, 14, 17)", () => {
    expect(fadeOwnHeroes([el("h", 0, 0, 38.2, 100), grid(32.6)])[0].maskId).toBeUndefined();
  });

  it("fades only the photo on top where two main photos meet (page 5)", () => {
    const out = fadeOwnHeroes([el("back", 24.9, 0, 75.1, 100), grid(30.9), el("front", 0, 0, 32.9, 100)]);
    expect(out[0].maskId).toBeUndefined();
    expect(out[2].maskId).toBe("fade-right-25");
  });

  it("leaves framed photos and full-spread photos alone", () => {
    expect(fadeOwnHeroes([el("h", 0, 0, 33.5, 100, { borderWidth: 3 }), grid(32.2)])[0].maskId).toBeUndefined();
    expect(fadeOwnHeroes([el("h", 0, 0, 100, 100), grid(32.2)])[0].maskId).toBeUndefined();
  });
});
