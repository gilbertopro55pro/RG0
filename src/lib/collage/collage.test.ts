import { describe, expect, it } from "vitest";
import { COLLAGE_MAX_CROP, collageCrop, collageLayout, type CollageLayout, type CollagePhoto } from "@/lib/collage/layout";
import { collageSource, collageSubject, faceSample, mainPeopleGroups, pickCollagePhotos, pickPhase, sourceGroups, type PickablePhoto } from "@/lib/collage/pick";
import { collageFileName, collagePixels, jpegWithDpi, MOBILE_MAX_PIXELS, DESKTOP_MAX_PIXELS } from "@/lib/collage/output";

// The automatic collage (admin, 2026-10-23): the layout, which photos, and the file.

const L = 1.5; // a landscape camera photo
const P = 2 / 3; // a portrait one
const photos = (aspects: number[]): CollagePhoto[] => aspects.map((aspect, i) => ({ id: `p${i}`, aspect }));

// Checks a layout fills the page: every cell inside, none overlapping, the gaps even.
function checkTiles(layout: CollageLayout, pageAspect: number, gap: number) {
  const g = gap; // fraction of the width
  const gy = gap * pageAspect; // the same length as a fraction of the height
  for (const c of layout.cells) {
    expect(c.x).toBeGreaterThanOrEqual(g - 1e-9);
    expect(c.y).toBeGreaterThanOrEqual(gy - 1e-9);
    expect(c.x + c.w).toBeLessThanOrEqual(1 - g + 1e-9);
    expect(c.y + c.h).toBeLessThanOrEqual(1 - gy + 1e-9);
  }
  for (let i = 0; i < layout.cells.length; i++)
    for (let j = i + 1; j < layout.cells.length; j++) {
      const a = layout.cells[i];
      const b = layout.cells[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(overlapX < 1e-9 || overlapY < 1e-9).toBe(true);
    }
  // Filled: the cells and the gaps between them cover the whole inner area.
  const area = layout.cells.reduce((s, c) => s + c.w * c.h, 0);
  expect(area).toBeGreaterThan((1 - 2 * g) * (1 - 2 * gy) * 0.8);
}

describe("collageLayout", () => {
  const page = 60 / 40;

  it("lays 8 photos on a 60×40 page edge to edge, every photo once, cropping little", () => {
    const set = photos([L, L, P, L, P, L, L, P]);
    const layout = collageLayout(set, { aspect: page, gap: 0.006 })!;
    expect(layout.cells.map((c) => c.photoId).sort()).toEqual(set.map((p) => p.id).sort());
    expect(layout.maxCrop).toBeLessThanOrEqual(COLLAGE_MAX_CROP);
    checkTiles(layout, page, 0.006);
  });

  it("each cell's shape is its photo's, cut by the reported crop at most", () => {
    const set = photos([L, P, L, L, P, L, P, L, L, L]);
    const layout = collageLayout(set, { aspect: page, gap: 0.005 })!;
    const byId = new Map(set.map((p) => [p.id, p.aspect]));
    for (const c of layout.cells) {
      const cellAspect = (c.w * page) / c.h;
      const photo = byId.get(c.photoId)!;
      expect(Math.max(cellAspect / photo, photo / cellAspect)).toBeLessThanOrEqual(layout.maxCrop + 1e-6);
    }
  });

  it("works from 2 to 30 photos, any mix of shapes", () => {
    for (const n of [2, 3, 5, 8, 12, 20, 30]) {
      const set = photos(Array.from({ length: n }, (_, i) => (i % 3 === 0 ? P : L)));
      const layout = collageLayout(set, { aspect: page, gap: 0.004 })!;
      expect(layout.cells).toHaveLength(n);
      checkTiles(layout, page, 0.004);
    }
  });

  it("is the same every time for the same input (the preview and the file match)", () => {
    const set = photos([L, P, L, P, L, L, P, L]);
    expect(collageLayout(set, { aspect: page, gap: 0.006, variant: 2 })).toEqual(collageLayout(set, { aspect: page, gap: 0.006, variant: 2 }));
  });

  it("another variant looks different, and they come back around", () => {
    const set = photos([L, P, L, P, L, L, P, L]);
    const looks = new Set(Array.from({ length: 4 }, (_, v) => collageLayout(set, { aspect: page, gap: 0.006, variant: v })!.signature.replace(/\|.*$/, "")));
    expect(looks.size).toBeGreaterThan(1);
  });

  it("a forced style: hero puts one photo the full height on a side; rows and columns as asked", () => {
    const set = photos([P, L, L, L, L, L, P, L]);
    const hero = collageLayout(set, { aspect: page, gap: 0.006, style: "hero" })!;
    expect(hero.style).toBe("hero");
    const tall = hero.cells.filter((c) => c.h > 0.95);
    expect(tall).toHaveLength(1);
    expect(collageLayout(set, { aspect: page, gap: 0.006, style: "rows" })!.style).toBe("rows");
    expect(collageLayout(set, { aspect: page, gap: 0.006, style: "columns" })!.style).toBe("columns");
  });

  it("no gap: the photos touch and fill the page completely", () => {
    const set = photos([L, L, L, L, L, L]);
    const layout = collageLayout(set, { aspect: page, gap: 0, style: "rows" })!;
    expect(layout.cells.reduce((s, c) => s + c.w * c.h, 0)).toBeCloseTo(1, 9);
  });

  it("nothing to lay out: null", () => {
    expect(collageLayout([], { aspect: page, gap: 0.01 })).toBeNull();
  });
});

describe("collageCrop", () => {
  it("a wide photo in a narrower cell keeps the faces, centered on them", () => {
    // A 3:2 photo in a square cell shows 2/3 of its width; the face at the right edge stays in.
    const crop = collageCrop(1.5, 1, [{ x: 0.85, y: 0.3, width: 0.1, height: 0.15 }]);
    expect(crop.sw).toBeCloseTo(2 / 3, 9);
    expect(crop.sx + crop.sw).toBeCloseTo(1, 9);
    expect(crop.sx).toBeLessThanOrEqual(0.85);
  });

  it("a tall photo in a wide cell never cuts the head: the hair above the face stays in", () => {
    // Portrait 2:3 in a 3:2 cell: shows 4/9 of the height. Face from 0.2 to 0.3, hair from 0.165.
    const crop = collageCrop(2 / 3, 1.5, [{ x: 0.4, y: 0.2, width: 0.2, height: 0.1 }]);
    expect(crop.sh).toBeCloseTo(4 / 9, 9);
    expect(crop.sy).toBeLessThanOrEqual(0.2 - 0.1 * 0.35 + 1e-9);
    expect(crop.sy + crop.sh).toBeGreaterThanOrEqual(0.3);
  });

  it("without faces: a wide photo from its middle, a tall one a third of the way down", () => {
    expect(collageCrop(2, 1).sx).toBeCloseTo(0.25, 9);
    const tall = collageCrop(0.5, 1);
    expect(tall.sy).toBeCloseTo((1 - 0.5) * 0.3, 9);
  });

  it("a small face far behind doesn't pull the crop", () => {
    const withGuest = collageCrop(1.5, 1, [
      { x: 0.1, y: 0.3, width: 0.2, height: 0.3 },
      { x: 0.9, y: 0.1, width: 0.04, height: 0.06 },
    ]);
    expect(withGuest.sx).toBeCloseTo(0, 9);
  });

  it("the same shape: the whole photo", () => {
    expect(collageCrop(1.5, 1.5)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 });
  });
});

describe("collage photos: the event's main figures", () => {
  const folders = [
    { id: "f1", name: "1.אוירה" },
    { id: "f2", name: "2.חתן" },
    { id: "f3", name: "3.משפחה" },
    { id: "f4", name: "4.תפילה" },
  ];
  const gallery = (perFolder: Record<string, number>, favorites: string[] = []): PickablePhoto[] =>
    Object.entries(perFolder).flatMap(([folderId, n]) =>
      Array.from({ length: n }, (_, i) => ({ id: `${folderId}-${i}`, folderId, favorite: favorites.includes(`${folderId}-${i}`) }))
    );

  it("who: a couple at a wedding or a henna, the child at a bar/bat mitzvah, free in a photo session", () => {
    expect(collageSubject("wedding")).toBe("couple");
    expect(collageSubject("henna")).toBe("couple");
    expect(collageSubject("bar_mitzvah")).toBe("child");
    expect(collageSubject("bat_mitzvah")).toBe("child");
    expect(collageSubject("book")).toBe("free");
  });

  it("the owners' tab first: a עלייה לתורה takes its 8 photos from \"2.חתן\", spread over the tab", () => {
    const g = gallery({ f1: 20, f2: 40, f3: 30, f4: 50 });
    const source = collageSource("bar_mitzvah", folders, g);
    expect(source).toEqual({ mode: "tabs", folderIds: ["f2"] });
    const ids = pickCollagePhotos(sourceGroups(source, g, folders), 8);
    expect(ids).toHaveLength(8);
    expect(ids.every((id) => id.startsWith("f2-"))).toBe(true);
    // Spread: from near the start of the tab to near its end, never neighbours.
    const idx = ids.map((id) => Number(id.split("-")[1])).sort((a, b) => a - b);
    expect(idx[0]).toBeLessThan(5);
    expect(idx[7]).toBeGreaterThan(34);
    for (let i = 1; i < idx.length; i++) expect(idx[i] - idx[i - 1]).toBeGreaterThan(2);
  });

  it("a wedding with \"חתן\", \"כלה\" and \"הזוג\" tabs mixes all three", () => {
    const wf = [
      { id: "a", name: "1.התארגנות" },
      { id: "g", name: "2.חתן" },
      { id: "b", name: "3.כלה" },
      { id: "c", name: "4.הזוג" },
      { id: "m", name: "5.משפחה" },
    ];
    const g = gallery({ a: 30, g: 20, b: 20, c: 40, m: 30 });
    const source = collageSource("wedding", wf, g);
    expect(source).toEqual({ mode: "tabs", folderIds: ["g", "b", "c"] });
    const ids = pickCollagePhotos(sourceGroups(source, g, wf), 8);
    for (const tab of ["g", "b", "c"]) expect(ids.some((id) => id.startsWith(`${tab}-`))).toBe(true);
    expect(ids.some((id) => id.startsWith("a-") || id.startsWith("m-"))).toBe(false);
  });

  it("the client's favorites first, and only them when there are enough", () => {
    const fav = ["f2-3", "f2-9", "f2-15", "f2-21", "f2-27", "f2-30", "f2-33", "f2-36", "f2-38"];
    const g = gallery({ f1: 10, f2: 40, f3: 10 }, fav);
    const ids = pickCollagePhotos(sourceGroups(collageSource("bar_mitzvah", folders, g), g, folders), 8);
    expect(ids.every((id) => fav.includes(id))).toBe(true);
    // Fewer favorites than needed: all of them, then the rest.
    const few = gallery({ f2: 40 }, ["f2-5", "f2-6"]);
    const ids2 = pickCollagePhotos(sourceGroups(collageSource("bar_mitzvah", folders, few), few, folders), 8);
    expect(ids2.slice(0, 2)).toEqual(["f2-5", "f2-6"]);
    expect(ids2).toHaveLength(8);
  });

  it("rejected photos never go in", () => {
    const g = gallery({ f2: 10 }).map((p, i) => ({ ...p, rejected: i % 2 === 0 }));
    const ids = pickCollagePhotos(sourceGroups(collageSource("bar_mitzvah", folders, g), g, folders), 8);
    expect(ids).toHaveLength(5);
    expect(ids.every((id) => Number(id.split("-")[1]) % 2 === 1)).toBe(true);
  });

  it("a photo session (בוק): the whole gallery, every place it was shot in", () => {
    const bf = [
      { id: "x", name: "1.עין צורים" },
      { id: "y", name: "2.גרפיטי" },
      { id: "z", name: "3.חוף ים" },
    ];
    const g = gallery({ x: 100, y: 120, z: 121 });
    const source = collageSource("book", bf, g);
    expect(source).toEqual({ mode: "all" });
    const ids = pickCollagePhotos(sourceGroups(source, g, bf), 8);
    expect(ids).toHaveLength(8);
    for (const tab of ["x", "y", "z"]) expect(ids.some((id) => id.startsWith(`${tab}-`))).toBe(true);
  });

  it("a tab named for the child (\"2.נטע\" right before \"3.משפחה\") is the owners' tab; \"משפחת החתן\" is not", () => {
    const nf = [
      { id: "a", name: "1.אוירה" },
      { id: "n", name: "2.נטע" },
      { id: "m", name: "3.משפחה" },
    ];
    expect(collageSource("bat_mitzvah", nf, gallery({ a: 5, n: 5, m: 5 }))).toEqual({ mode: "tabs", folderIds: ["n"] });
    const wf = [
      { id: "g", name: "1.חתן וכלה" },
      { id: "m", name: "2.משפחת החתן" },
    ];
    expect(collageSource("wedding", wf, gallery({ g: 5, m: 5 }))).toEqual({ mode: "tabs", folderIds: ["g"] });
  });

  it("no owners' tab: a wedding or a bar mitzvah looks for the main people by their faces", () => {
    const g = gallery({ f1: 10, f3: 10 });
    expect(collageSource("wedding", folders, g)).toEqual({ mode: "faces", people: 2 });
    expect(collageSource("bat_mitzvah", [], g)).toEqual({ mode: "faces", people: 1 });
    expect(collageSource("other", [], g)).toEqual({ mode: "all" });
    // A tab named for them but empty doesn't count.
    expect(collageSource("bar_mitzvah", folders, gallery({ f1: 5, f3: 5 }))).toEqual({ mode: "faces", people: 1 });
  });

  it("\"other photos\": another phase picks other photos the same way, still spread over the tab", () => {
    const g = gallery({ f2: 60 });
    const groups = sourceGroups(collageSource("bar_mitzvah", folders, g), g, folders);
    const first = pickCollagePhotos(groups, 8, undefined, pickPhase(0));
    const second = pickCollagePhotos(groups, 8, undefined, pickPhase(1));
    expect(first).toEqual(pickCollagePhotos(groups, 8));
    expect(second).toHaveLength(8);
    expect(second.filter((id) => first.includes(id)).length).toBeLessThan(2);
    for (let r = 0; r < 20; r++) expect(pickPhase(r)).toBeGreaterThanOrEqual(0);
  });

  it("asks for more photos than there are: all of them", () => {
    const g = gallery({ f2: 3 });
    expect(pickCollagePhotos(sourceGroups(collageSource("bar_mitzvah", folders, g), g, folders), 8)).toHaveLength(3);
  });
});

describe("main people by their faces", () => {
  // Three people as 2-d "descriptors" far apart: the couple (A, B) and a guest (G).
  const A = [0, 0];
  const B = [3, 0];
  const G = [0, 3];
  const face = (d: number[], height = 0.2) => ({ descriptor: d, box: { x: 0.4, y: 0.2, width: height * 0.8, height } });

  it("the two most frequent people are the couple: together first, then each alone", () => {
    const found = [
      ...Array.from({ length: 10 }, (_, i) => ({ photoId: `t${i}`, faces: [face(A), face(B)] })),
      ...Array.from({ length: 6 }, (_, i) => ({ photoId: `a${i}`, faces: [face(A)] })),
      ...Array.from({ length: 5 }, (_, i) => ({ photoId: `b${i}`, faces: [face(B)] })),
      ...Array.from({ length: 3 }, (_, i) => ({ photoId: `g${i}`, faces: [face(G)] })),
    ];
    const res = mainPeopleGroups(found, 2)!;
    expect(res.groups[0].every((id) => id.startsWith("t"))).toBe(true);
    expect(res.groups[0]).toHaveLength(10);
    expect(res.weights[0]).toBe(2);
    expect(res.groups.slice(1).flat().some((id) => id.startsWith("g"))).toBe(false);
    // Half of an 8-photo collage is the two together.
    const picks = pickCollagePhotos(res.groups.map((g) => g.map((id) => ({ id, favorite: false, folderId: null }))), 8, res.weights);
    expect(picks.filter((id) => id.startsWith("t"))).toHaveLength(4);
  });

  it("a guest's small face far behind doesn't count", () => {
    const found = Array.from({ length: 12 }, (_, i) => ({ photoId: `p${i}`, faces: [face(A, 0.3), face(G, 0.05)] }));
    const res = mainPeopleGroups(found, 1)!;
    expect(res.groups).toEqual([found.map((f) => f.photoId)]);
    expect(mainPeopleGroups(found, 2)!.groups).toHaveLength(1);
  });

  it("faces too small to tell who they are (full-body shots) don't count", () => {
    const found = Array.from({ length: 12 }, (_, i) => ({ photoId: `p${i}`, faces: [face(A, 0.05), face(B, 0.05)] }));
    expect(mainPeopleGroups(found, 2)).toBeNull();
  });

  it("nobody repeats: null (the collage falls back to the whole gallery)", () => {
    expect(mainPeopleGroups([{ photoId: "x", faces: [face(A)] }], 1)).toBeNull();
    expect(mainPeopleGroups([], 2)).toBeNull();
  });

  it("the sample to look in: favorites first, then the rest spread over the gallery, in gallery order", () => {
    const ps: PickablePhoto[] = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, favorite: i < 10, folderId: null }));
    const sample = faceSample(ps, 60);
    expect(sample).toHaveLength(60);
    for (let i = 0; i < 10; i++) expect(sample).toContain(`p${i}`);
    expect(sample.some((id) => Number(id.slice(1)) > 280)).toBe(true);
    const order = sample.map((id) => Number(id.slice(1)));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("the collage file", () => {
  it("300 DPI when the device can draw it, less when it can't", () => {
    expect(collagePixels(60, 40, DESKTOP_MAX_PIXELS)).toEqual({ width: 7087, height: 4724, dpi: 300 });
    const phone = collagePixels(60, 40, MOBILE_MAX_PIXELS);
    expect(phone.dpi).toBeLessThan(300);
    expect(phone.width * phone.height).toBeLessThanOrEqual(MOBILE_MAX_PIXELS);
    expect(phone.width / phone.height).toBeCloseTo(1.5, 2);
    expect(collagePixels(30, 20, MOBILE_MAX_PIXELS).dpi).toBe(300);
  });

  it("writes the DPI into the JPEG's JFIF header, and leaves anything else alone", () => {
    const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
    const out = jpegWithDpi(jfif, 300);
    expect([...out.slice(13, 18)]).toEqual([1, 0x01, 0x2c, 0x01, 0x2c]);
    expect(jfif[13]).toBe(0); // the input untouched
    const other = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(jpegWithDpi(other, 300)).toBe(other);
  });

  it("the file's name: the gallery's title without characters a file can't hold", () => {
    expect(collageFileName("עלייה לתורה / אורי", "קולאז'")).toBe("קולאז' - עלייה לתורה אורי.jpg");
    expect(collageFileName("", "Collage")).toBe("Collage.jpg");
  });
});
