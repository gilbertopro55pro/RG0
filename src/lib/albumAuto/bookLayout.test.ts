import { describe, expect, it } from "vitest";
import { BOOK_FILL_CROP, bookElements, bookFadePage, bookPage } from "@/lib/albumAuto/bookLayout";
import type { AlbumPhotoElement } from "@/lib/types";
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

  it("lays a page of one photo on one side of the fold, the sides taking turns, or centred on a single page", () => {
    const a = bookPage([photo("a", 1.5)], { widthCm: 60, heightCm: 30, marginCm: 1, spreadIndex: 0 })!;
    const b = bookPage([photo("a", 0.667)], { widthCm: 60, heightCm: 30, marginCm: 1, spreadIndex: 1 })!;
    expect(a.frames[0].xPct).toBeGreaterThanOrEqual(50);
    expect(b.frames[0].xPct + b.frames[0].widthPct).toBeLessThanOrEqual(50);
    expect(crop(a.frames[0], 1.5, 58, 28)).toBeLessThanOrEqual(BOOK_FILL_CROP + 1e-6);
    const one = bookPage([photo("a", 0.667)], { widthCm: 30, heightCm: 20, marginCm: 1, spreadIndex: 0 })!;
    expect(one.frames[0].heightPct).toBeGreaterThan(90);
    expect(Math.abs(one.frames[0].xPct + one.frames[0].widthPct / 2 - 50)).toBeLessThan(0.5);
  });

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

// The book's page opens with a large faded photo (owner, 2026-11-01), the others in rows on its
// faded strip, as the clean line lays them out.
describe("a book's page with a faded photo", () => {
  const input = (photos: LayoutPhoto[], w = 60, h = 30, spreadIndex = 0, style: "clean" | "modern" | "catalog" | "scribble" = "clean") =>
    ({ style, photos, section: "event" as const, spreadIndex, widthCm: w, heightCm: h });
  const photosOf = (els: { type: string }[]) => els.filter((e): e is AlbumPhotoElement => e.type === "photo");
  const mixed = [photo("a", 1.5), photo("b", 0.667), photo("c", 1.5), photo("d", 0.667)];

  for (const style of ["clean", "modern"] as const) {
    for (const [name, photos, w, h] of [
      ["two on a double page", mixed.slice(0, 2), 60, 30],
      ["three on a double page", mixed.slice(0, 3), 60, 30],
      ["four on a double page", mixed, 60, 30],
      ["three on a single page", mixed.slice(0, 3), 30, 20],
    ] as [string, LayoutPhoto[], number, number][]) {
      it(`${style}: a faded photo and the rest whole on its strip, ${name}`, () => {
        const out = bookFadePage(input(photos, w, h, 0, style), 1)!;
        expect(out).not.toBeNull();
        const els = photosOf(out.elements);
        expect(new Set(els.map((e) => e.photoId))).toEqual(new Set(photos.map((p) => p.id)));
        expect(els).toHaveLength(photos.length);
        const hero = els.filter((e) => e.maskId?.startsWith("fade"));
        expect(hero).toHaveLength(1);
        expect(hero[0].heightPct).toBeGreaterThan(99);
        expect(hero[0].widthPct).toBeGreaterThanOrEqual(50);
        const aspect = (id: string | null) => photos.find((p) => p.id === id)!.aspect;
        const framed = els.filter((e) => e !== hero[0]);
        for (const f of framed) {
          // Whole, as on every book page.
          expect(crop(f, aspect(f.photoId), w - 2, h - 2)).toBeLessThanOrEqual(BOOK_FILL_CROP + 1e-6);
          // On the faded strip or beyond it, never on a double page's fold.
          if (hero[0].xPct < 1) expect(f.xPct).toBeGreaterThanOrEqual(hero[0].widthPct * 0.75 - 0.5);
          else expect(f.xPct + f.widthPct).toBeLessThanOrEqual(hero[0].xPct + hero[0].widthPct * 0.25 + 0.5);
          if (w / h >= 1.6) expect(f.xPct + f.widthPct <= 50.01 || f.xPct >= 49.99).toBe(true);
        }
        expect(out.background?.photoId).toBe(hero[0].photoId);
      });
    }
  }

  it("puts the faded photo on the other side on the next faded page", () => {
    const side = (i: number, bookTurn?: number) => photosOf(bookFadePage({ ...input(mixed.slice(0, 3), 60, 30, i), bookTurn }, 1)!.elements).find((e) => e.maskId)!.xPct < 1;
    expect(side(0)).not.toBe(side(1));
    expect(side(1)).not.toBe(side(2));
    // Pages 2, 4 and 6 of a book whose odd pages hold one photo: the faded pages' own count decides.
    expect(side(2, 0)).not.toBe(side(4, 1));
    expect(side(4, 1)).not.toBe(side(6, 2));
  });

  it("leaves the page to the book's collage when it can't have a faded photo", () => {
    expect(bookFadePage(input([photo("a", 1.5)]), 1)).toBeNull();
    expect(bookFadePage(input([photo("a", 0.667), photo("b", 0.667), photo("c", 0.667)]), 1)).toBeNull();
    expect(bookFadePage(input(mixed.slice(0, 3), 60, 30, 0, "catalog"), 1)).toBeNull();
    expect(bookFadePage(input(mixed.slice(0, 3), 60, 30, 0, "scribble"), 1)).toBeNull();
  });
});
