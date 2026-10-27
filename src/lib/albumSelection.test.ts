import { describe, expect, it } from "vitest";
import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";
import { albumPoolIds, matchSlots, selectionDiff, selectionPlan, type SelectionPhoto, type SelectionSpread } from "@/lib/albumSelection";

// The album selection (owner, 2026-10-27): the pool the album tools offer, and what a changed
// selection does to an album that already exists.
const frame = (id: string, photoId: string | null, xPct = 10, widthPct = 30): AlbumPhotoElement => ({
  id,
  type: "photo",
  photoId,
  xPct,
  yPct: 10,
  widthPct,
  heightPct: 40,
  focalX: 50,
  focalY: 50,
  zoom: 100,
  borderWidth: 3,
  borderColor: "#ffffff",
});
const text: AlbumElement = { id: "t1", type: "text", text: "שלום", xPct: 5, yPct: 80, widthPct: 40, fontSize: 40, color: "#000", fontFamily: "Rubik", align: "center" } as AlbumElement;
const spread = (id: string, sort_order: number, elements: AlbumElement[], extra: Partial<SelectionSpread> = {}): SelectionSpread => ({
  id,
  sort_order,
  elements,
  background_photo_id: null,
  width_cm: null,
  height_cm: null,
  ...extra,
});
const photo = (id: string, folder_id: string | null = "f1", aspect = 1.5): SelectionPhoto => ({ id, folder_id, aspect });
const album = { width_cm: 60, height_cm: 30, safe_margin_cm: 0.5 };
const photosOf = (els: AlbumElement[] | undefined) => (els ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo").map((el) => el.photoId);

describe("albumPoolIds", () => {
  const photos = [
    { id: "a", is_favorite: true },
    { id: "b", is_favorite: false },
    { id: "c", is_favorite: true },
  ];
  it("offers the favorites while there is no confirmed selection", () => {
    expect(albumPoolIds(photos, null)).toEqual(["a", "c"]);
  });
  it("offers the confirmed selection, in gallery order, once there is one", () => {
    expect(albumPoolIds(photos, ["c", "b"])).toEqual(["b", "c"]);
    expect(albumPoolIds(photos, [])).toEqual([]);
  });
});

describe("selectionDiff", () => {
  const spreads = [spread("s1", 1, [frame("e1", "a"), frame("e2", "b")]), spread("s0", 0, [frame("e0", "x")])];
  it("frees the frames of photos that left the selection, and lists the ones that joined", () => {
    const d = selectionDiff(spreads, new Set(["a", "b", "x", "c"]), ["a", "x", "d"]);
    expect(d.removed).toEqual([{ spreadId: "s1", elId: "e2", photoId: "b" }]);
    expect(d.added).toEqual(["d"]);
  });
  it("on the first selection, every picked photo that isn't in the album joins (the owner's 1-6 example)", () => {
    const album = [spread("s", 0, ["a", "b", "c", "d", "e", "f"].map((p, i) => frame(`e${i + 1}`, p)))];
    const d = selectionDiff(album, new Set(["a", "b", "c", "d", "e", "f", "g", "h"]), ["a", "b", "c", "d", "g", "h"], true);
    expect(d.removed.map((s) => s.photoId)).toEqual(["e", "f"]);
    expect(d.added).toEqual(["g", "h"]);
  });
  it("a later change doesn't bring back a photo of the previous selection left out of the album", () => {
    const album = [spread("s", 0, [frame("e1", "a"), frame("e2", "b")])];
    const d = selectionDiff(album, new Set(["a", "b", "c"]), ["a", "c", "d"]);
    expect(d.removed.map((s) => s.photoId)).toEqual(["b"]);
    expect(d.added).toEqual(["d"]);
  });
  it("keeps a photo placed from outside the selection, and never adds one already in the album", () => {
    const d = selectionDiff(spreads, new Set(["a", "b"]), ["a", "b", "x"]);
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual([]);
  });
});

describe("matchSlots", () => {
  it("prefers the same tab, then the nearest photo in the gallery's order", () => {
    const photos = [photo("old1", "f1"), photo("new1", "f1"), photo("old2", "f2"), photo("new2", "f2")];
    const slots = [
      { spreadId: "s", elId: "e1", photoId: "old2" },
      { spreadId: "s", elId: "e2", photoId: "old1" },
    ];
    const m = matchSlots(slots, ["new1", "new2"], photos, () => 1.5);
    expect(m.get(0)).toBe("new2");
    expect(m.get(1)).toBe("new1");
  });
  it("prefers the shape that fits the frame", () => {
    const photos = [photo("old", "f1"), photo("wide", "f1", 1.5), photo("tall", "f1", 0.67)];
    const m = matchSlots([{ spreadId: "s", elId: "e", photoId: "old" }], ["wide", "tall"], photos, () => 0.7);
    expect(m.get(0)).toBe("tall");
  });
});

describe("selectionPlan", () => {
  const photos = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => photo(id));

  it("puts a joined photo in a freed frame, marks it, and moves the page's background with it", () => {
    const spreads = [spread("s1", 0, [frame("e1", "a"), frame("e2", "b"), text], { background_photo_id: "b" })];
    const plan = selectionPlan({ spreads, removed: [{ spreadId: "s1", elId: "e2", photoId: "b" }], added: ["c"], photos, album, idPrefix: "t" });
    const p = plan.patches.get("s1")!;
    expect(photosOf(p.elements)).toEqual(["a", "c"]);
    expect(p.elements.find((el) => el.id === "e2")).toMatchObject({ xPct: 10, widthPct: 30, borderWidth: 3 });
    expect(p.marked_frames).toEqual(["e2"]);
    expect(p.background_photo_id).toBe("c");
    expect(plan.replaced).toBe(1);
    expect(plan.newPages).toEqual([]);
  });

  describe("more photos left than joined", () => {
    const spreads = [spread("s1", 0, [frame("e1", "a"), frame("e2", "b"), frame("e3", "c"), text])];
    const removed = [
      { spreadId: "s1", elId: "e2", photoId: "b" },
      { spreadId: "s1", elId: "e3", photoId: "c" },
    ];
    it("leaves the extra frame empty and marked", () => {
      const plan = selectionPlan({ spreads, removed, added: ["d"], photos, album, idPrefix: "t", leftoverFrames: "empty" });
      const p = plan.patches.get("s1")!;
      expect(photosOf(p.elements).sort()).toEqual(["a", "d", null].sort());
      expect(p.marked_frames.sort()).toEqual(["e2", "e3"]);
      expect(plan.emptied).toBe(1);
    });
    it("deletes the extra frame, leaving the rest of the page as it was", () => {
      const plan = selectionPlan({ spreads, removed, added: ["d"], photos, album, idPrefix: "t", leftoverFrames: "remove" });
      const p = plan.patches.get("s1")!;
      expect(p.elements.filter((el) => el.type === "photo")).toHaveLength(2);
      expect(p.elements.find((el) => el.id === "e1")).toMatchObject({ photoId: "a", xPct: 10 });
      expect(p.elements.some((el) => el.id === "t1")).toBe(true);
      expect(plan.removedFrames).toBe(1);
    });
    it("redesigns the page for the photos it has now, marking only the new one", () => {
      const plan = selectionPlan({ spreads, removed, added: ["d"], photos, album, idPrefix: "t", leftoverFrames: "redesign" });
      const p = plan.patches.get("s1")!;
      expect(photosOf(p.elements).sort()).toEqual(["a", "d"]);
      expect(p.elements.some((el) => el.id === "t1")).toBe(true);
      const dFrame = p.elements.find((el) => el.type === "photo" && el.photoId === "d")!;
      expect(p.marked_frames).toEqual([dFrame.id]);
      expect(plan.redesigned).toBe(1);
    });
    it("drops a page left with no photo at all", () => {
      const lone = [spread("s1", 0, [frame("e1", "a")]), spread("s2", 1, [frame("e2", "b")])];
      for (const leftoverFrames of ["remove", "redesign"] as const) {
        const plan = selectionPlan({ spreads: lone, removed: [{ spreadId: "s1", elId: "e1", photoId: "a" }], added: [], photos, album, idPrefix: "t", leftoverFrames });
        expect(plan.deleted).toEqual(["s1"]);
        expect(plan.patches.has("s1")).toBe(false);
      }
    });
    it("never redesigns a cover page: its frame stays, empty", () => {
      const cover = [spread("c", 0, [frame("e1", "a")], { width_cm: 32, height_cm: 32 })];
      const plan = selectionPlan({ spreads: cover, removed: [{ spreadId: "c", elId: "e1", photoId: "a" }], added: [], photos, album, idPrefix: "t", leftoverFrames: "redesign" });
      expect(photosOf(plan.patches.get("c")!.elements)).toEqual([null]);
    });
  });

  describe("more photos joined than left", () => {
    const spreads = [spread("s1", 0, [frame("e1", "a"), frame("e2", "b")]), spread("s2", 1, [frame("e3", "g"), frame("e4", "h")])];
    const removed = [{ spreadId: "s1", elId: "e2", photoId: "b" }];
    it("puts the rest on a new page at the end, every frame marked", () => {
      const plan = selectionPlan({ spreads, removed, added: ["c", "d", "e"], photos, album, idPrefix: "t", leftoverPhotos: "newPage" });
      expect(plan.replaced).toBe(1);
      expect(plan.newPages).toHaveLength(1);
      const page = plan.newPages[0];
      expect(photosOf(page.elements)).toHaveLength(2);
      expect(page.marked_frames).toHaveLength(2);
      const all = [...photosOf(plan.patches.get("s1")!.elements), ...photosOf(page.elements)];
      expect(all.sort()).toEqual(["a", "c", "d", "e"]);
    });
    it("splits many photos into pages of up to 8", () => {
      const many = Array.from({ length: 19 }, (_, i) => `n${i}`);
      const plan = selectionPlan({ spreads, removed: [], added: many, photos: [...photos, ...many.map((id) => photo(id))], album, idPrefix: "t" });
      expect(plan.newPages.map((p) => photosOf(p.elements).length)).toEqual([7, 6, 6]);
    });
    it("redesigns the page that lost a photo, for its new count", () => {
      const plan = selectionPlan({ spreads, removed, added: ["c", "d", "e"], photos, album, idPrefix: "t", leftoverPhotos: "redesign" });
      expect(plan.newPages).toEqual([]);
      const p = plan.patches.get("s1")!;
      expect(photosOf(p.elements).sort()).toEqual(["a", "c", "d", "e"]);
      expect(p.marked_frames).toHaveLength(3);
      expect(plan.patches.has("s2")).toBe(false);
    });
    it("with nothing removed, a joined photo goes to the page nearest it in the gallery", () => {
      const plan = selectionPlan({ spreads, removed: [], added: ["f"], photos, album, idPrefix: "t", leftoverPhotos: "redesign" });
      expect(photosOf(plan.patches.get("s2")!.elements).sort()).toEqual(["f", "g", "h"]);
      expect(plan.patches.has("s1")).toBe(false);
    });
  });

  it("a redesigned page keeps the marks of photos not yet seen from an earlier change", () => {
    const spreads = [spread("s1", 0, [frame("e1", "a"), frame("e2", "b"), frame("e3", "c")], { marked_frames: ["e1"] })];
    const plan = selectionPlan({
      spreads,
      removed: [
        { spreadId: "s1", elId: "e2", photoId: "b" },
        { spreadId: "s1", elId: "e3", photoId: "c" },
      ],
      added: ["d"],
      photos,
      album,
      idPrefix: "t",
      leftoverFrames: "redesign",
    });
    const p = plan.patches.get("s1")!;
    const marked = p.elements.filter((el) => p.marked_frames.includes(el.id)).map((el) => (el as AlbumPhotoElement).photoId);
    expect(marked.sort()).toEqual(["a", "d"]);
  });

  it("keeps a page's existing marks, minus frames that are gone", () => {
    const spreads = [spread("s1", 0, [frame("e1", "a"), frame("e2", "b")], { marked_frames: ["e1", "gone"] })];
    const plan = selectionPlan({ spreads, removed: [{ spreadId: "s1", elId: "e2", photoId: "b" }], added: ["c"], photos, album, idPrefix: "t" });
    expect(plan.patches.get("s1")!.marked_frames.sort()).toEqual(["e1", "e2"]);
  });
});
