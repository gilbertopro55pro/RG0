import { describe, expect, it } from "vitest";
import { catalogCover, catalogSpread, type CatalogType } from "./catalogLayout";
import type { LayoutPhoto } from "./types";
import type { AlbumElement, AlbumPhotoElement, AlbumTextElement } from "@/lib/types";

// Photos like a real book's: mostly landscape and portrait, one face each, off the middle now and then.
const ASPECTS = [1.5, 0.667, 1.5, 0.667, 1.5, 1.5, 0.75, 1.33, 0.667, 1.5];
function photosOf(n: number, seed = 0): LayoutPhoto[] {
  return Array.from({ length: n }, (_, i) => {
    const k = (i + seed) % ASPECTS.length;
    const x = [0.42, 0.3, 0.55, 0.62, 0.38][k % 5];
    return { id: `p${seed}-${i}`, aspect: ASPECTS[k], faces: [{ x, y: 0.2, width: 0.12, height: 0.16 }] };
  });
}
const photoEls = (els: AlbumElement[]) => els.filter((e): e is AlbumPhotoElement => e.type === "photo");
const SIZES: [number, number][] = [
  [60, 30],
  [30, 20],
  [40, 30],
  [30, 30],
];

describe("catalogSpread", () => {
  it("places every photo once, on every size, for 1 to 8 photos", () => {
    for (const [w, h] of SIZES) {
      for (let n = 1; n <= 8; n++) {
        for (let seed = 0; seed < 4; seed++) {
          const photos = photosOf(n, seed);
          const out = catalogSpread({ style: "catalog", photos, section: "event", spreadIndex: seed, widthCm: w, heightCm: h });
          expect(out, `${w}x${h} n=${n} seed=${seed}`).not.toBeNull();
          const placed = photoEls(out!.elements).map((e) => e.photoId);
          expect(placed.sort()).toEqual(photos.map((p) => p.id).sort());
          const ids = out!.elements.map((e) => e.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });

  it("keeps the framed photos inside the page and off a double page's fold", () => {
    for (let seed = 0; seed < 8; seed++) {
      const out = catalogSpread({ style: "catalog", photos: photosOf(4, seed), section: "event", spreadIndex: seed, widthCm: 60, heightCm: 30 })!;
      const bleeds = new Set(out.bleedIds ?? []);
      for (const el of photoEls(out.elements)) {
        if (bleeds.has(el.id)) continue;
        expect(el.xPct).toBeGreaterThanOrEqual(-0.01);
        expect(el.yPct).toBeGreaterThanOrEqual(-0.01);
        expect(el.xPct + el.widthPct).toBeLessThanOrEqual(100.01);
        expect(el.yPct + el.heightPct).toBeLessThanOrEqual(100.01);
        // Wholly on one page.
        const crosses = el.xPct < 49.9 && el.xPct + el.widthPct > 50.1;
        expect(crosses, `${out.type} ${el.id}`).toBe(false);
      }
    }
  });

  it("keeps the special spreads rare and changes the design on a redesign", () => {
    const recent: CatalogType[] = [];
    for (let i = 0; i < 19; i++) {
      const out = catalogSpread({ style: "catalog", photos: photosOf(4, i), section: "event", spreadIndex: i, widthCm: 60, heightCm: 30, recent })!;
      recent.push(out.type);
    }
    expect(recent.filter((t) => t === "hexagons").length).toBeLessThanOrEqual(3);
    // Never the same special type twice in a row.
    for (let i = 1; i < recent.length; i++) if (recent[i] !== "hero-grid") expect(recent[i]).not.toBe(recent[i - 1]);
    const photos = photosOf(3, 1);
    const types = new Set(
      Array.from({ length: 6 }, (_, v) => catalogSpread({ style: "catalog", photos, section: "event", spreadIndex: 2, widthCm: 60, heightCm: 30, variant: v })?.type).filter(Boolean)
    );
    expect(types.size).toBeGreaterThan(1);
  });

  it("names the place on the spread when a title is given", () => {
    let titled = 0;
    for (let seed = 0; seed < 6; seed++) {
      const out = catalogSpread({ style: "catalog", photos: photosOf(4, seed), section: "event", spreadIndex: seed, widthCm: 60, heightCm: 30, title: "חוף ים" })!;
      const text = out.elements.find((e): e is AlbumTextElement => e.type === "text");
      if (text) {
        titled++;
        expect(text.text).toBe("חוף ים");
      }
    }
    expect(titled).toBeGreaterThan(3);
  });
});

describe("catalogCover", () => {
  it("draws the photo in a circle with a ring, the name in a frame, on a blurred copy", () => {
    const photo = photosOf(1)[0];
    const out = catalogCover({ style: "catalog", photo, title: "רומי", widthCm: 60, heightCm: 30 })!;
    const circle = photoEls(out.elements)[0];
    expect(circle.maskId).toBe("shape-circle");
    // A circle: as wide as it is high on the paper.
    expect(Math.abs((circle.widthPct * 60) / (circle.heightPct * 30) - 1)).toBeLessThan(0.01);
    expect(out.elements.some((e) => e.type === "shape" && e.shapeStyle === "circle-outline")).toBe(true);
    expect(out.elements.find((e): e is AlbumTextElement => e.type === "text")?.text).toBe("רומי");
    expect(out.background?.photoId).toBe(photo.id);
    expect(catalogCover({ style: "catalog", photo: null, title: "x", widthCm: 60, heightCm: 30 })).toBeNull();
  });
});

describe("catalogCover's name", () => {
  it("puts what follows a comma, and the kind and date, on a smaller line under the name", () => {
    const photo = photosOf(1)[0];
    const out = catalogCover({ style: "catalog", photo, title: "יעל ואיתי, חתונה", lines: { main: "יעל ואיתי, חתונה", sub: "5.10.2026" }, widthCm: 30, heightCm: 20 })!;
    const texts = out.elements.filter((e): e is AlbumTextElement => e.type === "text");
    expect(texts.map((t) => t.text)).toEqual(["יעל ואיתי", "חתונה | 5.10.2026"]);
    expect(texts[1].fontSize).toBeLessThan(texts[0].fontSize);
    // Each fits its box's width on one line (about half a letter's size per letter).
    for (const t of texts) expect(t.fontSize * 0.52 * [...t.text].length).toBeLessThanOrEqual((t.widthPct / 100) * 1600 + 1);
  });
});
