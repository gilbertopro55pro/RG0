import { describe, expect, it } from "vitest";
import { layoutCover } from "@/lib/albumAuto/layouts";
import type { AlbumShapeElement, AlbumTextElement } from "@/lib/types";

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
