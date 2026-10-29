import { describe, expect, it } from "vitest";
import {
  cellFaceUses,
  cellLabel,
  cellPeopleFromReferences,
  cellsFor,
  combinedBookShare,
  combinedCoverLines,
  combinedParts,
  coverTitleLines,
  countNames,
  detectEventKind,
  familyCaps,
  followsTabs,
  mixOwnersShots,
  nameList,
  ownersCountFor,
  pageCap,
  pickCellFaces,
  planAlbum,
  planCombined,
  splitSection,
  tabLabel,
  tabRoles,
  ownersTabIndexes,
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
const face = (person: number) => Array.from({ length: 12 }, (_, k) => (k === person ? 1 : 0));
const GROOM = 0;
const BRIDE = 1;
const MOTHER = 2;
const FATHER = 3;
const SISTER = 4;
const GRANDMA = 5;
const STRANGER_A = 6;
const STRANGER_B = 7;
// The bride's side (owner 2026-10-21: two parents' cells at a wedding, grandparents of both sides).
const MOTHER2 = 8;
const FATHER2 = 9;
const GRANDMA2 = 10;
const GRANDPA = 11;

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

const RANK: Record<SectionKind, number> = { owners: 0, parents: 1, parents2: 2, siblings: 3, grandparents: 4, grandparents2: 5, event: 6 };
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
    expect(cellLabel("parents", "bar_mitzvah")).toBe("ההורים");
    expect(cellLabel("siblings", "bat_mitzvah")).toBe("אחים ואחיות");
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

describe("the cells of both sides (owner 2026-10-21)", () => {
  it("shows two parents' cells only at a wedding or a henna, the grandparents of both sides always", () => {
    expect(cellsFor("wedding")).toEqual(["parents", "parents2", "owners", "siblings", "grandparents", "grandparents2"]);
    expect(cellsFor("henna")).toContain("parents2");
    for (const kind of ["bar_mitzvah", "bat_mitzvah", "birthday", "other"] as EventKind[]) {
      expect(cellsFor(kind)).toEqual(["parents", "owners", "siblings", "grandparents", "grandparents2"]);
    }
    expect(cellsFor("book")).toEqual([]);
  });

  it("names the sides: the groom's and the bride's at a wedding, the father's and the mother's otherwise", () => {
    expect(cellLabel("parents", "wedding")).toBe("הורי החתן");
    expect(cellLabel("parents2", "wedding")).toBe("הורי הכלה");
    expect(cellLabel("parents", "henna")).toBe("הורי החתן");
    expect(cellLabel("grandparents", "wedding")).toBe("סבא וסבתא מצד החתן");
    expect(cellLabel("grandparents2", "henna")).toBe("סבא וסבתא מצד הכלה");
    expect(cellLabel("grandparents", "bar_mitzvah")).toBe("סבא וסבתא מצד אבא");
    expect(cellLabel("grandparents2", "bat_mitzvah")).toBe("סבא וסבתא מצד אמא");
  });

  const WEDDING_CELLS: CellPeople[] = [
    { id: "owners", descriptors: [face(GROOM), face(BRIDE)] },
    { id: "parents", descriptors: [face(MOTHER), face(FATHER)] },
    { id: "parents2", descriptors: [face(MOTHER2), face(FATHER2)] },
    { id: "siblings", descriptors: [face(SISTER)] },
    { id: "grandparents", descriptors: [face(GRANDMA)] },
    { id: "grandparents2", descriptors: [face(GRANDMA2), face(GRANDPA)] },
  ];

  it("runs owners → the groom's parents → the bride's parents → siblings → each side's grandparents → event", () => {
    const { photos, faces, byRun } = build([
      { prefix: "o", n: 10, people: [GROOM, BRIDE] },
      { prefix: "gp", n: 6, people: [GROOM, BRIDE, MOTHER, FATHER] },
      { prefix: "bp", n: 6, people: [GROOM, BRIDE, MOTHER2, FATHER2] },
      // Both families with the couple: the bride's parents' photo (the later section takes it).
      { prefix: "both", n: 2, people: [GROOM, BRIDE, MOTHER, FATHER, MOTHER2, FATHER2] },
      { prefix: "s", n: 5, people: [BRIDE, SISTER] },
      { prefix: "g1", n: 6, people: [GROOM, GRANDMA] },
      { prefix: "g2", n: 6, people: [BRIDE, GRANDMA2, GRANDPA] },
      { prefix: "e", n: 40, people: [] },
    ]);
    const plan = planAlbum(photos, faces, WEDDING_CELLS, { ...CLEAN, kind: "wedding" });
    const sectionOf = (id: string) => plan.spreads.find((sp) => sp.photoIds.includes(id))?.section;
    for (const p of byRun.gp) expect(sectionOf(p.id)).toBe("parents");
    for (const p of [...byRun.bp, ...byRun.both]) expect(sectionOf(p.id)).toBe("parents2");
    for (const p of byRun.g1) expect(sectionOf(p.id)).toBe("grandparents");
    for (const p of byRun.g2) expect(sectionOf(p.id)).toBe("grandparents2");
    const order = sectionsOf(plan).filter((sec, i, all) => i === 0 || all[i - 1] !== sec);
    expect(order).toEqual(["owners", "parents", "parents2", "siblings", "grandparents", "grandparents2", "event"]);
    expectEveryPhotoOnce(plan, photos);
  });

  it("gives each side's grandparents 2 pages when both are filled, and one side alone its 3", () => {
    const runs = (withSecond: boolean) =>
      build([
        { prefix: "o", n: 6, people: [GROOM, BRIDE] },
        { prefix: "g1", n: 30, people: [GRANDMA] },
        ...(withSecond ? [{ prefix: "g2", n: 30, people: [GRANDMA2] }] : []),
        { prefix: "e", n: 40, people: [] },
      ]);
    const both = runs(true);
    const planBoth = planAlbum(both.photos, both.faces, WEDDING_CELLS, { ...CLEAN, kind: "wedding" });
    expect(countSection(planBoth, "grandparents")).toBe(2);
    expect(countSection(planBoth, "grandparents2")).toBe(2);
    const one = runs(false);
    const planOne = planAlbum(one.photos, one.faces, WEDDING_CELLS.filter((c) => c.id !== "grandparents2"), { ...CLEAN, kind: "wedding" });
    expect(countSection(planOne, "grandparents")).toBe(3);
  });

  it("orders the family tab by both sides when the book follows the tabs", () => {
    const tabbed = (prefix: string, n: number, tab: { key: string; name: string; order: number }) => shots(prefix, 1, n).map((p) => ({ ...p, tab }));
    const owners = { key: "t2", name: "2.חתן וכלה", order: 0 };
    const family = { key: "t3", name: "3.משפחה", order: 1 };
    const event = { key: "t4", name: "4.ריקודים", order: 2 };
    const photos = [
      ...tabbed("o", 8, owners),
      // In shooting order the bride's side comes first; the tab still runs the groom's side first.
      ...tabbed("gb", 3, family),
      ...tabbed("bp", 3, family),
      ...tabbed("gp", 3, family),
      ...tabbed("e", 20, event),
    ].map((p, i) => ({ ...p, filename: `IMG_${String(i).padStart(4, "0")}.jpg` }));
    const people: Record<string, number[]> = { o: [GROOM, BRIDE], gb: [BRIDE, GRANDMA2], bp: [BRIDE, MOTHER2, FATHER2], gp: [GROOM, MOTHER, FATHER] };
    const faces = photos.flatMap((p) => {
      const who = people[p.id.replace(/\d+$/, "")];
      return who ? [{ photoId: p.id, faces: who.map((w) => ({ descriptor: face(w), area: 0.05 })) }] : [];
    });
    const plan = planAlbum(photos, faces, WEDDING_CELLS, { ...CLEAN, kind: "wedding" });
    const familyIds = plan.spreads.filter((sp) => sp.tab === "t3").flatMap((sp) => sp.photoIds);
    expect(familyIds.map((id) => id.replace(/\d+$/, ""))).toEqual(["gp", "gp", "gp", "bp", "bp", "bp", "gb", "gb", "gb"]);
  });
});

describe("names written right to left (owner 2026-10-21)", () => {
  const f = (person: number, area: number, x: number) => ({ descriptor: face(person), area, x });
  const useOf = (refs: Parameters<typeof cellFaceUses>[0], kind: EventKind, order: "rtl" | "ltr" = "rtl") =>
    Object.fromEntries(cellFaceUses(refs, kind, order).map((c) => [c.id, c.faces.map((u) => `${u.status}:${u.name ?? ""}${u.knownCell ? `@${u.knownCell}` : ""}`)]));

  it("reads the names in order, with the field's opening words left out", () => {
    expect(nameList("מימין לשמאל: אבא, אורי, אמא")).toEqual(["אבא", "אורי", "אמא"]);
    expect(nameList("אמא רחל ואבא דוד")).toEqual(["אמא רחל", "אבא דוד"]);
    expect(nameList("סבתא שושנה")).toEqual(["סבתא שושנה"]);
    expect(nameList("3")).toEqual([]);
    expect(countNames("מימין לשמאל:")).toBe(0);
    expect(countNames("מימין לשמאל: רחל ודוד")).toBe(2);
  });

  it("gives each face its name, right to left across the photo", () => {
    // Mom at the right, dad at the left (x is the face's centre, 0 = left).
    const uses = useOf([{ id: "parents", faces: [f(FATHER, 0.04, 0.2), f(MOTHER, 0.05, 0.8)], names: "אמא רחל, אבא דוד" }], "bar_mitzvah");
    expect(uses.parents).toEqual(["cell:אבא דוד", "cell:אמא רחל"]);
  });

  it("left to right in English and Russian", () => {
    const uses = useOf([{ id: "parents", faces: [f(FATHER, 0.04, 0.2), f(MOTHER, 0.05, 0.8)], names: "Dad, Mom" }], "bar_mitzvah", "ltr");
    expect(uses.parents).toEqual(["cell:Dad", "cell:Mom"]);
  });

  it("leaves out the face of someone named in an earlier cell, even when he's the largest face", () => {
    // The boy stands between his parents, the largest face: "אבא, אורי, אמא", and "אורי" is the owners' cell.
    const refs = [
      { id: "owners" as const, faces: [f(GROOM, 0.08, 0.5)], names: "אורי" },
      { id: "parents" as const, faces: [f(GROOM, 0.09, 0.5), f(FATHER, 0.05, 0.8), f(MOTHER, 0.04, 0.2)], names: "מימין לשמאל: אבא, אורי, אמא" },
    ];
    expect(useOf(refs, "bar_mitzvah").parents).toEqual(["known:אורי@owners", "cell:אבא", "cell:אמא"]);
    expect(cellPeopleFromReferences(refs, "bar_mitzvah")[1]).toEqual({ id: "parents", descriptors: [face(FATHER), face(MOTHER)] });
  });

  it("knows the owners by title too, and the parents in the grandparents' photo", () => {
    // Faces that look like nobody known: only the names can tell.
    const kid = Array.from({ length: 12 }, (_, k) => (k === GROOM ? 0.5 : k === STRANGER_A ? 0.5 : 0));
    const dad = Array.from({ length: 12 }, (_, k) => (k === FATHER ? 0.5 : k === STRANGER_B ? 0.5 : 0));
    const refs = [
      { id: "parents" as const, faces: [{ descriptor: kid, area: 0.09, x: 0.5 }, f(FATHER, 0.05, 0.8), f(MOTHER, 0.04, 0.2)], names: "אבא, הילד, אמא" },
      { id: "grandparents" as const, faces: [f(GRANDMA, 0.05, 0.8), { descriptor: dad, area: 0.05, x: 0.5 }, f(GRANDPA, 0.05, 0.2)], names: "סבתא, אבא, סבא" },
    ];
    const uses = useOf(refs, "bar_mitzvah");
    expect(uses.parents).toEqual(["known:הילד@owners", "cell:אבא", "cell:אמא"]);
    expect(uses.grandparents).toEqual(["cell:סבתא", "known:אבא@parents", "cell:סבא"]);
  });

  it("never takes the bride's parents for the groom's because both are written 'אבא, אמא'", () => {
    const refs = [
      { id: "parents" as const, faces: [f(FATHER, 0.05, 0.8), f(MOTHER, 0.05, 0.2)], names: "אבא, אמא" },
      { id: "parents2" as const, faces: [f(FATHER2, 0.05, 0.8), f(MOTHER2, 0.05, 0.2)], names: "אבא, אמא" },
    ];
    expect(useOf(refs, "wedding").parents2).toEqual(["cell:אבא", "cell:אמא"]);
  });

  it("doesn't take someone of the groom's ('אבא של החתן') for the groom", () => {
    const refs = [{ id: "siblings" as const, faces: [f(SISTER, 0.05, 0.8), f(FATHER, 0.05, 0.2)], names: "האחות, אבא של החתן" }];
    expect(useOf(refs, "wedding").siblings).toEqual(["cell:האחות", "known:אבא של החתן@parents"]);
  });

  it("puts no names on the faces when fewer faces than names were found, and still counts them", () => {
    const uses = useOf([{ id: "parents", faces: [f(MOTHER, 0.05, 0.8)], names: "אמא, אבא" }], "bar_mitzvah");
    expect(uses.parents).toEqual(["cell:"]);
  });

  it("lets a direction typed at the start win", () => {
    const uses = useOf([{ id: "parents", faces: [f(FATHER, 0.04, 0.2), f(MOTHER, 0.05, 0.8)], names: "משמאל לימין: אבא, אמא" }], "bar_mitzvah");
    expect(uses.parents).toEqual(["cell:אבא", "cell:אמא"]);
  });

  it("marks the background faces beyond the names as unused", () => {
    const uses = useOf([{ id: "parents", faces: [f(MOTHER, 0.05, 0.7), f(STRANGER_A, 0.005, 0.95), f(FATHER, 0.05, 0.3)], names: "אמא, אבא" }], "bar_mitzvah");
    expect(uses.parents).toEqual(["cell:אמא", "unused:", "cell:אבא"]);
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

// --- The book by the gallery's tabs (owner, 2026-10-21) ----------------------------------------
// The owner's hand-made albums run tab by tab ("2.חתן", "3.משפחה", "4.תפילה", "5.ארוחה"), with the
// atmosphere tab on the last page (the owner's choice).

type TabSpec = { name: string; n: number; aspect?: number };
// A gallery sorted into tabs: each tab's photos in shooting order, the tabs one after the other.
// `shuffleTime`: shooting times that interleave the tabs, as they do at a real event (the family
// photos are taken between the prayer shots), so only the tabs can keep them apart.
function tabbedGallery(specs: TabSpec[], opts: { shuffleTime?: boolean } = {}) {
  const photos: AutoPhoto[] = [];
  let k = 0;
  specs.forEach((t, order) => {
    for (let i = 0; i < t.n; i++, k++) {
      photos.push({
        id: `${order}-${i}`,
        aspect: t.aspect ?? 1.5,
        takenAt: opts.shuffleTime ? Date.UTC(2026, 9, 1, 18) + ((k * 7919) % 997) * 20_000 : Date.UTC(2026, 9, 1, 18) + k * 20_000,
        filename: `IMG_${String(k).padStart(4, "0")}.jpg`,
        tab: { key: `tab${order}`, name: t.name, order },
      });
    }
  });
  return photos;
}
const tabOfId = (id: string) => Number(id.split("-")[0]);
const tabsOfPage = (plan: AlbumPlan) => plan.spreads.map((s) => [...new Set(s.photoIds.map(tabOfId))]);

describe("tabLabel and tabRoles", () => {
  it("drops the order number in front of a tab's name", () => {
    expect(tabLabel("3.משפחה")).toBe("משפחה");
    expect(tabLabel("03 - חופה")).toBe("חופה");
    expect(tabLabel("ריקודים")).toBe("ריקודים");
  });

  it("finds the atmosphere, the owners, the family and the stages", () => {
    expect(tabRoles(["1.אוירה", "2.חתן", "3.משפחה", "4.תפילה", "5.ארוחה"])).toEqual(["atmosphere", "owners", "family", "stage", "stage"]);
    expect(tabRoles(["1.אוירה", "2.הזוג", "3.משפחה", "4.ריקודים", "5.טקס חינה"])).toEqual(["atmosphere", "owners", "family", "stage", "stage"]);
    expect(tabRoles(["1.חתן", "2.משפחה", "3.תפילה", "4.ארוחה ואורחים"])).toEqual(["owners", "family", "stage", "stage"]);
    // Named for the bat mitzvah girl: the owners, since the family's tab comes right after.
    expect(tabRoles(["1.אוירה", "2.נטע", "3.משפחה", "4.אורחים"])).toEqual(["atmosphere", "owners", "family", "stage"]);
    expect(tabRoles(["3.משפחה", "4.משפחה מורחבת"])).toEqual(["family", "family"]);
    expect(tabRoles(["טקס", "קבלת פנים", "ריקודים"])).toEqual(["stage", "stage", "stage"]);
    // "זוג" as its own word names the couple's tab; "זוגות" doesn't (2026-10-24).
    expect(tabRoles(["הכנות", "טקס", "צילומי זוג", "מסיבה"])).toEqual(["stage", "stage", "owners", "stage"]);
    expect(tabRoles(["1.אוירה", "2.צילומי הזוג", "3.ריקודי זוגות"])).toEqual(["atmosphere", "owners", "stage"]);
    expect(tabRoles(["טקס", "ריקודי זוגות"])).toEqual(["stage", "stage"]);
    expect(ownersTabIndexes(["1.Getting ready", "2.Bride", "3.Groom", "4.Couple", "5.Party"])).toEqual([1, 2, 3]);
  });
});

describe("planAlbum: the book by the gallery's tabs", () => {
  const ORTAL: TabSpec[] = [
    { name: "1.אוירה", n: 2 },
    { name: "2.חתן", n: 7 },
    { name: "3.משפחה", n: 18 },
    { name: "4.תפילה", n: 133 },
    { name: "5.ארוחה", n: 10 },
  ];

  it("follows the tabs: their order, one tab a page, the small atmosphere tab on the last page", () => {
    const photos = tabbedGallery(ORTAL, { shuffleTime: true });
    const plan = planAlbum(photos, [], [], { style: "clean", targetSpreads: 19 });
    expectEveryPhotoOnce(plan, photos);
    expect(plan.spreads).toHaveLength(18);
    const pages = tabsOfPage(plan);
    // Owners, family, prayer, meal, and the atmosphere's 2 photos join the meal's last page.
    expect(pages.slice(0, -1).every((t) => t.length === 1)).toBe(true);
    expect(pages[pages.length - 1].sort()).toEqual([0, 4]);
    const order = pages.map((t) => t.find((x) => x !== 0) ?? 0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBe(1);
    expect(sectionsOf(plan)[0]).toBe("owners");
    expect(plan.spreads.filter((s) => s.section === "parents").every((s) => s.photoIds.every((id) => tabOfId(id) === 2))).toBe(true);
  });

  it("keeps the photos of each tab in shooting order", () => {
    const photos = tabbedGallery(ORTAL, { shuffleTime: true });
    const plan = planAlbum(photos, [], [], { style: "clean", targetSpreads: 19 });
    const prayer = plan.spreads.flatMap((s) => s.photoIds).filter((id) => tabOfId(id) === 3);
    const times = prayer.map((id) => photos.find((p) => p.id === id)!.takenAt as number);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("gives a big atmosphere tab its own last page", () => {
    const photos = tabbedGallery([{ name: "1.אוירה", n: 9 }, { name: "2.חתן", n: 8 }, { name: "3.משפחה", n: 12 }, { name: "4.ריקודים", n: 40 }]);
    const plan = planAlbum(photos, [], [], CLEAN);
    const pages = tabsOfPage(plan);
    expect(pages[pages.length - 1]).toEqual([0]);
    expect(pages.slice(0, -1).flat()).not.toContain(0);
  });

  it("takes the cover from the owners' tab, a portrait one first", () => {
    const photos = tabbedGallery([{ name: "1.אוירה", n: 2 }, { name: "2.חתן", n: 6 }, { name: "3.משפחה", n: 10 }, { name: "4.תפילה", n: 40 }]);
    photos.find((p) => p.id === "1-3")!.aspect = 0.67;
    const plan = planAlbum(photos, [], [], CLEAN);
    expect(plan.coverPhotoId).toBe("1-3");
  });

  it("orders the family tab parents, siblings, grandparents when the cells are filled", () => {
    const photos = tabbedGallery([{ name: "1.חתן", n: 6 }, { name: "2.משפחה", n: 12 }, { name: "3.תפילה", n: 30 }]);
    // In the family tab, in shooting order: grandma, sister, parents, four of each.
    const who = [GRANDMA, SISTER, MOTHER];
    const faces: PhotoFaces[] = photos
      .filter((p) => tabOfId(p.id) === 1)
      .map((p, i) => ({ photoId: p.id, faces: [{ descriptor: face(GROOM), area: 0.05 }, { descriptor: face(who[Math.floor(i / 4)]), area: 0.05 }] }));
    const plan = planAlbum(photos, faces, CELLS, CLEAN);
    const family = plan.spreads.flatMap((s) => s.photoIds).filter((id) => tabOfId(id) === 1);
    const rank = (id: string) => Math.floor(Number(id.split("-")[1]) / 4);
    expect(family.map(rank)).toEqual([2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0]);
  });

  it("keeps the page limits: at most 30 pages, the caps by position, never a lone photo or a dropped one", () => {
    const specs: TabSpec[] = [
      { name: "1.אוירה", n: 3 },
      { name: "2.הזוג", n: 30 },
      { name: "3.משפחה", n: 45 },
      { name: "4.חופה", n: 50 },
      { name: "5.ריקודים", n: 110 },
      { name: "6.אורחים", n: 12 },
    ];
    for (const target of [null, 12, 20, 30]) {
      const photos = tabbedGallery(specs, { shuffleTime: true });
      const plan = planAlbum(photos, [], [], { style: "clean", targetSpreads: target });
      expectEveryPhotoOnce(plan, photos);
      expect(plan.spreads.length).toBeLessThanOrEqual((target ?? 30) - 1);
      plan.spreads.forEach((s) => expect(s.photoIds.length).toBeGreaterThanOrEqual(2));
      if (target === null || target === 30) plan.spreads.forEach((s, i) => expect(s.photoIds.length).toBeLessThanOrEqual(pageCap(i + 1)));
    }
  });

  it("doesn't follow the tabs with a single tab, or with many photos outside the tabs", () => {
    const one = tabbedGallery([{ name: "ריקודים", n: 30 }]);
    expect(followsTabs(one)).toBe(false);
    const loose = tabbedGallery([{ name: "1.חתן", n: 10 }, { name: "2.משפחה", n: 10 }]);
    for (let i = 0; i < 6; i++) loose[i].tab = null;
    expect(followsTabs(loose)).toBe(false);
    expect(planAlbum(one, [], [], CLEAN).spreads.every((s) => !s.tab)).toBe(true);
  });

  it("orders a photo book session by shooting time even with tabs", () => {
    const photos = tabbedGallery([{ name: "1.אוירה", n: 4 }, { name: "2.חוף", n: 10 }, { name: "3.סטודיו", n: 10 }], { shuffleTime: true });
    const plan = planAlbum(photos, [], [], { ...CLEAN, kind: "book" });
    const times = plan.spreads.flatMap((s) => s.photoIds).map((id) => photos.find((p) => p.id === id)!.takenAt as number);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

// The photo cover's two lines, as the owner set them on "עלייה לתורה - אורי" (2026-10-21).
describe("coverTitleLines", () => {
  it("puts the name large and the event with its date under it", () => {
    expect(coverTitleLines("עלייה לתורה - אורי", "2026-10-05")).toEqual({ main: "אורי", sub: "עלייה לתורה | 5.10.2026" });
    expect(coverTitleLines("דנה ואורי | חתונה", "2027-01-15")).toEqual({ main: "דנה ואורי", sub: "חתונה | 15.1.2027" });
  });

  it("keeps a title in one part whole, with the date alone under it", () => {
    expect(coverTitleLines("חתונת דנה ואורי", "2026-06-30")).toEqual({ main: "חתונת דנה ואורי", sub: "30.6.2026" });
    expect(coverTitleLines("אורי", null)).toEqual({ main: "אורי", sub: null });
  });

  it("splits on the first part when neither names an event kind", () => {
    expect(coverTitleLines("דנה – אורי", null)).toEqual({ main: "דנה", sub: "אורי" });
  });

  it("doesn't split a hyphen inside a word, and reads the date without a time zone", () => {
    expect(coverTitleLines("בת-מצווה של נועה", "2026-03-01T00:00:00Z")).toEqual({ main: "בת-מצווה של נועה", sub: "1.3.2026" });
  });
});

// The combined album (CLAUDE.md, "אלבום משולב"): a gallery of two events in two main tabs, the book
// first by the book's rules, then an opening page and the event by its tabs.
describe("the combined album", () => {
  const BOOK = { key: "book", name: "בוק בת מצווה", order: 0 };
  const EVENT = { key: "aliyah", name: "עלייה לתורה", order: 4 };
  const inTab = (prefix: string, from: number, n: number, main: typeof BOOK, tab: { key: string; name: string; order: number }, aspect = 1.5): AutoPhoto[] =>
    shots(prefix, from, n, aspect).map((p) => ({ ...p, main, tab }));
  // As the gallery "ניסוי בדיקה" (2026-10-28): 8, 8 and 3 photos under each main tab.
  const gallery = (): AutoPhoto[] => [
    ...inTab("b", 1, 8, BOOK, { key: "b1", name: "1.עין צורים", order: 1 }),
    ...inTab("b", 9, 8, BOOK, { key: "b2", name: "2.גרפיטי", order: 2 }),
    ...inTab("b", 17, 3, BOOK, { key: "b3", name: "3.ים", order: 3 }, 0.67),
    ...inTab("e", 1, 8, EVENT, { key: "e1", name: "1.חתן", order: 5 }, 0.67),
    ...inTab("e", 9, 8, EVENT, { key: "e2", name: "2.תפילה", order: 6 }),
    ...inTab("e", 17, 3, EVENT, { key: "e3", name: "3.אורחים", order: 7 }),
  ];
  const tabOf = (photos: AutoPhoto[]) => new Map(photos.map((p) => [p.id, p.tab?.key] as const));

  it("finds the book and the event, the book first whatever the tabs' order", () => {
    const parts = combinedParts(gallery(), "other");
    expect(parts?.book.name).toBe("בוק בת מצווה");
    expect(parts?.event).toMatchObject({ name: "עלייה לתורה", kind: "bar_mitzvah" });
    expect(parts?.book.ids).toHaveLength(19);
    const flipped = gallery().map((p) => ({ ...p, main: p.main!.key === "book" ? { ...BOOK, order: 9 } : EVENT }));
    expect(combinedParts(flipped, "other")?.book.key).toBe("book");
  });

  it("isn't a combined gallery without exactly a book and another event", () => {
    const one = gallery().map((p) => ({ ...p, main: BOOK }));
    expect(combinedParts(one, "other")).toBeNull();
    const twoBooks = gallery().map((p) => ({ ...p, main: p.main!.key === "aliyah" ? { ...EVENT, name: "בוק עלייה לתורה" } : BOOK }));
    expect(combinedParts(twoBooks, "other")).toBeNull();
    const noBook = gallery().map((p) => ({ ...p, main: p.main!.key === "book" ? { ...BOOK, name: "ריקודים" } : EVENT }));
    expect(combinedParts(noBook, "other")).toBeNull();
    expect(combinedParts(shots("x", 1, 10), "book")).toBeNull();
  });

  it("names the event by the gallery when its tab doesn't, and closes it with the photos outside the tabs", () => {
    const photos = [...gallery().map((p) => (p.main!.key === "aliyah" ? { ...p, main: { ...EVENT, name: "יום חמישי" } } : p)), ...shots("loose", 1, 2)];
    const parts = combinedParts(photos, "bat_mitzvah");
    expect(parts?.event.kind).toBe("bat_mitzvah");
    expect(parts?.event.ids.slice(-2)).toEqual(["loose1", "loose2"]);
  });

  it("20 pages: the cover, the book, an opening page and the event by its tabs, every photo once", () => {
    const photos = gallery();
    const parts = combinedParts(photos, "other")!;
    const plan = planCombined(photos, [], [], parts, { style: "clean", targetSpreads: 20 });
    expect(plan.spreads.length).toBeLessThanOrEqual(19);
    expectEveryPhotoOnce(plan, photos);
    const book = plan.spreads.slice(0, plan.bookSpreads);
    expect(book.flatMap((s) => s.photoIds).every((id) => id.startsWith("b"))).toBe(true);
    expect(book.flatMap((s) => s.photoIds)).toHaveLength(19);
    // The book by its places in their order, a page never mixing two (2026-10-28).
    const places = book.map((s) => [...new Set(s.photoIds.map((id) => tabOf(photos).get(id)))]);
    expect(places.every((p) => p.length === 1)).toBe(true);
    expect(places.flat()).toEqual([...places.flat()].sort());
    const opener = plan.spreads[plan.bookSpreads];
    expect(opener.opener).toEqual({ title: "עלייה לתורה" });
    expect(opener.photoIds).toHaveLength(1);
    // The opening page's photo is the owners' shot, from "1.חתן".
    expect(tabOf(photos).get(opener.photoIds[0])).toBe("e1");
    // The event follows its tabs in their order.
    const tabs = tabOf(photos);
    const order = plan.spreads.slice(plan.bookSpreads + 1).flatMap((s) => s.photoIds.map((id) => tabs.get(id)));
    expect(order).toEqual([...order].sort());
    expect(plan.bookSpreads + plan.eventSpreads).toBe(plan.spreads.length);
    // The same number of photos in each part: about as many pages each.
    expect(Math.abs(plan.bookSpreads - (plan.eventSpreads - 1))).toBeLessThanOrEqual(1);
  });

  it("gives the book the pages the photographer set, and the event the rest", () => {
    const photos = gallery();
    const parts = combinedParts(photos, "other")!;
    const plan = planCombined(photos, [], [], parts, { style: "clean", targetSpreads: 12, bookSpreads: 3 });
    expect(plan.bookSpreads).toBe(3);
    expect(plan.spreads.length).toBeLessThanOrEqual(11);
    expect(plan.eventSpreads).toBe(plan.spreads.length - 3);
    expectEveryPhotoOnce(plan, photos);
  });

  it("with no pages typed keeps each part's natural pages within 30", () => {
    const photos = gallery();
    const plan = planCombined(photos, [], [], combinedParts(photos, "other")!, { style: "clean", targetSpreads: null });
    expect(plan.spreads.length).toBeLessThanOrEqual(29);
    expectEveryPhotoOnce(plan, photos);
    const big = [...inTab("b", 1, 200, BOOK, { key: "b1", name: "1.חוף", order: 1 }), ...inTab("e", 1, 150, EVENT, { key: "e1", name: "1.חתן", order: 5 })];
    const full = planCombined(big, [], [], combinedParts(big, "other")!, { style: "clean", targetSpreads: null });
    expect(full.spreads.length).toBeLessThanOrEqual(29);
    expectEveryPhotoOnce(full, big);
  });

  it("covers the album with the book's closest portrait", () => {
    const photos = gallery().map((p) => (p.id === "b18" ? { ...p, faceArea: 0.2 } : p.id === "b17" ? { ...p, faceArea: 0.05 } : p));
    expect(planCombined(photos, [], [], combinedParts(photos, "other")!, CLEAN).coverPhotoId).toBe("b18");
    // Faces unknown: the book's first portrait.
    expect(planCombined(gallery(), [], [], combinedParts(gallery(), "other")!, CLEAN).coverPhotoId).toBe("b17");
  });

  it("writes both events and the date under the name on the cover", () => {
    const parts = combinedParts(gallery(), "other")!;
    expect(combinedCoverLines("רומי - בוק בת מצווה", parts, "2026-10-05")).toEqual({ main: "רומי", sub: "בוק בת מצווה ועלייה לתורה | 5.10.2026" });
    expect(combinedCoverLines("ניסוי בדיקה", parts, null)).toEqual({ main: "ניסוי בדיקה", sub: "בוק בת מצווה ועלייה לתורה" });
  });

  it("shares the pages by the photo counts, at least one each", () => {
    expect(combinedBookShare(18, 19, 18)).toBe(9);
    expect(combinedBookShare(18, 100, 1)).toBe(17);
    expect(combinedBookShare(18, 1, 100)).toBe(1);
    expect(combinedBookShare(2, 10, 10)).toBe(1);
  });
});
