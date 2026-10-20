import { describe, expect, it } from "vitest";
import { swapPhotoPatches } from "@/lib/albumAuto/swapPhotos";
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
