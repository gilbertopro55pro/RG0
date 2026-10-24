import { describe, expect, it } from "vitest";
import { fitFramesToSafeArea, marginInsetPctFor } from "@/lib/albumSafeArea";
import type { AlbumFrame } from "@/lib/types";

// Automatic layouts are scaled into the print-safe box (the green line).
describe("albumSafeArea", () => {
  it("turns the safe margin into a percentage of each side, 0.5cm by default", () => {
    expect(marginInsetPctFor({ width_cm: 60, height_cm: 30, safe_margin_cm: 1.5 })).toEqual({ x: 2.5, y: 5 });
    expect(marginInsetPctFor({ width_cm: 50, height_cm: 25 })).toEqual({ x: 1, y: 2 });
    expect(marginInsetPctFor({ width_cm: 0, height_cm: 30 })).toBeNull();
  });

  it("scales a full-bleed frame into the safe box and keeps everything else", () => {
    const frame = { id: "f", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, photoId: "p" } as unknown as AlbumFrame;
    const [fitted] = fitFramesToSafeArea([frame], { x: 2.5, y: 5 });
    expect(fitted).toMatchObject({ id: "f", photoId: "p", xPct: 2.5, yPct: 5, widthPct: 95, heightPct: 90 });
  });

  it("leaves frames alone without a margin or with an impossible one", () => {
    const frames = [{ xPct: 10, yPct: 10, widthPct: 20, heightPct: 20 } as AlbumFrame];
    expect(fitFramesToSafeArea(frames, null)).toBe(frames);
    expect(fitFramesToSafeArea(frames, { x: 60, y: 5 })).toBe(frames);
  });
});
