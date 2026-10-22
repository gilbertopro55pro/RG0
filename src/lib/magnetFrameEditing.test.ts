import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  canMoveLayer,
  duplicateElement,
  frameSnapLines,
  historyCommit,
  historyRedo,
  historyStart,
  historyUndo,
  moveLayer,
  normalizeDeg,
  pointerAngleDeg,
  resizeFromDrag,
  snapRotation,
  snapValue,
} from "@/lib/magnetFrameEditing";
import type { MagnetFrameElement } from "@/lib/types";

// The magnet frame editor's tools (owner, 2026-10-22).
describe("history", () => {
  it("undoes and redoes in order, and a new edit drops the redo branch", () => {
    let h = historyStart("a");
    h = historyCommit(h, "b");
    h = historyCommit(h, "c");
    h = historyUndo(h);
    expect(h.present).toBe("b");
    h = historyUndo(h);
    expect(h.present).toBe("a");
    expect(historyUndo(h)).toBe(h);
    h = historyRedo(h);
    expect(h.present).toBe("b");
    h = historyCommit(h, "d");
    expect(h.future).toEqual([]);
    expect(historyRedo(h)).toBe(h);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("ignores a commit that changes nothing, and keeps at most the limit", () => {
    let h = historyStart(0);
    expect(historyCommit(h, 0)).toBe(h);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = historyCommit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
  });
});

describe("snapping", () => {
  const inset = { xPct: 9, topPct: 12, bottomPct: 22 };
  const lines = frameSnapLines(inset, [{ xPct: 30, yPct: 40 }]);

  it("offers the frame middle, the window edges and middle, the mat middles and other elements", () => {
    expect(lines.x).toEqual(expect.arrayContaining([50, 9, 91, 4.5, 95.5, 30]));
    expect(lines.y).toEqual(expect.arrayContaining([50, 12, 78, 45, 6, 89, 40]));
  });

  it("catches the nearest line within the threshold, and leaves the value alone outside it", () => {
    expect(snapValue(88.4, lines.y, 1.2)).toEqual({ value: 89, line: 89 });
    expect(snapValue(87, lines.y, 1.2)).toEqual({ value: 87, line: null });
    expect(snapValue(49.4, [50, 49], 1.2).value).toBe(49);
  });
});

describe("rotation", () => {
  it("measures the pointer angle clockwise from up", () => {
    expect(pointerAngleDeg(0, 0, 0, -10)).toBeCloseTo(0);
    expect(pointerAngleDeg(0, 0, 10, 0)).toBeCloseTo(90);
    expect(pointerAngleDeg(0, 0, -10, 0)).toBeCloseTo(-90);
  });

  it("keeps angles within -180..180 and snaps near 45° steps", () => {
    expect(normalizeDeg(270)).toBe(-90);
    expect(normalizeDeg(-190)).toBe(170);
    expect(snapRotation(43)).toBe(45);
    expect(snapRotation(38)).toBe(38);
    expect(snapRotation(-91.5)).toBe(-90);
    expect(snapRotation(22, 15)).toBe(15);
  });
});

describe("element operations", () => {
  const text = (id: string): MagnetFrameElement => ({
    id,
    type: "text",
    text: id,
    xPct: 50,
    yPct: 96,
    fontKey: "heebo",
    fontSizePx: 72,
    color: "#000000",
    bold: true,
    italic: false,
    underline: false,
    shadowEnabled: false,
    shadowBlurPx: 6,
    shadowDistancePx: 3,
    locked: true,
  });

  it("duplicates a little apart, unlocked, inside the frame", () => {
    const copy = duplicateElement(text("a"), "b");
    expect(copy).toMatchObject({ id: "b", xPct: 53, yPct: 97, locked: false, text: "a" });
  });

  it("moves layers forward, back, to the front and to the back", () => {
    const list = ["a", "b", "c", "d"].map((id) => ({ id }));
    const ids = (l: { id: string }[]) => l.map((e) => e.id).join("");
    expect(ids(moveLayer(list, "b", "forward"))).toBe("acbd");
    expect(ids(moveLayer(list, "b", "backward"))).toBe("bacd");
    expect(ids(moveLayer(list, "b", "front"))).toBe("acdb");
    expect(ids(moveLayer(list, "c", "back"))).toBe("cabd");
    expect(ids(moveLayer(list, "d", "forward"))).toBe("abcd");
    expect(canMoveLayer(list, "d", "forward")).toBe(false);
    expect(canMoveLayer(list, "a", "back")).toBe(false);
    expect(canMoveLayer(list, "b", "back")).toBe(true);
  });

  it("resizes with the pointer's distance from the center, within range", () => {
    expect(resizeFromDrag(72, 50, 100, 10, 320)).toBe(144);
    expect(resizeFromDrag(72, 50, 1000, 10, 320)).toBe(320);
    expect(resizeFromDrag(72, 50, 1, 10, 320)).toBe(10);
    expect(resizeFromDrag(72, 0, 30, 10, 320)).toBe(72);
  });
});
