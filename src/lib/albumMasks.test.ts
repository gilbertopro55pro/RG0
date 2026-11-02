import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ALBUM_MASKS, findMask, maskCssUrl } from "@/lib/albumMasks";
import { messagesFor } from "@/i18n/dict";

// The editor's masks (owner, 2026-11-01: 20 more creative ones). Each is one SVG string, drawn as a
// CSS mask in the editor and rasterized by sharp in every export, so it must render in sharp, cover
// part of the frame and leave part of it, and be the same string every time.

const CREATIVE = [
  "shape-arch",
  "shape-arch-gothic",
  "shape-flower",
  "shape-crescent",
  "shape-scalloped",
  "shape-stamp",
  "shape-keyhole",
  "creative-brush",
  "creative-watercolor",
  "creative-deckled",
  "creative-torn-sides",
  "creative-halftone",
  "creative-pixels",
  "creative-triptych",
  "creative-four",
  "creative-sunburst",
  "creative-bokeh",
  "creative-filmstrip",
  "creative-cameo",
  "pattern-hearts",
];

// Six more from the owner's reference album (a bat mitzvah book, 2026-11-02), right after those.
const REFERENCE = ["shape-hexagon-rounded", "shape-circle-ring", "creative-grunge", "creative-arc-right", "creative-arc-left", "soft-edge-narrow"];

// The mask's alpha at w×h, rasterized as an export does it.
async function alphaOf(svg: string, w: number, h: number) {
  const sized = svg.replace("<svg ", `<svg width="${w}" height="${h}" `);
  return sharp(Buffer.from(sized)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

// The share of the frame a mask shows (0-1).
async function coverage(svg: string, w: number, h: number): Promise<{ shown: number; hidden: number }> {
  const { data, info } = await alphaOf(svg, w, h);
  let shown = 0;
  let hidden = 0;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] > 245) shown++;
    else if (data[i] < 10) hidden++;
  }
  const n = info.width * info.height;
  return { shown: shown / n, hidden: hidden / n };
}

describe("album masks", () => {
  it("has the 20 creative masks and the 6 from the reference album, every id once", () => {
    const ids = ALBUM_MASKS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...CREATIVE, ...REFERENCE]) expect(findMask(id), id).toBeTruthy();
    const after = ids.indexOf("pattern-hearts") + 1;
    expect(ids.slice(after, after + REFERENCE.length)).toEqual(REFERENCE);
    expect(ALBUM_MASKS.length).toBe(80);
  });

  it("names every mask in English and Russian", () => {
    const en = messagesFor("en");
    const ru = messagesFor("ru");
    for (const m of ALBUM_MASKS) {
      if (m.label === "סרט") continue; // translated through "סרט (מסכה)" (maskLabel in the editor)
      expect(en[m.label], m.label).toBeTruthy();
      expect(ru[m.label], m.label).toBeTruthy();
    }
  });

  it("is the same string every time (the seeded ones too)", async () => {
    vi.resetModules();
    const again = (await import("@/lib/albumMasks")).ALBUM_MASKS;
    for (const id of [...CREATIVE, ...REFERENCE]) expect(again.find((m) => m.id === id)!.svg).toBe(findMask(id)!.svg);
  });

  // The narrow soft edge shows the whole photo, so it's checked on its own below.
  for (const id of [...CREATIVE, ...REFERENCE.filter((r) => r !== "soft-edge-narrow")]) {
    it(`${id}: renders in the export, showing part of the frame and hiding part of it`, async () => {
      const svg = findMask(id)!.svg;
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(maskCssUrl(svg).startsWith('url("data:image/svg+xml,')).toBe(true);
      for (const [w, h] of [
        [300, 200],
        [200, 300],
      ]) {
        const c = await coverage(svg, w, h);
        expect(c.shown, `${id} ${w}x${h} shown`).toBeGreaterThan(0.2);
        expect(c.hidden, `${id} ${w}x${h} hidden`).toBeGreaterThan(0.02);
      }
    });
  }

  it("soft-edge-narrow: shows the whole photo, fading out only in a narrow band at the very edge", async () => {
    const svg = findMask("soft-edge-narrow")!.svg;
    for (const [w, h] of [
      [300, 200],
      [200, 300],
    ]) {
      const { data, info } = await alphaOf(svg, w, h);
      const a = (x: number, y: number) => data[(y * w + x) * info.channels + 3];
      // The corners are gone, and the outermost row and column all but gone.
      for (const [x, y] of [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
      ])
        expect(a(x, y), `${w}x${h} corner ${x},${y}`).toBeLessThan(10);
      let edge = 0;
      for (let x = 0; x < w; x++) edge += a(x, 0) + a(x, h - 1);
      for (let y = 0; y < h; y++) edge += a(0, y) + a(w - 1, y);
      expect(edge / (2 * (w + h)), `${w}x${h} edge`).toBeLessThan(25);
      // 6% in from every side (and in the middle) it's fully shown: far narrower than vignette-rect.
      for (const [x, y] of [
        [Math.round(w * 0.06), Math.round(h / 2)],
        [Math.round(w * 0.94), Math.round(h / 2)],
        [Math.round(w / 2), Math.round(h * 0.06)],
        [Math.round(w / 2), Math.round(h * 0.94)],
        [Math.round(w / 2), Math.round(h / 2)],
      ])
        expect(a(x, y), `${w}x${h} at ${x},${y}`).toBeGreaterThan(250);
      expect((await coverage(svg, w, h)).shown, `${w}x${h} shown`).toBeGreaterThan(0.85);
      expect((await coverage(findMask("vignette-rect")!.svg, w, h)).shown, "vignette-rect is much softer").toBeLessThan(0.6);
    }
  });
});
