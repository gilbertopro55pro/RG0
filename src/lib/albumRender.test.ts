import { describe, expect, it } from "vitest";
import { shadowColorRgb, textEffectsCss, textShadowDistance, textShadowSpecs } from "@/lib/albumRender";

// The drop shadow exactly as it was drawn before a text element could have its own shadow color
// and distance (2026-10-21): offset s*6 on both axes, blur s*15, black, alpha 0.2 + 0.5s.
function legacyDropShadow(shadow: number) {
  const s = shadow / 100;
  return { dx: s * 6, dy: s * 6, blur: s * 15, rgb: [0, 0, 0], alpha: 0.2 + s * 0.5 };
}

describe("textShadowSpecs", () => {
  it("draws text saved without a shadow color or distance exactly as before", () => {
    for (const shadow of [1, 7, 25, 33, 50, 60, 77, 99, 100]) {
      expect(textShadowSpecs({ color: "#ffffff", shadow })).toEqual([legacyDropShadow(shadow)]);
      expect(textShadowSpecs({ color: "#000000", shadow, glow: 40 })).toEqual([
        legacyDropShadow(shadow),
        { dx: 0, dy: 0, blur: 3 + 0.4 * 27, rgb: [255, 255, 255], alpha: 0.35 + 0.4 * 0.55 },
      ]);
    }
  });

  it("keeps the CSS of an existing shadow character for character", () => {
    expect(textEffectsCss({ color: "#ffffff", shadow: 60 })).toEqual({
      textShadow: "calc(3.60 / 1600 * 100cqw) calc(3.60 / 1600 * 100cqw) calc(9.00 / 1600 * 100cqw) rgba(0,0,0,0.500)",
    });
    expect(textEffectsCss({ color: "#d4af37", shadow: 100, strokeWidth: 3, strokeColor: "#a44a3f" })).toEqual({
      textShadow: "calc(6.00 / 1600 * 100cqw) calc(6.00 / 1600 * 100cqw) calc(15.00 / 1600 * 100cqw) rgba(0,0,0,0.700)",
      WebkitTextStroke: "calc(6.00 / 1600 * 100cqw) #a44a3f",
      paintOrder: "stroke fill",
    });
  });

  it("keeps the default contrast shadow when there is no shadow, whatever the color and distance", () => {
    const plain = textShadowSpecs({ color: "#ffffff" });
    expect(plain).toEqual([{ dx: 0, dy: 1.5, blur: 6, rgb: [0, 0, 0], alpha: 0.7 }]);
    expect(textShadowSpecs({ color: "#ffffff", shadow: 0, shadowColor: "#d4af37", shadowDistance: 30 })).toEqual(plain);
  });

  it("uses the chosen shadow color, and leaves the glow white", () => {
    const [shadow, glow] = textShadowSpecs({ color: "#ffffff", shadow: 60, shadowColor: "#d4af37", glow: 20 });
    expect(shadow).toEqual({ ...legacyDropShadow(60), rgb: [212, 175, 55] });
    expect(glow.rgb).toEqual([255, 255, 255]);
    expect(textEffectsCss({ color: "#ffffff", shadow: 60, shadowColor: "#d4af37" }).textShadow).toContain("rgba(212,175,55,0.500)");
  });

  it("uses the chosen distance on both axes, with the intensity's own blur and opacity", () => {
    const [shadow] = textShadowSpecs({ color: "#ffffff", shadow: 40, shadowDistance: 30 });
    expect(shadow).toEqual({ ...legacyDropShadow(40), dx: 30, dy: 30 });
    expect(textEffectsCss({ color: "#ffffff", shadow: 40, shadowDistance: 30 }).textShadow).toBe(
      "calc(30.00 / 1600 * 100cqw) calc(30.00 / 1600 * 100cqw) calc(6.00 / 1600 * 100cqw) rgba(0,0,0,0.400)"
    );
  });

  it("draws a distance of 0 right under the text, still blurred", () => {
    const [shadow] = textShadowSpecs({ color: "#ffffff", shadow: 100, shadowDistance: 0, shadowColor: "#5b7c99" });
    expect(shadow).toEqual({ dx: 0, dy: 0, blur: 15, rgb: [91, 124, 153], alpha: 0.7 });
  });

  it("falls back to black for a color it can't read", () => {
    for (const shadowColor of ["banana", "#12345", "#gggggg", "", "white", "rgb(1,2,3)", "d4af37"]) {
      expect(textShadowSpecs({ color: "#ffffff", shadow: 50, shadowColor })[0].rgb).toEqual([0, 0, 0]);
    }
  });
});

describe("shadowColorRgb", () => {
  it("reads #rrggbb and #rgb in any case", () => {
    expect(shadowColorRgb("#A44A3F")).toEqual([164, 74, 63]);
    expect(shadowColorRgb("#fff")).toEqual([255, 255, 255]);
    expect(shadowColorRgb(" #000000 ")).toEqual([0, 0, 0]);
    expect(shadowColorRgb(undefined)).toEqual([0, 0, 0]);
  });
});

describe("textShadowDistance", () => {
  it("follows the intensity until a distance is set", () => {
    expect(textShadowDistance({ shadow: 50 })).toBe(3);
    expect(textShadowDistance({})).toBe(0);
    expect(textShadowDistance({ shadow: 50, shadowDistance: 12 })).toBe(12);
    expect(textShadowDistance({ shadow: 50, shadowDistance: 0 })).toBe(0);
  });

  it("never offsets the shadow backwards, and ignores a distance that isn't a number", () => {
    expect(textShadowDistance({ shadow: 50, shadowDistance: -8 })).toBe(0);
    expect(textShadowDistance({ shadow: 50, shadowDistance: Number.NaN })).toBe(3);
  });
});
