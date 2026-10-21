import { describe, expect, it } from "vitest";
import { ownTemplatePlan } from "@/lib/albumAuto/templateFill";
import type { AlbumFrame } from "@/lib/types";

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
