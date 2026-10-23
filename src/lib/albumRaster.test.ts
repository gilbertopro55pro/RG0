import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { albumTextEffects, resolvePageElements, svgTextLayer } from "@/lib/albumRaster";
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
