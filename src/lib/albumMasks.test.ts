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

// The share of the frame a mask shows (0-1), rasterized as an export does it.
async function coverage(svg: string, w: number, h: number): Promise<{ shown: number; hidden: number }> {
  const sized = svg.replace("<svg ", `<svg width="${w}" height="${h}" `);
  const { data, info } = await sharp(Buffer.from(sized)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  it("has the 20 creative masks, every id once", () => {
    const ids = ALBUM_MASKS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of CREATIVE) expect(findMask(id), id).toBeTruthy();
    expect(ALBUM_MASKS.length).toBe(74);
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
    for (const id of CREATIVE) expect(again.find((m) => m.id === id)!.svg).toBe(findMask(id)!.svg);
  });

  for (const id of CREATIVE) {
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
});
