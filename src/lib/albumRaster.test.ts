import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { albumTextEffects, composePhotoTile, erodeAlpha, maskOutlineAlpha, resolvePageElements, shadowLayerPng, silhouetteShadowPng, svgTextLayer } from "@/lib/albumRaster";
import { outlineCss, outlineWidthAt } from "@/lib/albumRender";
import type { AlbumTextElement, GalleryAlbumSpreadRow } from "@/lib/types";

vi.mock("@/lib/storage", () => ({ downloadObjectBuffer: vi.fn(async () => null) }));

// A turned album text (AlbumTextElement.rotation, 2026-10-23) in the JPG/PSD text layer: clockwise
// around the box's center, the shadow's offset turning with the text, like the editor's CSS rotate.

const PAGE_W = 800;
const PAGE_H = 500;
// A wide box in the middle of the page: center (400, 250).
const BOX = { xPx: 100, yPx: 200, widthPx: 600, heightPx: 100 };
const base = { ...BOX, fontSizePx: 60, color: "#ff0000", align: "center" as const, pageWidthPx: PAGE_W, pageHeightPx: PAGE_H };

type Pixel = { r: number; g: number; b: number; a: number };
async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): Pixel => {
    const i = (y * info.width + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  return { width: info.width, height: info.height, at };
}

// Bounds and centroid of the pixels that match.
async function ink(png: Buffer, match: (p: Pixel) => boolean = (p) => p.a > 128) {
  const img = await pixels(png);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!match(img.at(x, y))) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      sx += x;
      sy += y;
      n++;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: sx / n, cy: sy / n, n };
}

describe("svgTextLayer rotation", () => {
  it("no turn (missing or 0) is the exact same layer, effects included", async () => {
    const effects = albumTextEffects({ kind: "text", text: "", x: 0, y: 0, width: 0, height: 0, fontSizePx: 60, color: "#ff0000", align: "center", shadow: 60, strokeWidth: 2 }, PAGE_W);
    for (const opts of [base, { ...base, effects }]) {
      const upright = await svgTextLayer("שלום עולם", opts);
      expect((await svgTextLayer("שלום עולם", { ...opts, rotationDeg: 0 })).equals(upright)).toBe(true);
      expect((await svgTextLayer("שלום עולם", { ...opts, rotationDeg: undefined })).equals(upright)).toBe(true);
    }
  }, 20000);

  it("a quarter turn stands a wide line up, around the box's center", async () => {
    const upright = await ink(await svgTextLayer("Hello World", base));
    const turned = await ink(await svgTextLayer("Hello World", { ...base, rotationDeg: 90 }));
    expect(upright.w).toBeGreaterThan(upright.h * 3);
    expect(turned.h).toBeGreaterThan(turned.w * 3);
    // Width and height swap (within antialiasing), and the ink's center turns around the box's
    // center (400, 250): an offset (dx, dy) from it becomes (-dy, dx).
    expect(Math.abs(turned.h - upright.w)).toBeLessThanOrEqual(3);
    expect(Math.abs(turned.w - upright.h)).toBeLessThanOrEqual(3);
    const ux = (upright.x0 + upright.x1) / 2;
    const uy = (upright.y0 + upright.y1) / 2;
    expect(Math.abs((turned.x0 + turned.x1) / 2 - (400 - (uy - 250)))).toBeLessThanOrEqual(3);
    expect(Math.abs((turned.y0 + turned.y1) / 2 - (250 + (ux - 400)))).toBeLessThanOrEqual(3);
  }, 20000);

  it("turns clockwise: left-aligned text goes above the box's center", async () => {
    const left = { ...base, align: "left" as const };
    const cw = await ink(await svgTextLayer("Hi", { ...left, rotationDeg: 90 }));
    expect(cw.y1).toBeLessThan(250);
    expect(Math.abs(cw.cx - 400)).toBeLessThan(40);
    const ccw = await ink(await svgTextLayer("Hi", { ...left, rotationDeg: -90 }));
    expect(ccw.y0).toBeGreaterThan(250);
  }, 20000);

  it("the shadow's offset turns with the text, like a CSS transform on the box", async () => {
    // Red text, a blue shadow 20px down-right (40pt of the 1600pt canvas at 0.5 px/pt).
    const effects = albumTextEffects({ kind: "text", text: "", x: 0, y: 0, width: 0, height: 0, fontSizePx: 60, color: "#ff0000", align: "center", shadow: 100, shadowColor: "#0000ff", shadowDistance: 40 }, PAGE_W);
    const red = (p: Pixel) => p.a > 128 && p.r > p.b + 60;
    const blue = (p: Pixel) => p.a > 60 && p.b > p.r + 60;
    const offset = async (rotationDeg?: number) => {
      const png = await svgTextLayer("שלום", { ...base, effects, rotationDeg });
      const [text, shadow] = await Promise.all([ink(png, red), ink(png, blue)]);
      return { dx: shadow.cx - text.cx, dy: shadow.cy - text.cy };
    };
    const upright = await offset();
    expect(upright.dx).toBeGreaterThan(4);
    expect(upright.dy).toBeGreaterThan(4);
    // Down-right turned 90° clockwise is down-left.
    const turned = await offset(90);
    expect(turned.dx).toBeLessThan(-4);
    expect(turned.dy).toBeGreaterThan(4);
  }, 20000);

  it("without a box height (the cover title band) a turn is ignored", async () => {
    const band = { ...base, heightPx: undefined };
    const upright = await svgTextLayer("Title", band);
    expect((await svgTextLayer("Title", { ...band, rotationDeg: 45 })).equals(upright)).toBe(true);
  }, 20000);
});

describe("resolvePageElements carries a text's turn", () => {
  const text: AlbumTextElement = { id: "t", type: "text", text: "שלום", xPct: 10, yPct: 20, widthPct: 50, heightPct: 10, fontSize: 40, color: "white", align: "center", rotation: 30 };
  const spread = (layout: GalleryAlbumSpreadRow["layout"]): GalleryAlbumSpreadRow => ({
    id: "s",
    album_id: "a",
    sort_order: 0,
    photo_id_1: "p1",
    photo_id_2: null,
    layout,
    focal_x_1: 50,
    focal_y_1: 50,
    focal_x_2: 50,
    focal_y_2: 50,
    elements: [text],
    background_photo_id: null,
    background_blur: 0,
    background_opacity: 100,
    background_zoom: 100,
    width_cm: null,
    height_cm: null,
    created_at: "",
  });

  it("in a free-form page and in a preset layout", () => {
    for (const layout of ["custom", "split"] as const) {
      const resolved = resolvePageElements(spread(layout), 1600, 800).find((el) => el.kind === "text");
      expect(resolved).toMatchObject({ kind: "text", rotation: 30 });
    }
    const upright = resolvePageElements({ ...spread("custom"), elements: [{ ...text, rotation: undefined }] }, 1600, 800)[0];
    expect(upright).toMatchObject({ kind: "text" });
    expect((upright as { rotation?: number }).rotation).toBeUndefined();
  });
});

// The photographer's own line breaks (2026-10-23): a long text wrapped into two lines in the editor
// and came out as one line in the exports. Now lines break only at "\n", everywhere.
describe("svgTextLayer lines", () => {
  const ml = { ...base, multiline: true };

  it("a text without a break is the exact same layer, with or without multiline", async () => {
    expect((await svgTextLayer("שלום עולם", ml)).equals(await svgTextLayer("שלום עולם", base))).toBe(true);
  });

  it("two lines: the one-line ink half a line height above and below, centered as a block", async () => {
    // Line height 1.2 × 60px = 72px: each line sits 36px from where the one line sits.
    const one = await ink(await svgTextLayer("Hi", ml));
    const two = await ink(await svgTextLayer("Hi\nHi", ml));
    expect(two.y0).toBeCloseTo(one.y0 - 36, -0.5);
    expect(two.y1).toBeCloseTo(one.y1 + 36, -0.5);
    expect(two.cx).toBeCloseTo(one.cx, 0);
    expect(two.cy).toBeCloseTo(one.cy, 0);
  });

  it("each line is aligned in the box on its own", async () => {
    for (const align of ["right", "left", "center"] as const) {
      const png = await svgTextLayer("Hello World\nHi", { ...ml, align });
      const top = await ink(png, (p) => p.a > 128);
      const img = await pixels(png);
      // The short second line: the ink below the block's middle (250).
      let x0 = Infinity;
      let x1 = -1;
      for (let y = 251; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.at(x, y).a > 128) [x0, x1] = [Math.min(x0, x), Math.max(x1, x)];
      if (align === "right") expect(Math.abs(x1 - top.x1)).toBeLessThanOrEqual(4);
      if (align === "left") expect(Math.abs(x0 - top.x0)).toBeLessThanOrEqual(4);
      if (align === "center") expect(Math.abs((x0 + x1) / 2 - 400)).toBeLessThanOrEqual(4);
    }
  });

  it("an empty line keeps its place", async () => {
    const two = await ink(await svgTextLayer("Hi\n\nHi", ml));
    const one = await ink(await svgTextLayer("Hi", ml));
    expect(two.y0).toBeCloseTo(one.y0 - 72, -0.5);
    expect(two.y1).toBeCloseTo(one.y1 + 72, -0.5);
  });

  it("without multiline (the magnet export) or a box height (the cover title), a break is not a new line", async () => {
    const magnet = await ink(await svgTextLayer("Hi\nHi", base));
    const one = await ink(await svgTextLayer("Hi", base));
    // One row (the break itself draws as the font's missing-glyph box, as it always has), not two.
    expect(magnet.h).toBeLessThan(one.h + 30);
    const band = { ...ml, heightPx: undefined };
    expect((await svgTextLayer("Hi\nHi", band)).equals(await svgTextLayer("Hi\nHi", { ...band, multiline: false }))).toBe(true);
  });

  it("a turned two-line text turns as one block around the box's center", async () => {
    const turned = await ink(await svgTextLayer("Hello World\nHello World", { ...ml, rotationDeg: 90 }));
    expect(turned.cx).toBeCloseTo(400, -1);
    expect(turned.cy).toBeCloseTo(250, -1);
    expect(turned.w).toBeGreaterThan(100);
    expect(turned.h).toBeGreaterThan(turned.w);
  });
});

// A masked photo's outline and shadow follow the mask's shape (2026-11-01, user request: the
// outline was drawn around the rectangular frame), as in the editor and the PSD.
describe("a masked photo's outline and shadow", () => {
  const photo = () => sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg().toBuffer();
  const at = (tile: { data: Buffer; width: number }, x: number, y: number) => {
    const i = (y * tile.width + x) * 4;
    return { r: tile.data[i], g: tile.data[i + 1], b: tile.data[i + 2], a: tile.data[i + 3] };
  };

  it("erodes like feMorphology: a (2r+1) square, the edge counting as outside", () => {
    const w = 9;
    const h = 5;
    const full = new Uint8Array(w * h).fill(255);
    const e = erodeAlpha(full, w, h, 1);
    expect(e[0]).toBe(0); // a corner touches the outside
    expect(e[2 * w + 4]).toBe(255); // the middle stays
    expect(e[1 * w + 1]).toBe(255); // one pixel in from the edge, with r = 1
    expect(Array.from(erodeAlpha(full, w, h, 2)).filter((v) => v === 255).length).toBe(5 * 1); // only the center row's middle 5
    const hole = new Uint8Array(w * h).fill(255);
    hole[2 * w + 4] = 0;
    const e2 = erodeAlpha(hole, w, h, 1);
    expect(e2[2 * w + 5]).toBe(0);
    expect(e2[1 * w + 3]).toBe(0);
    expect(e2[2 * w + 6]).toBe(255);
  });

  it("the outline is a band inside what the mask shows, and fades with a soft mask", () => {
    const w = 10;
    const m = new Uint8Array(w * w);
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) m[y * w + x] = 255;
    const ring = maskOutlineAlpha(m, w, w, 1);
    expect(ring[2 * w + 2]).toBe(255); // the square's edge
    expect(ring[4 * w + 4]).toBe(0); // its inside
    expect(ring[0]).toBe(0); // outside the mask: nothing
    const soft = new Uint8Array(w * w).fill(128);
    expect(maskOutlineAlpha(soft, w, w, 1)[0]).toBe(64); // along the frame's edge: (128/255)² of full
    expect(maskOutlineAlpha(soft, w, w, 1)[5 * w + 5]).toBe(0); // and nothing inside it
    // A fade across the frame (alpha falling by 25 per pixel): no gray band along it.
    const fade = new Uint8Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) fade[y * w + x] = 255 - x * 25;
    expect(maskOutlineAlpha(fade, w, w, 1)[5 * w + 5]).toBe(2);
  });

  it("follows a circle mask, not the frame's rectangle", async () => {
    const tile = (await composePhotoTile(await photo(), 200, 120, 50, 50, undefined, true, { maskId: "shape-circle", borderWidth: 6, borderColor: "#000000" }))!;
    expect(at(tile, 2, 2).a).toBe(0); // the frame's corner: outside the circle, no outline
    expect(at(tile, 100, 2).a).toBe(0); // nor along the frame's top
    // shape-circle's top in a 120px-high frame, then just inside it: the outline, black.
    let top = 0;
    while (top < 60 && at(tile, 100, top).a < 128) top++;
    const ring = at(tile, 100, top + 2);
    expect(ring.a).toBeGreaterThan(200);
    expect(ring.r).toBeLessThan(40);
    const mid = at(tile, 100, 60); // the photo in the circle
    expect(mid.a).toBe(255);
    expect(mid.r).toBeGreaterThan(150);
  });

  it("a photo without a mask keeps its rectangular outline", async () => {
    const tile = (await composePhotoTile(await photo(), 200, 120, 50, 50, undefined, true, { borderWidth: 6, borderColor: "#000000" }))!;
    expect(at(tile, 2, 2)).toMatchObject({ r: 0, g: 0, b: 0, a: 255 });
    expect(at(tile, 18, 18)).toMatchObject({ a: 255 });
  });

  async function alphaAt(layer: { buffer: Buffer; left: number; top: number }, pageX: number, pageY: number) {
    const { data, info } = await sharp(layer.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const x = pageX - layer.left;
    const y = pageY - layer.top;
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return 0;
    return data[(y * info.width + x) * 4 + 3];
  }

  it("the shadow is the photo's shape, not a rectangle", async () => {
    // A 200x120 circle-masked tile at (100, 100) on a 600x400 page.
    const tile = (await composePhotoTile(await photo(), 200, 120, 50, 50, undefined, true, { maskId: "shape-circle" }))!;
    const shadow = (await silhouetteShadowPng(tile, 100, 100, 60, undefined, undefined, undefined, 600, 400))!;
    expect(await alphaAt(shadow, 106, 106)).toBe(0); // the frame's corner, outside the circle
    expect(await alphaAt(shadow, 200, 175)).toBeGreaterThan(40); // under the circle's bottom
    const rect = (await shadowLayerPng(200, 120, 60, 100, 100, undefined, undefined, undefined, undefined, 600, 400))!;
    expect(await alphaAt(rect, 106, 106)).toBeGreaterThan(20); // what the rectangle did
  });

  it("without a page it is placed around the tile, for the PDF", async () => {
    const tile = (await composePhotoTile(await photo(), 100, 100, 50, 50, undefined, true, { maskId: "shape-circle" }))!;
    const layer = (await silhouetteShadowPng(tile, 0, 0, 60, undefined, undefined, undefined, undefined, undefined, 2))!;
    expect(layer.left).toBeLessThan(0);
    expect(layer.width).toBeGreaterThan(100);
  });
});

// An outline is the same share of the page everywhere (2026-11-02, user request: "the print should
// come out exactly like the editor"): its width is px on a page 1000px wide. The JPG drew it as
// raw pixels at 300 DPI, so a 3 on a 60cm page (7087px) came out 7 times thinner than the editor.
describe("outline width is a share of the page", () => {
  it("outlineWidthAt", () => {
    expect(outlineWidthAt(3, 1000)).toBe(3);
    expect(outlineWidthAt(3, 7087)).toBeCloseTo(21.26, 2);
    expect(outlineWidthAt(3, 1600)).toBeCloseTo(4.8, 5); // the PDF's page
    expect(outlineWidthAt(undefined, 7087)).toBe(0);
    expect(outlineCss(3)).toBe("calc(3 * 100cqw / 1000)");
  });

  it("resolvePageElements scales photo, shape and ornament outlines to the page's pixels", () => {
    const row: GalleryAlbumSpreadRow = {
      id: "s", album_id: "a", sort_order: 0, photo_id_1: "x", photo_id_2: null, layout: "custom",
      focal_x_1: 50, focal_y_1: 50, focal_x_2: 50, focal_y_2: 50,
      background_photo_id: null, background_blur: 0, background_opacity: 100, background_zoom: 100, width_cm: null, height_cm: null, created_at: "",
      elements: [
        { id: "p", type: "photo", photoId: "x", xPct: 0, yPct: 0, widthPct: 50, heightPct: 50, focalX: 50, focalY: 50, borderWidth: 3, borderColor: "#000" },
        { id: "q", type: "photo", photoId: "y", xPct: 50, yPct: 0, widthPct: 50, heightPct: 50, focalX: 50, focalY: 50 },
        { id: "o", type: "shape", shapeStyle: "rect-outline", xPct: 0, yPct: 50, widthPct: 50, heightPct: 50, color: "#fff", rotation: 0, opacity: 100 },
        { id: "r", type: "shape", xPct: 50, yPct: 50, widthPct: 50, heightPct: 50, color: "#fff", rotation: 0, opacity: 100, borderWidth: 6 },
      ] as GalleryAlbumSpreadRow["elements"],
    };
    const [photo, bare, outlineShape, shape] = resolvePageElements(row, 7087, 3543) as Array<{ borderWidth?: number }>;
    expect(photo.borderWidth).toBeCloseTo(21.26, 2);
    expect(bare.borderWidth).toBeUndefined();
    expect(outlineShape.borderWidth).toBeCloseTo(35.435, 3); // the editor's default 5
    expect(shape.borderWidth).toBeCloseTo(42.52, 2);
  });
});
