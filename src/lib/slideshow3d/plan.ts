// The plan of a 3D slideshow (admin only for now, see access.ts): the photos in a random order
// (owner, 2026-11-02: "תצטרך לגרום לתמונות להופיע בסדר רנדומלי"), a 3D transition into every photo,
// never the same one twice in a row, and the slow 3D drift of each photo while it's on.
//
// Everything comes from one seed, picked once when the slideshow opens, so the screen and the video
// made from it show exactly the same thing.

export const SHOW_SLIDE_SECONDS = 3;
export const SHOW_TRANSITION_SECONDS = 1.2;
// A photo is on screen from the start of its transition in until its transition out ends.
export const SHOW_LIFE_SECONDS = SHOW_SLIDE_SECONDS + SHOW_TRANSITION_SECONDS;

export const TRANSITIONS = [
  "cube",
  "cube-vertical",
  "flip",
  "flip-vertical",
  "door",
  "doors",
  "page",
  "carousel",
  "coverflow",
  "zoom-through",
  "tiles",
  "blinds",
  "fall-away",
  "swing-in",
  "shatter",
] as const;
export type TransitionId = (typeof TRANSITIONS)[number];

// `dir` mirrors the effect (left or right, up or down); `seed` drives its own randomness (the
// shards of "shatter").
export type Transition = { id: TransitionId; dir: 1 | -1; seed: number };

// The 3D drift of a photo over its life: each pair is [start, end]. Angles in radians, `s` a scale,
// x/y shares of the canvas.
export type Drift = {
  rx: [number, number];
  ry: [number, number];
  rz: [number, number];
  s: [number, number];
  x: [number, number];
  y: [number, number];
};

export type ShowPlan = {
  // order[k] is the index (in the photos as given) of the k-th photo shown.
  order: number[];
  // transitions[k] brings photo k on (k ≥ 1). transitions[0] is the one back to the first photo
  // when the slideshow loops on the screen; the video opens with its own entrance instead.
  transitions: Transition[];
  drifts: Drift[];
};

// A small fast seeded generator (mulberry32): the same seed gives the same numbers everywhere.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newShowSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// Fisher–Yates.
export function shuffledOrder(count: number, random: () => number): number[] {
  const out = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

// Goes through all the effects in a random order before any repeats, so a slideshow of 15 photos
// shows 15 different ones. Never the same effect twice in a row, also around the loop (last → first).
export function pickTransitions(count: number, random: () => number): Transition[] {
  const out: Transition[] = [];
  let bag: TransitionId[] = [];
  const refill = () => {
    const order = shuffledOrder(TRANSITIONS.length, random);
    bag = order.map((i) => TRANSITIONS[i]);
  };
  for (let i = 0; i < count; i++) {
    const avoid = new Set<TransitionId>();
    if (i > 0) avoid.add(out[i - 1].id);
    if (i === count - 1 && count > 2) avoid.add(out[0].id);
    if (!bag.some((id) => !avoid.has(id))) refill();
    const at = bag.findIndex((id) => !avoid.has(id));
    const id = bag[at];
    bag.splice(at, 1);
    out.push({ id, dir: random() < 0.5 ? 1 : -1, seed: Math.floor(random() * 4294967296) >>> 0 });
  }
  return out;
}

const DEG = Math.PI / 180;

export function makeDrift(random: () => number): Drift {
  const sign = () => (random() < 0.5 ? 1 : -1);
  const ry = (4 + 3 * random()) * DEG * sign();
  const rx = (2 + 2 * random()) * DEG * sign();
  const rz = (0.5 + 0.8 * random()) * DEG * sign();
  const zoom = 0.07 + 0.04 * random();
  const zoomIn = random() < 0.6;
  const x = (0.012 + 0.012 * random()) * sign();
  const y = (0.008 + 0.01 * random()) * sign();
  return {
    rx: [rx, -rx],
    ry: [-ry, ry],
    rz: [-rz, rz],
    s: zoomIn ? [1, 1 + zoom] : [1 + zoom, 1],
    x: [-x, x],
    y: [-y, y],
  };
}

export function makeShowPlan(count: number, seed: number): ShowPlan {
  const random = seededRandom(seed);
  const order = shuffledOrder(count, random);
  const transitions = pickTransitions(count, random);
  const drifts = Array.from({ length: Math.max(0, count) }, () => makeDrift(random));
  return { order, transitions, drifts };
}

export type DriftPose = { rx: number; ry: number; rz: number; s: number; x: number; y: number };

// Where the drift is, `age` seconds after the photo started coming on: a steady glide, like Ken
// Burns, from start to end over the photo's whole life.
export function driftAt(d: Drift, age: number): DriftPose {
  const k = Math.min(1, Math.max(0, age / SHOW_LIFE_SECONDS));
  const at = (p: [number, number]) => p[0] + (p[1] - p[0]) * k;
  return { rx: at(d.rx), ry: at(d.ry), rz: at(d.rz), s: at(d.s), x: at(d.x), y: at(d.y) };
}

export type ShowMoment = {
  // The photo coming on (or on).
  index: number;
  age: number;
  // The photo going off during the transition (null when none: on, or the opening entrance).
  prev: number | null;
  prevAge: number;
  // 0–1 through the transition; 1 when it's over.
  progress: number;
};

// The video's timeline: every photo gets 3 seconds, and its transition in takes the first 1.2 of
// them (the first photo makes its entrance in the same time). So the length is 3s per photo.
export function showMomentAt(t: number, count: number): ShowMoment {
  if (count <= 0) return { index: 0, age: 0, prev: null, prevAge: 0, progress: 1 };
  const index = Math.min(count - 1, Math.max(0, Math.floor(t / SHOW_SLIDE_SECONDS)));
  const age = Math.max(0, t - index * SHOW_SLIDE_SECONDS);
  if (age < SHOW_TRANSITION_SECONDS) {
    return {
      index,
      age,
      prev: index > 0 ? index - 1 : null,
      prevAge: age + SHOW_SLIDE_SECONDS,
      progress: age / SHOW_TRANSITION_SECONDS,
    };
  }
  return { index, age, prev: null, prevAge: 0, progress: 1 };
}
