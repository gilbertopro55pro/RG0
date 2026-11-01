import { describe, expect, it } from "vitest";
import { CLIENT_DESIGN_LIMIT_CROP, CLIENT_DESIGN_MAX_CROP, applyClientEdit, clientDesigns, worstCrop, type ClientEditContext, type ClientEditOutcome, type EditSpread } from "@/lib/albumAuto/clientEdits";
import { collageTemplates, designShape, engineLayouts, redesignDesigns } from "@/lib/albumAuto/redesign";
import { marginInsetPctFor } from "@/lib/albumSafeArea";
import { pagePhotoIds, sameDesign } from "@/lib/albumClientEdit";
import type { AlbumElement, AlbumPhotoElement, AlbumTextElement } from "@/lib/types";

// The server's side of the client's changes to the album (CLAUDE.md, "עריכת האלבום על ידי הלקוח"):
// swaps within a page and between pages, the redesign of a page whose new photo doesn't fit, "back"
// up to 3 designs, and undoing everything. The album's photos never change, only where they are.

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const COVER = "33333333-3333-4333-8333-333333333333";

// On a 60×30 page: a 2:3 portrait frame and a 3:2 landscape one.
const portrait = { xPct: 5, yPct: 5, widthPct: 30, heightPct: 90 };
const landscape = { xPct: 50, yPct: 20, widthPct: 45, heightPct: 60 };
const photo = (id: string, photoId: string, box: typeof portrait, extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement => ({
  id,
  type: "photo",
  photoId,
  ...box,
  focalX: 20,
  focalY: 70,
  zoom: 140,
  borderWidth: 3,
  shadow: 35,
  ...extra,
});
const title: AlbumTextElement = { id: "t1", type: "text", text: "נועה ואורי", xPct: 40, yPct: 85, widthPct: 20, fontSize: 40, color: "#fff", align: "center" };

function album(): ClientEditContext {
  const spread = (id: string, elements: AlbumElement[], extra: Partial<EditSpread> = {}): EditSpread => ({
    id,
    elements,
    background_photo_id: null,
    width_cm: null,
    height_cm: null,
    // As the column holds it: never null.
    marked_frames: [],
    client_original: null,
    client_history: null,
    ...extra,
  });
  return {
    album: { width_cm: 60, height_cm: 30, safe_margin_cm: 0.5, auto_style: "clean" },
    spreads: [
      spread(COVER, [photo("cv", "cover", { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 })], { width_cm: 30, height_cm: 30 }),
      spread(S1, [photo("a", "por1", portrait), photo("b", "lan1", landscape), title], { background_photo_id: "por1" }),
      spread(S2, [photo("c", "por2", portrait), photo("d", "lan2", landscape)], { background_photo_id: "lan2", marked_frames: ["c"] }),
    ],
    photos: new Map([
      ["cover", { aspect: 1 }],
      ["por1", { aspect: 2 / 3, faces: [{ x: 0.4, y: 0.1, width: 0.2, height: 0.12 }] }],
      ["por2", { aspect: 2 / 3 }],
      ["lan1", { aspect: 3 / 2 }],
      ["lan2", { aspect: 3 / 2 }],
    ]),
    userTemplates: [],
    idPrefix: "c1",
  };
}

// The pages as they'd be read back after the route saved the outcome.
function saved(ctx: ClientEditContext, out: ClientEditOutcome): ClientEditContext {
  if (!out.ok) throw new Error(out.error);
  const byId = new Map(out.updates.map((u) => [u.id, u] as const));
  return {
    ...ctx,
    spreads: ctx.spreads.map((sp) => {
      const u = byId.get(sp.id);
      return u
        ? { ...sp, elements: u.elements, background_photo_id: u.background_photo_id, marked_frames: u.marked_frames, client_original: u.client_original, client_history: u.client_history }
        : sp;
    }),
  };
}
const page = (ctx: ClientEditContext, id: string) => ctx.spreads.find((sp) => sp.id === id) as EditSpread;
const allPhotos = (ctx: ClientEditContext) => ctx.spreads.flatMap((sp) => pagePhotoIds(sp.elements ?? [])).sort();
const photoEls = (sp: EditSpread) => (sp.elements ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo");

describe("a swap of two photos that fit each other's frame", () => {
  const ctx = album();
  const out = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false });
  const after = saved(ctx, out);

  it("trades the photos and keeps every frame where it was", () => {
    expect(photoEls(page(after, S1)).map((el) => [el.id, el.photoId, el.xPct, el.widthPct])).toEqual([
      ["a", "por2", 5, 30],
      ["b", "lan1", 50, 45],
    ]);
    expect(page(after, S2).elements?.[0]).toMatchObject({ id: "c", photoId: "por1", borderWidth: 3 });
    expect(allPhotos(after)).toEqual(allPhotos(ctx));
  });

  it("crops by the faces, and resets the photographer's zoom", () => {
    const moved = photoEls(page(after, S2))[0];
    expect(moved.zoom).toBe(100);
    expect([moved.focalX, moved.focalY]).not.toEqual([20, 70]);
  });

  it("moves the blurred background with the photo that left", () => {
    expect(page(after, S1).background_photo_id).toBe("por2");
    expect(page(after, S2).background_photo_id).toBe("lan2");
  });

  it("keeps the photographer's page, marks the changed frames, and has nothing to go back to", () => {
    if (!out.ok) throw new Error();
    const u1 = out.updates.find((u) => u.id === S1)!;
    const u2 = out.updates.find((u) => u.id === S2)!;
    expect(u1.edited).toBe(true);
    expect(u1.client_original?.elements).toEqual(page(ctx, S1).elements);
    expect(u1.marked_frames).toEqual(["a"]);
    expect(u2.marked_frames).toEqual(["c"]);
    expect(u1.client_history).toBeNull();
    expect(u1.layout).toBeUndefined();
  });

  it("swapping them back returns both pages to the photographer's, with their red dots", () => {
    const back = applyClientEdit(after, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false });
    if (!back.ok) throw new Error();
    // A photo back in the frame it was sent in takes back the photographer's crop (found in the live
    // check, 2026-10-27: refitted, both pages stayed "changed", and the photographer would have been
    // told so).
    for (const u of back.updates) {
      const sent = page(album(), u.id);
      expect([u.edited, u.canOriginal, u.client_original]).toEqual([false, false, null]);
      expect(u.elements).toEqual(sent.elements);
      expect(u.marked_frames).toEqual(sent.marked_frames);
    }
  });
});

describe("a portrait photo swapped with a landscape one", () => {
  it("asks first: the page will be redesigned", () => {
    const out = applyClientEdit(album(), { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S1, elId: "b" }, redesign: false });
    expect(out).toMatchObject({ ok: false, status: 409, code: "needs_redesign", pages: [S1] });
  });

  it("on the same page: redesigns it for the same photos, keeps its text, and can go back", () => {
    const ctx = album();
    const out = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S1, elId: "b" }, redesign: true });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates).toHaveLength(1);
    const u = out.updates[0];
    expect(u.layout).toBe("custom");
    expect(pagePhotoIds(u.elements)).toEqual(["lan1", "por1"]);
    expect(u.elements.find((el) => el.id === "t1")).toEqual(title);
    expect(u.client_history).toEqual([{ elements: page(ctx, S1).elements, background_photo_id: "por1" }]);
    expect(out.cycles[S1]?.seen.length).toBeGreaterThan(0);
    // Every frame is new, so every one gets the photographer's red dot.
    expect(u.marked_frames?.length).toBe(photoEls({ ...page(ctx, S1), elements: u.elements }).length);
  });

  it("between pages: redesigns both, and the album keeps every photo", () => {
    const ctx = album();
    const out = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "d" }, redesign: true });
    const after = saved(ctx, out);
    if (!out.ok) throw new Error();
    expect(out.updates.map((u) => [u.id, u.layout, u.client_history])).toEqual([
      [S1, "custom", null],
      [S2, "custom", null],
    ]);
    expect(pagePhotoIds(page(after, S1).elements ?? [])).toEqual(["lan1", "lan2"]);
    expect(pagePhotoIds(page(after, S2).elements ?? [])).toEqual(["por1", "por2"]);
    expect(allPhotos(after)).toEqual(allPhotos(ctx));
  });

  it("never redesigns the cover: a photo for it must fit its frame", () => {
    const out = applyClientEdit(album(), { action: "swap", a: { spreadId: COVER, elId: "cv" }, b: { spreadId: S1, elId: "a" }, redesign: true });
    expect(out).toMatchObject({ ok: false, status: 422, code: "cover" });
  });
});

describe("עיצוב מחדש and חזרה", () => {
  it("each click shows another design of the same photos, and back steps through them, 3 at most", () => {
    // A single 30×20 page: a double page with 2 photos has only 2 designs that fit (none on the fold).
    let ctx: ClientEditContext = { ...album(), album: { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5, auto_style: "clean" } };
    let cycle = { count: -1, seen: [] as string[] };
    const shapes = [designShape(photoEls(page(ctx, S1)))];
    for (let i = 0; i < 4; i++) {
      const out = applyClientEdit(ctx, { action: "redesign", spreadId: S1, ...cycle });
      if (!out.ok) throw new Error(out.error);
      cycle = out.cycles[S1];
      ctx = saved(ctx, out);
      shapes.push(designShape(photoEls(page(ctx, S1))));
      expect(pagePhotoIds(page(ctx, S1).elements ?? [])).toEqual(["lan1", "por1"]);
    }
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(page(ctx, S1).client_history).toHaveLength(3);

    for (let i = 3; i >= 1; i--) {
      const out = applyClientEdit(ctx, { action: "back", spreadId: S1 });
      ctx = saved(ctx, out);
      expect(designShape(photoEls(page(ctx, S1)))).toBe(shapes[i]);
    }
    expect(applyClientEdit(ctx, { action: "back", spreadId: S1 })).toMatchObject({ ok: false, status: 409, code: "no_history" });
  });

  it("back to the photographer's design makes the page theirs again", () => {
    const ctx = album();
    const after = saved(ctx, applyClientEdit(ctx, { action: "redesign", spreadId: S2, count: -1, seen: [] }));
    expect(page(after, S2).marked_frames?.length).toBeGreaterThan(1);
    const out = applyClientEdit(after, { action: "back", spreadId: S2 });
    if (!out.ok) throw new Error();
    expect(out.updates[0]).toMatchObject({ edited: false, client_original: null, client_history: null, marked_frames: ["c"] });
    expect(out.updates[0].elements).toEqual(page(ctx, S2).elements);
  });

  it("the cover isn't redesigned", () => {
    expect(applyClientEdit(album(), { action: "redesign", spreadId: COVER, count: -1, seen: [] })).toMatchObject({ ok: false, code: "cover" });
  });
  // Page 1 is the cover whatever its size (owner, 2026-10-28): in a 30×20 album it has the album's size.
  it("nor is the first page when it has the album's size, though a photo that fits can still swap in", () => {
    const base = album();
    const ctx: ClientEditContext = { ...base, spreads: base.spreads.slice(1) };
    expect(applyClientEdit(ctx, { action: "redesign", spreadId: S1, count: -1, seen: [] })).toMatchObject({ ok: false, status: 422, code: "cover" });
    expect(applyClientEdit(ctx, { action: "redesign", spreadId: S2, count: -1, seen: [] }).ok).toBe(true);
    const across = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "d" }, redesign: true });
    expect(across).toMatchObject({ ok: false, status: 422, code: "cover" });
    expect(applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false }).ok).toBe(true);
  });
});

describe("the designs a client gets", () => {
  // Two portraits and two landscapes on a 30×20 page, as in the test album (live check, 2026-10-27):
  // the first design put both portraits in landscape frames, cutting a head.
  it("crop no photo past the quality check's lines, and still offer a choice", () => {
    const four: ClientEditContext = {
      ...album(),
      album: { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5, auto_style: "clean" },
      // The cover first: the client never redesigns the first page.
      spreads: [
        album().spreads[0],
        {
          ...album().spreads[1],
          elements: [
            photo("h", "lan1", { xPct: 0, yPct: 0, widthPct: 70, heightPct: 100 }, { maskId: "fade-right-25", borderWidth: undefined, shadow: undefined }),
            photo("p1", "por1", { xPct: 56, yPct: 8, widthPct: 19, heightPct: 42 }),
            photo("p2", "por2", { xPct: 76, yPct: 8, widthPct: 19, heightPct: 42 }),
            photo("l2", "lan2", { xPct: 56, yPct: 53, widthPct: 39, heightPct: 39 }),
          ],
        },
      ],
    };
    const size = { widthCm: 30, heightCm: 20 };
    const aspect = (id: string) => four.photos.get(id)?.aspect ?? 1.5;
    let ctx = four;
    let cycle = { count: -1, seen: [] as string[] };
    // The swap that started it: a portrait into the landscape frame. The page is laid out again for
    // its photos, with none cropped past the warning line.
    const swapped = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "p1" }, b: { spreadId: S1, elId: "l2" }, redesign: true });
    if (!swapped.ok) throw new Error(swapped.error);
    cycle = swapped.cycles[S1];
    ctx = saved(ctx, swapped);
    expect(worstCrop(page(ctx, S1).elements ?? [], size, aspect)).toBeLessThanOrEqual(CLIENT_DESIGN_MAX_CROP);
    // Then "עיצוב מחדש": a few designs to choose from, none past the error line.
    const shapes = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const out = applyClientEdit(ctx, { action: "redesign", spreadId: S1, ...cycle });
      if (!out.ok) throw new Error(out.error);
      cycle = out.cycles[S1];
      ctx = saved(ctx, out);
      shapes.add(designShape(photoEls(page(ctx, S1))));
      expect(worstCrop(page(ctx, S1).elements ?? [], size, aspect)).toBeLessThanOrEqual(CLIENT_DESIGN_LIMIT_CROP);
    }
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });
});

describe("collage layouts for a redesign", () => {
  const mixed = [
    { id: "a", aspect: 2 / 3 },
    { id: "b", aspect: 3 / 2 },
    { id: "c", aspect: 2 / 3 },
    { id: "d", aspect: 2 / 3 },
    { id: "e", aspect: 3 / 2 },
    { id: "f", aspect: 3 / 2 },
  ];

  it("lay a single page out within it, every photo in a frame", () => {
    const layouts = collageTemplates(mixed, 30, 20, 0.5);
    expect(layouts.length).toBeGreaterThan(4);
    for (const frames of layouts) {
      expect(frames).toHaveLength(6);
      for (const f of frames) {
        expect(f.xPct).toBeGreaterThanOrEqual(0);
        expect(f.xPct + f.widthPct).toBeLessThanOrEqual(100.001);
        expect(f.yPct + f.heightPct).toBeLessThanOrEqual(100.001);
      }
    }
  });

  it("keep every photo of a double page on one half", () => {
    for (const frames of collageTemplates(mixed, 60, 30, 0.5)) {
      for (const f of frames) expect(f.xPct + f.widthPct <= 50.001 || f.xPct >= 49.999).toBe(true);
    }
  });

  it("give the client designs without a framed photo on a double page's fold", () => {
    const inset = marginInsetPctFor({ width_cm: 60, height_cm: 30, safe_margin_cm: 0.5 });
    const engine = engineLayouts({ style: "clean", photos: mixed, pageIndex: 2, widthCm: 60, heightCm: 30, inset });
    const all = redesignDesigns({ engine, photos: mixed, userTemplates: [], widthCm: 60, heightCm: 30, inset, elements: [], idPrefix: "x", extraTemplates: collageTemplates(mixed, 60, 30, 0.5) });
    const designs = clientDesigns(all, { widthCm: 60, heightCm: 30 }, (id) => mixed.find((p) => p.id === id)?.aspect ?? 1.5);
    expect(new Set(designs.map((d) => designShape(d.rects))).size).toBeGreaterThanOrEqual(4);
    for (const d of designs.filter((x) => !x.engine)) {
      for (const el of d.build().filter((e): e is AlbumPhotoElement => e.type === "photo")) {
        const side = 0.15 * el.widthPct;
        expect(el.xPct < 50 - side && el.xPct + el.widthPct > 50 + side).toBe(false);
      }
    }
  });
});

describe("לעיצוב המקורי: one page back to the photographer's design", () => {
  const single = (): ClientEditContext => ({ ...album(), album: { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5, auto_style: "clean" } });

  it("after redesigns: the photographer's page, and back still returns to the last design", () => {
    let ctx = single();
    let cycle = { count: -1, seen: [] as string[] };
    for (let i = 0; i < 2; i++) {
      const out = applyClientEdit(ctx, { action: "redesign", spreadId: S1, ...cycle });
      if (!out.ok) throw new Error(out.error);
      cycle = out.cycles[S1];
      ctx = saved(ctx, out);
    }
    const lastDesign = page(ctx, S1).elements;
    expect(page(ctx, S1).client_original).not.toBeNull();
    const out = applyClientEdit(ctx, { action: "original", spreadId: S1 });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates).toHaveLength(1);
    expect(out.updates[0]).toMatchObject({ edited: false, client_original: null, marked_frames: [], elements: page(single(), S1).elements });
    expect(out.updates[0].client_history).toHaveLength(3);
    ctx = saved(ctx, out);
    const back = applyClientEdit(ctx, { action: "back", spreadId: S1 });
    if (!back.ok) throw new Error(back.error);
    expect(back.updates[0]).toMatchObject({ edited: true, canOriginal: true, elements: lastDesign });
    expect(back.updates[0].client_original?.elements).toEqual(page(single(), S1).elements);
  });

  // Owner, 2026-10-27: after a swap between two pages, neither offers it; going back alone would show
  // a photo twice and lose another. A swap within the page keeps it.
  it("isn't offered on either page after a swap between them, and the server refuses it", () => {
    let ctx = album();
    const out = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates.map((u) => [u.id, u.edited, u.canOriginal])).toEqual([
      [S1, true, false],
      [S2, true, false],
    ]);
    ctx = saved(ctx, out);
    expect(applyClientEdit(ctx, { action: "original", spreadId: S1 })).toMatchObject({ ok: false, status: 409, code: "photos_moved" });
    expect(applyClientEdit(ctx, { action: "original", spreadId: S2 })).toMatchObject({ ok: false, status: 409, code: "photos_moved" });
    // A redesign of such a page doesn't bring it back: the photos are still another page's.
    const redesigned = applyClientEdit(ctx, { action: "redesign", spreadId: S1, count: -1, seen: [] });
    if (!redesigned.ok) throw new Error(redesigned.error);
    expect(redesigned.updates[0].canOriginal).toBe(false);
  });

  it("a page redesigned before, swapped away and back, offers its original again", () => {
    const holding = (c: ClientEditContext, id: string, photoId: string) => (page(c, id).elements ?? []).find((el) => el.type === "photo" && el.photoId === photoId)?.id as string;
    let ctx = album();
    ctx = saved(ctx, applyClientEdit(ctx, { action: "redesign", spreadId: S1, count: -1, seen: [] }));
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: holding(ctx, S1, "por1") }, b: { spreadId: S2, elId: "c" }, redesign: false }));
    expect(page(ctx, S1).client_original).not.toBeNull();
    const back = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: holding(ctx, S1, "por2") }, b: { spreadId: S2, elId: "c" }, redesign: false });
    if (!back.ok) throw new Error(back.error);
    expect(back.updates.map((u) => [u.id, u.edited, u.canOriginal])).toEqual([
      [S1, true, true],
      [S2, false, false],
    ]);
  });

  it("stays after a swap within the page", () => {
    const out = applyClientEdit(album(), { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S1, elId: "b" }, redesign: true });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates[0]).toMatchObject({ edited: true, canOriginal: true });
    const ctx = saved(album(), out);
    const original = applyClientEdit(ctx, { action: "original", spreadId: S1 });
    if (!original.ok) throw new Error(original.error);
    expect(original.updates[0].elements).toEqual(page(album(), S1).elements);
  });

  it("a page whose photos stayed goes back alone, whatever other pages swapped", () => {
    const S3 = "55555555-5555-4555-8555-555555555555";
    const base = album();
    let ctx: ClientEditContext = {
      ...base,
      spreads: [...base.spreads, { ...base.spreads[2], id: S3, marked_frames: [], elements: [photo("e", "por3", portrait), photo("f", "lan3", landscape)] }],
      photos: new Map([...base.photos, ["por3", { aspect: 2 / 3 }], ["lan3", { aspect: 3 / 2 }]]),
    };
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S2, elId: "c" }, b: { spreadId: S2, elId: "d" }, redesign: true }));
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S3, elId: "e" }, redesign: false }));
    const out = applyClientEdit(ctx, { action: "original", spreadId: S2 });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates.map((u) => u.id)).toEqual([S2]);
  });

  it("a page as the photographer sent it has nothing to go back to", () => {
    expect(applyClientEdit(album(), { action: "original", spreadId: S1 })).toMatchObject({ ok: false, code: "unchanged" });
  });
});

describe("the red dots column", () => {
  // gallery_album_spreads.marked_frames is NOT NULL: a page back to the photographer's design wrote
  // null, and the save failed (live check, 2026-10-27).
  it("is never written as null, whatever the client does", () => {
    let ctx = album();
    const seen: unknown[] = [];
    const run = (req: Parameters<typeof applyClientEdit>[1]) => {
      const out = applyClientEdit(ctx, req);
      if (!out.ok) throw new Error(out.error);
      for (const u of out.updates) seen.push(u.marked_frames);
      ctx = saved(ctx, out);
    };
    run({ action: "redesign", spreadId: S1, count: -1, seen: [] });
    run({ action: "back", spreadId: S1 });
    run({ action: "redesign", spreadId: S1, count: -1, seen: [] });
    run({ action: "original", spreadId: S1 });
    run({ action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false });
    run({ action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false });
    run({ action: "redesign", spreadId: S2, count: -1, seen: [] });
    run({ action: "original", spreadId: S2 });
    run({ action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false });
    run({ action: "reset" });
    expect(seen.length).toBeGreaterThan(6);
    expect(seen.every((m) => Array.isArray(m))).toBe(true);
  });
});

describe("undo all my changes", () => {
  it("returns every page the client changed to the photographer's", () => {
    let ctx = album();
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "d" }, redesign: true }));
    ctx = saved(ctx, applyClientEdit(ctx, { action: "redesign", spreadId: S2, count: -1, seen: [] }));
    const out = applyClientEdit(ctx, { action: "reset" });
    const after = saved(ctx, out);
    const original = album();
    for (const id of [S1, S2]) {
      expect(page(after, id).elements).toEqual(page(original, id).elements);
      expect(page(after, id).background_photo_id).toBe(page(original, id).background_photo_id);
      expect(page(after, id).marked_frames).toEqual(page(original, id).marked_frames);
    }
    if (!out.ok) throw new Error();
    expect(out.updates.every((u) => !u.edited && !u.client_original && !u.client_history)).toBe(true);
  });
});

describe("what the client can't do", () => {
  it("swap a photo of another album, or an empty frame", () => {
    const ctx = album();
    expect(applyClientEdit(ctx, { action: "swap", a: { spreadId: "44444444-4444-4444-8444-444444444444", elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false })).toMatchObject({ status: 404 });
    expect(applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "t1" }, b: { spreadId: S2, elId: "c" }, redesign: false })).toMatchObject({ status: 404 });
  });
});

// The client changes the photos' outline color for the whole album (owner, 2026-11-01).
describe("the photos' outline color", () => {
  // A photo running to the page's edge without an outline: it keeps having none.
  const bleed = photo("bl", "lan3", { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 }, { borderWidth: undefined, shadow: undefined });
  const withBleed = (): ClientEditContext => {
    const base = album();
    return {
      ...base,
      spreads: base.spreads.map((sp) => (sp.id === S2 ? { ...sp, elements: [bleed, ...(sp.elements ?? [])] } : sp)),
      photos: new Map([...base.photos, ["lan3", { aspect: 3 / 2 }]]),
    };
  };
  const outlineColors = (sp: EditSpread) => photoEls(sp).map((el) => [el.id, el.borderWidth ?? 0, el.borderColor]);
  const run = (ctx: ClientEditContext, req: Parameters<typeof applyClientEdit>[1]) => {
    const out = applyClientEdit(ctx, req);
    if (!out.ok) throw new Error(out.error);
    return { out, after: saved(ctx, out) };
  };

  it("recolors every outlined photo on every page, the cover too, and nothing else", () => {
    const ctx = withBleed();
    const { out, after } = run(ctx, { action: "outline", color: "#000000" });
    if (!out.ok) throw new Error();
    expect(out.updates.map((u) => u.id)).toEqual([COVER, S1, S2]);
    expect(outlineColors(page(after, COVER))).toEqual([["cv", 3, "#000000"]]);
    expect(outlineColors(page(after, S1))).toEqual([
      ["a", 3, "#000000"],
      ["b", 3, "#000000"],
    ]);
    // The edge-to-edge photo without an outline still has none.
    expect(outlineColors(page(after, S2))).toEqual([
      ["bl", 0, undefined],
      ["c", 3, "#000000"],
      ["d", 3, "#000000"],
    ]);
    // Same photos in the same frames, the text as it was.
    for (const id of [COVER, S1, S2]) {
      const strip = (sp: EditSpread) => (sp.elements ?? []).map((el) => (el.type === "photo" ? { ...el, borderColor: undefined } : el));
      expect(strip(page(after, id))).toEqual(strip(page(ctx, id)));
      expect(page(after, id).background_photo_id).toBe(page(ctx, id).background_photo_id);
    }
    expect(out.cycles).toEqual({});
  });

  it("keeps the photographer's page, adds no red dots, and leaves nothing for back or original", () => {
    const ctx = withBleed();
    const { out } = run(ctx, { action: "outline", color: "#d4af37" });
    if (!out.ok) throw new Error();
    for (const u of out.updates) {
      const sent = page(ctx, u.id);
      expect(u.edited).toBe(true);
      expect(u.client_original).toEqual({ elements: sent.elements, background_photo_id: sent.background_photo_id, marked_frames: sent.marked_frames });
      // No frame moved or changed photo: the photographer's dots as they were (S2 had one).
      expect(u.marked_frames).toEqual(sent.marked_frames);
      expect(u.client_history).toBeNull();
      expect(u.canOriginal).toBe(false);
      expect(u.layout).toBeUndefined();
    }
  });

  it("keeps the red dots of an earlier swap", () => {
    let ctx = album();
    ctx = run(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false }).after;
    const { out } = run(ctx, { action: "outline", color: "#000000" });
    if (!out.ok) throw new Error();
    expect(out.updates.find((u) => u.id === S1)?.marked_frames).toEqual(["a"]);
    expect(out.updates.find((u) => u.id === S2)?.marked_frames).toEqual(["c"]);
  });

  it("undo all my changes brings back the photographer's colors", () => {
    const ctx = withBleed();
    const changed = run(ctx, { action: "outline", color: "#000000" }).after;
    const { out, after } = run(changed, { action: "reset" });
    if (!out.ok) throw new Error();
    expect(out.updates.map((u) => u.id).sort()).toEqual([COVER, S1, S2].sort());
    for (const id of [COVER, S1, S2]) {
      expect(page(after, id).elements).toEqual(page(ctx, id).elements);
      expect(page(after, id).marked_frames).toEqual(page(ctx, id).marked_frames);
      expect(page(after, id).client_original).toBeNull();
    }
    expect(out.updates.every((u) => !u.edited)).toBe(true);
  });

  it("choosing the photographer's color again makes the pages theirs again", () => {
    const ctx = withBleed();
    const changed = run(ctx, { action: "outline", color: "#000000" }).after;
    // The test album's outlines have no color saved: the white every renderer draws.
    const { out, after } = run(changed, { action: "outline", color: "#ffffff" });
    if (!out.ok) throw new Error();
    expect(out.updates.map((u) => [u.id, u.edited, u.client_original])).toEqual([
      [COVER, false, null],
      [S1, false, null],
      [S2, false, null],
    ]);
    for (const id of [COVER, S1, S2]) expect(page(after, id).elements).toEqual(page(ctx, id).elements);
  });

  it("a page already in that color isn't touched", () => {
    const out = applyClientEdit(album(), { action: "outline", color: "#ffffff" });
    expect(out).toEqual({ ok: true, updates: [], cycles: {} });
  });

  it("isn't offered by the server when no photo has an outline", () => {
    const base = album();
    const bare: ClientEditContext = {
      ...base,
      spreads: base.spreads.map((sp) => ({ ...sp, elements: (sp.elements ?? []).map((el) => (el.type === "photo" ? { ...el, borderWidth: 0 } : el)) })),
    };
    expect(applyClientEdit(bare, { action: "outline", color: "#000000" })).toMatchObject({ ok: false, status: 422, code: "no_outline" });
  });

  it("leaves a page of the old builder's fixed layouts alone (drawn without outlines)", () => {
    const base = album();
    const ctx: ClientEditContext = { ...base, spreads: base.spreads.map((sp) => (sp.id === S2 ? { ...sp, layout: "split" } : sp)) };
    const { out } = run(ctx, { action: "outline", color: "#000000" });
    if (!out.ok) throw new Error();
    expect(out.updates.map((u) => u.id)).toEqual([COVER, S1]);
  });

  it("stays through a redesign, back and the photographer's design, page by page", () => {
    const RED = "#b03a2e";
    const reds = (sp: EditSpread) => photoEls(sp).filter((el) => el.borderWidth).map((el) => el.borderColor);
    let ctx = album();
    // A redesign before the color change: its "back" holds the photographer's design, in white.
    let cycle = { count: -1, seen: [] as string[] };
    const first = run(ctx, { action: "redesign", spreadId: S1, ...cycle });
    if (!first.out.ok) throw new Error();
    cycle = first.out.cycles[S1];
    ctx = first.after;
    ctx = run(ctx, { action: "outline", color: RED }).after;
    expect(reds(page(ctx, S1)).every((c) => c === RED)).toBe(true);
    expect(page(ctx, S1).client_history).toHaveLength(1);

    // Back: the photographer's design, in the client's color. Changed only by its color, so
    // "לעיצוב המקורי" isn't offered (and the server says it's already the original).
    const back = run(ctx, { action: "back", spreadId: S1 });
    if (!back.out.ok) throw new Error();
    ctx = back.after;
    expect(reds(page(ctx, S1))).toEqual([RED, RED]);
    expect(back.out.updates[0]).toMatchObject({ edited: true, canOriginal: false, marked_frames: [] });
    expect(applyClientEdit(ctx, { action: "original", spreadId: S1 })).toMatchObject({ ok: false, status: 409, code: "unchanged" });

    // Another design keeps the color, whatever the engine's own.
    const again = run(ctx, { action: "redesign", spreadId: S1, ...cycle });
    if (!again.out.ok) throw new Error();
    ctx = again.after;
    expect(reds(page(ctx, S1)).length).toBeGreaterThan(0);
    expect(reds(page(ctx, S1)).every((c) => c === RED)).toBe(true);
    expect(again.out.updates[0].canOriginal).toBe(true);

    // The photographer's design, in the client's color: the album keeps one color.
    const original = run(ctx, { action: "original", spreadId: S1 });
    if (!original.out.ok) throw new Error();
    ctx = original.after;
    expect(reds(page(ctx, S1))).toEqual([RED, RED]);
    expect(original.out.updates[0]).toMatchObject({ edited: true, canOriginal: false, marked_frames: [] });

    // Undo all: the photographer's pages and colors.
    const reset = run(ctx, { action: "reset" }).after;
    for (const sp of album().spreads) expect(page(reset, sp.id).elements).toEqual(sp.elements);
  });

  // A client redesign made before this change could come in the engine's own color (black in the
  // clean style) on one page only: that isn't the album's color, and doesn't spread.
  it("brings the photographer's design back as sent when the album has no one color", () => {
    let ctx = album();
    ctx = run(ctx, { action: "redesign", spreadId: S1, count: -1, seen: [] }).after;
    ctx = {
      ...ctx,
      spreads: ctx.spreads.map((sp) => (sp.id === S1 ? { ...sp, elements: (sp.elements ?? []).map((el) => (el.type === "photo" && el.borderWidth ? { ...el, borderColor: "#000000" } : el)) } : sp)),
    };
    const original = run(ctx, { action: "original", spreadId: S1 });
    if (!original.out.ok) throw new Error();
    expect(original.out.updates[0]).toMatchObject({ edited: false, client_original: null });
    expect(page(original.after, S1).elements).toEqual(page(album(), S1).elements);
    // The album has one color again (the photographer's white): "back" brings the design in it.
    const redesigned = page(ctx, S1).elements ?? [];
    const back = run(original.after, { action: "back", spreadId: S1 });
    expect(sameDesign(page(back.after, S1).elements ?? [], redesigned)).toBe(true);
    expect(photoEls(page(back.after, S1)).map((el) => [el.borderWidth ?? 0, el.borderColor])).toEqual(photoEls({ ...page(ctx, S1), elements: redesigned }).map((el) => [el.borderWidth ?? 0, el.borderWidth ? "#ffffff" : el.borderColor]));
  });

  it("never writes the red dots column as null", () => {
    let ctx = withBleed();
    const seen: unknown[] = [];
    for (const req of [
      { action: "outline", color: "#000000" },
      { action: "redesign", spreadId: S1, count: -1, seen: [] },
      { action: "outline", color: "#ffffff" },
      { action: "back", spreadId: S1 },
      { action: "outline", color: "#d4af37" },
      { action: "reset" },
    ] as Parameters<typeof applyClientEdit>[1][]) {
      const { out, after } = run(ctx, req);
      if (!out.ok) throw new Error();
      for (const u of out.updates) seen.push(u.marked_frames);
      ctx = after;
    }
    expect(seen.length).toBeGreaterThan(6);
    expect(seen.every((m) => Array.isArray(m))).toBe(true);
  });
});
