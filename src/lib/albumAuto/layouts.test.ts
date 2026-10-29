import { describe, expect, it } from "vitest";
import { layoutCover, layoutOpener } from "@/lib/albumAuto/layouts";
import type { AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "@/lib/types";

// The photo cover as the owner corrected the first auto album ("עלייה לתורה - אורי", 32×32,
// 2026-10-21): the band at 45%, "אורי" at 187pt and "עלייה לתורה | 5.10.2026" at 50pt in Bodoni Moda,
// shadow 50.
const cover = (lines: { main: string; sub: string | null } | undefined, widthCm = 32, heightCm = 32) =>
  layoutCover({ style: "clean", photo: { id: "p", aspect: 0.67 }, title: "עלייה לתורה - אורי", lines, widthCm, heightCm }).elements;
const texts = (els: ReturnType<typeof cover>) => els.filter((e): e is AlbumTextElement => e.type === "text");

describe("layoutCover: the photo cover's title", () => {
  it("sets the name and the event line the way the owner did", () => {
    const els = cover({ main: "אורי", sub: "עלייה לתורה | 5.10.2026" });
    const band = els.find((e): e is AlbumShapeElement => e.id === "auto-cover-band");
    expect(band?.opacity).toBe(45);
    const [name, line] = texts(els);
    expect(name).toMatchObject({ text: "אורי", fontSize: 187, fontFamily: "bodoni-moda", shadow: 50, color: "#ffffff" });
    expect(line).toMatchObject({ id: "auto-cover-subtitle", text: "עלייה לתורה | 5.10.2026", fontSize: 50, fontFamily: "bodoni-moda", shadow: 50 });
    // The name above the line, both inside the band.
    expect(name.yPct + name.heightPct! / 2).toBeLessThan(line.yPct + line.heightPct! / 2);
    expect(name.yPct).toBeGreaterThanOrEqual(band!.yPct);
    expect(line.yPct + line.heightPct!).toBeLessThanOrEqual(band!.yPct + band!.heightPct);
  });

  it("shrinks a long name to the cover's width, and both lines to a low cover's band", () => {
    const [long] = texts(cover({ main: "יהונתן אברהם וקנין", sub: null }));
    expect(long.fontSize).toBeLessThan(187);
    // A cover twice as wide as high: the band is half as tall per point.
    const els = cover({ main: "אורי", sub: "עלייה לתורה | 5.10.2026" }, 60, 30);
    const band = els.find((e) => e.id === "auto-cover-band")!;
    for (const t of texts(els)) {
      expect(t.yPct).toBeGreaterThanOrEqual(band.yPct - 0.01);
      expect(t.yPct + t.heightPct!).toBeLessThanOrEqual(band.yPct + band.heightPct! + 0.01);
    }
  });

  it("puts a title without lines on one line, centred in the band", () => {
    const [one, ...rest] = texts(cover(undefined));
    expect(rest).toHaveLength(0);
    expect(one.text).toBe("עלייה לתורה - אורי");
    expect(one.yPct + one.heightPct! / 2).toBeCloseTo(84.5, 1);
  });
});

// The combined album's opening page for its second part (2026-10-28): the event's photo large and
// its name.
describe("layoutOpener: the opening page of the album's second event", () => {
  const opener = (style: "clean" | "catalog" | "scribble" | "modern", widthCm = 60, heightCm = 30) =>
    layoutOpener({ style, photo: { id: "p", aspect: 0.67, faces: [{ x: 0.4, y: 0.2, width: 0.2, height: 0.15 }] }, title: "עלייה לתורה", spreadIndex: 9, widthCm, heightCm });
  const photoOf = (els: ReturnType<typeof opener>["elements"]) => els.find((e): e is AlbumPhotoElement => e.type === "photo")!;
  const textOf = (els: ReturnType<typeof opener>["elements"]) => els.find((e): e is AlbumTextElement => e.type === "text")!;

  it("on a double page: the photo fills the left page, the name on the right page's band", () => {
    const out = opener("clean");
    const photo = photoOf(out.elements);
    expect(photo).toMatchObject({ photoId: "p", xPct: 0, yPct: 0, widthPct: 50, heightPct: 100 });
    expect(out.bleedIds).toContain(photo.id);
    const name = textOf(out.elements);
    expect(name).toMatchObject({ text: "עלייה לתורה", fontFamily: "bodoni-moda", align: "center" });
    expect(name.xPct).toBeGreaterThanOrEqual(50);
    expect(name.xPct + name.widthPct).toBeLessThanOrEqual(100);
    const band = out.elements.find((e): e is AlbumShapeElement => e.id.endsWith("-band"))!;
    expect(band).toMatchObject({ xPct: 50, widthPct: 50, opacity: 45 });
    expect(name.yPct).toBeGreaterThanOrEqual(band.yPct);
    expect(name.yPct + name.heightPct!).toBeLessThanOrEqual(band.yPct + band.heightPct + 0.01);
    expect(out.background).toEqual({ photoId: "p", blur: 40, opacity: 55 });
  });

  it("keeps nothing at the edge in catalog: the photo framed inside equal margins", () => {
    const out = opener("catalog");
    const photo = photoOf(out.elements);
    expect(out.bleedIds).not.toContain(photo.id);
    expect(photo.borderWidth).toBe(5);
    expect(photo.xPct).toBeGreaterThan(0);
    expect(photo.xPct + photo.widthPct).toBeLessThan(50);
    expect((photo.xPct / 100) * 60).toBeCloseTo((photo.yPct / 100) * 30, 5);
  });

  it("puts scribble on its kraft paper, without the band", () => {
    const out = opener("scribble");
    expect(out.elements[0]).toMatchObject({ type: "shape", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, color: "#efe6d6" });
    expect(out.elements.some((e) => e.id.endsWith("-band"))).toBe(false);
    expect(textOf(out.elements).fontFamily).toBe("amatic-sc");
  });

  it("on a single page is the photo cover with the name, its ids its own", () => {
    const out = opener("clean", 30, 20);
    expect(textOf(out.elements).text).toBe("עלייה לתורה");
    const ids = out.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("auto-9-opener"))).toBe(true);
  });
});
