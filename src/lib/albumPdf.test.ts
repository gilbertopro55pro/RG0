import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { generateAlbumPdf } from "@/lib/albumPdf";
import type { AlbumTextElement, GalleryAlbumRow, GalleryAlbumSpreadRow } from "@/lib/types";

vi.mock("@/lib/storage", () => ({ downloadObjectBuffer: vi.fn(async () => null) }));

// A turned album text (AlbumTextElement.rotation, 2026-10-23) in the PDF: drawn inside the same
// rotation transform as a turned photo frame, around the text box's center.

// 30×20 album: pages are 1600 design points wide and 1066.67 high.
const album: GalleryAlbumRow = {
  id: "a",
  gallery_id: "g",
  photographer_id: "p",
  title: "",
  status: "draft",
  cover_photo_id: null,
  width_cm: 30,
  height_cm: 20,
  safe_margin_cm: 0.5,
  approved_at: null,
  created_at: "",
};
const PAGE_H = 20 * (1600 / 30);

// Box from 10% to 60% across and 20% to 30% down: center (560, PAGE_H × 0.75) in PDF's y-up points.
const text = (extra: Partial<AlbumTextElement> = {}): AlbumTextElement => ({
  id: "t",
  type: "text",
  text: "שלום Hello",
  xPct: 10,
  yPct: 20,
  widthPct: 50,
  heightPct: 10,
  fontSize: 60,
  color: "#ff0000",
  align: "center",
  shadow: 50,
  strokeWidth: 2,
  ...extra,
});
const spread = (el: AlbumTextElement): GalleryAlbumSpreadRow => ({
  id: "s",
  album_id: "a",
  sort_order: 0,
  photo_id_1: "",
  photo_id_2: null,
  layout: "custom",
  focal_x_1: 50,
  focal_y_1: 50,
  focal_x_2: 50,
  focal_y_2: 50,
  elements: [el],
  background_photo_id: null,
  background_blur: 0,
  background_opacity: 100,
  background_zoom: 100,
  width_cm: null,
  height_cm: null,
  created_at: "",
});

// The page's decoded content streams, joined.
async function pageContent(el: AlbumTextElement): Promise<string> {
  const bytes = await generateAlbumPdf({ album, spreads: [spread(el)], photosById: new Map() });
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const parts = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  return parts
    .map((s) => {
      if (!(s instanceof PDFRawStream)) return "";
      return (s.dict.get(PDFName.of("Filter")) ? inflateSync(s.contents) : Buffer.from(s.contents)).toString("latin1");
    })
    .join("\n");
}

const NUM = String.raw`(-?[\d.]+(?:e-?\d+)?)`;
const CM = new RegExp(`${NUM} ${NUM} ${NUM} ${NUM} ${NUM} ${NUM} cm`, "g");
function cmOps(content: string): { m: number[]; index: number }[] {
  return [...content.matchAll(CM)].map((m) => ({ m: m.slice(1, 7).map(Number), index: m.index ?? 0 }));
}

describe("album PDF text rotation", () => {
  it("upright text (missing or 0) draws exactly the same operators, with no turn", async () => {
    const upright = await pageContent(text());
    expect(upright).toContain("BT");
    expect(await pageContent(text({ rotation: 0 }))).toBe(upright);
    expect(cmOps(upright).some(({ m }) => m[1] !== 0 || m[2] !== 0)).toBe(false);
  }, 20000);

  it("a turned text is drawn inside a clockwise turn around its box's center", async () => {
    const content = await pageContent(text({ rotation: 30 }));
    const ops = cmOps(content);
    const r = ops.findIndex(({ m }) => m[1] !== 0);
    expect(r).toBeGreaterThan(0);
    // PDF's y axis points up, so a clockwise turn on screen is a negative angle here.
    const rad = (-30 * Math.PI) / 180;
    const [a, b, c, d, e, f] = ops[r].m;
    expect(a).toBeCloseTo(Math.cos(rad), 6);
    expect(b).toBeCloseTo(Math.sin(rad), 6);
    expect(c).toBeCloseTo(-Math.sin(rad), 6);
    expect(d).toBeCloseTo(Math.cos(rad), 6);
    expect([e, f]).toEqual([0, 0]);
    // Moved to the box's center before the turn and back after it.
    const before = ops[r - 1].m;
    const after = ops[r + 1].m;
    expect(before[4]).toBeCloseTo(560, 4);
    expect(before[5]).toBeCloseTo(PAGE_H * 0.75, 4);
    expect(after[4]).toBeCloseTo(-560, 4);
    expect(after[5]).toBeCloseTo(-PAGE_H * 0.75, 4);
    // Every text copy (shadow, outline ring, the text) is drawn after the turn, and the state is
    // restored after the last one.
    const firstText = content.indexOf("BT");
    const lastText = content.lastIndexOf("ET");
    expect(firstText).toBeGreaterThan(ops[r + 1].index);
    expect(content.indexOf("Q", lastText)).toBeGreaterThan(lastText);
  }, 20000);
});
