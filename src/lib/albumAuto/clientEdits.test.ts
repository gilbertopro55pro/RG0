import { describe, expect, it } from "vitest";
import { CLIENT_DESIGN_LIMIT_CROP, CLIENT_DESIGN_MAX_CROP, applyClientEdit, clientDesigns, worstCrop, type ClientEditContext, type ClientEditOutcome, type EditSpread } from "@/lib/albumAuto/clientEdits";
import { collageTemplates, designShape, engineLayouts, redesignDesigns } from "@/lib/albumAuto/redesign";
import { marginInsetPctFor } from "@/lib/albumSafeArea";
import { pagePhotoIds } from "@/lib/albumClientEdit";
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
    marked_frames: null,
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
    const u2 = back.updates.find((u) => u.id === S2)!;
    // The crop the photographer set doesn't come back, so the page is still the client's.
    expect(u2.edited).toBe(true);
    expect(u2.client_original?.marked_frames).toEqual(["c"]);
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
});

describe("the designs a client gets", () => {
  // Two portraits and two landscapes on a 30×20 page, as in the test album (live check, 2026-10-27):
  // the first design put both portraits in landscape frames, cutting a head.
  it("crop no photo past the quality check's lines, and still offer a choice", () => {
    const four: ClientEditContext = {
      ...album(),
      album: { width_cm: 30, height_cm: 20, safe_margin_cm: 0.5, auto_style: "clean" },
      spreads: [
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
    const page = { widthCm: 30, heightCm: 20 };
    const aspect = (id: string) => four.photos.get(id)?.aspect ?? 1.5;
    let ctx = four;
    let cycle = { count: -1, seen: [] as string[] };
    // The swap that started it: a portrait into the landscape frame. The page is laid out again for
    // its photos, with none cropped past the warning line.
    const swapped = applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "p1" }, b: { spreadId: S1, elId: "l2" }, redesign: true });
    if (!swapped.ok) throw new Error(swapped.error);
    cycle = swapped.cycles[S1];
    ctx = saved(ctx, swapped);
    expect(worstCrop(ctx.spreads[0].elements ?? [], page, aspect)).toBeLessThanOrEqual(CLIENT_DESIGN_MAX_CROP);
    // Then "עיצוב מחדש": a few designs to choose from, none past the error line.
    const shapes = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const out = applyClientEdit(ctx, { action: "redesign", spreadId: S1, ...cycle });
      if (!out.ok) throw new Error(out.error);
      cycle = out.cycles[S1];
      ctx = saved(ctx, out);
      shapes.add(designShape(photoEls(ctx.spreads[0])));
      expect(worstCrop(ctx.spreads[0].elements ?? [], page, aspect)).toBeLessThanOrEqual(CLIENT_DESIGN_LIMIT_CROP);
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
    const out = applyClientEdit(ctx, { action: "original", spreadId: S1, confirm: false });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates).toHaveLength(1);
    expect(out.updates[0]).toMatchObject({ edited: false, client_original: null, marked_frames: null, elements: page(single(), S1).elements });
    expect(out.updates[0].client_history).toHaveLength(3);
    ctx = saved(ctx, out);
    const back = applyClientEdit(ctx, { action: "back", spreadId: S1 });
    if (!back.ok) throw new Error(back.error);
    expect(back.updates[0]).toMatchObject({ edited: true, elements: lastDesign });
    expect(back.updates[0].client_original?.elements).toEqual(page(single(), S1).elements);
  });

  it("a page that swapped photos with another: asks first, then both go back, the rest untouched", () => {
    let ctx = album();
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S2, elId: "c" }, redesign: false }));
    const ask = applyClientEdit(ctx, { action: "original", spreadId: S1, confirm: false });
    expect(ask).toMatchObject({ ok: false, status: 409, code: "linked_pages", pages: [S2] });
    const out = applyClientEdit(ctx, { action: "original", spreadId: S1, confirm: true });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates.map((u) => u.id)).toEqual([S1, S2]);
    const after = saved(ctx, out);
    for (const id of [S1, S2]) expect(page(after, id).elements).toEqual(page(album(), id).elements);
    expect(page(after, COVER)).toEqual(page(album(), COVER));
    expect(allPhotos(after)).toEqual(allPhotos(album()));
  });

  it("a page whose photos stayed goes back alone, whatever other pages swapped", () => {
    const S3 = "55555555-5555-4555-8555-555555555555";
    const base = album();
    let ctx: ClientEditContext = {
      ...base,
      spreads: [...base.spreads, { ...base.spreads[2], id: S3, marked_frames: null, elements: [photo("e", "por3", portrait), photo("f", "lan3", landscape)] }],
      photos: new Map([...base.photos, ["por3", { aspect: 2 / 3 }], ["lan3", { aspect: 3 / 2 }]]),
    };
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S2, elId: "c" }, b: { spreadId: S2, elId: "d" }, redesign: true }));
    ctx = saved(ctx, applyClientEdit(ctx, { action: "swap", a: { spreadId: S1, elId: "a" }, b: { spreadId: S3, elId: "e" }, redesign: false }));
    const out = applyClientEdit(ctx, { action: "original", spreadId: S2, confirm: false });
    if (!out.ok) throw new Error(out.error);
    expect(out.updates.map((u) => u.id)).toEqual([S2]);
  });

  it("a page as the photographer sent it has nothing to go back to", () => {
    expect(applyClientEdit(album(), { action: "original", spreadId: S1, confirm: true })).toMatchObject({ ok: false, code: "unchanged" });
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
