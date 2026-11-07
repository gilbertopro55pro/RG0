import { cameraFor, chain, planeQuad, rotateX, rotateY, rotateZ, scale, translate, type Affine3, type Camera } from "../slideshow3d/math3d";

// Picture in picture like ProShow's (owner, 2026-11-04: "תמונה בתוך תמונה - צריכה לעבוד כמו
// שבתוכנת proshow"). A segment is a slide with layers: the first photo is the background (on the
// whole screen, still moving), and one or two photos in a frame are layers over it. Each layer has
// its own keyframes inside the segment: it comes in from outside (from a side, from far away, from
// close to the camera, spinning, swinging on its top edge), keeps moving while it's on (a slow
// drift, turn or tilt, never standing still), and goes out before the segment ends, so even with a
// hard cut every layer has visibly come and gone. The second layer comes in a moment after the
// first. Every segment gets a different motion (a style), in an order that goes through all of
// them before one comes back.
//
// This file only plans: where each layer is at a moment, as a pure function of the time (tested
// without a canvas). scene.ts (drawPip) draws it, with the slideshow's 3D planes and shadow.

export type PipStyle = "slide" | "fly" | "carousel" | "drop" | "swing" | "spin" | "strip" | "pair";

// "pair": both photos of a picture-in-picture segment as prints over a blurred copy of the first
// (only with one inset, where it shows the same two photos).
export const PIP_STYLES: PipStyle[] = ["slide", "fly", "carousel", "drop", "swing", "spin", "strip", "pair"];

// A framed photo keeps its own shape between these (width / height); a photo beyond is cropped to
// them, so a panorama doesn't become a thin strip.
export const PIP_CARD_ASPECT: [number, number] = [0.62, 1.62];

// When the segment is on, in seconds from the moment it starts being drawn (the start of the
// transition into it). scene.ts gets it from the timeline (render.ts, segmentTiming).
export type SegTiming = {
  // How long the segment is drawn (to the end of the transition out of it, or of the reel).
  life: number;
  // The transition into it: the cut is at `lead`.
  lead: number;
  // Nothing of the layers is left after this (the cut out, or the ending text coming on).
  end: number;
  // The beat grid the cuts are on (seconds), and one point of it (life seconds); null: no music
  // tempo.
  grid: number | null;
  gridAt: number;
  // The reel's title is on screen during the segment: the layers stay clear of it.
  title: boolean;
};

// For drawing without a timeline (the transition thumbnails).
export const DEFAULT_TIMING: SegTiming = { life: 2.6, lead: 0, end: 2.6, grid: null, gridAt: 0, title: false };

// Where a layer is: its centre (canvas pixels from the canvas's middle, z away from the viewer, 0
// = the screen's plane), its turns (degrees), its scale and its opacity.
export type PipPose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; alpha: number };

export type PipTimes = { enter: number; land: number; exitStart: number; exitEnd: number };

export type PipCard = {
  // Which photo of the segment it shows (0 = the first).
  image: number;
  // At rest, its frame included (canvas pixels).
  w: number;
  h: number;
  // The white frame and the corner radius, in the same pixels.
  border: number;
  radius: number;
  reflection: boolean;
  times: PipTimes;
  pose: (u: number) => PipPose;
};

export type PipBox = { left: number; top: number; right: number; bottom: number };

export type PipPlan = {
  style: PipStyle;
  // "photo": the first photo, sharp; "blurred": a blurred copy of it (the pair style, where it's
  // also one of the prints).
  background: "photo" | "blurred";
  cards: PipCard[];
  // Where the layers rest (canvas pixels).
  stage: PipBox;
  // The title's band the layers stay out of, or null.
  band: { top: number; bottom: number } | null;
};

export type PipInput = {
  W: number;
  H: number;
  // The segment.
  k: number;
  // The reel's random seed (the "shuffle" of the transitions also gives other motions).
  seed: number;
  // The shape (width / height) of each photo of the segment, the background first.
  aspects: number[];
  // How many framed photos the template puts over the background (1 or 2).
  insets: number;
  timing: SegTiming;
  // Where the title is, when it's on during this segment.
  title: "top" | "center" | "bottom" | null;
};

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A repeatable random number in [0, 1) (the same one in the preview and the exported file).
function hash(...nums: number[]): number {
  let h = 0x9e3779b9;
  for (const x of nums) {
    h = Math.imul(h ^ (x | 0), 2246822519);
    h ^= h >>> 15;
    h = Math.imul(h, 3266489917);
    h ^= h >>> 13;
  }
  return (h >>> 0) / 4294967296;
}

type Ease = "linear" | "out" | "in" | "inOut" | "back";
const EASE: Record<Ease, (v: number) => number> = {
  linear: (v) => v,
  out: (v) => 1 - Math.pow(1 - v, 3),
  in: (v) => v * v * v,
  inOut: (v) => -(Math.cos(Math.PI * v) - 1) / 2,
  // A small overshoot past the rest place and back (a print landing on the table).
  back: (v) => {
    const s = 1.1;
    return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2);
  },
};

type Key = { t: number; pose: PipPose; ease: Ease };

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;

function poseAt(keys: Key[], u: number): PipPose {
  if (u <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (u <= b.t) {
      const a = keys[i - 1];
      const span = b.t - a.t;
      const e = span > 1e-6 ? EASE[b.ease](clamp((u - a.t) / span, 0, 1)) : 1;
      return {
        x: lerp(a.pose.x, b.pose.x, e),
        y: lerp(a.pose.y, b.pose.y, e),
        z: lerp(a.pose.z, b.pose.z, e),
        rx: lerp(a.pose.rx, b.pose.rx, e),
        ry: lerp(a.pose.ry, b.pose.ry, e),
        rz: lerp(a.pose.rz, b.pose.rz, e),
        s: lerp(a.pose.s, b.pose.s, e),
        alpha: clamp(lerp(a.pose.alpha, b.pose.alpha, e), 0, 1),
      };
    }
  }
  return keys[keys.length - 1].pose;
}

const P0: PipPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, alpha: 1 };
const pose = (p: Partial<PipPose>): PipPose => ({ ...P0, ...p });

// The layer's placement in 3D (math3d's coordinates: x right, y down, z away, from the middle).
export function poseTransform(p: PipPose): Affine3 {
  return chain(translate(p.x, p.y, p.z), rotateY(p.ry * DEG), rotateX(p.rx * DEG), rotateZ(p.rz * DEG), scale(p.s));
}

// The card's outline on the canvas at pose p (its four corners), for the tests and the fitting.
export function poseBox(cam: Camera, w: number, h: number, p: PipPose): PipBox {
  const q = planeQuad(cam, { T: poseTransform(p), w, h });
  const xs = [q.tl[0], q.tr[0], q.br[0], q.bl[0]];
  const ys = [q.tl[1], q.tr[1], q.br[1], q.bl[1]];
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

// The motion of the segment: the k-th of an order that goes through every style before one comes
// back (and never the same twice in a row across rounds), by the seed.
export function pipStyleAt(k: number, seed: number, insets: number): PipStyle {
  const pool = insets === 1 ? PIP_STYLES : PIP_STYLES.filter((s) => s !== "pair");
  const n = pool.length;
  const order = (round: number) => {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(hash(seed, round, i, 71) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const kk = Math.max(0, Math.floor(k));
  const round = Math.floor(kk / n);
  const cur = order(round);
  if (round > 0 && cur[0] === order(round - 1)[n - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return cur[kk % n];
}

// Where the layers may rest: inside the screen, away from the very top and bottom of a 9:16 reel
// (the apps' buttons and captions), and out of the title's band while it's on.
export function pipStage(W: number, H: number, title: PipInput["title"]): { stage: PipBox; band: PipPlan["band"] } {
  const tall = H / W > 1.5;
  let top = H * (tall ? 0.085 : 0.05);
  let bottom = H * (tall ? 0.84 : 0.95);
  let band: PipPlan["band"] = null;
  // The title's block (render.ts, drawReelFrame) with room for two lines.
  const half = H * 0.11;
  if (title === "bottom") {
    band = { top: H * 0.83 - half, bottom: H };
    bottom = Math.min(bottom, band.top - H * 0.015);
  } else if (title === "top") {
    band = { top: 0, bottom: H * 0.16 + half };
    top = Math.max(top, band.bottom + H * 0.015);
  } else if (title === "center") {
    band = { top: H * 0.5 - half, bottom: H * 0.5 + half };
    // The larger side of it.
    const above = band.top - H * 0.015 - top;
    const below = bottom - (band.bottom + H * 0.015);
    if (above >= below) bottom = band.top - H * 0.015;
    else top = band.bottom + H * 0.015;
  }
  return { stage: { left: W * 0.045, right: W * 0.955, top, bottom }, band };
}

// When each layer comes in, lands, starts going and is gone (life seconds). The first comes in
// during the transition into the segment, the second a moment later; they're gone by `end`. With
// the music's beat known, each one lands on a beat and goes out from a beat, the last one gone
// exactly on the cut.
export function pipTimes(timing: SegTiming, n: number): PipTimes[] {
  const end = Math.max(0.2, timing.end);
  const start0 = Math.min(timing.lead * 0.4, end * 0.3);
  const body = Math.max(0.1, end - start0);
  let E = clamp(0.3 * body, 0.38, 0.85);
  let X = clamp(0.22 * body, 0.3, 0.6);
  let D = n > 1 ? clamp(0.16 * body, 0.2, 0.5) : 0;
  let hold = 0.25;
  const need = E + D + hold + X + D * 0.5;
  if (need > body) {
    const f = body / need;
    E *= f;
    X *= f;
    D *= f;
    hold *= f;
  }
  const out: PipTimes[] = [];
  for (let i = 0; i < n; i++) {
    const enter = start0 + i * D;
    const exitEnd = end - (n - 1 - i) * D * 0.5;
    out.push({ enter, land: enter + E, exitStart: exitEnd - X, exitEnd });
  }
  const grid = timing.grid && timing.grid > 0.05 ? timing.grid : null;
  if (grid) {
    // On the beat: each layer lands on a beat (the second on a later one when there's time), goes
    // out from a beat when there's time for that (the first a beat before the second), and all are
    // gone exactly on the cut, which is on the grid. A layer the segment is too short for keeps the
    // times above.
    const g0 = timing.gridAt;
    const nextGrid = (x: number) => g0 + Math.ceil((x - g0) / grid - 1e-6) * grid;
    const prevGrid = (x: number) => g0 + Math.floor((x - g0) / grid + 1e-6) * grid;
    const minMove = 0.22;
    const minHold = 0.12;
    const exitLen = Math.max(minMove, Math.min(X, grid));
    const latestLand = end - minMove - minHold;
    let prevLand = -Infinity;
    let nextExit = Infinity;
    const lands: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      const earliest = out[i].enter + Math.max(minMove, 0.6 * E);
      let land = nextGrid(earliest);
      if (land <= prevLand + 1e-6) land = prevLand + grid;
      // No time for a later beat: the same one as the layer before (still on the beat).
      if (land > latestLand && prevLand >= earliest - 1e-6) land = prevLand;
      lands.push(land <= latestLand + 1e-6 ? land : null);
      if (lands[i] != null) prevLand = land;
    }
    for (let i = n - 1; i >= 0; i--) {
      const land = lands[i];
      if (land == null) continue;
      let exitStart = prevGrid(Math.min(end - exitLen, nextExit - grid + 1e-6));
      if (i === n - 1) exitStart = prevGrid(end - exitLen);
      if (exitStart < land + minHold - 1e-6) exitStart = Math.max(land + minHold, end - Math.max(minMove, Math.min(X, end - land - minHold)));
      nextExit = exitStart;
      out[i] = { enter: out[i].enter, land, exitStart, exitEnd: end };
    }
  }
  return out;
}

type Rest = { x: number; y: number; w: number; h: number };

type Build = {
  R: Rest;
  side: 1 | -1;
  t: PipTimes;
  quiet: boolean;
  W: number;
  H: number;
  P: number;
  r: number;
};

// A depth (z) with the x and y that keep the layer over the same place on the canvas (it grows or
// shrinks where it is, rather than sliding toward the middle).
const inPlace = (R: Rest, z: number, P: number) => ({ x: (R.x * (P + z)) / P, y: (R.y * (P + z)) / P, z });

function keys(b: Build, inP: PipPose, landP: PipPose, holdP: PipPose, outP: PipPose, landEase: Ease = "out", holdEase: Ease = "inOut"): (u: number) => PipPose {
  const k: Key[] = [
    { t: b.t.enter, pose: inP, ease: "linear" },
    { t: b.t.land, pose: landP, ease: landEase },
    { t: b.t.exitStart, pose: holdP, ease: holdEase },
    { t: b.t.exitEnd, pose: outP, ease: "in" },
  ];
  return (u) => poseAt(k, u);
}

const offX = (b: Build) => b.W / 2 + (b.R.w / 2 + b.R.h * 0.2) * 1.12 + b.W * 0.03;

const STYLE: Record<PipStyle, (b: Build) => (u: number) => PipPose> = {
  // Slides in from its side, turned a little, settles, drifts and goes out the other side.
  slide: (b) => {
    const { R, side: s, W, H } = b;
    const dy = b.quiet ? 0 : s * 0.03 * H;
    return keys(
      b,
      pose({ x: s * offX(b), y: R.y + dy, rz: s * 9 }),
      pose({ x: R.x + s * 0.02 * W, y: R.y, rz: s * 2.5 }),
      pose({ x: R.x - s * 0.02 * W, y: R.y, rz: -s * 1, s: 1.035 }),
      pose({ x: -s * offX(b), y: R.y - dy, rz: -s * 8 }),
      "back",
    );
  },
  // Out of the distance where it rests, slowly closer, then through the camera (or back into the
  // distance, while the title is on).
  fly: (b) => {
    const { R, side: s, P } = b;
    return keys(
      b,
      pose({ ...inPlace(R, 2.4 * P, P), rz: s * 12, ry: -s * 28, alpha: 0 }),
      pose({ x: R.x, y: R.y, rz: s * 2, ry: s * 5 }),
      pose({ ...inPlace(R, -0.06 * P, P), rz: -s * 1, ry: -s * 5 }),
      b.quiet ? pose({ ...inPlace(R, 1.8 * P, P), rz: s * 8, alpha: 0 }) : pose({ ...inPlace(R, -0.5 * P, P), rz: -s * 4, alpha: 0 }),
    );
  },
  // Turns in from the side like a door, keeps turning through facing the viewer, turns out.
  carousel: (b) => {
    const { R, side: s, W, P } = b;
    // Deeper, at the height that shows it where it rests (not drawn in toward the middle).
    const y = inPlace(R, 0.3 * P, P).y;
    return keys(
      b,
      pose({ x: s * 0.62 * W, y, z: 0.3 * P, ry: s * 72, alpha: 0 }),
      pose({ x: R.x, y: R.y, ry: s * 24 }),
      pose({ x: R.x - s * 0.02 * W, y: R.y, ry: -s * 14, s: 1.02 }),
      pose({ x: -s * 0.62 * W, y, z: 0.3 * P, ry: -s * 72, alpha: 0 }),
    );
  },
  // Dropped from near the camera onto the table, a little bounce, then pushed off to its side.
  drop: (b) => {
    const { R, side: s, W, H, P, r } = b;
    const turn = s * (3 + 3 * r);
    return keys(
      b,
      pose({ ...inPlace(R, (b.quiet ? -0.12 : -0.42) * P, P), rz: s * (16 + 8 * r), alpha: 0 }),
      pose({ x: R.x, y: R.y, rz: turn }),
      pose({ x: R.x + s * 0.012 * W, y: R.y, rz: turn - s * 1.5, s: 1.02 }),
      pose({ x: s * offX(b), y: R.y + (b.quiet ? 0 : 0.05 * H), rz: s * 14 }),
      "back",
    );
  },
  // Hangs from its top edge and swings, the swing dying down but never quite still; comes down
  // from above the screen and goes back up (in place, fading, while the title is on).
  swing: (b) => {
    const { R, side: s, H, t } = b;
    const px = R.x;
    const py = R.y - R.h / 2;
    // High enough that even its turned corners are above the screen.
    const above = -H / 2 - (R.h + R.w * 0.5) * 1.05 - H * 0.05;
    const period = 1.5;
    return (u) => {
      const since = Math.max(0, u - t.enter);
      const amp = 24 * Math.exp(-since / 0.75) + 2.2;
      const theta = s * amp * Math.cos((2 * Math.PI * since) / period);
      let pivotY = py;
      let alpha = 1;
      let sc = 1;
      if (u < t.land) {
        const e = EASE.out(clamp((u - t.enter) / Math.max(0.01, t.land - t.enter), 0, 1));
        if (b.quiet) {
          alpha = e;
          sc = 0.8 + 0.2 * e;
        } else pivotY = lerp(above, py, e);
      } else if (u > t.exitStart) {
        const e = EASE.in(clamp((u - t.exitStart) / Math.max(0.01, t.exitEnd - t.exitStart), 0, 1));
        if (b.quiet) {
          alpha = 1 - e;
          sc = 1 - 0.2 * e;
        } else pivotY = lerp(py, above, e);
      }
      if (u <= t.enter) alpha = b.quiet ? 0 : 1;
      const a = theta * DEG;
      const hh = (R.h / 2) * sc;
      return pose({ x: px - Math.sin(a) * hh, y: pivotY + Math.cos(a) * hh, rz: theta, s: sc, alpha });
    };
  },
  // Spins in from small, settles, spins out to nothing.
  spin: (b) => {
    const { R, side: s } = b;
    return keys(
      b,
      pose({ x: R.x, y: R.y, rz: -s * 380, s: 0.12, alpha: 0 }),
      pose({ x: R.x, y: R.y, rz: s * 3 }),
      pose({ x: R.x, y: R.y, rz: -s * 1.5, s: 1.04 }),
      pose({ x: R.x, y: R.y, rz: s * 220, s: 0.08, alpha: 0 }),
    );
  },
  // Passes across the screen like a frame of a film strip, turned in depth, slowing in the middle.
  strip: (b) => {
    const { R, side: s, W, P } = b;
    const y = inPlace(R, 0.1 * P, P).y;
    return keys(
      b,
      pose({ x: s * offX(b), y, z: 0.1 * P, ry: -s * 16 }),
      pose({ x: R.x + s * 0.09 * W, y: R.y, ry: -s * 8 }),
      pose({ x: R.x - s * 0.09 * W, y: R.y, ry: s * 8 }),
      pose({ x: -s * offX(b), y, z: 0.1 * P, ry: s * 16 }),
      "out",
      "linear",
    );
  },
  // Two prints come in from opposite sides, tilted back a little, settle and drift, and go out.
  pair: (b) => {
    const { R, side: s, W, H } = b;
    const dy = b.quiet ? 0 : -s * 0.02 * H;
    return keys(
      b,
      pose({ x: s * offX(b), y: R.y + dy, rx: 14, rz: s * 7 }),
      pose({ x: R.x, y: R.y, rx: 3, rz: s * 2.5 }),
      pose({ x: R.x - s * 0.015 * W, y: R.y, rx: -2, rz: s * 0.5, s: 1.03 }),
      pose({ x: -s * offX(b), y: R.y - dy, rx: -10, rz: -s * 6 }),
      "back",
    );
  },
};

// The card's size for a photo of shape `aspect`, at most maxW × maxH, frame included.
function cardSize(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
  const a = clamp(aspect > 0 ? aspect : 1.5, PIP_CARD_ASPECT[0], PIP_CARD_ASPECT[1]);
  const w = Math.min(maxW, maxH * a);
  return { w, h: w / a };
}

// The rest places of the layers in the stage, for this segment.
function restPlaces(style: PipStyle, stage: PipBox, W: number, H: number, aspects: number[], k: number, side: 1 | -1): Rest[] {
  const sw = stage.right - stage.left;
  const sh = stage.bottom - stage.top;
  const cx = (stage.left + stage.right) / 2 - W / 2;
  const cy = (stage.top + stage.bottom) / 2 - H / 2;
  const n = aspects.length;
  // A short stage (the title in the middle) takes the cards higher in it, so they stay big.
  const short = sh < H * 0.4;
  if (n === 1) {
    const a = aspects[0];
    const { w, h } = cardSize(a, sw * (a >= 1 ? 0.8 : 0.64), sh * (short ? 0.8 : 0.62));
    const ox = style === "spin" || style === "fly" ? 0 : side * sw * 0.05;
    return [{ x: cx + ox, y: cy + ((((k % 3) + 3) % 3) - 1) * sh * 0.06, w, h }];
  }
  if (style === "drop") {
    // A small stack: overlapping, the second on top.
    return aspects.map((a, i) => {
      const { w, h } = cardSize(a, sw * (short ? 0.5 : 0.66), sh * (short ? 0.72 : 0.5));
      const d = i === 0 ? -1 : 1;
      return { x: cx + d * side * sw * (short ? 0.2 : 0.08), y: cy + d * sh * (short ? 0.06 : 0.11), w, h };
    });
  }
  if (sh / sw > 1.1) {
    // One above the other, a little to each side.
    return aspects.map((a, i) => {
      const { w, h } = cardSize(a, sw * 0.74, sh * 0.45);
      const d = i === 0 ? -1 : 1;
      return { x: cx + d * side * sw * 0.08, y: cy + d * sh * 0.25, w, h };
    });
  }
  // Side by side, a little above and below each other.
  return aspects.map((a, i) => {
    const { w, h } = cardSize(a, sw * 0.47, sh * (short ? 0.8 : 0.74));
    const d = i === 0 ? -1 : 1;
    return { x: cx + d * side * sw * 0.25, y: cy + d * sh * 0.05, w, h };
  });
}

const within = (b: PipBox, s: PipBox) => b.left >= s.left - 0.5 && b.right <= s.right + 0.5 && b.top >= s.top - 0.5 && b.bottom <= s.bottom + 0.5;

// The segment's plan: its style, the layers, and where each one is at every moment. Worked out
// once per segment and kept (every frame of the segment asks for the same one).
const plans = new Map<string, PipPlan>();
export function pipPlan(input: PipInput): PipPlan {
  const key = JSON.stringify(input);
  const hit = plans.get(key);
  if (hit) return hit;
  const plan = makePlan(input);
  if (plans.size > 160) plans.clear();
  plans.set(key, plan);
  return plan;
}

function makePlan(input: PipInput): PipPlan {
  const { W, H, k, seed, timing } = input;
  const insets = Math.max(1, Math.min(2, Math.round(input.insets)));
  const cam = cameraFor(W, H);
  const style = pipStyleAt(k, seed, insets);
  const { stage, band } = pipStage(W, H, input.title);
  const quiet = !!band;
  const pair = style === "pair";
  // The photos in frames: the insets, or (the pair) the first two photos.
  const images = pair ? [0, 1] : Array.from({ length: insets }, (_, i) => i + 1);
  const avail = images.filter((i) => i < input.aspects.length);
  const side: 1 | -1 = hash(seed, k, 3) < 0.5 ? 1 : -1;
  const times = pipTimes(timing, avail.length);
  const rests = restPlaces(style, stage, W, H, avail.map((i) => input.aspects[i]), k, side);
  const m = Math.max(1, Math.min(W, H) * 0.002);
  const inner = { left: stage.left + m, right: stage.right - m, top: stage.top + m, bottom: stage.bottom - m };
  const cards: PipCard[] = avail.map((image, i) => {
    // The second layer from the other side (on a stack, from the same).
    const s: 1 | -1 = style === "drop" ? side : i === 0 ? side : ((-side) as 1 | -1);
    const r = hash(seed, k, i, 11);
    const R = { ...rests[i] };
    const make = () => STYLE[style]({ R, side: s, t: times[i], quiet, W, H, P: cam.P, r });
    let fn = make();
    // Fitted: while it's at rest the whole card stays in the stage; while the title is on, no part
    // of it ever crosses the title's band. Moved in, or made smaller, until it does.
    for (let round = 0; round < 24; round++) {
      const t = times[i];
      let box: PipBox | null = null;
      for (let j = 0; j <= 16; j++) {
        const p = fn(t.land + ((t.exitStart - t.land) * j) / 16);
        const b = poseBox(cam, R.w, R.h, p);
        box = box ? { left: Math.min(box.left, b.left), right: Math.max(box.right, b.right), top: Math.min(box.top, b.top), bottom: Math.max(box.bottom, b.bottom) } : b;
      }
      // How far it reaches into the title's band (the deepest moment), above or below it.
      let into = 0;
      if (band) {
        const mid = (band.top + band.bottom) / 2;
        // With a little room, so no moment between the samples touches it.
        const pad = H * 0.006;
        for (let j = 0; j <= 48; j++) {
          const p = fn(t.enter + ((t.exitEnd - t.enter) * j) / 48);
          if (p.alpha <= 0.04) continue;
          const b = poseBox(cam, R.w, R.h, p);
          if (b.right <= 0 || b.left >= W || b.bottom <= 0 || b.top >= H) continue;
          if (b.bottom > band.top - pad && b.top < band.bottom + pad) {
            const fromAbove = (b.top + b.bottom) / 2 < mid;
            const d = fromAbove ? -(b.bottom - band.top + pad) : band.bottom + pad - b.top;
            if (Math.abs(d) > Math.abs(into)) into = d;
          }
        }
      }
      // A pixel or two inside, so no moment between the samples pokes out.
      if (box && within(box, inner) && !into) break;
      if (box) {
        const tooWide = box.right - box.left > stage.right - stage.left;
        const tooTall = box.bottom - box.top > stage.bottom - stage.top;
        if (tooWide || tooTall || into || round >= 8) {
          const f = round >= 16 ? 0.85 : 0.93;
          R.w *= f;
          R.h *= f;
        }
        if (box.left < inner.left) R.x += Math.min(inner.left - box.left, W * 0.2);
        else if (box.right > inner.right) R.x -= Math.min(box.right - inner.right, W * 0.2);
        if (box.top < inner.top) R.y += Math.min(inner.top - box.top, H * 0.2);
        else if (box.bottom > inner.bottom) R.y -= Math.min(box.bottom - inner.bottom, H * 0.2);
        // Away from the title, as far as the stage allows.
        else if (into) R.y += Math.max(-H * 0.2, Math.min(H * 0.2, into * 1.05));
      }
      fn = make();
    }
    const short = Math.min(R.w, R.h);
    const rounded = style === "fly" || style === "carousel" || style === "spin";
    return {
      image,
      w: R.w,
      h: R.h,
      border: Math.max(2, short * 0.03),
      radius: rounded ? short * 0.035 : 0,
      // A reflection under the layers that turn in depth, with room for it below and no title.
      reflection: !quiet && (style === "carousel" || style === "fly") && R.y + H / 2 + R.h * 0.95 < H,
      times: times[i],
      pose: fn,
    };
  });
  return { style, background: pair ? "blurred" : "photo", cards, stage, band };
}
