import { describe, expect, it } from "vitest";
import {
  cellLabel,
  cellPeopleFromReferences,
  countNames,
  detectEventKind,
  familyCaps,
  mixOwnersShots,
  ownersCountFor,
  pageCap,
  pickCellFaces,
  planAlbum,
  splitSection,
  TOGETHER,
} from "@/lib/albumAuto/planner";
import type { AlbumPlan, AutoPhoto, AutoStyleId, CellPeople, EventKind, PhotoFaces, PlanOptions, SectionKind } from "@/lib/albumAuto/types";

// The owner's album rules (CLAUDE.md, "עיצוב אלבום אוטומטי"): at most 30 pages counting the cover,
// per-page photo caps by position, never a dropped photo, never an empty or one-photo page, and the
// family sections (owners → parents → siblings → grandparents) before the event.

const CLEAN: PlanOptions = { style: "clean", targetSpreads: null };
const STYLES: AutoStyleId[] = ["clean", "catalog", "scribble", "modern"];

// Photos in shooting order by file name (no EXIF times, so the planner orders them by name).
function shots(prefix: string, from: number, n: number, aspect = 1.5): AutoPhoto[] {
  return Array.from({ length: n }, (_, i) => {
    const k = from + i;
    return { id: `${prefix}${k}`, aspect, takenAt: null, filename: `IMG_${String(k).padStart(4, "0")}.jpg` };
  });
}

const sizes = (plan: AlbumPlan) => plan.spreads.map((s) => s.photoIds.length);
const sectionsOf = (plan: AlbumPlan) => plan.spreads.map((s) => s.section);
const countSection = (plan: AlbumPlan, section: SectionKind) => plan.spreads.filter((s) => s.section === section).length;
const sizesOf = (plan: AlbumPlan, section: SectionKind) => plan.spreads.filter((s) => s.section === section).map((s) => s.photoIds.length);

function expectEveryPhotoOnce(plan: AlbumPlan, photos: AutoPhoto[]) {
  const ids = plan.spreads.flatMap((s) => s.photoIds);
  expect(ids).toHaveLength(photos.length);
  expect(new Set(ids)).toEqual(new Set(photos.map((p) => p.id)));
}

// --- Family fixture --------------------------------------------------------------------------
// One-hot face descriptors: every person is √2 away from every other, far past the match
// threshold, and each photo's faces are that person's exact descriptor.
const face = (person: number) => Array.from({ length: 8 }, (_, k) => (k === person ? 1 : 0));
const GROOM = 0;
const BRIDE = 1;
const MOTHER = 2;
const FATHER = 3;
const SISTER = 4;
const GRANDMA = 5;
const STRANGER_A = 6;
const STRANGER_B = 7;

const CELLS: CellPeople[] = [
  { id: "owners", descriptors: [face(GROOM), face(BRIDE)] },
  { id: "parents", descriptors: [face(MOTHER), face(FATHER)] },
  { id: "siblings", descriptors: [face(SISTER)] },
  { id: "grandparents", descriptors: [face(GRANDMA)] },
];

type Counts = { owners?: number; parents?: number; siblings?: number; grandparents?: number; event?: number };

// Builds a book's worth of photos in shooting order: owners shots first, then parents, siblings,
// grandparents, then event shots with no faces at all.
function familyBook(c: Counts) {
  const photos: AutoPhoto[] = [];
  const faces: PhotoFaces[] = [];
  let next = 1;
  const add = (prefix: string, n: number, people: number[]) => {
    const run = shots(prefix, next, n);
    next += n;
    photos.push(...run);
    if (people.length > 0) for (const p of run) faces.push({ photoId: p.id, faces: people.map((who) => ({ descriptor: face(who), area: 0.05 })) });
    return run;
  };
  const owners = add("o", c.owners ?? 0, [GROOM, BRIDE]);
  const parents = add("p", c.parents ?? 0, [MOTHER, FATHER]);
  const siblings = add("s", c.siblings ?? 0, [SISTER]);
  const grandparents = add("g", c.grandparents ?? 0, [GRANDMA]);
  const event = add("e", c.event ?? 0, []);
  return { photos, faces, owners, parents, siblings, grandparents, event };
}

// ---------------------------------------------------------------------------------------------

describe("pageCap", () => {
  it("allows 6 photos on pages 1–5, 8 on 6–10, 15 on 11–20 and 20 on 21–30", () => {
    expect([1, 5].map(pageCap)).toEqual([6, 6]);
    expect([6, 10].map(pageCap)).toEqual([8, 8]);
    expect([11, 20].map(pageCap)).toEqual([15, 15]);
    expect([21, 29, 30].map(pageCap)).toEqual([20, 20, 20]);
  });

  it("gives the 29 inner pages of a 30-page book room for 400 photos, well above the 250 maximum", () => {
    const room = Array.from({ length: 29 }, (_, i) => pageCap(i + 1)).reduce((a, b) => a + b, 0);
    expect(room).toBe(400);
  });
});

describe("planAlbum: page limits", () => {
  it("returns an empty book for no photos", () => {
    expect(planAlbum([], [], [], CLEAN)).toEqual({ coverPhotoId: null, spreads: [] });
  });

  it("puts a handful of photos on a single page", () => {
    for (const n of [2, 3, 4, 5]) {
      const plan = planAlbum(shots("e", 1, n), [], [], CLEAN);
      expect(sizes(plan)).toEqual([n]);
    }
  });

  it.each(STYLES)("keeps 250 photos (%s) within 29 pages plus the cover, every page within its cap", (style) => {
    const photos = shots("e", 1, 250);
    const plan = planAlbum(photos, [], [], { style, targetSpreads: null });
    expect(plan.spreads.length).toBeLessThanOrEqual(29);
    sizes(plan).forEach((n, i) => {
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(pageCap(i + 1));
    });
    expectEveryPhotoOnce(plan, photos);
  });

  it("fills a 30-page book to exactly its caps when there are 400 photos", () => {
    const photos = shots("e", 1, 400);
    const plan = planAlbum(photos, [], [], CLEAN);
    expect(sizes(plan)).toEqual(Array.from({ length: 29 }, (_, i) => pageCap(i + 1)));
    expectEveryPhotoOnce(plan, photos);
  });

  it("never goes past 30 pages: more photos go to the last pages, up to 20 each", () => {
    const photos = shots("e", 1, 500);
    const plan = planAlbum(photos, [], [], CLEAN);
    expect(sizes(plan)).toEqual([6, 6, 6, 6, 6, 10, ...Array(23).fill(20)]);
    expectEveryPhotoOnce(plan, photos);
  });

  it("uses all 30 pages for spreads when the book has no cover", () => {
    const plan = planAlbum(shots("e", 1, 500), [], [], { style: "clean", targetSpreads: null, hasCover: false });
    expect(plan.spreads).toHaveLength(30);
  });

  it("caps a typed page count at 30", () => {
    const plan = planAlbum(shots("e", 1, 250), [], [], { style: "clean", targetSpreads: 50 });
    expect(plan.spreads).toHaveLength(29);
  });

  it("counts the cover in a typed count: 20 pages = 19 spreads and the cover", () => {
    const photos = shots("e", 1, 250);
    const withCover = planAlbum(photos, [], [], { style: "clean", targetSpreads: 20 });
    expect(withCover.spreads).toHaveLength(19);
    // 205 photos fit the caps of 19 pages; the other 45 bring pages 11–19 up to 20.
    expect(sizes(withCover)).toEqual([6, 6, 6, 6, 6, 8, 8, 8, 8, 8, ...Array(9).fill(20)]);

    const noCover = planAlbum(photos, [], [], { style: "clean", targetSpreads: 20, hasCover: false });
    expect(noCover.spreads).toHaveLength(20);
    expectEveryPhotoOnce(noCover, photos);
  });

  it("sends the photos a short typed count can't hold to the last pages, up to 20 each", () => {
    const photos = shots("e", 1, 100);
    const plan = planAlbum(photos, [], [], { style: "clean", targetSpreads: 10 });
    // 9 spreads: the caps hold 62, the last pages fill to 20 from the end backwards.
    expect(sizes(plan)).toEqual([6, 6, 6, 6, 6, 10, 20, 20, 20]);
    expectEveryPhotoOnce(plan, photos);
  });

  it("never drops a photo, even when 20 a page isn't enough for a typed count", () => {
    const photos = shots("e", 1, 250);
    const plan = planAlbum(photos, [], [], { style: "clean", targetSpreads: 10 });
    expect(plan.spreads).toHaveLength(9);
    expectEveryPhotoOnce(plan, photos);
  });

  it("never makes an empty page or a page with a single photo", () => {
    for (const style of ["clean", "scribble"] as const) {
      for (const targetSpreads of [null, 5, 12, 30]) {
        for (const n of [2, 3, 7, 9, 14, 23, 31, 58, 97, 151, 203, 250]) {
          const photos = shots("e", 1, n);
          const plan = planAlbum(photos, [], [], { style, targetSpreads });
          expect(Math.min(...sizes(plan))).toBeGreaterThanOrEqual(2);
          expect(plan.spreads.length).toBeLessThanOrEqual(Math.min(30, targetSpreads ?? 30) - 1);
          expectEveryPhotoOnce(plan, photos);
        }
      }
    }
  });

  it("is deterministic and independent of the input order", () => {
    const photos = shots("e", 1, 120);
    const a = planAlbum(photos, [], [], CLEAN);
    const b = planAlbum([...photos].reverse(), [], [], CLEAN);
    expect(b).toEqual(a);
  });

  it("uses a photo once even if it is passed twice", () => {
    const photos = shots("e", 1, 12);
    const plan = planAlbum([...photos, photos[3], photos[7]], [], [], CLEAN);
    expectEveryPhotoOnce(plan, photos);
  });
});

describe("planAlbum: family sections", () => {
  it("runs owners → parents → siblings → grandparents → event, each split into its page slots", () => {
    const book = familyBook({ owners: 15, parents: 10, siblings: 14, grandparents: 5, event: 40 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    const order = sectionsOf(plan);
    expect(order.slice(0, 9)).toEqual(["owners", "owners", "owners", "parents", "parents", "siblings", "siblings", "siblings", "grandparents"]);
    expect(order.slice(9).every((s) => s === "event")).toBe(true);
    // Owners: 3 pages of 5. Parents: two pages, 60:40. Siblings: three, as even as possible.
    // Grandparents: 5 photos are one page.
    expect(sizesOf(plan, "owners")).toEqual([5, 5, 5]);
    expect(sizesOf(plan, "parents")).toEqual([6, 4]);
    expect(sizesOf(plan, "siblings")).toEqual([5, 5, 4]);
    expect(sizesOf(plan, "grandparents")).toEqual([5]);
    // The event part keeps the per-position caps, counted from right after the family pages.
    sizes(plan).forEach((n, i) => expect(n).toBeLessThanOrEqual(pageCap(i + 1)));
    expectEveryPhotoOnce(plan, book.photos);
  });

  it("gives each section at most its pages (3, 2, 3, 3); the extra photos join the event", () => {
    const book = familyBook({ owners: 20, parents: 10, siblings: 30, grandparents: 30, event: 40 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    expect(countSection(plan, "owners")).toBe(3);
    expect(countSection(plan, "parents")).toBe(2);
    expect(countSection(plan, "siblings")).toBe(3);
    expect(countSection(plan, "grandparents")).toBe(3);
    // Clean style: owners up to 5 a page, so 15 of the 20 owners shots; the last 5 are event photos.
    const eventIds = new Set(plan.spreads.filter((s) => s.section === "event").flatMap((s) => s.photoIds));
    for (const p of book.owners.slice(15)) expect(eventIds.has(p.id)).toBe(true);
    expectEveryPhotoOnce(plan, book.photos);
  });

  it("splits two pages 60:40 and three or more as evenly as possible", () => {
    const owners = familyBook({ owners: 8, event: 20 });
    const two = planAlbum(owners.photos, owners.faces, CELLS, CLEAN);
    expect(sizesOf(two, "owners")).toEqual([5, 3]);
    const more = familyBook({ owners: 13, event: 20 });
    const three = planAlbum(more.photos, more.faces, CELLS, CLEAN);
    expect(sizesOf(three, "owners")).toEqual([5, 4, 4]);
  });

  it("gives a section with few photos fewer pages, and the next section moves up", () => {
    const book = familyBook({ owners: 4, parents: 10, event: 30 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    expect(sectionsOf(plan).slice(0, 3)).toEqual(["owners", "parents", "parents"]);
    expect(sizesOf(plan, "owners")).toEqual([4]);
  });

  it("keeps only the owners on the owners' pages", () => {
    const book = familyBook({ owners: 6, event: 20 });
    // The groom with his mother belongs to the parents' pages.
    const withMother: AutoPhoto = { id: "x-mother", aspect: 1.5, takenAt: null, filename: "IMG_0003a.jpg" };
    // The couple in a crowd (more than one stranger) belongs to the event.
    const inCrowd: AutoPhoto = { id: "x-crowd", aspect: 1.5, takenAt: null, filename: "IMG_0004a.jpg" };
    const photos = [...book.photos, withMother, inCrowd];
    const faces: PhotoFaces[] = [
      ...book.faces,
      { photoId: withMother.id, faces: [face(GROOM), face(MOTHER)].map((descriptor) => ({ descriptor, area: 0.05 })) },
      { photoId: inCrowd.id, faces: [face(GROOM), face(BRIDE), face(STRANGER_A), face(STRANGER_B)].map((descriptor) => ({ descriptor, area: 0.05 })) },
    ];
    const plan = planAlbum(photos, faces, CELLS, CLEAN);
    const ownersIds = plan.spreads.filter((s) => s.section === "owners").flatMap((s) => s.photoIds);
    expect(new Set(ownersIds)).toEqual(new Set(book.owners.map((p) => p.id)));
    expect(plan.spreads.find((s) => s.photoIds.includes(withMother.id))?.section).not.toBe("owners");
    expect(plan.spreads.find((s) => s.photoIds.includes(inCrowd.id))?.section).toBe("event");
    expectEveryPhotoOnce(plan, photos);
  });

  it("never puts a section's lone photo on the owners' pages, and never leaves it alone on a page", () => {
    const book = familyBook({ owners: 6, parents: 1, event: 20 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    const ownersIds = plan.spreads.filter((s) => s.section === "owners").flatMap((s) => s.photoIds);
    expect(ownersIds).not.toContain(book.parents[0].id);
    expect(Math.min(...sizes(plan))).toBeGreaterThanOrEqual(2);
    expectEveryPhotoOnce(plan, book.photos);
  });

  it("in a short book, the family gives up pages so the event stays within 20 a page", () => {
    // 5 pages = 4 spreads and the cover.
    const short = familyBook({ owners: 15, event: 30 });
    const plan = planAlbum(short.photos, short.faces, CELLS, { style: "clean", targetSpreads: 5 });
    expect(sectionsOf(plan)).toEqual(["owners", "event", "event", "event"]);
    expect(sizes(plan)).toEqual([5, 6, 14, 20]);
    expectEveryPhotoOnce(plan, short.photos);

    // Too many photos for any family page: the whole book is the event.
    const crowded = familyBook({ owners: 15, parents: 10, event: 50 });
    const all = planAlbum(crowded.photos, crowded.faces, CELLS, { style: "clean", targetSpreads: 5 });
    expect(sectionsOf(all)).toEqual(["event", "event", "event", "event"]);
    expect(sizes(all)).toEqual([15, 20, 20, 20]);
    expectEveryPhotoOnce(all, crowded.photos);
  });

  it("picks the closest owners shot for the cover, preferring a portrait slightly", () => {
    const run = shots("c", 1, 3);
    const [landscape, portrait, closeUp] = [
      { ...run[0], aspect: 1.5 },
      { ...run[1], aspect: 0.67 },
      { ...run[2], aspect: 1.5 },
    ];
    const both = (area: number) => [face(GROOM), face(BRIDE)].map((descriptor) => ({ descriptor, area }));
    const event = shots("e", 10, 10);
    // Landscape 0.20 vs portrait 0.18 × 1.15 = 0.207: the portrait wins.
    const plan = planAlbum(
      [landscape, portrait, ...event],
      [{ photoId: landscape.id, faces: both(0.1) }, { photoId: portrait.id, faces: both(0.09) }],
      CELLS,
      CLEAN
    );
    expect(plan.coverPhotoId).toBe(portrait.id);
    // A clearly closer landscape (0.25) beats the portrait's bonus.
    const plan2 = planAlbum(
      [landscape, portrait, closeUp, ...event],
      [{ photoId: landscape.id, faces: both(0.1) }, { photoId: portrait.id, faces: both(0.09) }, { photoId: closeUp.id, faces: both(0.125) }],
      CELLS,
      CLEAN
    );
    expect(plan2.coverPhotoId).toBe(closeUp.id);
  });
});

// --- Generic fixture -------------------------------------------------------------------------
// Runs of photos in shooting order, each run with the same people (one-hot faces as above). An
// optional `extra` adds unidentified faces (strangers) to every photo of the run.
type Run = { prefix: string; n: number; people: number[]; strangers?: number; area?: number };
function build(runs: Run[]) {
  const photos: AutoPhoto[] = [];
  const faces: PhotoFaces[] = [];
  const byRun: Record<string, AutoPhoto[]> = {};
  let next = 1;
  for (const r of runs) {
    const run = shots(r.prefix, next, r.n);
    next += r.n;
    photos.push(...run);
    byRun[r.prefix] = run;
    const people = [...r.people, ...Array.from({ length: r.strangers ?? 0 }, (_, k) => (k % 2 === 0 ? STRANGER_A : STRANGER_B))];
    if (people.length > 0) for (const p of run) faces.push({ photoId: p.id, faces: people.map((who) => ({ descriptor: face(who), area: r.area ?? 0.05 })) });
  }
  return { photos, faces, byRun };
}

const RANK: Record<SectionKind, number> = { owners: 0, parents: 1, siblings: 2, grandparents: 3, event: 4 };
const STYLE_MAX: Record<AutoStyleId, { owners: number; family: number }> = {
  clean: { owners: 5, family: 8 },
  catalog: { owners: 4, family: 6 },
  scribble: { owners: 3, family: 5 },
  modern: { owners: 5, family: 8 },
};

// The rules every book keeps (CLAUDE.md): each photo exactly once, no empty page, no one-photo page
// (unless the whole book is one photo), at most 30 pages with the cover, every family page within
// the cap of its position and the style's maximum, the event pages within their caps (in a short
// typed book the overflow goes to the last pages, up to 20 each, when 20 a page can hold it),
// sections in the book order, and the owners' pages hold only owners' shots.
function expectBookRules(plan: AlbumPlan, photos: AutoPhoto[], opts: PlanOptions, ownerIds?: Set<string>) {
  expectEveryPhotoOnce(plan, photos);
  const maxSpreads = Math.max(1, Math.min(30, opts.targetSpreads ?? 30) - (opts.hasCover === false ? 0 : 1));
  expect(plan.spreads.length).toBeLessThanOrEqual(maxSpreads);
  plan.spreads.forEach((sp, i) => {
    expect(sp.photoIds.length).toBeGreaterThanOrEqual(photos.length === 1 ? 1 : 2);
    if (sp.section !== "event") {
      const max = sp.section === "owners" ? STYLE_MAX[opts.style].owners : STYLE_MAX[opts.style].family;
      expect(sp.photoIds.length, `family page ${i + 1} (${sp.section})`).toBeLessThanOrEqual(Math.min(pageCap(i + 1), max));
    } else if (!opts.targetSpreads) {
      expect(sp.photoIds.length, `page ${i + 1}`).toBeLessThanOrEqual(pageCap(i + 1));
    } else if (photos.length <= 20 * maxSpreads) {
      expect(sp.photoIds.length, `page ${i + 1}`).toBeLessThanOrEqual(20);
    }
    if (i > 0) expect(RANK[sp.section]).toBeGreaterThanOrEqual(RANK[plan.spreads[i - 1].section]);
    if (sp.section === "owners" && ownerIds) for (const id of sp.photoIds) expect(ownerIds.has(id), `${id} on an owners' page`).toBe(true);
  });
}

// Deterministic pseudo-random numbers (no real randomness in tests).
function lcg(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

describe("planAlbum: page caps on the family pages", () => {
  // Measured before the fix (2026-10-20): owners 15 + parents 12 → page 4 had 8; parents only 16 →
  // page 1 had 10; siblings only 24 → pages 1–3 had 8 each.
  it("keeps the parents' pages after three owners' pages within 6 (owners 15 + parents 12)", () => {
    const book = familyBook({ owners: 15, parents: 12, event: 40 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    expect(sizesOf(plan, "owners")).toEqual([5, 5, 5]);
    expect(sizesOf(plan, "parents")).toEqual([6, 6]);
    expectBookRules(plan, book.photos, CLEAN, new Set(book.owners.map((p) => p.id)));
  });

  it("puts at most 6 photos on the first pages when the parents open the book (parents 16)", () => {
    const book = familyBook({ parents: 16, event: 40 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    expect(sizesOf(plan, "parents")).toEqual([6, 6]);
    // The 4 parents' shots the two pages can't hold go on with the event, none dropped.
    const eventIds = new Set(plan.spreads.filter((s) => s.section === "event").flatMap((s) => s.photoIds));
    expect(book.parents.filter((p) => eventIds.has(p.id))).toHaveLength(4);
    expectBookRules(plan, book.photos, CLEAN);
  });

  it("keeps the siblings' pages within 6 when they open the book (siblings 24)", () => {
    const book = familyBook({ siblings: 24, event: 40 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    expect(sizesOf(plan, "siblings")).toEqual([6, 6, 6]);
    expectBookRules(plan, book.photos, CLEAN);
  });

  it("takes a second page within the slot when one page would go past the cap", () => {
    // 7 parents' photos after three owners' pages: one page of 7 is over the cap of 6 (page 4),
    // so two pages, as close to 60:40 as the caps allow.
    const book = familyBook({ owners: 15, parents: 7, event: 30 });
    const plan = planAlbum(book.photos, book.faces, CELLS, CLEAN);
    expect(sizesOf(plan, "parents")).toEqual([4, 3]);
    expectBookRules(plan, book.photos, CLEAN);
  });

  it("holds the caps and every other rule for any mix of sections, styles and page counts", () => {
    const rand = lcg(20261020);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    for (let k = 0; k < 160; k++) {
      const counts = {
        owners: pick([0, 1, 2, 3, 7, 13, 15, 22]),
        parents: pick([0, 1, 2, 5, 7, 12, 16, 20]),
        siblings: pick([0, 1, 3, 9, 14, 24, 30]),
        grandparents: pick([0, 1, 2, 5, 13, 30]),
        event: pick([0, 1, 2, 3, 9, 40, 120]),
      };
      const book = familyBook(counts);
      if (book.photos.length === 0) continue;
      const opts: PlanOptions = { style: pick(STYLES), targetSpreads: pick([null, null, 4, 8, 12, 20, 30]), hasCover: pick([true, true, false]) };
      const plan = planAlbum(book.photos, book.faces, CELLS, opts);
      expectBookRules(plan, book.photos, opts, new Set(book.owners.map((p) => p.id)));
    }
  });

  it("never leaves a single event photo alone on a page", () => {
    // The last family page has room: the photo joins it.
    const a = familyBook({ owners: 6, parents: 4, event: 1 });
    const planA = planAlbum(a.photos, a.faces, CELLS, CLEAN);
    expect(sizes(planA)).toEqual([4, 2, 5]);
    expect(planA.spreads[2].photoIds).toContain(a.event[0].id);
    expectBookRules(planA, a.photos, CLEAN, new Set(a.owners.map((p) => p.id)));

    // The last family page is the owners': its last photo keeps the event photo company.
    const b = familyBook({ owners: 5, event: 1 });
    const planB = planAlbum(b.photos, b.faces, CELLS, CLEAN);
    expect(sectionsOf(planB)).toEqual(["owners", "event"]);
    expect(sizes(planB)).toEqual([4, 2]);
    expectBookRules(planB, b.photos, CLEAN, new Set(b.owners.map((p) => p.id)));

    // An owners' page of two can't give one up: the three share an event page.
    const c = familyBook({ owners: 6, event: 1 });
    const planC = planAlbum(c.photos, c.faces, CELLS, CLEAN);
    expect(sectionsOf(planC)).toEqual(["owners", "event"]);
    expect(sizes(planC)).toEqual([4, 3]);
    expectBookRules(planC, c.photos, CLEAN, new Set(c.owners.map((p) => p.id)));
  });
});

describe("planAlbum: the book order per event kind", () => {
  const ORDER_KINDS: EventKind[] = ["wedding", "henna", "bar_mitzvah", "bat_mitzvah", "birthday", "other"];

  it.each(ORDER_KINDS)("runs owners → parents → siblings → grandparents → the rest by time (%s)", (kind) => {
    const book = familyBook({ owners: 9, parents: 8, siblings: 8, grandparents: 6, event: 40 });
    // Shuffled input: the order comes from the plan, not the input.
    const photos = [...book.photos].reverse();
    const opts: PlanOptions = { style: "clean", targetSpreads: null, kind };
    const plan = planAlbum(photos, book.faces, CELLS, opts);
    const firstOf = (section: SectionKind) => sectionsOf(plan).indexOf(section);
    expect(firstOf("owners")).toBe(0);
    expect(firstOf("parents")).toBeGreaterThan(firstOf("owners"));
    expect(firstOf("siblings")).toBeGreaterThan(firstOf("parents"));
    expect(firstOf("grandparents")).toBeGreaterThan(firstOf("siblings"));
    expect(firstOf("event")).toBeGreaterThan(firstOf("grandparents"));
    // The rest of the event in shooting order.
    const eventIds = plan.spreads.filter((s) => s.section === "event").flatMap((s) => s.photoIds);
    expect(eventIds).toEqual(book.event.map((p) => p.id));
    expectBookRules(plan, book.photos, opts, new Set(book.owners.map((p) => p.id)));
    // The kind (other than a book) doesn't change the family order: same plan as with no kind.
    expect(plan).toEqual(planAlbum(photos, book.faces, CELLS, CLEAN));
  });

  it("plans a henna exactly like a wedding", () => {
    const book = familyBook({ owners: 12, parents: 5, siblings: 4, event: 30 });
    const henna = planAlbum(book.photos, book.faces, CELLS, { ...CLEAN, kind: "henna" });
    const wedding = planAlbum(book.photos, book.faces, CELLS, { ...CLEAN, kind: "wedding" });
    expect(henna).toEqual(wedding);
  });

  it("orders a photo book session only by shooting time, with no family sections", () => {
    // Family shots exist and the cells are filled, but a book ignores them. EXIF times run in the
    // reverse of the file names, so the order must come from the times.
    const book = familyBook({ owners: 10, parents: 8, siblings: 6, grandparents: 4, event: 30 });
    const t0 = Date.UTC(2026, 9, 1, 10);
    const timed = book.photos.map((p, i) => ({ ...p, takenAt: t0 + (book.photos.length - i) * 60_000 }));
    const refs = [{ id: "owners" as const, photoId: book.owners[0].id }, { id: "parents" as const, photoId: book.parents[0].id }];
    const opts: PlanOptions = { style: "clean", targetSpreads: null, kind: "book" };
    const plan = planAlbum(timed, book.faces, CELLS, opts, refs);
    expect(new Set(sectionsOf(plan))).toEqual(new Set(["event"]));
    const byTime = [...timed].sort((a, b) => (a.takenAt as number) - (b.takenAt as number)).map((p) => p.id);
    expect(plan.spreads.flatMap((s) => s.photoIds)).toEqual(byTime);
    expectBookRules(plan, timed, opts);
    // The same book without faces, cells or references.
    expect(plan.spreads).toEqual(planAlbum(timed, [], [], opts).spreads);
  });

  it("keeps the page limits in a long photo book session", () => {
    const photos = shots("b", 1, 250);
    const opts: PlanOptions = { style: "clean", targetSpreads: 20, kind: "book" };
    const plan = planAlbum(photos, [], CELLS, opts);
    expect(plan.spreads.flatMap((s) => s.photoIds)).toEqual(photos.map((p) => p.id));
    expectBookRules(plan, photos, opts);
  });
});

describe("planAlbum: the couple's pages (wedding, henna)", () => {
  const WEDDING: PlanOptions = { style: "clean", targetSpreads: null, kind: "wedding" };

  it("mixes the groom alone, the bride alone and both together, a together shot first", () => {
    const { photos, faces, byRun } = build([
      { prefix: "groom", n: 6, people: [GROOM] },
      { prefix: "bride", n: 8, people: [BRIDE] },
      { prefix: "both", n: 10, people: [GROOM, BRIDE] },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, CELLS, WEDDING);
    const ownersPages = plan.spreads.filter((s) => s.section === "owners");
    expect(ownersPages.map((s) => s.photoIds.length)).toEqual([5, 5, 5]);
    const groupOf = (id: string) => id.replace(/\d+$/, "");
    // The section opens with a together shot.
    expect(groupOf(ownersPages[0].photoIds[0])).toBe("both");
    // Every owners' page has all three kinds of shots.
    for (const page of ownersPages) expect(new Set(page.photoIds.map(groupOf))).toEqual(new Set(["groom", "bride", "both"]));
    // Each kind keeps its shooting order inside the section.
    const ownersIds = ownersPages.flatMap((s) => s.photoIds);
    for (const prefix of ["groom", "bride", "both"]) {
      const mine = ownersIds.filter((id) => groupOf(id) === prefix);
      expect(mine).toEqual(byRun[prefix].map((p) => p.id).filter((id) => mine.includes(id)));
    }
    expectBookRules(plan, photos, WEDDING, new Set([...byRun.groom, ...byRun.bride, ...byRun.both].map((p) => p.id)));
  });

  it("doesn't let many close together shots crowd out the alone shots", () => {
    const { photos, faces, byRun } = build([
      { prefix: "both", n: 20, people: [GROOM, BRIDE], area: 0.2 },
      { prefix: "groom", n: 3, people: [GROOM], area: 0.02 },
      { prefix: "bride", n: 3, people: [BRIDE], area: 0.02 },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, CELLS, WEDDING);
    const ownersIds = new Set(plan.spreads.filter((s) => s.section === "owners").flatMap((s) => s.photoIds));
    expect(ownersIds.size).toBe(15);
    for (const p of [...byRun.groom, ...byRun.bride]) expect(ownersIds.has(p.id)).toBe(true);
    expectBookRules(plan, photos, WEDDING);
  });

  it("keeps a single owner's section (bar/bat mitzvah) in shooting order", () => {
    const cells: CellPeople[] = [{ id: "owners", descriptors: [face(GROOM)] }, ...CELLS.slice(1)];
    const { photos, faces, byRun } = build([
      { prefix: "kid", n: 12, people: [GROOM] },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, cells, { style: "clean", targetSpreads: null, kind: "bar_mitzvah" });
    const ownersIds = plan.spreads.filter((s) => s.section === "owners").flatMap((s) => s.photoIds);
    expect(ownersIds).toEqual(byRun.kid.map((p) => p.id));
  });
});

describe("planAlbum: who goes to which family section", () => {
  const ownersOnly = (plan: AlbumPlan) => plan.spreads.filter((s) => s.section === "owners").flatMap((s) => s.photoIds);
  const sectionOf = (plan: AlbumPlan, id: string) => plan.spreads.find((s) => s.photoIds.includes(id))?.section;

  it("puts the owner with a parent on the parents' pages", () => {
    const { photos, faces, byRun } = build([
      { prefix: "o", n: 6, people: [GROOM, BRIDE] },
      { prefix: "withMom", n: 4, people: [BRIDE, MOTHER] },
      { prefix: "withDad", n: 3, people: [GROOM, FATHER] },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, CELLS, CLEAN);
    for (const p of [...byRun.withMom, ...byRun.withDad]) expect(sectionOf(plan, p.id)).toBe("parents");
  });

  it("puts a family shot with the siblings on the siblings' pages", () => {
    const { photos, faces, byRun } = build([
      { prefix: "o", n: 6, people: [GROOM, BRIDE] },
      { prefix: "family", n: 5, people: [GROOM, BRIDE, MOTHER, FATHER, SISTER] },
      { prefix: "withSis", n: 3, people: [BRIDE, SISTER] },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, CELLS, CLEAN);
    for (const p of [...byRun.family, ...byRun.withSis]) expect(sectionOf(plan, p.id)).toBe("siblings");
  });

  it("puts the grandparents with the owner (and anyone of the family) on the grandparents' pages", () => {
    const { photos, faces, byRun } = build([
      { prefix: "o", n: 6, people: [GROOM, BRIDE] },
      { prefix: "withGran", n: 4, people: [GROOM, GRANDMA] },
      { prefix: "allOfUs", n: 3, people: [GROOM, MOTHER, SISTER, GRANDMA] },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, CELLS, CLEAN);
    for (const p of [...byRun.withGran, ...byRun.allOfUs]) expect(sectionOf(plan, p.id)).toBe("grandparents");
  });

  it("leaves an owner with two strangers off the owners' pages, but allows one stranger", () => {
    const { photos, faces, byRun } = build([
      { prefix: "o", n: 6, people: [GROOM, BRIDE] },
      { prefix: "bridesmaids", n: 3, people: [BRIDE], strangers: 2 },
      { prefix: "guest", n: 3, people: [BRIDE], strangers: 1 },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, CELLS, { ...CLEAN, kind: "wedding" });
    const owners = new Set(ownersOnly(plan));
    for (const p of byRun.bridesmaids) {
      expect(owners.has(p.id)).toBe(false);
      expect(sectionOf(plan, p.id)).toBe("event");
    }
    for (const p of byRun.guest) expect(owners.has(p.id)).toBe(true);
  });
});

describe("splitSection and familyCaps", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`);
  const lens = (pages: string[][]) => pages.map((p) => p.length);

  it("caps each slot by its book position and the style's maximum", () => {
    expect(familyCaps(1, 3, 5)).toEqual([5, 5, 5]);
    expect(familyCaps(4, 2, 8)).toEqual([6, 6]);
    expect(familyCaps(5, 3, 8)).toEqual([6, 8, 8]);
    expect(familyCaps(10, 3, 8)).toEqual([8, 8, 8]);
    expect(familyCaps(11, 2, 20)).toEqual([15, 15]);
  });

  it("splits two pages 60:40 within the caps, and more pages as evenly as possible", () => {
    expect(lens(splitSection(ids(10), [6, 6], 4))).toEqual([6, 4]);
    expect(lens(splitSection(ids(8), [8, 8], 4))).toEqual([5, 3]);
    expect(lens(splitSection(ids(12), [6, 6], 4))).toEqual([6, 6]);
    // 60:40 would put 10 on the first page, over its cap of 8.
    expect(lens(splitSection(ids(16), [8, 8], 4))).toEqual([8, 8]);
    expect(lens(splitSection(ids(14), [8, 8, 8], 4))).toEqual([5, 5, 4]);
    expect(lens(splitSection(ids(16), [5, 5, 8], 3))).toEqual([5, 5, 6]);
    expect(lens(splitSection(ids(5), [6, 6], 4))).toEqual([5]);
    expect(lens(splitSection(ids(7), [6, 6], 4))).toEqual([4, 3]);
  });

  it("never makes a one-photo page and keeps the order", () => {
    for (let n = 2; n <= 24; n++) {
      for (const caps of [[6, 6, 6], [5, 5, 5], [3, 3, 3], [6, 8, 8], [8, 8, 8]]) {
        if (n > caps.reduce((a, b) => a + b, 0)) continue;
        for (const min of [2, 3, 4, 7]) {
          const pages = splitSection(ids(n), caps, min);
          expect(pages.flat()).toEqual(ids(n));
          expect(pages.length).toBeLessThanOrEqual(caps.length);
          pages.forEach((p, i) => {
            expect(p.length).toBeGreaterThanOrEqual(2);
            expect(p.length).toBeLessThanOrEqual(caps[i]);
          });
        }
      }
    }
  });
});

describe("mixOwnersShots", () => {
  const order = (id: string) => Number(id.replace(/\D/g, ""));

  it("with one owner, takes the closest shots in shooting order", () => {
    // Closest first: 5, 2, 9, 1, 7.
    expect(mixOwnersShots(["a5", "a2", "a9", "a1", "a7"], 3, () => 0, order)).toEqual(["a2", "a5", "a9"]);
  });

  it("takes each group in turn and spreads them evenly, a together shot first", () => {
    const group = (id: string) => (id.startsWith("t") ? TOGETHER : id.startsWith("g") ? 0 : 1);
    const ranked = ["t1", "t2", "t3", "t4", "t5", "t6", "g7", "g8", "b9", "b10", "b11"];
    const out = mixOwnersShots(ranked, 9, group, order);
    expect(out).toHaveLength(9);
    expect(out[0]).toBe("t1");
    // 3 + 2 + 3 + 1 more together: round robin until the room is full.
    expect(out.filter((id) => id.startsWith("t"))).toHaveLength(4);
    expect(out.filter((id) => id.startsWith("g"))).toEqual(["g7", "g8"]);
    expect(out.filter((id) => id.startsWith("b"))).toEqual(["b9", "b10", "b11"]);
    // No two together shots in a row while alone shots are left to mix in.
    expect(out.slice(0, 4).map((id) => id[0])).not.toEqual(["t", "t", "t", "t"]);
  });

  it("returns nothing for no room", () => {
    expect(mixOwnersShots(["a1"], 0, () => 0, order)).toEqual([]);
  });
});

describe("pickCellFaces", () => {
  const f = (person: number, area: number) => ({ descriptor: face(person), area });

  it("uses the named count, else every big face, at most the kind's owners", () => {
    const faces = [f(MOTHER, 0.04), f(GROOM, 0.05), f(FATHER, 0.03)];
    expect(pickCellFaces(faces, "")).toHaveLength(3);
    // A bar mitzvah child with the parents behind him: only the child (the largest face).
    expect(pickCellFaces(faces, "", 1)).toEqual([face(GROOM)]);
    // Names win over the kind's count.
    expect(pickCellFaces(faces, "יוסי ואבא", 1)).toEqual([face(GROOM), face(MOTHER)]);
    expect(pickCellFaces([], "", 1)).toEqual([]);
  });
});

describe("cellPeopleFromReferences", () => {
  const f = (person: number, area: number) => ({ descriptor: face(person), area });
  const ids = (people: { id: string; descriptors: number[][] }[]) =>
    people.map((c) => `${c.id}:${c.descriptors.map((d) => d.indexOf(1)).join(",")}`);

  it("leaves the owner out of the parents' reference photo, where he is the largest face", () => {
    // Owners' cell: the boy alone. Parents' cell: the boy in front of his parents, "אמא ואבא".
    const people = cellPeopleFromReferences(
      [
        { id: "parents", faces: [f(GROOM, 0.09), f(MOTHER, 0.05), f(FATHER, 0.04)], names: "אמא ואבא" },
        { id: "owners", faces: [f(GROOM, 0.08)], names: "" },
      ],
      "bar_mitzvah"
    );
    expect(ids(people)).toEqual([`owners:${GROOM}`, `parents:${MOTHER},${FATHER}`]);
  });

  it("also without names, and for every later cell (the grandparents with the couple)", () => {
    const people = cellPeopleFromReferences(
      [
        { id: "owners", faces: [f(GROOM, 0.06), f(BRIDE, 0.05)], names: "" },
        { id: "parents", faces: [f(GROOM, 0.07), f(MOTHER, 0.06), f(FATHER, 0.05)], names: "" },
        { id: "grandparents", faces: [f(BRIDE, 0.08), f(GROOM, 0.07), f(GRANDMA, 0.06)], names: "סבתא" },
      ],
      "wedding"
    );
    expect(ids(people)).toEqual([`owners:${GROOM},${BRIDE}`, `parents:${MOTHER},${FATHER}`, `grandparents:${GRANDMA}`]);
  });

  it("keeps the people the photographer named, even when one looks like a known person", () => {
    // Two faces, two names: nothing is left out (a parent who resembles the child stays a parent).
    const lookalike = face(GROOM).map((v, i) => (i === MOTHER ? 0.3 : v));
    const people = cellPeopleFromReferences(
      [
        { id: "owners", faces: [f(GROOM, 0.08)], names: "יוסי" },
        { id: "parents", faces: [{ descriptor: lookalike, area: 0.05 }, f(FATHER, 0.04)], names: "אמא ואבא" },
      ],
      "bar_mitzvah"
    );
    expect(people[1].descriptors).toEqual([lookalike, face(FATHER)]);
  });

  it("takes the kind's head count for the owners when there are no names", () => {
    const refs = [{ id: "owners" as const, faces: [f(GROOM, 0.06), f(MOTHER, 0.05), f(FATHER, 0.05)], names: "" }];
    expect(cellPeopleFromReferences(refs, "bar_mitzvah")[0].descriptors).toEqual([face(GROOM)]);
    expect(cellPeopleFromReferences(refs, "wedding")[0].descriptors).toHaveLength(2);
    expect(cellPeopleFromReferences(refs, "other")[0].descriptors).toHaveLength(3);
    expect(cellPeopleFromReferences(refs)[0].descriptors).toHaveLength(3);
  });

  it("skips cells with no faces", () => {
    expect(cellPeopleFromReferences([{ id: "parents", faces: [], names: "אמא" }])).toEqual([]);
  });

  it("keeps the boy's own shots on the owners' pages (end to end)", () => {
    const cells = cellPeopleFromReferences(
      [
        { id: "owners", faces: [f(GROOM, 0.08)], names: "" },
        { id: "parents", faces: [f(GROOM, 0.09), f(MOTHER, 0.05), f(FATHER, 0.04)], names: "אמא ואבא" },
      ],
      "bar_mitzvah"
    );
    const { photos, faces, byRun } = build([
      { prefix: "kid", n: 8, people: [GROOM] },
      { prefix: "withParents", n: 6, people: [GROOM, MOTHER, FATHER] },
      { prefix: "e", n: 30, people: [] },
    ]);
    const plan = planAlbum(photos, faces, cells, { style: "clean", targetSpreads: null, kind: "bar_mitzvah" });
    const sectionOf = (id: string) => plan.spreads.find((s) => s.photoIds.includes(id))?.section;
    for (const p of byRun.kid) expect(sectionOf(p.id)).toBe("owners");
    for (const p of byRun.withParents) expect(sectionOf(p.id)).toBe("parents");
  });
});

describe("detectEventKind and cell labels", () => {
  it("recognizes the event kinds the labels depend on", () => {
    expect(detectEventKind("החתונה של דנה ויוסי")).toBe("wedding");
    expect(detectEventKind("דנה ויוסי", "חתונה")).toBe("wedding");
    expect(detectEventKind("חינה לדנה")).toBe("henna");
    expect(detectEventKind("בר-מצווה יוסי")).toBe("bar_mitzvah");
    expect(detectEventKind("עלייה לתורה של אורטל")).toBe("bar_mitzvah");
    expect(detectEventKind("בת מצווה נועה")).toBe("bat_mitzvah");
    expect(detectEventKind("מלי חוגגת 60")).toBe("birthday");
    expect(detectEventKind("יוסי בן 40")).toBe("birthday");
    expect(detectEventKind("כנס שנתי 12/05")).toBe("other");
  });

  it.each([
    "חתונה",
    "חתונת דנה ויוסי",
    "החתונה של דנה ויוסי",
    "לחתונה של דנה",
    "חתונות 2026",
    "חופה - דנה ויוסי",
    "Dana & Yossi wedding",
  ])("detects a wedding: %s", (title) => {
    expect(detectEventKind(title)).toBe("wedding");
  });

  it.each(["חינה", "החינה של דנה", "חינה לדנה ויוסי", "Henna night"])("detects a henna: %s", (title) => {
    expect(detectEventKind(title)).toBe("henna");
  });

  it.each([
    "בר מצווה",
    "בר המצווה של יוסי",
    "לבר המצווה של יוסי",
    "בר-מצווה יוסי",
    "בר־מצווה יוסי",
    "בר מצוה יוסי",
    "בר-המצוה",
    "ברמצווה",
    "בַּר מִצְוָה",
    "עלייה לתורה",
    "עליה לתורה של אורטל",
    "העלייה לתורה של אורטל",
    "הנחת תפילין - יוסי",
    "Yossi bar mitzvah",
  ])("detects a bar mitzvah: %s", (title) => {
    expect(detectEventKind(title)).toBe("bar_mitzvah");
  });

  it.each(["בת מצווה", "בת המצווה של נועה", "בת-מצווה נועה", "בת מצוה נועה", "בת־המצווה", "בת מיצווה", "Noa bat mitzvah"])(
    "detects a bat mitzvah: %s",
    (title) => {
      expect(detectEventKind(title)).toBe("bat_mitzvah");
    }
  );

  it.each(["בוק", "בוק בת מצווה", "בוק בר מצווה - יוסי", "בוק בר-מצווה", "הבוק של נועה", "צילומי בוק לבת המצווה"])("detects a photo book session: %s", (title) => {
    expect(detectEventKind(title)).toBe("book");
  });

  it("does not mistake other words for the kinds", () => {
    // "בוקר" (morning) is not a book; "מבחינה" (in terms of) is not a henna.
    expect(detectEventKind("עלייה לתורה בוקר")).toBe("bar_mitzvah");
    expect(detectEventKind("צילומי בוקר")).toBe("other");
    expect(detectEventKind("מבחינה טכנית")).toBe("other");
    expect(detectEventKind("China trip")).toBe("other");
    expect(detectEventKind("ברית לאורי")).toBe("other");
  });

  it("reads the event type first, then the gallery title", () => {
    expect(detectEventKind("יוסי בן 40", "חתונה")).toBe("wedding");
    expect(detectEventKind("חינה של דנה", "חתונה")).toBe("wedding");
    expect(detectEventKind("נועה", "בת מצווה")).toBe("bat_mitzvah");
    expect(detectEventKind("אורטל", "עלייה לתורה")).toBe("bar_mitzvah");
    // An event type with no kind ("ברית", a free text) falls back to the title.
    expect(detectEventKind("בר המצווה של יוסי", "ברית")).toBe("bar_mitzvah");
    expect(detectEventKind("בר המצווה של יוסי", null)).toBe("bar_mitzvah");
    expect(detectEventKind("", "")).toBe("other");
  });

  it("lets a 'בוק' in either the event type or the title win", () => {
    expect(detectEventKind("בוק - נועה", "בת מצווה")).toBe("book");
    expect(detectEventKind("נועה", "בוק בת מצווה")).toBe("book");
  });

  it("labels the owners' cell by the event kind", () => {
    expect(cellLabel("owners", "wedding")).toBe("חתן וכלה");
    expect(cellLabel("owners", "henna")).toBe("חתן וכלה");
    expect(cellLabel("owners", "bar_mitzvah")).toBe("חתן בר המצווה");
    expect(cellLabel("owners", "bat_mitzvah")).toBe("כלת בת המצווה");
    expect(cellLabel("owners", "birthday")).toBe("בעלי השמחה");
    expect(cellLabel("owners", "book")).toBe("בעלי השמחה");
    expect(cellLabel("parents", "wedding")).toBe("ההורים");
    expect(cellLabel("siblings", "bat_mitzvah")).toBe("אחים ואחיות");
    expect(cellLabel("grandparents", "wedding")).toBe("סבא וסבתא");
    // The detected kind of the known misses gets the right label.
    expect(cellLabel("owners", detectEventKind("חתונת דנה ויוסי"))).toBe("חתן וכלה");
    expect(cellLabel("owners", detectEventKind("בר המצווה של יוסי"))).toBe("חתן בר המצווה");
    expect(cellLabel("owners", detectEventKind("בת המצווה של נועה"))).toBe("כלת בת המצווה");
  });

  it("knows how many owners each kind has", () => {
    expect(ownersCountFor("wedding")).toBe(2);
    expect(ownersCountFor("henna")).toBe(2);
    expect(ownersCountFor("bar_mitzvah")).toBe(1);
    expect(ownersCountFor("bat_mitzvah")).toBe(1);
    expect(ownersCountFor("birthday")).toBeUndefined();
    expect(ownersCountFor("book")).toBeUndefined();
  });
});

describe("countNames", () => {
  it("counts the people a cell's free text names", () => {
    expect(countNames("")).toBe(0);
    expect(countNames("3")).toBe(3);
    expect(countNames("סבתא שושנה")).toBe(1);
    expect(countNames("רחל ודוד")).toBe(2);
    expect(countNames("אמא ואבא")).toBe(2);
    expect(countNames("אמא רחל, אבא דוד")).toBe(2);
    expect(countNames("Dana and Yossi")).toBe(2);
  });
});
