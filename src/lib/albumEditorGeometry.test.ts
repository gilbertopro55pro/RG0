import { describe, expect, it } from "vitest";
import {
  duplicatedText,
  scaleTextBox,
  SHAPE_BEHIND_COLOR,
  SHAPE_BEHIND_OPACITY,
  clampGroupDelta,
  computeMoveAlignment,
  freeLayerId,
  groupBounds,
  layerBox,
  moveShapeAroundPhotos,
  pageSizeOf,
  resizeSnapTargets,
  resizeWithinPage,
  shapeBehindPhotos,
  snapResizeBox,
} from "@/lib/albumEditorGeometry";
import type { AlbumElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "@/lib/types";

// The free album editor's admin tools (AlbumSpreadCanvasEditor.tsx, "עדכון אדמין" 2026-10-20): a
// white 35% rectangle behind a group of photos, moving a shape under/over the photos, snapping a
// moved selection, and each page's own size in the page strip.

const photo = (id: string, xPct: number, yPct: number, widthPct: number, heightPct: number): AlbumPhotoElement => ({
  id,
  type: "photo",
  photoId: `p-${id}`,
  xPct,
  yPct,
  widthPct,
  heightPct,
  focalX: 50,
  focalY: 50,
});
const shape = (id: string, xPct: number, yPct: number, widthPct: number, heightPct: number): AlbumShapeElement => ({
  id,
  type: "shape",
  xPct,
  yPct,
  widthPct,
  heightPct,
  color: "#2e3142",
});
const text = (id: string): AlbumTextElement => ({ id, type: "text", text: "שלום", xPct: 10, yPct: 80, widthPct: 30, fontSize: 40, color: "white", align: "center" });
const ids = (els: AlbumElement[]) => els.map((e) => e.id);
const PAGE_60x30 = { width_cm: 60, height_cm: 30 };

describe("layerBox / groupBounds", () => {
  it("gives a text element without a height the editor's 15% fallback", () => {
    expect(layerBox(text("t")).bottom).toBe(95);
  });

  it("wraps every box", () => {
    expect(groupBounds([photo("a", 10, 20, 20, 30), photo("b", 40, 10, 10, 10)])).toEqual({ xPct: 10, yPct: 10, widthPct: 40, heightPct: 40 });
  });
});

describe("shapeBehindPhotos", () => {
  const els: AlbumElement[] = [shape("bg", 0, 0, 100, 100), photo("a", 20, 20, 20, 30), text("t"), photo("b", 45, 25, 20, 30), photo("c", 80, 10, 10, 10)];

  it("adds a white 35% rectangle without a border, 0.7 cm past the selected photos on every side", () => {
    const next = shapeBehindPhotos(els, ["a", "b"], PAGE_60x30, "new")!;
    const added = next.find((e) => e.id === "new") as AlbumShapeElement;
    expect(added).toMatchObject({ type: "shape", color: SHAPE_BEHIND_COLOR, opacity: SHAPE_BEHIND_OPACITY, rotation: 0 });
    expect(SHAPE_BEHIND_COLOR).toBe("#ffffff");
    expect(SHAPE_BEHIND_OPACITY).toBe(35);
    expect(added.borderWidth).toBeUndefined();
    expect(added.maskId).toBeUndefined();
    expect(added.shapeStyle).toBeUndefined();
    // 0.7 cm is 0.7/60 of the width and 0.7/30 of the height: the same real distance on both axes.
    const padX = (0.7 / 60) * 100;
    const padY = (0.7 / 30) * 100;
    expect(added.xPct).toBeCloseTo(20 - padX, 9);
    expect(added.yPct).toBeCloseTo(20 - padY, 9);
    expect(added.xPct + added.widthPct).toBeCloseTo(65 + padX, 9);
    expect(added.yPct + added.heightPct).toBeCloseTo(55 + padY, 9);
  });

  it("goes just under the lowest selected photo: under the group, above what was under it", () => {
    const next = shapeBehindPhotos(els, ["b", "a"], PAGE_60x30, "new")!;
    expect(ids(next)).toEqual(["bg", "new", "a", "t", "b", "c"]);
    const onlyB = shapeBehindPhotos(els, ["b"], PAGE_60x30, "new")!;
    expect(ids(onlyB)).toEqual(["bg", "a", "t", "new", "b", "c"]);
  });

  it("stays on the page when the photos reach its edge", () => {
    const edge = [photo("a", 0, 0, 50, 100)];
    const added = shapeBehindPhotos(edge, ["a"], PAGE_60x30, "new")![0] as AlbumShapeElement;
    expect(added.xPct).toBe(0);
    expect(added.yPct).toBe(0);
    expect(added.heightPct).toBe(100);
    expect(added.widthPct).toBeCloseTo(50 + (0.7 / 60) * 100, 9);
  });

  it("does nothing without a selected photo", () => {
    expect(shapeBehindPhotos(els, [], PAGE_60x30, "new")).toBeNull();
    expect(shapeBehindPhotos(els, ["t", "bg"], PAGE_60x30, "new")).toBeNull();
  });

  it("leaves the other elements untouched", () => {
    const next = shapeBehindPhotos(els, ["a"], PAGE_60x30, "new")!;
    expect(next.filter((e) => e.id !== "new")).toEqual(els);
  });
});

describe("freeLayerId", () => {
  it("picks the first id no element on the page has", () => {
    expect(freeLayerId([], "shape-behind")).toBe("shape-behind-1");
    const els: AlbumElement[] = [shape("shape-behind-1", 0, 0, 10, 10), shape("shape-behind-3", 0, 0, 10, 10)];
    expect(freeLayerId(els, "shape-behind")).toBe("shape-behind-2");
    const added = shapeBehindPhotos([photo("a", 0, 0, 10, 10), ...els], ["a"], PAGE_60x30, freeLayerId(els, "shape-behind"))!;
    expect(new Set(ids(added)).size).toBe(added.length);
  });
});

describe("moveShapeAroundPhotos", () => {
  // z-order: later = on top. s1 overlaps a and b; far overlaps nothing.
  const els: AlbumElement[] = [photo("x", 70, 70, 10, 10), photo("a", 10, 10, 20, 20), text("t"), photo("b", 25, 15, 20, 20), shape("s1", 5, 5, 45, 35), shape("far", 90, 0, 5, 5)];

  it("sends a shape under every photo it overlaps, in one step", () => {
    expect(ids(moveShapeAroundPhotos(els, "s1", "below"))).toEqual(["x", "s1", "a", "t", "b", "far"]);
  });

  it("brings it back over all of them", () => {
    const below = moveShapeAroundPhotos(els, "s1", "below");
    expect(ids(moveShapeAroundPhotos(below, "s1", "above"))).toEqual(["x", "a", "t", "b", "s1", "far"]);
  });

  it("puts it right after the top overlapping photo, under layers above that (text)", () => {
    const mixed: AlbumElement[] = [shape("s1", 5, 5, 45, 35), photo("a", 10, 10, 20, 20), photo("b", 25, 15, 20, 20), text("t")];
    expect(ids(moveShapeAroundPhotos(mixed, "s1", "above"))).toEqual(["a", "b", "s1", "t"]);
  });

  it("lifts a shape sitting between two of its photos", () => {
    const between: AlbumElement[] = [photo("a", 10, 10, 20, 20), shape("s1", 5, 5, 45, 35), photo("b", 25, 15, 20, 20)];
    expect(ids(moveShapeAroundPhotos(between, "s1", "below"))).toEqual(["s1", "a", "b"]);
    expect(ids(moveShapeAroundPhotos(between, "s1", "above"))).toEqual(["a", "b", "s1"]);
  });

  it("uses every photo on the page for a shape that overlaps none", () => {
    expect(ids(moveShapeAroundPhotos(els, "far", "below"))).toEqual(["far", "x", "a", "t", "b", "s1"]);
  });

  it("returns the same array when there's nothing to change", () => {
    const below = moveShapeAroundPhotos(els, "s1", "below");
    expect(moveShapeAroundPhotos(below, "s1", "below")).toBe(below);
    expect(moveShapeAroundPhotos(els, "far", "above")).toBe(els);
    expect(moveShapeAroundPhotos(els, "a", "below")).toBe(els); // not a shape
    expect(moveShapeAroundPhotos(els, "missing", "below")).toBe(els);
    const noPhotos: AlbumElement[] = [shape("s1", 0, 0, 10, 10), text("t")];
    expect(moveShapeAroundPhotos(noPhotos, "s1", "below")).toBe(noPhotos);
  });

  it("keeps every element", () => {
    const next = moveShapeAroundPhotos(els, "s1", "below");
    expect([...ids(next)].sort()).toEqual([...ids(els)].sort());
  });
});

describe("computeMoveAlignment", () => {
  const T = 1.2;
  const neighbour = photo("n", 50, 20, 20, 30); // left 50, right 70, top 20, bottom 50, center 60/35

  it("snaps a left edge flush against a neighbour's right edge", () => {
    const r = computeMoveAlignment({ xPct: 70.8, yPct: 60, widthPct: 10, heightPct: 10 }, [neighbour], T);
    expect(r.snapXPct).toBeCloseTo(70, 9);
    expect(r.guides).toContainEqual({ axis: "v", pos: 70 });
  });

  it("snaps a right edge flush against a neighbour's left edge", () => {
    const r = computeMoveAlignment({ xPct: 29.5, yPct: 60, widthPct: 20, heightPct: 10 }, [neighbour], T);
    expect(r.snapXPct).toBeCloseTo(30, 9);
  });

  it("snaps a top edge under a neighbour's bottom edge, and lines up same edges", () => {
    const r = computeMoveAlignment({ xPct: 50.6, yPct: 50.9, widthPct: 20, heightPct: 10 }, [neighbour], T);
    expect(r.snapYPct).toBeCloseTo(50, 9);
    expect(r.snapXPct).toBeCloseTo(50, 9);
    expect(r.guides).toEqual(expect.arrayContaining([{ axis: "h", pos: 50 }, { axis: "v", pos: 50 }, { axis: "v", pos: 70 }]));
  });

  it("takes the nearest line, not the first one found", () => {
    // left 30.9 is 0.9 from the far photo's right edge (30) and 0.3 from the near one's left (31.2).
    const far = photo("far", 10, 0, 20, 10);
    const near = photo("near", 31.2, 80, 10, 10);
    const r = computeMoveAlignment({ xPct: 30.9, yPct: 40, widthPct: 5, heightPct: 5 }, [far, near], T);
    expect(r.snapXPct).toBeCloseTo(31.2, 9);
  });

  it("centers on the page", () => {
    const r = computeMoveAlignment({ xPct: 39.5, yPct: 30.4, widthPct: 20, heightPct: 40 }, [], T);
    expect(r.snapXPct).toBeCloseTo(40, 9);
    expect(r.snapYPct).toBeCloseTo(30, 9);
    expect(r.guides).toEqual([{ axis: "v", pos: 50 }, { axis: "h", pos: 50 }]);
  });

  it("does not snap outside the threshold", () => {
    const r = computeMoveAlignment({ xPct: 72, yPct: 60, widthPct: 5, heightPct: 5 }, [neighbour], T);
    expect(r.snapXPct).toBeUndefined();
    expect(r.snapYPct).toBeUndefined();
    expect(r.guides).toEqual([]);
  });
});

describe("clampGroupDelta", () => {
  const bounds = { xPct: 10, yPct: 20, widthPct: 50, heightPct: 60 };

  it("lets the group move freely inside the page", () => {
    expect(clampGroupDelta(bounds, 5, -5)).toEqual({ dx: 5, dy: -5 });
  });

  it("stops the whole group at the page edge, one delta for every member", () => {
    expect(clampGroupDelta(bounds, -30, 50)).toEqual({ dx: -10, dy: 20 });
    expect(clampGroupDelta(bounds, 80, -40)).toEqual({ dx: 40, dy: -20 });
  });

  it("keeps the members' relative positions exactly", () => {
    const members = [photo("a", 10, 20, 20, 20), photo("b", 35, 50, 25, 30)];
    const { dx, dy } = clampGroupDelta(groupBounds(members), 90, 3);
    const moved = members.map((m) => ({ x: m.xPct + dx, y: m.yPct + dy }));
    expect(moved[1].x - moved[0].x).toBe(25);
    expect(moved[1].y - moved[0].y).toBe(30);
    expect(moved[1].x + 25).toBeLessThanOrEqual(100);
  });

  it("never pushes a member that's already past an edge further out, nor yanks it back in", () => {
    const bleeding = { xPct: -5, yPct: 10, widthPct: 30, heightPct: 30 };
    expect(clampGroupDelta(bleeding, -3, 0).dx).toBe(0);
    expect(clampGroupDelta(bleeding, 4, 0).dx).toBe(4);
  });
});

describe("pageSizeOf", () => {
  const book = { width_cm: 60, height_cm: 30 };

  it("gives a page with its own size (a square cover) that size", () => {
    expect(pageSizeOf({ width_cm: 32, height_cm: 32 }, book)).toEqual({ width_cm: 32, height_cm: 32 });
  });

  it("gives every other page the album's size", () => {
    expect(pageSizeOf({ width_cm: null, height_cm: null }, book)).toBe(book);
    expect(pageSizeOf({ width_cm: 32, height_cm: null }, book)).toBe(book);
  });
});

describe("resizeWithinPage", () => {
  const box = { xPct: 40, yPct: 20, widthPct: 30, heightPct: 40 };

  it("keeps the opposite corner fixed", () => {
    const r = resizeWithinPage("ne", box, 5, -5);
    expect(r).toEqual({ xPct: 40, yPct: 15, widthPct: 35, heightPct: 45 });
    expect(r.yPct + r.heightPct).toBe(60);
  });

  it("stops a top-right corner at the page edge without stretching the bottom (the owner's bug)", () => {
    const r = resizeWithinPage("ne", box, 80, -80);
    expect(r.yPct).toBe(0);
    expect(r.yPct + r.heightPct).toBe(60);
    expect(r.xPct).toBe(40);
    expect(r.xPct + r.widthPct).toBe(100);
  });

  it("stops a left edge at the page edge with the right edge fixed", () => {
    const r = resizeWithinPage("w", box, -90, 0);
    expect(r.xPct).toBe(0);
    expect(r.xPct + r.widthPct).toBe(70);
    expect(r.heightPct).toBe(40);
  });

  it("keeps the proportions at the page edge when the aspect is locked", () => {
    const r = resizeWithinPage("se", box, 0, 90, { lockAspect: true });
    expect(r.yPct + r.heightPct).toBeCloseTo(100);
    expect(r.widthPct / r.heightPct).toBeCloseTo(30 / 40);
    expect(r.xPct).toBe(40);
    expect(r.yPct).toBe(20);
  });

  it("locks the aspect against the nearer edge too", () => {
    // Growing the bottom-right: the right edge (30% of room) runs out before the bottom does.
    const r = resizeWithinPage("se", { xPct: 60, yPct: 10, widthPct: 20, heightPct: 20 }, 50, 50, { lockAspect: true });
    expect(r.xPct + r.widthPct).toBeCloseTo(100);
    expect(r.widthPct).toBeCloseTo(r.heightPct);
  });

  it("grows around the center with Alt and stops when the nearer side reaches the edge", () => {
    const r = resizeWithinPage("e", box, 50, 0, { symmetric: true });
    // center 55: the right side has 45% of room, the left 55%.
    expect(r.xPct + r.widthPct / 2).toBeCloseTo(55);
    expect(r.xPct + r.widthPct).toBeCloseTo(100);
  });

  it("never shrinks below the minimum", () => {
    expect(resizeWithinPage("se", box, -100, -100)).toMatchObject({ xPct: 40, yPct: 20, widthPct: 8, heightPct: 6 });
  });

  it("never yanks a box that already reaches past an edge back in", () => {
    const bled = { xPct: -2, yPct: 0, widthPct: 52, heightPct: 100 };
    const r = resizeWithinPage("w", bled, -5, 0);
    expect(r).toEqual(bled);
    expect(resizeWithinPage("w", bled, 10, 0).xPct).toBe(8);
  });
});

describe("snapResizeBox", () => {
  const margin = { x: 2, y: 4 };
  const targets = resizeSnapTargets([photo("n", 75, 10, 20, 30)], margin);

  it("snaps a stretched edge onto the green frame", () => {
    const r = snapResizeBox("e", { xPct: 40, yPct: 20, widthPct: 57.5, heightPct: 40 }, targets, 1.2);
    expect(r.box.xPct + r.box.widthPct).toBe(98);
    expect(r.box.xPct).toBe(40);
    expect(r.hitX).toBe(98);
    expect(r.guides).toEqual([{ axis: "v", pos: 98 }]);
  });

  it("snaps both edges of a diagonal drag, each on its own", () => {
    const r = snapResizeBox("nw", { xPct: 2.8, yPct: 3.5, widthPct: 37.2, heightPct: 56.5 }, targets, 1.2);
    expect(r.box).toEqual({ xPct: 2, yPct: 4, widthPct: 38, heightPct: 56 });
    expect(r.hitX).toBe(2);
    expect(r.hitY).toBe(4);
  });

  it("snaps onto a neighbour's edge", () => {
    const r = snapResizeBox("e", { xPct: 40, yPct: 50, widthPct: 34.4, heightPct: 20 }, targets, 1.2);
    expect(r.box.xPct + r.box.widthPct).toBe(75);
  });

  it("takes the nearest line, not the first", () => {
    const t = { x: [50, 51], y: [] };
    const r = snapResizeBox("e", { xPct: 10, yPct: 10, widthPct: 40.8, heightPct: 10 }, t, 1.2);
    expect(r.box.xPct + r.box.widthPct).toBe(51);
  });

  it("keeps the proportions with a locked aspect: the nearer snap wins and the other side follows", () => {
    const b = { xPct: 40, yPct: 20, widthPct: 57.6, heightPct: 43.2 };
    const r = snapResizeBox("se", b, targets, 1.2, { lockAspect: true });
    expect(r.box.xPct + r.box.widthPct).toBeCloseTo(98);
    expect(r.box.widthPct / r.box.heightPct).toBeCloseTo(57.6 / 43.2);
    expect(r.box.xPct).toBe(40);
    expect(r.box.yPct).toBe(20);
  });

  it("leaves the box alone with nothing in reach", () => {
    const b = { xPct: 30, yPct: 30, widthPct: 20.1, heightPct: 20.2 };
    expect(snapResizeBox("se", b, { x: [0, 100], y: [0, 100] }, 1.2)).toEqual({ box: b, guides: [], hitX: undefined, hitY: undefined });
  });
});

describe("text corner controls", () => {
  const start = { xPct: 20, yPct: 40, widthPct: 40, heightPct: 10, fontSize: 40 };

  it("scales the letters and the box together around the center", () => {
    const r = scaleTextBox(start, 80);
    expect(r).toEqual({ xPct: 0, yPct: 35, widthPct: 80, heightPct: 20, fontSize: 80 });
    expect(r.xPct + r.widthPct / 2).toBe(40);
    expect(r.yPct + r.heightPct / 2).toBe(45);
  });

  it("keeps the font in the slider's range and the box with it", () => {
    const big = scaleTextBox(start, 1000);
    expect(big.fontSize).toBe(250);
    expect(big.widthPct).toBeCloseTo(250);
    const small = scaleTextBox(start, 0.5);
    expect(small.fontSize).toBe(2);
    expect(small.heightPct).toBeCloseTo(0.5);
  });

  it("copies a text a little aside, on the page and unlocked", () => {
    const el = { id: "t1", type: "text" as const, text: "שלום", xPct: 10, yPct: 20, widthPct: 30, heightPct: 10, fontSize: 40, color: "#000", align: "center" as const, rotation: 15, locked: true };
    const copy = duplicatedText(el, "t2");
    expect(copy).toMatchObject({ id: "t2", text: "שלום", xPct: 13, yPct: 23, rotation: 15, locked: false });
    const edge = duplicatedText({ ...el, xPct: 69, yPct: 89 }, "t3");
    expect(edge.xPct).toBe(70);
    expect(edge.yPct).toBe(90);
  });
});
