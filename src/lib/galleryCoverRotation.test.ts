import { describe, expect, it } from "vitest";
import { collageSource, type PhotoFacesFound, type PickablePhoto } from "@/lib/collage/pick";
import { COVER_ROTATION_CANDIDATES, COVER_ROTATION_SHOWN, coverDrawWidth, coverOrientation, coverRotationIds, rotationForBox } from "@/lib/galleryCoverRotation";

// The client gallery's rotating cover (2026-10-24): the chosen cover first, then the main figures.

const folders = [
  { id: "f1", name: "1.אוירה" },
  { id: "f2", name: "2.חתן" },
  { id: "f3", name: "3.משפחה" },
  { id: "f4", name: "4.ריקודים" },
];
const gallery = (perFolder: number): PickablePhoto[] =>
  folders.flatMap((f) => Array.from({ length: perFolder }, (_, i) => ({ id: `${f.id}-${i}`, favorite: false, folderId: f.id })));

describe("coverRotationIds", () => {
  it("starts with the chosen cover, then only the owners' tab", () => {
    const photos = gallery(30);
    const ids = coverRotationIds({ coverId: "f1-3", source: collageSource("wedding", folders, photos), photos, folders });
    expect(ids[0]).toBe("f1-3");
    expect(ids.slice(1).every((id) => id.startsWith("f2-"))).toBe(true);
    expect(ids.length).toBe(1 + COVER_ROTATION_CANDIDATES);
  });

  it("never shows the chosen cover twice", () => {
    const photos = gallery(5);
    const ids = coverRotationIds({ coverId: "f2-2", source: collageSource("bar_mitzvah", folders, photos), photos, folders });
    expect(ids).toEqual(["f2-2", "f2-0", "f2-1", "f2-3", "f2-4"]);
  });

  it("takes the client's favorites first", () => {
    const photos = gallery(40).map((p) => (p.id === "f2-30" || p.id === "f2-31" ? { ...p, favorite: true } : p));
    const ids = coverRotationIds({ coverId: "f1-0", source: collageSource("wedding", folders, photos), photos, folders });
    expect(ids.slice(1, 3).sort()).toEqual(["f2-30", "f2-31"]);
  });

  it("skips rejected photos", () => {
    const photos = gallery(3).map((p) => (p.id === "f2-1" ? { ...p, rejected: true } : p));
    const ids = coverRotationIds({ coverId: "f1-0", source: collageSource("wedding", folders, photos), photos, folders });
    expect(ids).toEqual(["f1-0", "f2-0", "f2-2"]);
  });

  it("a photo session rotates over every tab", () => {
    const photos = gallery(10);
    const ids = coverRotationIds({ coverId: "f1-0", source: collageSource("book", folders, photos), photos, folders });
    const tabs = new Set(ids.slice(1).map((id) => id.split("-")[0]));
    expect(tabs).toEqual(new Set(["f1", "f2", "f3", "f4"]));
  });

  it("stays on the cover when the main figures can't be told (no owners' tab, no saved faces)", () => {
    const noOwners = [
      { id: "a", name: "טקס" },
      { id: "b", name: "מסיבה" },
    ];
    const photos: PickablePhoto[] = ["a", "b"].flatMap((f) => Array.from({ length: 10 }, (_, i) => ({ id: `${f}${i}`, favorite: false, folderId: f })));
    const source = collageSource("wedding", noOwners, photos);
    expect(source.mode).toBe("faces");
    expect(coverRotationIds({ coverId: "a0", source, photos, folders: noOwners })).toEqual(["a0"]);
    expect(coverRotationIds({ coverId: "a0", source, photos, folders: noOwners, found: [] })).toEqual(["a0"]);
  });

  it("with saved faces, the most frequent person (a child's event)", () => {
    const photos: PickablePhoto[] = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, favorite: false, folderId: null }));
    const child = Array.from({ length: 128 }, (_, k) => (k === 0 ? 1 : 0));
    const guest = (i: number) => Array.from({ length: 128 }, (_, k) => (k === (i % 100) + 5 ? 1 : 0));
    const found: PhotoFacesFound[] = photos.map((p, i) => ({
      photoId: p.id,
      faces: [{ descriptor: i % 3 === 0 ? child : guest(i), box: { x: 0.4, y: 0.2, width: 0.15, height: 0.2 } }],
    }));
    const source = collageSource("bar_mitzvah", [], photos);
    const ids = coverRotationIds({ coverId: "p1", source, photos, folders: [], found });
    expect(ids[0]).toBe("p1");
    expect(ids.slice(1).sort()).toEqual(["p0", "p12", "p15", "p18", "p21", "p24", "p27", "p3", "p6", "p9"].sort());
  });
});

describe("rotationForBox", () => {
  const list = (aspects: (number | null)[]) => aspects.map((aspect, i) => ({ id: i, aspect }));

  it("keeps the photos shaped like the box, the cover always first", () => {
    const photos = list([0.66, 1.5, 0.66, 1.5, 1.5, 0.66, 1.5]);
    expect(rotationForBox(photos, "landscape").map((p) => p.id)).toEqual([0, 1, 3, 4, 6]);
    // Only 2 portrait photos besides the cover: not enough, so all of them.
    expect(rotationForBox(photos, "portrait").map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("takes every photo when fewer than 3 fit the box", () => {
    const photos = list([1.5, 1.5, 1.5, 0.66, 1.5]);
    expect(rotationForBox(photos, "portrait").map((p) => p.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("a square box takes any photo", () => {
    const photos = list([1, 1.5, 0.66, null]);
    expect(rotationForBox(photos, "any").map((p) => p.id)).toEqual([0, 1, 2, 3]);
  });

  it("an unknown shape doesn't count as fitting", () => {
    const photos = list([1.5, null, null, null, 1.5, 1.5, 1.5]);
    expect(rotationForBox(photos, "landscape").map((p) => p.id)).toEqual([0, 4, 5, 6]);
  });

  it("shows at most the cap", () => {
    const photos = list(Array.from({ length: 30 }, () => 1.5));
    expect(rotationForBox(photos, "landscape")).toHaveLength(COVER_ROTATION_SHOWN);
  });

  it("orientation of a box", () => {
    expect(coverOrientation(16 / 9)).toBe("landscape");
    expect(coverOrientation(390 / 780)).toBe("portrait");
    expect(coverOrientation(1)).toBe("any");
  });
});

describe("coverDrawWidth", () => {
  it("a photo narrower than the box is drawn at the box's width", () => {
    expect(coverDrawWidth(1.5, 1440, 900)).toBe(1450);
    expect(coverDrawWidth(0.66, 390, 776)).toBe(550);
  });
  it("a landscape photo on a phone's tall cover is drawn to the cover's height", () => {
    expect(coverDrawWidth(1.5, 390, 776)).toBe(1200);
  });
});
