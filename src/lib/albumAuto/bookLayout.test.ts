import { describe, expect, it } from "vitest";
import { BOOK_FILL_CROP, bookElements, bookPage } from "@/lib/albumAuto/bookLayout";
import type { LayoutPhoto } from "@/lib/albumAuto/types";

// A book's page (owner, 2026-11-01): its photos as large as the page holds, none cut.
const photo = (id: string, aspect: number): LayoutPhoto => ({ id, aspect });
const crop = (frame: { widthPct: number; heightPct: number }, aspect: number, sw: number, sh: number) => {
  const fa = (frame.widthPct * sw) / (frame.heightPct * sh);
  return Math.max(fa / aspect, aspect / fa);
};

describe("a book's page", () => {
  const cases: [string, LayoutPhoto[], number, number][] = [
    ["two portraits on a double page", [photo("a", 0.667), photo("b", 0.667)], 60, 30],
    ["a portrait and a landscape on a double page", [photo("a", 0.667), photo("b", 1.5)], 60, 30],
    ["three mixed on a double page", [photo("a", 0.667), photo("b", 1.5), photo("c", 0.667)], 60, 30],
    ["three mixed on a single page", [photo("a", 0.667), photo("b", 1.5), photo("c", 1.5)], 30, 20],
    ["two landscapes on a single page", [photo("a", 1.5), photo("b", 1.5)], 30, 20],
  ];
  for (const [name, photos, w, h] of cases) {
    it(`shows every photo whole: ${name}`, () => {
      const page = bookPage(photos, { widthCm: w, heightCm: h, marginCm: 1, spreadIndex: 0 });
      expect(page).not.toBeNull();
      const sw = w - 2;
      const sh = h - 2;
      expect(page!.frames).toHaveLength(photos.length);
      expect(new Set(page!.photos.map((p) => p.id))).toEqual(new Set(photos.map((p) => p.id)));
      page!.frames.forEach((f, i) => expect(crop(f, page!.photos[i].aspect, sw, sh)).toBeLessThanOrEqual(BOOK_FILL_CROP + 1e-6));
      // A double page: no photo on the fold.
      if (w / h >= 1.6) for (const f of page!.frames) expect(f.xPct + f.widthPct <= 50.01 || f.xPct >= 49.99).toBe(true);
      // Large: two 3:2 photos on a 3:2 page can cover about half of it at most (gaps aside).
      const area = page!.frames.reduce((a, f) => a + f.widthPct * f.heightPct, 0) / 10000;
      expect(area).toBeGreaterThan(0.4);
    });
  }

  it("changes shape from the page before when another near-best layout exists", () => {
    const photos = [photo("a", 0.667), photo("b", 1.5), photo("c", 0.667)];
    const first = bookPage(photos, { widthCm: 30, heightCm: 20, marginCm: 1, spreadIndex: 0 })!;
    const next = bookPage(photos, { widthCm: 30, heightCm: 20, marginCm: 1, spreadIndex: 0, avoidShape: first.shape })!;
    expect(next.shape).not.toBe(first.shape);
  });

  it("places each photo in its frame with the page's finish", () => {
    const photos = [photo("a", 0.667), photo("b", 1.5)];
    const page = bookPage(photos, { widthCm: 60, heightCm: 30, marginCm: 1, spreadIndex: 1 })!;
    const els = bookElements(page, 60, 30, 1, "book-1", { borderWidth: 3, borderColor: "#000000", shadow: 35 });
    expect(els.map((e) => e.photoId).sort()).toEqual(["a", "b"]);
    expect(els.every((e) => e.borderWidth === 3 && e.shadow === 35 && e.zoom === 100)).toBe(true);
  });
});
