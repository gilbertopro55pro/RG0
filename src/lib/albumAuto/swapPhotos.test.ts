import { describe, expect, it } from "vitest";
import { fitPhotoInFrame, swapPhotoPatches } from "@/lib/albumAuto/swapPhotos";
import type { AlbumElement, AlbumPhotoElement, AlbumTextElement } from "@/lib/types";

// Swapping two photos between pages in the album preview (CLAUDE.md, "החלפת תמונות בין עמודים"):
// the photos trade frames, the crop resets, and a page whose blurred background was the photo
// that left gets the one that came in.

const photo = (id: string, photoId: string | null, extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement => ({
  id,
  type: "photo",
  photoId,
  xPct: 10,
  yPct: 20,
  widthPct: 30,
  heightPct: 40,
  focalX: 12,
  focalY: 80,
  zoom: 180,
  borderWidth: 3,
  shadow: 35,
  ...extra,
});

const title: AlbumTextElement = { id: "t1", type: "text", text: "דנה ויוסי", xPct: 5, yPct: 5, widthPct: 50, fontSize: 24, color: "white", align: "center" };

function book() {
  return [
    { id: "s1", elements: [photo("a", "photo-A", { xPct: 0, widthPct: 70 }), photo("b", "photo-B"), title] as AlbumElement[], background_photo_id: "photo-A" },
    { id: "s2", elements: [photo("c", "photo-C", { xPct: 55 }), photo("d", "photo-D")] as AlbumElement[], background_photo_id: "photo-C" },
    { id: "s3", elements: [photo("e", "photo-E")] as AlbumElement[], background_photo_id: "photo-E" },
  ];
}

const RESET = { focalX: 50, focalY: 40, zoom: 100 };
const el = (els: AlbumElement[] | undefined, id: string) => els?.find((e) => e.id === id) as AlbumPhotoElement;

describe("swapPhotoPatches", () => {
  it("gives each photo the other's frame, with the crop reset", () => {
    const spreads = book();
    const out = swapPhotoPatches(spreads, { spreadId: "s1", elId: "a" }, { spreadId: "s2", elId: "c" });
    expect(out).not.toBeNull();
    const a = el(out?.get("s1")?.elements, "a");
    const c = el(out?.get("s2")?.elements, "c");
    // The frame (position, size, finish) stays; only the photo and its crop change.
    expect(a).toEqual({ ...photo("a", "photo-C", { xPct: 0, widthPct: 70 }), ...RESET });
    expect(c).toEqual({ ...photo("c", "photo-A", { xPct: 55 }), ...RESET });
  });

  it("leaves the other elements on both pages as they were", () => {
    const spreads = book();
    const out = swapPhotoPatches(spreads, { spreadId: "s1", elId: "a" }, { spreadId: "s2", elId: "c" });
    expect(el(out?.get("s1")?.elements, "b")).toBe(spreads[0].elements[1]);
    expect(out?.get("s1")?.elements.find((e) => e.id === "t1")).toBe(title);
    expect(el(out?.get("s2")?.elements, "d")).toBe(spreads[1].elements[1]);
    expect(out?.get("s1")?.elements.map((e) => e.id)).toEqual(["a", "b", "t1"]);
  });

  it("replaces a background that was the photo that left with the one that came in", () => {
    const out = swapPhotoPatches(book(), { spreadId: "s1", elId: "a" }, { spreadId: "s2", elId: "c" });
    expect(out?.get("s1")?.background_photo_id).toBe("photo-C");
    expect(out?.get("s2")?.background_photo_id).toBe("photo-A");
  });

  it("keeps a background that wasn't the swapped photo", () => {
    const out = swapPhotoPatches(book(), { spreadId: "s1", elId: "b" }, { spreadId: "s2", elId: "d" });
    expect(out?.get("s1")?.background_photo_id).toBe("photo-A");
    expect(out?.get("s2")?.background_photo_id).toBe("photo-C");
    expect(el(out?.get("s1")?.elements, "b").photoId).toBe("photo-D");
    expect(el(out?.get("s2")?.elements, "d").photoId).toBe("photo-B");
  });

  it("returns a patch only for the two pages involved", () => {
    const out = swapPhotoPatches(book(), { spreadId: "s1", elId: "a" }, { spreadId: "s3", elId: "e" });
    expect([...(out?.keys() ?? [])].sort()).toEqual(["s1", "s3"]);
  });

  it("swaps two photos on the same page, keeping its background (both photos are still there)", () => {
    const out = swapPhotoPatches(book(), { spreadId: "s1", elId: "a" }, { spreadId: "s1", elId: "b" });
    expect([...(out?.keys() ?? [])]).toEqual(["s1"]);
    const patch = out?.get("s1");
    expect(el(patch?.elements, "a")).toMatchObject({ photoId: "photo-B", ...RESET });
    expect(el(patch?.elements, "b")).toMatchObject({ photoId: "photo-A", ...RESET });
    expect(patch?.background_photo_id).toBe("photo-A");
  });

  it("doesn't change the pages it was given", () => {
    const spreads = book();
    const before = JSON.parse(JSON.stringify(spreads));
    swapPhotoPatches(spreads, { spreadId: "s1", elId: "a" }, { spreadId: "s2", elId: "c" });
    expect(spreads).toEqual(before);
  });

  it("returns null when there is nothing to swap", () => {
    const spreads = book();
    // The same photo on both sides.
    const same = [...spreads, { id: "s4", elements: [photo("f", "photo-A")] as AlbumElement[], background_photo_id: null }];
    expect(swapPhotoPatches(same, { spreadId: "s1", elId: "a" }, { spreadId: "s4", elId: "f" })).toBeNull();
    // A missing page or element, or an element that isn't a photo.
    expect(swapPhotoPatches(spreads, { spreadId: "nope", elId: "a" }, { spreadId: "s2", elId: "c" })).toBeNull();
    expect(swapPhotoPatches(spreads, { spreadId: "s1", elId: "zz" }, { spreadId: "s2", elId: "c" })).toBeNull();
    expect(swapPhotoPatches(spreads, { spreadId: "s1", elId: "t1" }, { spreadId: "s2", elId: "c" })).toBeNull();
    // A page with no elements yet.
    const empty = [...spreads, { id: "s5", elements: null, background_photo_id: null }];
    expect(swapPhotoPatches(empty, { spreadId: "s5", elId: "a" }, { spreadId: "s2", elId: "c" })).toBeNull();
  });
});

describe("fitPhotoInFrame (the admin's swap, 2026-10-20)", () => {
  // A 60×30 spread: 1% across is 0.6 cm, 1% down is 0.3 cm.
  const page = { widthCm: 60, heightCm: 30 };
  // 20% × 60% of the spread = 12 × 18 cm, a portrait frame (aspect 2/3).
  const portrait = { xPct: 10, yPct: 20, widthPct: 20, heightPct: 60 };

  it("shrinks the frame to a landscape photo's shape, centred, so nothing is cut", () => {
    const out = fitPhotoInFrame(portrait, page, 1.5, [], true);
    // 12 cm wide → 8 cm tall at 3:2 = 26.67% of 30 cm, centred in the old 60%.
    expect(out.widthPct).toBe(20);
    expect(out.heightPct).toBeCloseTo(26.67, 2);
    expect(out.yPct).toBeCloseTo(20 + (60 - 80 / 3) / 2, 1);
    expect(out.xPct).toBe(10);
    expect([out.focalX, out.focalY, out.zoom]).toEqual([50, 50, 100]);
  });

  it("shrinks a wide frame to a portrait photo's shape, centred across", () => {
    // 60% × 60% = 36 × 18 cm (aspect 2) holding a 2:3 portrait.
    const out = fitPhotoInFrame({ xPct: 20, yPct: 20, widthPct: 60, heightPct: 60 }, page, 2 / 3, [], true);
    // 18 cm tall → 12 cm wide = 20% of 60 cm, centred in the old 60%.
    expect(out.widthPct).toBeCloseTo(20, 2);
    expect(out.xPct).toBeCloseTo(40, 2);
    expect(out.heightPct).toBe(60);
  });

  it("keeps a frame that can't change shape, and follows the faces across", () => {
    // A landscape photo in the portrait frame: only 2/3 ÷ 1.5 = 44% of its width shows.
    const face = { x: 0.7, y: 0.3, width: 0.1, height: 0.15 };
    const out = fitPhotoInFrame(portrait, page, 1.5, [face], false);
    expect(out.widthPct).toBe(20);
    expect(out.heightPct).toBe(60);
    const visible = (2 / 3) / 1.5;
    const start = (out.focalX / 100) * (1 - visible);
    // The face is fully inside the visible part.
    expect(start).toBeLessThanOrEqual(face.x);
    expect(start + visible).toBeGreaterThanOrEqual(face.x + face.width);
  });

  it("never cuts a head off the top when the photo is cropped top and bottom", () => {
    // A portrait photo (2:3) in a slightly wider frame (aspect 0.72): crop 1.08, under the limit.
    const frame = { xPct: 10, yPct: 10, widthPct: 24, heightPct: 66.67 };
    const faces = [{ x: 0.4, y: 0.05, width: 0.2, height: 0.12 }];
    const out = fitPhotoInFrame(frame, page, 2 / 3, faces, true);
    expect(out.heightPct).toBe(66.67);
    const visible = (2 / 3) / ((24 * 60) / (66.67 * 30));
    const start = (out.focalY / 100) * (1 - visible);
    // The top of the head (face top less ~35% of its height for hair) is visible.
    expect(start).toBeLessThanOrEqual(Math.max(0, 0.05 - 0.35 * 0.12) + 1e-9);
  });

  it("without faces, shows the centre a little above the middle", () => {
    const out = fitPhotoInFrame({ xPct: 10, yPct: 10, widthPct: 24, heightPct: 66.67 }, page, 2 / 3, [], false);
    expect(out.focalX).toBe(50);
    expect(out.focalY).toBe(40);
  });

  it("is used by swapPhotoPatches when given, instead of the crop reset", () => {
    const spreads = [
      { id: "s1", background_photo_id: null, elements: [photo("a", "pA")] },
      { id: "s2", background_photo_id: null, elements: [photo("b", "pB")] },
    ];
    const patches = swapPhotoPatches(spreads, { spreadId: "s1", elId: "a" }, { spreadId: "s2", elId: "b" }, (el, spreadId, photoId) => ({ focalX: photoId === "pB" ? 11 : 22, focalY: spreadId === "s1" ? 33 : 44 }));
    const a = patches!.get("s1")!.elements[0] as { photoId: string; focalX: number; focalY: number };
    const b = patches!.get("s2")!.elements[0] as { photoId: string; focalX: number; focalY: number };
    expect([a.photoId, a.focalX, a.focalY]).toEqual(["pB", 11, 33]);
    expect([b.photoId, b.focalX, b.focalY]).toEqual(["pA", 22, 44]);
  });
});
