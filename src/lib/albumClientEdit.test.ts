import { describe, expect, it } from "vitest";
import {
  CLIENT_HISTORY_MAX,
  canReturnToOriginal,
  changedFrameIds,
  cropOf,
  fitsFrame,
  pagePhotoIds,
  parseClientEditRequest,
  pushHistory,
  samePage,
  swapRedesignPages,
} from "@/lib/albumClientEdit";
import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";

// The client's changes to the album design (CLAUDE.md, "עריכת האלבום על ידי הלקוח"): what the browser
// and the server both need — when a swap redesigns a page, the 3-step history, and which frames
// the photographer sees as changed.

const page = { widthCm: 60, heightCm: 30 };
// 30% × 90% of a 60×30 page is 18×27 cm: a portrait frame of 2:3.
const portraitFrame = { xPct: 5, yPct: 5, widthPct: 30, heightPct: 90 };
// 45% × 60% is 27×18 cm: a landscape frame of 3:2.
const landscapeFrame = { xPct: 50, yPct: 20, widthPct: 45, heightPct: 60 };
const PORTRAIT = 2 / 3;
const LANDSCAPE = 3 / 2;

const photo = (id: string, photoId: string | null, extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement => ({
  id,
  type: "photo",
  photoId,
  ...portraitFrame,
  focalX: 50,
  focalY: 50,
  ...extra,
});

describe("cropOf", () => {
  it("is 1 when the photo has the frame's shape, and the ratio between them otherwise", () => {
    expect(cropOf(portraitFrame, page, PORTRAIT)).toBeCloseTo(1);
    expect(cropOf(landscapeFrame, page, PORTRAIT)).toBeCloseTo(2.25);
    expect(cropOf(portraitFrame, page, LANDSCAPE)).toBeCloseTo(2.25);
  });
});

describe("fitsFrame", () => {
  it("takes a photo of the same orientation, and not one of the other", () => {
    expect(fitsFrame(portraitFrame, page, 0.75, PORTRAIT)).toBe(true);
    expect(fitsFrame(portraitFrame, page, LANDSCAPE, PORTRAIT)).toBe(false);
  });

  it("only counts a crop worse than the photo that was there", () => {
    // A square photo in a landscape frame crops 1.5 — over the limit, but no worse than before.
    expect(fitsFrame(landscapeFrame, page, 1, 1)).toBe(true);
    expect(fitsFrame(landscapeFrame, page, 1, LANDSCAPE)).toBe(false);
  });
});

describe("swapRedesignPages", () => {
  const side = (spreadId: string, frame: typeof portraitFrame, photoAspect: number) => ({ spreadId, frame, page, photoAspect });

  it("redesigns nothing when both photos fit", () => {
    expect(swapRedesignPages(side("p1", portraitFrame, PORTRAIT), side("p2", portraitFrame, 0.7))).toEqual([]);
  });

  it("redesigns both pages when a portrait photo and a landscape one change places", () => {
    expect(swapRedesignPages(side("p1", portraitFrame, PORTRAIT), side("p2", landscapeFrame, LANDSCAPE))).toEqual(["p1", "p2"]);
  });

  it("redesigns the page once when both photos are on it", () => {
    expect(swapRedesignPages(side("p1", portraitFrame, PORTRAIT), side("p1", landscapeFrame, LANDSCAPE))).toEqual(["p1"]);
  });
});

describe("pushHistory", () => {
  it(`keeps the last ${CLIENT_HISTORY_MAX} designs, the latest last`, () => {
    const s = (n: number) => ({ elements: [photo(`f${n}`, `p${n}`)] as AlbumElement[], background_photo_id: null });
    let h = pushHistory(null, s(1));
    for (let n = 2; n <= 5; n++) h = pushHistory(h, s(n));
    expect(h.map((x) => x.elements[0].id)).toEqual(["f3", "f4", "f5"]);
  });
});

describe("samePage", () => {
  it("ignores key order, as jsonb returns it", () => {
    const a = { elements: [photo("f1", "p1")] as AlbumElement[], background_photo_id: "p1" };
    const reordered = JSON.parse(JSON.stringify({ background_photo_id: "p1", elements: [{ ...Object.fromEntries(Object.entries(a.elements[0]).reverse()) }] }));
    expect(samePage(a, reordered)).toBe(true);
    expect(samePage(a, { ...a, background_photo_id: null })).toBe(false);
    expect(samePage(a, { ...a, elements: [photo("f1", "p2")] })).toBe(false);
  });
});

describe("changedFrameIds", () => {
  it("lists the frames with another photo, moved, or new — not the ones as they were", () => {
    const before = [photo("a", "p1"), photo("b", "p2", landscapeFrame)] as AlbumElement[];
    expect(changedFrameIds(before, before)).toEqual([]);
    expect(changedFrameIds(before, [photo("a", "p2"), photo("b", "p2", landscapeFrame)])).toEqual(["a"]);
    expect(changedFrameIds(before, [photo("a", "p1", { xPct: 6 }), photo("new", "p2")])).toEqual(["a", "new"]);
  });
});

describe("pagePhotoIds", () => {
  it("lists every photo once per frame, sorted, without empty frames", () => {
    expect(pagePhotoIds([photo("a", "p2"), photo("b", null), photo("c", "p1"), photo("d", "p2")])).toEqual(["p1", "p2", "p2"]);
  });
});

describe("canReturnToOriginal", () => {
  const sent = { elements: [photo("a", "p1"), photo("b", "p2")] as AlbumElement[] };
  it("only for a changed page that still holds the photos it was sent with", () => {
    expect(canReturnToOriginal(null, sent.elements)).toBe(false);
    expect(canReturnToOriginal(sent, [photo("x", "p2", landscapeFrame), photo("y", "p1")])).toBe(true);
    expect(canReturnToOriginal(sent, [photo("a", "p1"), photo("b", "p9")])).toBe(false);
  });
});

describe("parseClientEditRequest", () => {
  const id1 = "11111111-1111-4111-8111-111111111111";
  const id2 = "22222222-2222-4222-8222-222222222222";

  it("reads a swap, and a redesign only when asked", () => {
    expect(parseClientEditRequest({ action: "swap", a: { spreadId: id1, elId: "a" }, b: { spreadId: id2, elId: "b" } })).toEqual({
      action: "swap",
      a: { spreadId: id1, elId: "a" },
      b: { spreadId: id2, elId: "b" },
      redesign: false,
    });
    expect(parseClientEditRequest({ action: "swap", a: { spreadId: id1, elId: "a" }, b: { spreadId: id2, elId: "b" }, redesign: true })).toMatchObject({ redesign: true });
  });

  it("rejects a swap of a frame with itself, and ids that aren't the album's kind", () => {
    expect(parseClientEditRequest({ action: "swap", a: { spreadId: id1, elId: "a" }, b: { spreadId: id1, elId: "a" } })).toBeNull();
    expect(parseClientEditRequest({ action: "swap", a: { spreadId: "x", elId: "a" }, b: { spreadId: id2, elId: "b" } })).toBeNull();
    expect(parseClientEditRequest({ action: "back", spreadId: "1; drop table" })).toBeNull();
    expect(parseClientEditRequest({ action: "delete" })).toBeNull();
    expect(parseClientEditRequest(null)).toBeNull();
  });

  it("keeps a redesign's place in the cycle within bounds", () => {
    expect(parseClientEditRequest({ action: "redesign", spreadId: id1, count: 4, seen: ["a", 7, "b"] })).toEqual({ action: "redesign", spreadId: id1, count: 4, seen: ["a", "b"] });
    expect(parseClientEditRequest({ action: "redesign", spreadId: id1, count: 1.5 })).toEqual({ action: "redesign", spreadId: id1, count: -1, seen: [] });
    expect(parseClientEditRequest({ action: "redesign", spreadId: id1, seen: Array.from({ length: 500 }, () => "s") })).toMatchObject({ seen: { length: 300 } });
  });

  it("reads back, original and reset", () => {
    expect(parseClientEditRequest({ action: "back", spreadId: id1 })).toEqual({ action: "back", spreadId: id1 });
    expect(parseClientEditRequest({ action: "original", spreadId: id1 })).toEqual({ action: "original", spreadId: id1 });
    expect(parseClientEditRequest({ action: "original" })).toBeNull();
    expect(parseClientEditRequest({ action: "reset" })).toEqual({ action: "reset" });
  });
});
