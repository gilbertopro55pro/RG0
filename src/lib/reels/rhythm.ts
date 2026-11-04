// The rhythm of a reel (owner, 2026-11-04): "a photo's time can't be 0.4 for every photo, it goes
// by very fast", and "the times should vary too, one photo half a second and another two and a
// half, for variety and interest". Pure functions, so the preview and the exported file cut at the
// same moments (render.ts builds the timeline from them).

import { transitionInfo, type ReelTransition } from "./templates";

/** The shortest a photo stays on screen (seconds). */
export const MIN_SEGMENT = 0.5;
/** A single beat may be a little shorter than that (one beat at up to ~133 BPM). */
export const MIN_BEAT_SHOT = 0.45;
/** The reel never packs photos tighter than this on average: past it, photos are left out. */
export const HARD_AVG = 0.7;
/** The average time per photo the recommended count is worked out from, without music. */
export const TARGET_AVG = 1.2;
/** With music: about two beats per photo, never under a second on average. */
export const TARGET_BEATS = 2;
export const TARGET_MUSIC_MIN = 1;

export function rand01(seed: number, i: number) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function shuffled<T>(items: T[], seed: number, salt: number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand01(seed + salt * 7919, i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type ShotClass = "short" | "medium" | "long";

// Relative lengths: with an average of ~1.25s that's ~0.6s, ~1.25s and ~2.3s.
export const SHOT_WEIGHT: Record<ShotClass, number> = { short: 0.5, medium: 1, long: 1.85 };
// Each run of five middle photos has two short shots, two medium and one long hold.
const DECK: ShotClass[] = ["short", "short", "medium", "medium", "long"];

/**
 * The kind of shot each photo is: the first and the last are long holds, the ones between come
 * from shuffled decks of short, medium and long (so every stretch of the reel has all three),
 * and never three of the same kind in a row.
 */
export function shotClasses(n: number, seed: number): ShotClass[] {
  if (n <= 0) return [];
  if (n <= 2) return Array.from({ length: n }, () => "long" as const);
  const m = n - 2;
  const middle: ShotClass[] = [];
  for (let d = 0; middle.length < m; d++) middle.push(...shuffled(DECK, seed, d + 1));
  const out: ShotClass[] = ["long", ...middle.slice(0, m), "long"];
  const triple = (i: number) => i >= 2 && out[i] === out[i - 1] && out[i - 1] === out[i - 2];
  for (let i = 2; i < n; i++) {
    if (!triple(i)) continue;
    // The last photo stays a long hold: change the one before it instead.
    const at = i === n - 1 ? i - 1 : i;
    const swapWith = out.findIndex((c, j) => j > at && j < n - 1 && c !== out[at]);
    if (swapWith > 0) [out[at], out[swapWith]] = [out[swapWith], out[at]];
    else out[at] = out[at] === "medium" ? "short" : "medium";
  }
  // A swap can leave a triple further back; one more pass settles it.
  for (let i = 2; i < n - 1; i++) if (triple(i)) out[i] = out[i] === "medium" ? "short" : "medium";
  return out;
}

/** Each photo's share of the time, averaging 1: the kind of shot, with a little variation of its own. */
export function rhythmFactors(n: number, seed: number): number[] {
  const raw = shotClasses(n, seed).map((c, i) => SHOT_WEIGHT[c] * (0.9 + 0.2 * rand01(seed ^ 0x2545f491, i)));
  const mean = raw.reduce((x, y) => x + y, 0) / Math.max(1, n);
  return raw.map((x) => x / mean);
}

/**
 * Raises every share under `floor` to it, taking the time back from the longer shares (in
 * proportion to how much each is over the floor), so the total stays the same and the longer
 * photos stay the longer ones. `locked` shares (video clips) are left alone.
 */
export function withFloor(durs: number[], floor: number, locked: boolean[] = []): number[] {
  const out = durs.slice();
  const low = out.map((d, i) => (!locked[i] && d < floor - 1e-9 ? i : -1)).filter((i) => i >= 0);
  if (!low.length) return out;
  const need = low.reduce((s, i) => s + (floor - out[i]), 0);
  const donors = out.map((d, i) => (!locked[i] && d > floor + 1e-9 ? i : -1)).filter((i) => i >= 0);
  const spare = donors.reduce((s, i) => s + (out[i] - floor), 0);
  if (spare + 1e-9 < need) {
    // Not enough time for everyone at the floor (the reel caps the photos so this doesn't happen):
    // the free photos share what there is equally.
    const free = out.map((_, i) => i).filter((i) => !locked[i]);
    const total = free.reduce((s, i) => s + out[i], 0);
    for (const i of free) out[i] = total / free.length;
    return out;
  }
  const take = need / spare;
  for (const i of donors) out[i] -= (out[i] - floor) * take;
  for (const i of low) out[i] = floor;
  return out;
}

/** The fewest grid steps a shot can have: at least MIN_BEAT_SHOT long. */
export function minUnits(unit: number) {
  return Math.max(1, Math.ceil(MIN_BEAT_SHOT / unit - 1e-6));
}

/**
 * The grid the automatic cuts are on: whole beats, halved while the average photo would get fewer
 * than two steps (down to a quarter beat), so the varied lengths survive the rounding.
 */
export function beatUnit(bpm: number | null, mean: number): number | null {
  if (!bpm) return null;
  const beat = 60 / bpm;
  let unit = beat;
  while (mean / unit < 2 && unit > beat / 4 + 1e-9) unit /= 2;
  return unit;
}

/**
 * Moves every cut between two shots onto the grid (phase + k·unit), keeping each shot at least
 * `minUnits` steps and the end where it was. Each photo gets a whole number of beats, so the
 * cuts land on the music while the photos keep their different lengths.
 */
export function gridDurations(durs: number[], unit: number | null, phase = 0): number[] {
  const n = durs.length;
  if (!unit || n <= 1) return durs.slice();
  const end = durs.reduce((x, y) => x + y, 0);
  const mu = minUnits(unit);
  const endG = Math.floor((end - phase) / unit + 1e-6);
  const out: number[] = [];
  let acc = 0;
  let prevCut = 0;
  let prevG: number | null = null;
  for (let i = 0; i < n - 1; i++) {
    acc += durs[i];
    const lo = prevG == null ? Math.ceil(mu - phase / unit - 1e-6) : prevG + mu;
    const hi = endG - (n - 1 - i) * mu;
    let cut: number;
    if (lo > hi) {
      cut = Math.max(prevCut, acc);
      prevG = Math.ceil((cut - phase) / unit - 1e-6);
    } else {
      const g = Math.max(lo, Math.min(hi, Math.round((acc - phase) / unit)));
      cut = phase + g * unit;
      prevG = g;
    }
    out.push(cut - prevCut);
    prevCut = cut;
  }
  out.push(end - prevCut);
  return out;
}

/**
 * A beat template's beats per photo: its pattern, with the first and the last photo held for the
 * pattern's longest count, and never the same count three times in a row.
 */
export function variedBeats(n: number, pattern: number[]): number[] {
  const longest = Math.max(1, ...pattern.map((b) => Math.round(b) || 1));
  const out = Array.from({ length: n }, (_, i) => Math.max(1, Math.round(pattern[i % pattern.length] || 1)));
  for (let i = 2; i < n; i++) if (out[i] === out[i - 1] && out[i - 1] === out[i - 2]) out[i] = out[i] === 1 ? 2 : Math.max(1, Math.floor(out[i] / 2));
  if (n >= 1) out[0] = Math.max(out[0], longest);
  if (n >= 2) out[n - 1] = Math.max(out[n - 1], longest);
  if (n >= 3 && out[n - 1] === out[n - 2] && out[n - 2] === out[n - 3]) out[n - 2] = out[n - 2] === 1 ? 2 : Math.max(1, Math.floor(out[n - 2] / 2));
  return out;
}

/**
 * Whole counts (beats per photo) with no count three times in a row: a beat moves to or from the
 * next photo, so the total stays the same and no photo goes under `min`.
 */
export function breakTriples(counts: number[], min: number): number[] {
  const c = counts.slice();
  const n = c.length;
  for (let i = 2; i < n; i++) {
    if (!(c[i] === c[i - 1] && c[i - 1] === c[i - 2])) continue;
    const j = i + 1 < n ? i + 1 : i - 1;
    if (c[i] > min) {
      c[i]--;
      c[j]++;
    } else if (c[j] > min) {
      c[i]++;
      c[j]--;
    }
  }
  return c;
}

/** The average time per photo the recommendation counts on, for the music the reel has. */
export function recommendedPerPhoto(beat: number | null, pattern: number[] | null): number {
  if (!beat) return TARGET_AVG;
  if (pattern?.length) return Math.max(TARGET_MUSIC_MIN, (pattern.reduce((x, y) => x + y, 0) / pattern.length) * beat);
  return Math.max(TARGET_MUSIC_MIN, TARGET_BEATS * beat);
}

/**
 * How many segments fit `avail` seconds at `perPhoto` each (a video clip counts its own length,
 * up to half the reel), at least one.
 */
export function recommendedSegments(avail: number, perPhoto: number, segVideo: (number | null)[] = []): number {
  let used = 0;
  let segs = 0;
  for (let i = 0; i < 400; i++) {
    const v = segVideo[i];
    const d = v != null ? Math.min(v, avail / 2) : perPhoto;
    if (segs >= 1 && used + d > avail + 1e-6) break;
    used += d;
    segs++;
  }
  return Math.max(1, segs);
}

/**
 * The order the transitions come in (owner, 2026-11-04: "vary between the transition categories so
 * the reel is interesting"): the mix is grouped by category, every round visits each category once
 * in a shuffled order, the next round never starts with the category the last one ended on, and
 * each category's own transitions take turns. So two transitions in a row are never from the same
 * category, and none repeats before the mix has been through all of its categories. A mix from a
 * single category picks at random, never the same transition twice in a row. By the seed, so it's
 * the same on every frame and in the file.
 */
export function transitionSequence(pool: ReelTransition[], seed: number, count: number): ReelTransition[] {
  const unique = Array.from(new Set(pool));
  if (unique.length <= 1) return Array.from({ length: count }, () => unique[0] ?? "fade");
  const groups = new Map<string, ReelTransition[]>();
  for (const id of unique) {
    const cat = transitionInfo(id).category;
    groups.set(cat, [...(groups.get(cat) ?? []), id]);
  }
  const out: ReelTransition[] = [];
  const cats = [...groups.keys()];
  if (cats.length === 1) {
    let prev = -1;
    for (let i = 0; i < count; i++) {
      let idx = Math.floor(rand01(seed, i) * unique.length);
      if (idx === prev) idx = (idx + 1) % unique.length;
      prev = idx;
      out.push(unique[idx]);
    }
    return out;
  }
  // Each category's transitions in a shuffled order, reshuffled every time they've all been used.
  const decks = new Map<string, { order: ReelTransition[]; pos: number; pass: number }>();
  const nextOf = (cat: string, ci: number) => {
    const members = groups.get(cat)!;
    let d = decks.get(cat);
    if (!d || d.pos >= d.order.length) {
      const pass = d ? d.pass + 1 : 0;
      let order = shuffled(members, seed, 1000 + ci * 97 + pass);
      // Don't start the new pass with the one the last pass ended on.
      if (d && order.length > 1 && order[0] === d.order[d.order.length - 1]) order = [...order.slice(1), order[0]];
      d = { order, pos: 0, pass };
      decks.set(cat, d);
    }
    return d.order[d.pos++];
  };
  let lastCat: string | null = null;
  for (let round = 0; out.length < count; round++) {
    const order = shuffled(cats, seed, round + 1);
    if (order[0] === lastCat) [order[0], order[1]] = [order[1], order[0]];
    for (const cat of order) {
      if (out.length >= count) break;
      out.push(nextOf(cat, cats.indexOf(cat)));
      lastCat = cat;
    }
  }
  return out;
}
