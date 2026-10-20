import { describe, expect, it } from "vitest";
import { cellLabel, countNames, detectEventKind, pageCap, planAlbum } from "@/lib/albumAuto/planner";
import type { AlbumPlan, AutoPhoto, AutoStyleId, CellPeople, PhotoFaces, PlanOptions, SectionKind } from "@/lib/albumAuto/types";

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

  it("labels the owners' cell by the event kind", () => {
    expect(cellLabel("owners", "wedding")).toBe("חתן וכלה");
    expect(cellLabel("owners", "bar_mitzvah")).toBe("חתן בר המצווה");
    expect(cellLabel("owners", "bat_mitzvah")).toBe("כלת בת המצווה");
    expect(cellLabel("owners", "birthday")).toBe("בעלי השמחה");
    expect(cellLabel("grandparents", "wedding")).toBe("סבא וסבתא");
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
