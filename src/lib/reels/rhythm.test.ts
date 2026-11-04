import { describe, expect, it } from "vitest";
import { MIN_BEAT_SHOT, MIN_SEGMENT, gridDurations, rhythmFactors, shotClasses, transitionSequence, variedBeats, withFloor } from "@/lib/reels/rhythm";
import { lengthFor, recommendedPhotos, reelTimeline, transitionAfter, transitionPool } from "@/lib/reels/render";
import { REEL_TEMPLATES, defaultLineStyles, templateById, transitionInfo, type ReelSettings, type ReelTransition } from "@/lib/reels/templates";

function settings(patch: Partial<ReelSettings> = {}): ReelSettings {
  return {
    platform: "ig-reel",
    templateId: "soft",
    length: 15,
    fit: "blur",
    blur: 60,
    music: { source: "none", trackId: "celebration", volume: 0.8, offset: 0 },
    transitions: [],
    seed: 1,
    rhythm: 1,
    fx: null,
    text: { title: "דנה ואורי", subtitle: "", ending: "סטודיו", position: "bottom", show: true, styles: defaultLineStyles(REEL_TEMPLATES[0]) },
    ...patch,
  };
}

const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const noTriple = (xs: (number | string)[], eq = (a: number | string, b: number | string) => a === b) =>
  xs.every((x, i) => i < 2 || !(eq(x, xs[i - 1]) && eq(xs[i - 1], xs[i - 2])));
const sameDur = (a: number | string, b: number | string) => Math.abs(Number(a) - Number(b)) < 0.02;

describe("shotClasses", () => {
  it("holds the first and the last photo, mixes the three kinds, and never three of a kind in a row", () => {
    for (const seed of [1, 2, 7, 99, 1234]) {
      for (const n of [3, 5, 8, 10, 13, 20, 30]) {
        const cls = shotClasses(n, seed);
        expect(cls).toHaveLength(n);
        expect(cls[0]).toBe("long");
        expect(cls[n - 1]).toBe("long");
        expect(noTriple(cls), `${seed}/${n}: ${cls.join(",")}`).toBe(true);
        if (n >= 7) for (const c of ["short", "medium", "long"]) expect(cls).toContain(c);
      }
    }
  });

  it("is the same for the same seed and changes with the seed", () => {
    expect(shotClasses(12, 5)).toEqual(shotClasses(12, 5));
    const seeds = [1, 2, 3, 4, 5].map((s) => shotClasses(12, s).join(","));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("averages the factors to 1", () => {
    expect(close(sum(rhythmFactors(10, 3)) / 10, 1)).toBe(true);
  });
});

describe("withFloor and gridDurations", () => {
  it("raises short shares to the floor from the longer ones, keeping the total", () => {
    const out = withFloor([0.3, 2, 0.4, 3], 0.5);
    expect(close(sum(out), 5.7)).toBe(true);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(out[3]).toBeGreaterThan(out[1]);
  });

  it("puts every inner cut on the grid and keeps the end", () => {
    const durs = gridDurations([0.6, 1.3, 2.4, 0.7, 2.0], 0.5, 0.1);
    expect(close(sum(durs), 7)).toBe(true);
    let acc = 0;
    for (let i = 0; i < durs.length - 1; i++) {
      acc += durs[i];
      const k = (acc - 0.1) / 0.5;
      expect(close(k, Math.round(k), 1e-6)).toBe(true);
    }
    for (const d of durs) expect(d).toBeGreaterThanOrEqual(MIN_BEAT_SHOT);
  });

  it("varies a beat pattern: first and last held, never the same count three times running", () => {
    const b = variedBeats(14, [1, 1, 1, 1, 1, 1, 2]);
    expect(b[0]).toBe(2);
    expect(b[13]).toBe(2);
    expect(noTriple(b)).toBe(true);
  });
});

describe("reelTimeline: varied automatic times (owner, 2026-11-04)", () => {
  it("10 photos in 15 seconds without music: short, medium and long shots that fill the reel exactly", () => {
    const s = settings();
    const tl = reelTimeline(10, templateById("soft"), s);
    expect(tl.segments).toBe(10);
    expect(close(sum(tl.durs) + tl.tail, 15)).toBe(true);
    expect(Math.min(...tl.durs)).toBeGreaterThanOrEqual(MIN_SEGMENT - 1e-9);
    expect(Math.max(...tl.durs) / Math.min(...tl.durs)).toBeGreaterThan(2.5);
    expect(tl.durs[0]).toBeGreaterThan(sum(tl.durs) / 10);
    expect(tl.durs[9]).toBeGreaterThan(sum(tl.durs) / 10);
    expect(noTriple(tl.durs, sameDur)).toBe(true);
  });

  it("the fast template too", () => {
    const tl = reelTimeline(12, templateById("beat"), settings({ templateId: "beat", length: 10 }));
    expect(close(sum(tl.durs) + tl.tail, 10)).toBe(true);
    expect(new Set(tl.durs.map((d) => d.toFixed(2))).size).toBeGreaterThan(3);
    expect(noTriple(tl.durs, sameDur)).toBe(true);
  });

  it("never gives every photo the shortest time: past ~0.7s a photo, the rest are left out", () => {
    const tl = reelTimeline(30, templateById("soft"), settings({ length: 10 }));
    expect(tl.dropped).toBeGreaterThan(0);
    expect(Math.min(...tl.durs)).toBeGreaterThanOrEqual(MIN_SEGMENT - 1e-9);
    expect(tl.durs.filter((d) => d < 0.55).length).toBeLessThan(tl.durs.length);
    expect(close(sum(tl.durs) + tl.tail, 10)).toBe(true);
  });

  it("with a library song every cut is on the beat grid, and the photos still differ in beats", () => {
    const tl = reelTimeline(10, templateById("soft"), settings({ music: { source: "library", trackId: "celebration", volume: 0.8, offset: 0 } }), null, { bpm: 118, phase: 0 });
    expect(close(sum(tl.durs) + tl.tail, 15)).toBe(true);
    const beat = 60 / 118;
    expect(tl.unit).toBeTruthy();
    expect(close(beat / tl.unit!, Math.round(beat / tl.unit!), 1e-9)).toBe(true);
    for (let i = 1; i < tl.starts.length; i++) {
      const k = tl.starts[i] / tl.unit!;
      expect(close(k, Math.round(k), 1e-6)).toBe(true);
    }
    expect(new Set(tl.durs.slice(0, -1).map((d) => Math.round(d / tl.unit!))).size).toBeGreaterThan(2);
    for (const d of tl.durs) expect(d).toBeGreaterThanOrEqual(MIN_BEAT_SHOT - 1e-9);
  });

  it("with an uploaded song that doesn't start on a beat, the cuts follow its phase", () => {
    const tl = reelTimeline(8, templateById("beat"), settings({ templateId: "beat" }), null, { bpm: 100, phase: 0.2 });
    for (let i = 1; i < tl.starts.length; i++) {
      const k = (tl.starts[i] - 0.2) / tl.unit!;
      expect(close(k, Math.round(k), 1e-6)).toBe(true);
    }
  });

  it("a beat template cuts on whole beats, with varied counts", () => {
    const tpl = templateById("beat-strobe");
    const tl = reelTimeline(14, tpl, settings({ templateId: tpl.id, length: 15 }), null, { bpm: 124, phase: 0 });
    const beat = 60 / 124;
    const counts = tl.durs.map((d) => d / beat);
    for (const c of counts) expect(close(c, Math.round(c), 1e-6)).toBe(true);
    expect(new Set(counts.map(Math.round)).size).toBeGreaterThan(1);
    expect(noTriple(counts.map(Math.round))).toBe(true);
  });

  it("keeps the times the photographer set", () => {
    const s = settings({ length: 10 });
    const tl = reelTimeline(4, templateById("soft"), s);
    const avail = 10 - tl.tail;
    const custom = [avail - 3, 1, 1, 1];
    expect(reelTimeline(4, templateById("soft"), s, custom).durs).toEqual(custom);
  });

  it("a new rhythm seed gives other times, the same seed the same ones", () => {
    const a = reelTimeline(10, templateById("soft"), settings({ rhythm: 1 })).durs;
    expect(reelTimeline(10, templateById("soft"), settings({ rhythm: 1 })).durs).toEqual(a);
    expect(reelTimeline(10, templateById("soft"), settings({ rhythm: 2 })).durs).not.toEqual(a);
  });
});

describe("recommended photo count", () => {
  it("about 1.2 seconds a photo without music (after the ending text)", () => {
    const s = settings();
    expect(recommendedPhotos(15, templateById("soft"), s)).toBe(11);
    expect(reelTimeline(5, templateById("soft"), s).recommended).toBe(11);
    expect(recommendedPhotos(15, templateById("soft"), settings({ text: { ...s.text, ending: "" } }))).toBe(12);
  });

  it("about two beats a photo with music, never under a second", () => {
    expect(recommendedPhotos(15, templateById("soft"), settings(), { bpm: 72, phase: 0 })).toBe(7);
    expect(recommendedPhotos(15, templateById("soft"), settings(), { bpm: 124, phase: 0 })).toBe(13);
  });

  it("a beat template counts its own pattern; a split reel two photos a segment", () => {
    expect(recommendedPhotos(15, templateById("beat-cinema"), settings({ templateId: "beat-cinema" }), { bpm: 80, phase: 0 })).toBe(5);
    expect(recommendedPhotos(15, templateById("split"), settings({ templateId: "split" }))).toBe(22);
  });

  it("a video clip counts its own length", () => {
    expect(recommendedPhotos(15, templateById("soft"), settings(), null, [6])).toBe(7);
  });

  it("no fixed length: no recommendation", () => {
    expect(reelTimeline(5, templateById("soft"), settings({ length: null })).recommended).toBeNull();
  });

  it("suggests the shortest length that takes the photos", () => {
    expect(lengthFor(20, templateById("soft"), settings())).toBe(30);
    expect(lengthFor(5, templateById("soft"), settings())).toBe(10);
    expect(lengthFor(200, templateById("soft"), settings())).toBeNull();
  });
});

describe("transitions: the categories take turns", () => {
  const cat = (id: ReelTransition) => transitionInfo(id).category;

  it("never two in a row from the same category, and every category before one repeats", () => {
    for (const tpl of REEL_TEMPLATES) {
      const cats = new Set(tpl.transitions.map(cat));
      if (cats.size < 2) continue;
      for (const seed of [1, 5, 42]) {
        const seq = transitionSequence(tpl.transitions, seed, 40);
        for (let i = 1; i < seq.length; i++) expect(cat(seq[i]), `${tpl.id} ${seed} @${i}`).not.toBe(cat(seq[i - 1]));
        expect(new Set(seq.slice(0, cats.size).map(cat)).size).toBe(cats.size);
        for (const t of tpl.transitions) expect(seq).toContain(t);
      }
    }
  });

  it("follows the photographer's own mix", () => {
    const mine: ReelTransition[] = ["fade", "flash", "glitch", "cube"];
    const pool = transitionPool(templateById("soft"), settings({ transitions: mine }));
    expect(pool).toEqual(mine);
    const seq = Array.from({ length: 12 }, (_, k) => transitionAfter(k, pool, 3));
    for (const t of seq) expect(mine).toContain(t);
    expect(new Set(seq.slice(0, 4))).toEqual(new Set(mine));
  });

  it("is the same on every call (preview and file), and a single-category mix never repeats back to back", () => {
    const pool = templateById("cinema").transitions;
    const a = Array.from({ length: 20 }, (_, k) => transitionAfter(k, pool, 9));
    const b = transitionSequence(pool, 9, 20);
    expect(a).toEqual(b);
    const one: ReelTransition[] = ["fade", "slide", "push", "zoom"];
    const seq = transitionSequence(one, 4, 30);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
});
