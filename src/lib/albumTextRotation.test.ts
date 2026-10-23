import { describe, expect, it } from "vitest";
import { rotatedBounds, textRotationDeg, textRotationTransform } from "@/lib/albumTextRotation";

// An album text's turn (AlbumTextElement.rotation, 2026-10-23): clockwise degrees around its box's
// center, like the editor's CSS rotate on the box.

describe("textRotationDeg / textRotationTransform", () => {
  it("upright when missing, 0 or not a number, so the CSS is exactly what it was", () => {
    for (const rotation of [undefined, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(textRotationDeg({ rotation })).toBe(0);
      expect(textRotationTransform({ rotation })).toBeUndefined();
    }
  });

  it("a turn is a CSS rotate in degrees, negative too", () => {
    expect(textRotationTransform({ rotation: 15 })).toBe("rotate(15deg)");
    expect(textRotationTransform({ rotation: -32.5 })).toBe("rotate(-32.5deg)");
    expect(textRotationDeg({ rotation: 270 })).toBe(270);
  });
});

describe("rotatedBounds", () => {
  const box = { x0: 0, y0: 4, x1: 10, y1: 6 }; // 10 wide, 2 high, center (5, 5)

  it("no turn returns the box itself", () => {
    expect(rotatedBounds(box, { x: 5, y: 5 }, 0)).toBe(box);
  });

  it("a quarter turn around the center swaps width and height", () => {
    const b = rotatedBounds(box, { x: 5, y: 5 }, 90);
    expect(b.x0).toBeCloseTo(4, 9);
    expect(b.x1).toBeCloseTo(6, 9);
    expect(b.y0).toBeCloseTo(0, 9);
    expect(b.y1).toBeCloseTo(10, 9);
  });

  it("turns clockwise on screen (y down), like CSS rotate()", () => {
    // A box right of the pivot goes below it after +90°, above it after -90°.
    const right = { x0: 10, y0: -1, x1: 20, y1: 1 };
    const cw = rotatedBounds(right, { x: 0, y: 0 }, 90);
    expect(cw.y0).toBeCloseTo(10, 9);
    expect(cw.y1).toBeCloseTo(20, 9);
    const ccw = rotatedBounds(right, { x: 0, y: 0 }, -90);
    expect(ccw.y0).toBeCloseTo(-20, 9);
    expect(ccw.y1).toBeCloseTo(-10, 9);
  });

  it("45° grows a square's bounds by √2", () => {
    const b = rotatedBounds({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x: 1, y: 1 }, 45);
    expect(b.x1 - b.x0).toBeCloseTo(2 * Math.SQRT2, 9);
    expect(b.y1 - b.y0).toBeCloseTo(2 * Math.SQRT2, 9);
  });
});
