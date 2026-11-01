import { describe, expect, it } from "vitest";
import { clampOutlineWidth, withAutoOutline } from "@/lib/albumAuto/outline";
import type { AlbumElement } from "@/lib/types";

// The photos' outline chosen in the auto designer (owner, 2026-11-01).
const el = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: "photo", photoId: id, xPct: 10, yPct: 10, widthPct: 30, heightPct: 30, focalX: 50, focalY: 50, zoom: 100, ...extra }) as unknown as AlbumElement;

describe("withAutoOutline", () => {
  const page = [
    el("framed", { borderWidth: 3, borderColor: "#000000" }),
    el("bare"),
    el("hero", { xPct: 0, yPct: 0, widthPct: 70, heightPct: 100, maskId: "fade-right-25" }),
    el("bleed", { xPct: 50, yPct: 0, widthPct: 50, heightPct: 100 }),
    { id: "text", type: "text", text: "x" } as unknown as AlbumElement,
  ];

  it("keeps the style's own outline when nothing was chosen", () => {
    expect(withAutoOutline(page, [], null)).toEqual(page);
  });

  it("puts the chosen colour and width on every framed photo, not on faded or edge-to-edge photos", () => {
    const out = withAutoOutline(page, ["hero", "bleed"], { width: 6, color: "#d4af37" });
    const byId = new Map(out.map((e) => [e.id, e as { borderWidth?: number; borderColor?: string }]));
    expect(byId.get("framed")).toMatchObject({ borderWidth: 6, borderColor: "#d4af37" });
    expect(byId.get("bare")).toMatchObject({ borderWidth: 6, borderColor: "#d4af37" });
    expect(byId.get("hero")!.borderWidth).toBeUndefined();
    expect(byId.get("bleed")!.borderWidth).toBeUndefined();
    expect(byId.get("text")).toEqual(page[4]);
  });

  it("removes every outline with width 0", () => {
    const out = withAutoOutline(page, ["hero", "bleed"], { width: 0, color: "#000000" });
    for (const e of out) expect((e as { borderWidth?: number }).borderWidth).toBeUndefined();
  });

  it("keeps the width whole and within 0 to 20", () => {
    expect(clampOutlineWidth(2.6)).toBe(3);
    expect(clampOutlineWidth(-4)).toBe(0);
    expect(clampOutlineWidth(99)).toBe(20);
    expect(clampOutlineWidth(Number.NaN)).toBe(3);
  });
});
