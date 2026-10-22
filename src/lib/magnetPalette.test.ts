import { describe, expect, it } from "vitest";
import { contrastRatio, extractPalette, hexToRgb, rgbToHex, suggestFrameColors } from "@/lib/magnetPalette";

// An RGBA image made of blocks: [hex, pixel count].
function image(blocks: [string, number][], alpha = 255): number[] {
  const out: number[] = [];
  for (const [hex, n] of blocks) {
    const [r, g, b] = hexToRgb(hex);
    for (let i = 0; i < n; i++) out.push(r, g, b, alpha);
  }
  return out;
}

const near = (a: string, b: string) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 12;
};

describe("colors from the invitation", () => {
  it("finds the invitation's colors, most common first", () => {
    // Cream paper, navy text, a gold accent, a little blush.
    const palette = extractPalette(image([["#f4ede1", 6000], ["#1c2a4a", 1500], ["#c9a84c", 600], ["#e8b4b8", 300]]));
    expect(near(palette[0], "#f4ede1")).toBe(true);
    expect(near(palette[1], "#1c2a4a")).toBe(true);
    for (const c of ["#c9a84c", "#e8b4b8"]) expect(palette.some((p) => near(p, c))).toBe(true);
  });

  it("merges near-identical shades and ignores transparent pixels", () => {
    const shades = image([["#f4ede1", 3000], ["#f2ebdf", 3000], ["#1c2a4a", 1000]]);
    const palette = extractPalette([...shades, ...image([["#ff0000", 5000]], 0)]);
    expect(palette).toHaveLength(2);
    expect(palette.some((p) => near(p, "#ff0000"))).toBe(false);
  });

  it("is the same every time, and empty for an empty image", () => {
    const img = image([["#7a1f2b", 900], ["#f7f1e6", 2500], ["#c9a84c", 400]]);
    expect(extractPalette(img)).toEqual(extractPalette(img));
    expect(extractPalette([])).toEqual([]);
  });

  it("suggests a light mat, readable text and a saturated accent", () => {
    const s = suggestFrameColors(["#f4ede1", "#1c2a4a", "#c9a84c", "#e8b4b8"]);
    expect(s.mat).toBe("#f4ede1");
    expect(s.text).toBe("#1c2a4a");
    expect(s.accent).toBe("#c9a84c");
    expect(contrastRatio(hexToRgb(s.text), hexToRgb(s.mat))).toBeGreaterThanOrEqual(4.5);
  });

  it("a dark invitation keeps a white mat; a gray palette keeps the text as the accent", () => {
    const dark = suggestFrameColors(["#111111", "#7a1f2b", "#c9a84c"]);
    expect(dark.mat).toBe("#ffffff");
    expect(dark.text).toBe("#111111");
    const gray = suggestFrameColors(["#eeeeee", "#333333", "#999999"]);
    expect(gray.accent).toBe(gray.text);
  });

  it("converts colors both ways", () => {
    expect(rgbToHex(hexToRgb("#c9a84c"))).toBe("#c9a84c");
    expect(rgbToHex(hexToRgb("#fff"))).toBe("#ffffff");
  });
});
