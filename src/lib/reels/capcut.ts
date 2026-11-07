import { clamp01, drawGrain, layer, rand } from "./scene";
import type { ReelTimeline } from "./render";

// Reels that look like CapCut templates (owner, 2026-11-04: "it works, but not what I meant: I want
// a reel that looks like CapCut's templates, with special effects, not something basic"). What
// makes those templates look made is not the cut itself but everything around it, so a "look"
// adds, on top of the photos and their cuts:
//   - a camera that moves on the music: a punch-in on every cut that overshoots and settles, a
//     snap of rotation, whip pans with motion blur into the strong cuts, a shake that decays, a
//     zoom that speeds up into the cut (a speed ramp), small bumps on the beats in between;
//   - a colour grade (teal and orange, warm film, cool, neon, pastel), glow, vignette;
//   - light over the picture: light leaks, a film burn over the cut, dust and scratches, a lens
//     flare, floating bokeh, scan lines;
//   - beats that split the picture into 2, 3 or 4 panels and merge back;
//   - black and white that pops into colour on the beat, pixel blocks and colour flashes;
//   - text that comes in word by word on the beat (pop, slam, blur in, tracking);
//   - an opening and an ending of its own.
// Everything is a pure function of the time (and the timeline), like the rest of the reel, so the
// live preview and the exported file are the same frames. No ctx.filter (Safari's canvas has
// none): blur is a shrink and scale back up, colour is compositing (multiply, screen, overlay,
// saturation), light is gradients.

type Clocked = Pick<ReelTimeline, "segments" | "starts" | "durs" | "total" | "tail" | "beat" | "phase">;

// ---------------------------------------------------------------------------------------------
// Easing

export const outCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const inCubic = (x: number) => Math.pow(clamp01(x), 3);
export const inOutCubic = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
export const inOutSine = (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;
export const outExpo = (x: number) => {
  const v = clamp01(x);
  return v >= 1 ? 1 : 1 - Math.pow(2, -10 * v);
};
export const inExpo = (x: number) => {
  const v = clamp01(x);
  return v <= 0 ? 0 : Math.pow(2, 10 * v - 10);
};
/** Overshoots past 1 and comes back (a "back" ease); `s` is how far. */
export function outBack(x: number, s = 1.70158) {
  const v = clamp01(x) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}
/** Springs past 1 a few times and settles. */
export function outElastic(x: number) {
  const v = clamp01(x);
  if (v === 0 || v === 1) return v;
  return Math.pow(2, -10 * v) * Math.sin((v * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}
/** A damped swing that starts at 1 and dies out: `freq` swings a second, `decay` how fast. */
export function settle(dt: number, freq = 2.2, decay = 7) {
  if (dt < 0) return 0;
  return Math.exp(-decay * dt) * Math.cos(2 * Math.PI * freq * dt);
}

// ---------------------------------------------------------------------------------------------
// Where we are against the cuts and the beat

export type CutClock = {
  t: number;
  /** The segment on screen. */
  k: number;
  /** Seconds since it came in (its cut). */
  dt: number;
  /** Seconds until the next cut (Infinity on the last segment). */
  toNext: number;
  /** The segment's length (the last one: up to the ending text). */
  len: number;
  /** dt / len, 0-1. */
  u: number;
  /** The cut that brought this segment in is a strong one (every `accentEvery`-th cut). */
  accent: boolean;
  /** The next cut is a strong one. */
  nextAccent: boolean;
  /** Seconds since the last beat that isn't a cut (Infinity without a known tempo). */
  beatDt: number;
  /** The music's beat (seconds), when known. */
  beat: number | null;
  /** Where the pictures end and the ending text begins. */
  end: number;
};

export function cutClock(t: number, tl: Clocked, accentEvery: number): CutClock {
  const end = tl.total - tl.tail;
  let k = 0;
  while (k < tl.segments - 1 && t >= tl.starts[k + 1]) k++;
  const start = tl.starts[k] ?? 0;
  const last = k === tl.segments - 1;
  const len = Math.max(0.01, last ? end - start : tl.durs[k]);
  const dt = t - start;
  const toNext = last ? Infinity : tl.starts[k + 1] - t;
  const strong = (i: number) => i >= 1 && i < tl.segments && accentEvery > 0 && i % accentEvery === 0;
  let beatDt = Infinity;
  if (tl.beat && t < end) {
    const n = Math.floor((t - tl.phase) / tl.beat + 1e-6);
    const bt = tl.phase + n * tl.beat;
    // A beat that is also a cut already has the cut's hit.
    if (n >= 1 && !tl.starts.some((s) => Math.abs(s - bt) < 0.06)) beatDt = t - bt;
  }
  return { t, k, dt, toNext, len, u: clamp01(dt / len), accent: strong(k), nextAccent: strong(k + 1), beatDt, beat: tl.beat, end };
}

// ---------------------------------------------------------------------------------------------
// The camera

export type CameraSpec = {
  /** What every cut does to the new photo: a punch-in that overshoots, a drop from close up, or an elastic bounce. */
  hit?: "punch" | "drop" | "bounce";
  /** On every cut, or only on the strong ones. */
  hitOn?: "all" | "accent";
  /** How much bigger the photo comes in (0.2 = 20%). */
  hitScale?: number;
  /** Seconds the hit takes to settle. */
  hitLen?: number;
  /** A snap of rotation on every cut (degrees, alternating sides), springing back. */
  rot?: number;
  /** Whip pans with motion blur: into every cut, or only the strong ones. */
  whip?: "all" | "accent";
  /** Seconds the whip takes each side of the cut. */
  whipLen?: number;
  /** A shake on the strong cuts (fraction of the short side). */
  shake?: number;
  /** A small zoom bump on the beats between cuts. */
  pulse?: number;
  /** A zoom that speeds up into the cut (a speed ramp). */
  ramp?: number;
  /** A slow push-in across each photo. */
  push?: number;
  /** A film gate's weave (fraction of the short side, 12 steps a second). */
  weave?: number;
  /** The resting zoom (a bounce dips below it). */
  base?: number;
};

export type IntroStyle = "zoom" | "burn" | "white" | "black" | "glitch";

export type Cam = {
  scale: number;
  /** Radians. */
  rot: number;
  /** A shift that must stay covered (fractions of W and H). */
  x: number;
  y: number;
  /** The whip's offset (fraction of W): the edges it uncovers are filled with a mirror image. */
  wx: number;
  /** Motion blur along the whip (fraction of W) and of the zoom (fraction of the scale). */
  smear: number;
  zoomSmear: number;
};

const DEG = Math.PI / 180;
// The time the "shutter" is open: how long a smear a fast move leaves.
const SHUTTER = 1 / 48;
// How far the whip throws the picture (fraction of W) at the cut.
const WHIP_THROW = 0.75;

/** The zoom that keeps a W×H frame turned by `rot` covering the whole W×H canvas. */
export function coverScale(W: number, H: number, rot: number) {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  return c + Math.max(H / W, W / H) * s;
}

const whipDir = (cut: number) => (cut % 2 === 0 ? 1 : -1);

function rawCamera(spec: CameraSpec, c: CutClock, intro: IntroStyle | undefined) {
  let s = spec.base ?? 1;
  let rot = 0;
  let x = 0;
  let y = 0;
  let wx = 0;
  const hitHere = c.k >= 1 && (spec.hitOn !== "accent" || c.accent);
  if (spec.hit && hitHere) {
    const q = c.dt / (spec.hitLen ?? 0.4);
    const a = spec.hitScale ?? 0.15;
    if (spec.hit === "punch") s += a * (1 - outBack(q, 1.4));
    else if (spec.hit === "drop") s += a * (1 - outExpo(q));
    else s += a * (1 - outElastic(q));
  }
  if (spec.rot && c.k >= 1) rot += (c.k % 2 ? 1 : -1) * spec.rot * settle(c.dt, 1.8, 6) * DEG;
  if (spec.ramp && c.toNext !== Infinity) s += spec.ramp * inExpo(c.u);
  if (spec.push) s += spec.push * inOutSine(c.u);
  if (spec.pulse && c.beatDt < 0.25) s += spec.pulse * Math.pow(1 - c.beatDt / 0.25, 2);
  if (spec.shake && c.accent) {
    const e = Math.exp(-c.dt * 8);
    x += spec.shake * e * Math.sin(c.dt * 62 + c.k);
    y += spec.shake * 0.8 * e * Math.cos(c.dt * 49 + c.k * 2);
    rot += (spec.shake / 0.03) * 0.7 * DEG * e * Math.sin(c.dt * 41);
  }
  if (spec.weave) {
    const b = Math.floor(c.t * 12);
    x += (rand(b, 1) - 0.5) * spec.weave;
    y += (rand(b, 2) - 0.5) * spec.weave * 0.7;
  }
  if (spec.whip) {
    const L = spec.whipLen ?? 0.16;
    const whips = (cut: number) => cut >= 1 && (spec.whip === "all" || (c.accent && cut === c.k) || (c.nextAccent && cut === c.k + 1));
    if (c.toNext < L && whips(c.k + 1)) {
      const v = clamp01(1 - c.toNext / L);
      wx = whipDir(c.k + 1) * WHIP_THROW * v * v * v;
    } else if (c.dt < L && whips(c.k)) {
      const v = clamp01(1 - c.dt / L);
      wx = -whipDir(c.k) * WHIP_THROW * v * v * v;
    }
  }
  if (intro === "zoom" && c.t < 0.6) s += 0.45 * (1 - outExpo(c.t / 0.6));
  return { s, rot, x, y, wx };
}

function shifted(c: CutClock, h: number): CutClock {
  return { ...c, t: c.t + h, dt: c.dt + h, toNext: c.toNext - h, u: clamp01((c.dt + h) / c.len), beatDt: c.beatDt + h };
}

/**
 * The camera at this moment. The motion blur comes from how fast the camera moves right now,
 * measured inside the same segment (a cut is a jump, not a move).
 */
export function cameraAt(spec: CameraSpec, c: CutClock, W: number, H: number, intro?: IntroStyle): Cam {
  const h = 1 / 240;
  const r = rawCamera(spec, c, intro);
  const a = rawCamera(spec, shifted(c, h), intro);
  const b = rawCamera(spec, shifted(c, -h), intro);
  const vx = (a.wx - b.wx) / (2 * h);
  const vs = (a.s - b.s) / (2 * h);
  const short = Math.min(W, H);
  const dx = (Math.abs(r.x) * short) / W;
  const dy = (Math.abs(r.y) * short) / H;
  const cover = coverScale(W, H, r.rot) * (1 + 2 * Math.max(dx, dy));
  const scale = Math.max(r.s, cover);
  return {
    scale,
    rot: r.rot,
    x: (r.x * short) / W,
    y: (r.y * short) / H,
    wx: r.wx,
    smear: Math.min(0.5, Math.abs(vx) * SHUTTER),
    zoomSmear: Math.min(0.25, (Math.abs(vs) * SHUTTER) / scale),
  };
}

/**
 * Draws the pictures (`draw`) through the camera. A still camera draws straight onto the canvas
 * (sharp); a whip or a fast zoom draws once into a layer and lays it down several times along the
 * move (the motion blur), with a mirror image filling whatever the whip uncovers.
 */
export function drawWithCamera(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, draw: (c: CanvasRenderingContext2D) => void) {
  const place = (c: CanvasRenderingContext2D) => {
    c.translate(W / 2 + cam.x * W, H / 2 + cam.y * H);
    if (cam.rot) c.rotate(cam.rot);
    c.scale(cam.scale, cam.scale);
    c.translate(-W / 2, -H / 2);
  };
  const smearPx = cam.smear * W;
  const moving = smearPx > 1.2 || cam.zoomSmear > 0.004 || Math.abs(cam.wx) * W > 0.5;
  if (!moving) {
    ctx.save();
    place(ctx);
    draw(ctx);
    ctx.restore();
    return;
  }
  const g = layer(60, W, H);
  g.save();
  place(g);
  draw(g);
  g.restore();
  const n = Math.max(1, Math.min(9, Math.ceil(Math.max(smearPx / Math.max(2, W * 0.012), (cam.zoomSmear * W) / Math.max(2, W * 0.01)))));
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1) - 0.5;
    // An equal share for every sample: each one over the average so far.
    ctx.globalAlpha = 1 / (i + 1);
    drawWrapped(ctx, g.canvas, W, H, cam.wx * W + smearPx * f, 1 + cam.zoomSmear * (f + 0.5));
  }
  ctx.restore();
}

function drawWrapped(ctx: CanvasRenderingContext2D, src: CanvasImageSource, W: number, H: number, ox: number, s: number) {
  ctx.save();
  ctx.translate(W / 2 + ox, H / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(src, 0, 0, W, H);
  if (ox > 0.5) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, W, H);
    ctx.restore();
  } else if (ox < -0.5) {
    ctx.save();
    ctx.translate(2 * W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, W, H);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Panels: on a beat the picture splits into strips, halves, four copies or three bands, then
// merges back into the whole frame. Rectangles are fractions of the frame (source → destination).

export type PanelVariant = "strips" | "halves" | "grid" | "triple";
type Box = [number, number, number, number];
export type PanelDraw = { s: Box; d: Box };

const FULL: PanelDraw[] = [{ s: [0, 0, 1, 1], d: [0, 0, 1, 1] }];

// The thin black line between panels, closing as they merge.
const panelGap = (q: number) => 0.014 * (1 - inOutCubic((q - 0.62) / 0.3));

export function panelDraws(variant: PanelVariant, q: number, salt = 0): PanelDraw[] {
  if (q >= 1 || q < 0) return FULL;
  const g = panelGap(q);
  if (variant === "strips" || variant === "halves") {
    const n = variant === "strips" ? 3 : 2;
    const flip = salt % 2 ? 1 : -1;
    const out: PanelDraw[] = [];
    for (let i = 0; i < n; i++) {
      const qi = clamp01((q - i * 0.1) / 0.5);
      const dir = (i % 2 === 0 ? 1 : -1) * flip;
      const dy = dir * (1 - outExpo(qi)) * (variant === "strips" ? 0.55 : 0.7);
      const x0 = i / n + (i > 0 ? g / 2 : 0);
      const x1 = (i + 1) / n - (i < n - 1 ? g / 2 : 0);
      out.push({ s: [x0, 0, x1 - x0, 1], d: [x0, dy, x1 - x0, 1] });
    }
    return out;
  }
  if (variant === "grid") {
    // Four copies of the whole frame (a little pop in), then a zoom into one of them.
    const j = ((salt % 4) + 4) % 4;
    const ax = j % 2;
    const ay = Math.floor(j / 2);
    const pop = 0.9 + 0.1 * outBack(q / 0.25, 2);
    const z = 1 + inOutCubic((q - 0.5) / 0.5);
    const out: PanelDraw[] = [];
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        let x = cx * 0.5 + g / 2;
        let y = cy * 0.5 + g / 2;
        let w = 0.5 - g;
        let h = 0.5 - g;
        if (q < 0.5) {
          x = 0.5 + pop * (x - 0.5);
          y = 0.5 + pop * (y - 0.5);
          w *= pop;
          h *= pop;
        } else {
          x = ax + z * (x - ax);
          y = ay + z * (y - ay);
          w *= z;
          h *= z;
        }
        out.push({ s: [0, 0, 1, 1], d: [x, y, w, h] });
      }
    }
    return out;
  }
  // Three bands of the middle of the frame stacked, the outer two sliding in, then the middle one
  // opening to the whole frame and pushing the others out.
  const e = inOutCubic((q - 0.45) / 0.55);
  const hm = 1 / 3 + (2 / 3) * e;
  const slide = 1 - outExpo(q / 0.3);
  const side = salt % 2 ? 1 : -1;
  const mid: PanelDraw = { s: [0, 0.5 - hm / 2, 1, hm], d: [0, 0.5 - hm / 2, 1, hm] };
  const ht = 1 / 3;
  const top: PanelDraw = { s: [0, 0.5 - ht / 2, 1, ht], d: [side * slide, 0.5 - hm / 2 - g - ht, 1, ht] };
  const bottom: PanelDraw = { s: [0, 0.5 - ht / 2, 1, ht], d: [-side * slide, 0.5 + hm / 2 + g, 1, ht] };
  return [top, mid, bottom];
}

/** The panels' progress on this cut (0-1), or null when this cut doesn't split. */
export function panelPhase(c: CutClock, every: number): number | null {
  if (c.k < 1 || every <= 0 || c.k % every !== 0) return null;
  const win = Math.min(0.62, c.len * 0.9);
  const q = c.dt / win;
  return q < 1 ? q : null;
}

function drawPanels(ctx: CanvasRenderingContext2D, W: number, H: number, draws: PanelDraw[]) {
  const snap = copyOf(ctx, W, H, 61);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  for (const p of draws) {
    const [sx, sy, sw, sh] = p.s;
    const [dx, dy, dw, dh] = p.d;
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
    ctx.drawImage(snap, sx * W, sy * H, sw * W, sh * H, dx * W, dy * H, dw * W, dh * H);
  }
  ctx.restore();
}

// A copy of what's on the canvas so far, in a reused layer.
function copyOf(ctx: CanvasRenderingContext2D, W: number, H: number, slot: number): HTMLCanvasElement {
  const g = layer(slot, W, H);
  g.drawImage(ctx.canvas, 0, 0, W, H);
  return g.canvas;
}

// ---------------------------------------------------------------------------------------------
// Colour

export type GradeSpec = {
  /** Screened over the picture: lifts the shadows toward this colour. */
  lift?: string;
  /** Multiplied over it: tints the highlights. */
  gain?: string;
  /** The picture laid over itself (contrast), 0-1; `soft` for a gentler curve. */
  contrast?: number;
  soft?: boolean;
  /** More (>0) or less (<0) colour, -1-1. */
  sat?: number;
};

export function applyGrade(ctx: CanvasRenderingContext2D, W: number, H: number, g: GradeSpec) {
  ctx.save();
  if (g.contrast) {
    const snap = copyOf(ctx, W, H, 62);
    ctx.globalCompositeOperation = g.soft ? "soft-light" : "overlay";
    ctx.globalAlpha = clamp01(g.contrast);
    ctx.drawImage(snap, 0, 0, W, H);
  }
  if (g.sat) {
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = clamp01(Math.abs(g.sat));
    ctx.fillStyle = g.sat > 0 ? "hsl(0,100%,50%)" : "#808080";
    ctx.fillRect(0, 0, W, H);
  }
  if (g.gain) {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1;
    ctx.fillStyle = g.gain;
    ctx.fillRect(0, 0, W, H);
  }
  if (g.lift) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 1;
    ctx.fillStyle = g.lift;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** Black and white for this much (0-1). */
export function desaturate(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  if (amount <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "saturation";
  ctx.globalAlpha = clamp01(amount);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Black and white that pops into colour on the beat: a photo held two beats or more starts grey
 * and its colour comes in on its next beat (or a little before its middle, with no known tempo).
 * Short shots stay in colour. 1 = grey, 0 = colour.
 */
export function bwPopAmount(c: CutClock): number {
  if (c.len < 0.8 || c.t >= c.end) return 0;
  const at = c.beat ? Math.min(c.beat, c.len * 0.5) : c.len * 0.45;
  if (c.dt < at) return 1;
  return 1 - outCubic((c.dt - at) / 0.08);
}

/** The moment of the pop, for the hit that comes with it: seconds since it, or null. */
function popDt(c: CutClock): number | null {
  if (c.len < 0.8) return null;
  const at = c.beat ? Math.min(c.beat, c.len * 0.5) : c.len * 0.45;
  return c.dt >= at ? c.dt - at : null;
}

// A small copy of what's on the canvas, made in two steps (a third, then the final size): one big
// step down samples only a few pixels, and grain or dust turn into blotches when it's blown up.
function smallCopy(ctx: CanvasRenderingContext2D, W: number, H: number, div: number, slotMid: number, slot: number): CanvasRenderingContext2D {
  const mw = Math.max(8, Math.round(W / 3));
  const mh = Math.max(8, Math.round(H / 3));
  const m = layer(slotMid, mw, mh);
  m.imageSmoothingEnabled = true;
  m.imageSmoothingQuality = "high";
  m.drawImage(ctx.canvas, 0, 0, mw, mh);
  const w = Math.max(8, Math.round(W / div));
  const h = Math.max(8, Math.round(H / div));
  const a = layer(slot, w, h);
  a.imageSmoothingEnabled = true;
  a.imageSmoothingQuality = "high";
  a.drawImage(m.canvas, 0, 0, w, h);
  return a;
}

/** Glow: the bright parts, softened and screened back over the picture. */
export function applyBloom(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  if (amount <= 0.01) return;
  const a = smallCopy(ctx, W, H, 10, 74, 63);
  const w = a.canvas.width;
  const h = a.canvas.height;
  // The copy multiplied by itself twice keeps only the highlights (x³).
  const b = layer(64, w, h);
  b.drawImage(a.canvas, 0, 0);
  b.globalCompositeOperation = "multiply";
  b.drawImage(a.canvas, 0, 0);
  b.drawImage(a.canvas, 0, 0);
  const w2 = Math.max(8, Math.round(W / 4));
  const h2 = Math.max(8, Math.round(H / 4));
  const c = layer(65, w2, h2);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(b.canvas, 0, 0, w2, h2);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = clamp01(amount);
  ctx.drawImage(c.canvas, 0, 0, W, H);
  // A wider, fainter halo.
  ctx.globalAlpha = clamp01(amount * 0.5);
  ctx.drawImage(c.canvas, -W * 0.04, -H * 0.04, W * 1.08, H * 1.08);
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number, v: number) {
  if (v <= 0) return;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / W);
  const r = W * 0.78;
  const g = ctx.createRadialGradient(0, 0, r * 0.42, 0, 0, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.65, `rgba(0,0,0,${v * 0.45})`);
  g.addColorStop(1, `rgba(0,0,0,${v})`);
  ctx.fillStyle = g;
  ctx.fillRect(-W, -W, 2 * W, 2 * W);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Light over the picture

export type LeakPalette = "warm" | "pastel" | "neon";
const PALETTES: Record<LeakPalette, [number, number, number][]> = {
  warm: [
    [255, 118, 38],
    [255, 186, 74],
    [255, 72, 46],
  ],
  pastel: [
    [255, 170, 205],
    [255, 214, 168],
    [182, 168, 255],
  ],
  neon: [
    [255, 40, 196],
    [36, 214, 255],
    [138, 58, 255],
  ],
};

// Fills only the part of the canvas a round gradient of radius r around (x, y) reaches.
function fillDisc(ctx: CanvasRenderingContext2D, W: number, H: number, x: number, y: number, r: number) {
  const x0 = Math.max(0, Math.floor(x - r));
  const y0 = Math.max(0, Math.floor(y - r));
  const x1 = Math.min(W, Math.ceil(x + r));
  const y1 = Math.min(H, Math.ceil(y + r));
  if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** Soft coloured light coming in from the edges, drifting, brighter on the hits (hit 0-1). */
export function drawLightLeaks(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, amount: number, palette: LeakPalette, hit: number, salt: number) {
  if (amount <= 0) return;
  const colors = PALETTES[palette];
  const big = Math.max(W, H);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    const side = rand(salt, i, 1) < 0.5 ? -0.12 : 1.12;
    const x = W * (side + 0.14 * Math.sin(t * (0.33 + 0.17 * i) + i * 2.1));
    const y = H * (0.12 + 0.76 * rand(salt, i, 2) + 0.1 * Math.sin(t * (0.25 + 0.11 * i) + i));
    const r = big * (0.42 + 0.22 * rand(salt, i, 3)) * (1 + 0.18 * hit);
    const breathe = 0.5 + 0.5 * Math.sin(t * (0.55 + 0.27 * i) + i * 1.7);
    const a = amount * (0.22 + 0.2 * breathe + 0.55 * hit);
    const c = colors[(i + Math.floor(rand(salt, 9) * 3)) % 3];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(0.45, rgba(c, a * 0.45));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    fillDisc(ctx, W, H, x, y, r);
  }
  ctx.restore();
}

/** A film burn over a cut: q 0-1 through it, brightest at 0.4 (where the cut is). */
export function drawFilmBurn(ctx: CanvasRenderingContext2D, W: number, H: number, q: number, salt: number) {
  if (q <= 0 || q >= 1) return;
  const env = q < 0.4 ? outCubic(q / 0.4) : 1 - inOutCubic((q - 0.4) / 0.6);
  if (env <= 0.01) return;
  const right = rand(salt, 1) < 0.5;
  const big = Math.max(W, H);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    const cy = H * (0.15 + 0.7 * rand(salt, i, 2));
    const cx = right ? W * (1.08 - 0.25 * rand(salt, i, 3)) : W * (-0.08 + 0.25 * rand(salt, i, 3));
    const r = big * (0.16 + 0.62 * outCubic(q * 1.35) * (0.6 + 0.4 * rand(salt, i, 4)));
    const a = env * 0.9;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,222,150,${a})`);
    g.addColorStop(0.2, `rgba(255,146,42,${a * 0.95})`);
    g.addColorStop(0.5, `rgba(214,52,8,${a * 0.75})`);
    g.addColorStop(0.8, `rgba(120,12,0,${a * 0.3})`);
    g.addColorStop(1, "rgba(80,0,0,0)");
    ctx.fillStyle = g;
    fillDisc(ctx, W, H, cx, cy, r);
  }
  // At its height the burn flares over the whole frame, hot orange, so the cut under it is lost.
  if (env > 0.5) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,150,70,${((env - 0.5) / 0.5) * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** The burn's progress around the current or the next cut (strong cuts only), or null. */
export function burnPhase(c: CutClock, every: number): { q: number; cut: number } | null {
  const before = 0.2;
  const after = 0.35;
  const on = (cut: number) => cut >= 1 && every > 0 && cut % every === 0;
  if (on(c.k) && c.dt <= after) return { q: (c.dt + before) / (before + after), cut: c.k };
  if (on(c.k + 1) && c.toNext <= before) return { q: (before - c.toNext) / (before + after), cut: c.k + 1 };
  return null;
}

/** Dust specks, a hair now and then, and a scratch or two, flickering 12 times a second. */
export function drawDust(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, amount: number) {
  if (amount <= 0) return;
  const b = Math.floor(t * 12);
  const short = Math.min(W, H);
  ctx.save();
  const n = Math.round(4 + 10 * amount * rand(b, 0));
  for (let i = 0; i < n; i++) {
    const x = rand(b, i, 1) * W;
    const y = rand(b, i, 2) * H;
    const r = short * (0.0012 + 0.0045 * Math.pow(rand(b, i, 3), 2));
    const dark = rand(b, i, 4) < 0.7;
    ctx.fillStyle = dark ? `rgba(22,16,10,${0.55 * amount})` : `rgba(255,250,236,${0.5 * amount})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rand(b, i, 5)), rand(b, i, 6) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  if (rand(b, 40) < 0.22) {
    // A hair.
    const x = rand(b, 41) * W;
    const y = rand(b, 42) * H;
    const len = short * (0.04 + 0.06 * rand(b, 43));
    ctx.strokeStyle = `rgba(20,14,8,${0.5 * amount})`;
    ctx.lineWidth = Math.max(1, short * 0.0015);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.4, y - len * 0.5, x + len * 0.6, y + len * 0.4, x + len, y - len * 0.1);
    ctx.stroke();
  }
  // Scratches stay a little longer than the specks and wander.
  const sb = Math.floor(t * 3);
  const scratches = rand(sb, 50) < 0.6 ? 1 + (rand(sb, 51) < 0.3 ? 1 : 0) : 0;
  for (let i = 0; i < scratches; i++) {
    const x = (rand(sb, 52, i) + 0.004 * Math.sin(t * 9 + i)) * W;
    ctx.fillStyle = `rgba(255,248,230,${(0.1 + 0.14 * rand(b, 53, i)) * amount})`;
    ctx.fillRect(x, 0, Math.max(1, short * 0.0012), H);
  }
  ctx.restore();
}

/** An anamorphic lens flare: a long thin streak, a hot core and a few ghosts across the frame. */
export function drawFlare(ctx: CanvasRenderingContext2D, W: number, H: number, x: number, y: number, a: number) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.03);
  const sr = W * 1.1;
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, sr);
  sg.addColorStop(0, `rgba(235,245,255,${a})`);
  sg.addColorStop(0.12, `rgba(120,170,255,${a * 0.6})`);
  sg.addColorStop(1, "rgba(60,110,255,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(-sr, -sr, 2 * sr, 2 * sr);
  ctx.restore();
  const cr = W * 0.16;
  const cg = ctx.createRadialGradient(x, y, 0, x, y, cr);
  cg.addColorStop(0, `rgba(255,252,240,${a})`);
  cg.addColorStop(0.3, `rgba(255,214,150,${a * 0.45})`);
  cg.addColorStop(1, "rgba(255,180,90,0)");
  ctx.fillStyle = cg;
  ctx.fillRect(x - cr, y - cr, 2 * cr, 2 * cr);
  // Ghosts on the line through the middle of the frame.
  const ghosts: [number, number, [number, number, number]][] = [
    [0.55, 0.035, [140, 255, 200]],
    [0.85, 0.07, [190, 140, 255]],
    [1.25, 0.05, [255, 170, 110]],
    [1.55, 0.11, [120, 190, 255]],
  ];
  for (const [f, rr, col] of ghosts) {
    const gx = x + (W / 2 - x) * 2 * f;
    const gy = y + (H / 2 - y) * 2 * f;
    const r = W * rr;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, rgba(col, a * 0.1));
    g.addColorStop(0.8, rgba(col, a * 0.16));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, 2 * r, 2 * r);
  }
  ctx.restore();
}

/** Out-of-focus lights floating up slowly, brighter at the rim like a real lens's. */
export function drawBokeh(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, amount: number, palette: LeakPalette, salt: number) {
  if (amount <= 0) return;
  const colors = PALETTES[palette];
  const short = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 16; i++) {
    const speed = 0.02 + 0.05 * rand(salt, i, 1);
    const yy = 1.15 - ((rand(salt, i, 2) + t * speed) % 1.3);
    const x = W * (rand(salt, i, 3) + 0.03 * Math.sin(t * (0.4 + rand(salt, i, 4)) + i));
    const y = H * yy;
    const r = short * (0.025 + 0.07 * rand(salt, i, 5));
    const tw = 0.7 + 0.3 * Math.sin(t * (1.1 + rand(salt, i, 6)) + i * 2);
    const a = amount * (0.12 + 0.22 * rand(salt, i, 7)) * tw;
    const c = colors[i % 3];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a * 0.55));
    g.addColorStop(0.82, rgba(c, a * 0.8));
    g.addColorStop(0.92, rgba(c, a));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const scanCache = new Map<number, HTMLCanvasElement>();
/** Faint scan lines (a monitor's, a VHS tape's). */
export function drawScanlines(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, amount: number) {
  if (amount <= 0) return;
  const step = Math.max(2, Math.round(H / 340));
  let tile = scanCache.get(step);
  if (!tile) {
    tile = document.createElement("canvas");
    tile.width = 4;
    tile.height = step * 2;
    const g = tile.getContext("2d")!;
    g.fillStyle = "rgba(0,0,0,1)";
    g.fillRect(0, 0, 4, step);
    scanCache.set(step, tile);
  }
  ctx.save();
  ctx.globalAlpha = 0.16 * amount;
  ctx.translate(0, Math.floor((t * 40) % (step * 2)));
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, -step * 2, W, H + step * 4);
  ctx.restore();
}

/** Pixel blocks: a few rectangles of the picture coarsened and knocked sideways. */
export function drawBlocks(ctx: CanvasRenderingContext2D, W: number, H: number, salt: number, amount: number) {
  if (amount <= 0.02) return;
  const snap = copyOf(ctx, W, H, 66);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < 6; i++) {
    const w = W * (0.12 + 0.4 * rand(salt, i, 1));
    const h = H * (0.02 + 0.08 * rand(salt, i, 2));
    const x = (W - w) * rand(salt, i, 3);
    const y = (H - h) * rand(salt, i, 4);
    const shift = (rand(salt, i, 5) - 0.5) * 2 * W * 0.08 * amount;
    const px = Math.max(2, Math.round(Math.min(W, H) * 0.03));
    const tw = Math.max(1, Math.round(w / px));
    const th = Math.max(1, Math.round(h / px));
    const tiny = layer(67 + (i % 2), tw, th);
    tiny.imageSmoothingEnabled = true;
    tiny.drawImage(snap, x, y, w, h, 0, 0, tw, th);
    ctx.drawImage(tiny.canvas, 0, 0, tw, th, x + shift, y, w, h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Text that moves: word by word on the beat

export type KineticStyle = "pop" | "slam" | "blurin" | "track";

/** How one word looks `lt` seconds after it starts; dx, dy and smear are in font sizes. */
export type WordAnim = { a: number; scale: number; dy: number; smear: number; impact: number };

export function wordAnim(style: KineticStyle, lt: number): WordAnim {
  if (lt < 0) return { a: 0, scale: 1, dy: 0, smear: 0, impact: 0 };
  switch (style) {
    case "pop": {
      const x = lt / 0.34;
      return { a: clamp01(lt / 0.1), scale: 0.25 + 0.75 * outBack(x, 2.6), dy: 0.35 * (1 - outCubic(x)), smear: 0, impact: 0 };
    }
    case "slam": {
      const x = lt / 0.2;
      const landed = lt - 0.2;
      return {
        a: clamp01(lt / 0.06),
        scale: x < 1 ? 1 + 1.6 * (1 - x * x) : 1 + 0.06 * settle(landed, 3, 9),
        dy: 0,
        smear: 0,
        impact: landed >= 0 ? Math.exp(-landed * 7) : 0,
      };
    }
    case "blurin": {
      const x = lt / 0.5;
      return { a: outCubic(x), scale: 1, dy: 0.3 * (1 - outCubic(x)), smear: 0.9 * (1 - outCubic(x)), impact: 0 };
    }
    default: {
      const x = lt / 1.1;
      return { a: clamp01(lt / 0.35), scale: 1, dy: 0, smear: 0.5 * (1 - outExpo(x)), impact: 0 };
    }
  }
}

/** With "track" the words start spread out and come together: how far apart they are now. */
export function trackSpread(lt: number) {
  return 1 + 0.9 * (1 - outExpo(lt / 1.1));
}

/** Seconds between one word and the next: half a beat (with a known tempo), else 0.14. */
export function kineticStep(beat: number | null) {
  return beat ? Math.max(0.12, Math.min(0.3, beat / 2)) : 0.14;
}

const HEB = /[֐-׿]/;
const LTR = /[A-Za-zÀ-ɏЀ-ӿ0-9]/;

/**
 * The order the words of a line stand in, left to right. A right-to-left line keeps a run of
 * Latin words or numbers ("Dana & Ori", "4.11.2026") in its own order, the way the browser lays
 * out a whole line.
 */
export function visualOrder(words: string[], rtl: boolean): number[] {
  const n = words.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (!rtl) return idx;
  const kind = words.map((w) => (HEB.test(w) ? "r" : LTR.test(w) ? "l" : "n"));
  for (let i = 0; i < n; i++) {
    if (kind[i] !== "n") continue;
    let p = i - 1;
    while (p >= 0 && kind[p] === "n") p--;
    let q = i + 1;
    while (q < n && kind[q] === "n") q++;
    kind[i] = p >= 0 && q < n && kind[p] === "l" && kind[q] === "l" ? "l" : "r";
  }
  const runs: number[][] = [];
  for (let i = 0; i < n; i++) {
    const last = runs[runs.length - 1];
    if (kind[i] === "l" && last && kind[last[0]] === "l") last.push(i);
    else runs.push([i]);
  }
  return runs.reverse().flat();
}

/** The centres of words of these widths (in the order drawn, left to right), around 0. */
export function wordSlots(widths: number[], gap: number): number[] {
  const total = widths.reduce((x, y) => x + y, 0) + gap * Math.max(0, widths.length - 1);
  const out: number[] = [];
  let x = -total / 2;
  for (const w of widths) {
    out.push(x + w / 2);
    x += w + gap;
  }
  return out;
}

export type KLine = { text: string; font: string; size: number; color: string; rotate: number; lh: number };

export type KineticOptions = {
  style: KineticStyle;
  /** Seconds since the block started. */
  lt: number;
  /** 0-1 on the way out. */
  out: number;
  step: number;
  shadow: boolean;
  /** A coloured glow around the letters. */
  glow?: string;
  /** A thin line between the title and the subtitle, opening from the middle. */
  line: boolean;
};

/** A title (and subtitle) centred at y, the words coming in one after another. */
export function drawKineticBlock(ctx: CanvasRenderingContext2D, W: number, title: KLine[], sub: KLine[], y: number, o: KineticOptions) {
  if (!title.length && !sub.length) return;
  if (o.out >= 1) return;
  const subSize = sub[0]?.size ?? 0;
  const lineGap = o.line && title.length && sub.length ? subSize * 1.4 : sub.length && title.length ? subSize * 0.6 : 0;
  const blockH = title.reduce((h, l) => h + l.lh, 0) + lineGap + sub.reduce((h, l) => h + l.lh, 0);
  let cy = y - blockH / 2;
  let wordNo = 0;
  const titleWords = title.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  // "track" brings the words together all at once; the others one after another.
  const stagger = o.style === "track" ? 0.04 : o.step;
  // The subtitle comes in after the title.
  const subStart = titleWords * stagger + (o.style === "slam" ? 0.25 : o.style === "track" ? 0.35 : 0.12);
  const subStyle: KineticStyle = o.style === "pop" || o.style === "blurin" ? "blurin" : "track";
  const drawLine = (l: KLine, style: KineticStyle, startAt: number, each: number) => {
    const words = l.text.split(/\s+/).filter(Boolean);
    const rtl = HEB.test(l.text);
    ctx.font = l.font;
    const space = ctx.measureText(" ").width || l.size * 0.28;
    const order = visualOrder(words, rtl);
    const widths = order.map((i) => ctx.measureText(words[i]).width);
    const slots = wordSlots(widths, space);
    const lineY = cy + l.lh / 2;
    ctx.save();
    ctx.translate(W / 2, lineY);
    if (l.rotate) ctx.rotate((l.rotate * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = l.font;
    const spread = style === "track" ? trackSpread(o.lt - startAt) : 1;
    order.forEach((wi, vi) => {
      const lt = o.lt - startAt - (wordNo + wi) * each;
      const an = wordAnim(style, lt);
      let a = an.a * (1 - o.out);
      let scale = an.scale * (1 + 0.12 * o.out);
      const smear = (an.smear + 0.8 * o.out) * l.size;
      const dy = (an.dy - 0.2 * o.out) * l.size;
      if (a <= 0.004) return;
      a = clamp01(a);
      scale = Math.max(0.05, scale);
      ctx.save();
      ctx.translate(slots[vi] * spread, dy);
      ctx.scale(scale, scale);
      ctx.direction = HEB.test(words[wi]) ? "rtl" : "ltr";
      ctx.fillStyle = l.color;
      const copies = smear > 1.5 ? 5 : 1;
      for (let j = 0; j < copies; j++) {
        const f = copies === 1 ? 0 : j / (copies - 1) - 0.5;
        ctx.globalAlpha = copies === 1 ? a : Math.min(1, (a * 1.6) / copies);
        if (j === Math.floor(copies / 2) || copies === 1) {
          if (o.glow) {
            ctx.shadowColor = o.glow;
            ctx.shadowBlur = l.size * (0.35 + 0.6 * an.impact);
          } else if (o.shadow) {
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = l.size * (0.22 + 0.5 * an.impact);
          }
        } else ctx.shadowBlur = 0;
        ctx.fillText(words[wi], f * smear, 0);
      }
      // The moment a slammed word lands, a flash of light around it.
      if (an.impact > 0.05) {
        ctx.globalAlpha = a * an.impact * 0.55;
        ctx.shadowColor = o.glow ?? "rgba(255,255,255,0.9)";
        ctx.shadowBlur = l.size * 0.9;
        ctx.fillText(words[wi], 0, 0);
      }
      ctx.restore();
    });
    ctx.restore();
    wordNo += words.length;
    cy += l.lh;
  };
  for (const l of title) drawLine(l, o.style, 0, stagger);
  if (lineGap) {
    if (o.line) {
      const lp = outExpo((o.lt - subStart + 0.1) / 0.5) * (1 - o.out);
      if (lp > 0) {
        ctx.save();
        ctx.fillStyle = title[0]?.color ?? "#fff";
        const lw = W * 0.12 * lp;
        ctx.fillRect(W / 2 - lw / 2, cy + lineGap / 2 - W * 0.0015, lw, Math.max(1, W * 0.003));
        ctx.restore();
      }
    }
    cy += lineGap;
  }
  wordNo = 0;
  for (const l of sub) drawLine(l, subStyle, subStart, 0.05);
}

// ---------------------------------------------------------------------------------------------
// The whole look

export type CapcutLook = {
  camera: CameraSpec;
  grade: GradeSpec;
  /** Cuts that count as strong (whips, shakes, burns, flashes): every n-th. */
  accentEvery: number;
  intro: IntroStyle;
  kinetic: KineticStyle;
  /** The title's size against the template's (1 = the same). */
  titleScale?: number;
  /** A coloured glow around the text. */
  textGlow?: string;
  bloom?: number;
  vignette?: number;
  leaks?: { amount: number; palette: LeakPalette };
  /** A film burn over every n-th cut. */
  burn?: number;
  dust?: number;
  /** A lens flare that flashes on the hits. */
  flare?: number;
  bokeh?: { amount: number; palette: LeakPalette };
  bwPop?: boolean;
  /** Pixel blocks on the cuts. */
  blocks?: number;
  scan?: number;
  /** Colour flashes on the cuts, taking turns. */
  colorFlash?: string[];
  /** Coloured light along the two sides (left, right), like neon signs off frame. */
  rim?: [string, string];
  /** A hard cut to black for a moment on the strong cuts (a trailer's). */
  blackDip?: boolean;
  /** Split into panels on every n-th cut, the variants taking turns. */
  panels?: { every: number; variants: PanelVariant[] };
};

/** How bright the light is from the last hit (a cut, or a beat between, softer). */
export function hitEnvelope(c: CutClock): number {
  const cut = c.k >= 1 ? Math.exp(-c.dt * 4.5) * (c.accent ? 1 : 0.7) : 0;
  const beat = c.beatDt < Infinity ? Math.exp(-c.beatDt * 6) * 0.35 : 0;
  return Math.max(cut, beat);
}

/** The camera of a look at this moment. */
export function lookCamera(look: CapcutLook, c: CutClock, W: number, H: number): Cam {
  return cameraAt(look.camera, c, W, H, look.intro);
}

/**
 * Over the drawn pictures, before the on-beat effects (beatFx): the panels, the grade, the black
 * and white pop, the glow and the light.
 */
export function applyLook(ctx: CanvasRenderingContext2D, W: number, H: number, c: CutClock, look: CapcutLook, salt: number) {
  const t = c.t;
  if (look.panels) {
    const q = panelPhase(c, look.panels.every);
    if (q != null) {
      const v = look.panels.variants[Math.floor(c.k / Math.max(1, look.panels.every)) % look.panels.variants.length];
      drawPanels(ctx, W, H, panelDraws(v, q, salt + c.k));
    }
  }
  applyGrade(ctx, W, H, look.grade);
  if (look.bwPop) {
    desaturate(ctx, W, H, bwPopAmount(c));
  }
  if (look.bloom) applyBloom(ctx, W, H, look.bloom);
  const hit = hitEnvelope(c);
  if (look.rim) drawRim(ctx, W, H, look.rim, 0.42 + 0.35 * hit, t);
  if (look.leaks) drawLightLeaks(ctx, W, H, t, look.leaks.amount, look.leaks.palette, hit, salt);
  if (look.bokeh) drawBokeh(ctx, W, H, t, look.bokeh.amount, look.bokeh.palette, salt);
  if (look.flare) {
    // The light source sits in the upper part of each photo, on its own side.
    const fx = W * (0.15 + 0.7 * rand(salt, c.k, 31));
    const fy = H * (0.12 + 0.25 * rand(salt, c.k, 32)) + H * 0.02 * Math.sin(t * 0.8);
    drawFlare(ctx, W, H, fx + W * 0.04 * c.u, fy, look.flare * (0.3 + 0.7 * hit));
  }
  if (look.burn) {
    const b = burnPhase(c, look.burn);
    if (b) drawFilmBurn(ctx, W, H, b.q, salt + b.cut * 17);
  }
  if (look.bwPop) {
    const p = popDt(c);
    // The colour comes in with a split of the colours.
    if (p != null && p < 0.16) chromaHit(ctx, W, H, (1 - p / 0.16) * W * 0.018);
  }
  if (look.blocks && c.k >= 1 && c.dt < 0.22) drawBlocks(ctx, W, H, salt * 31 + c.k * 7 + Math.floor(c.dt * 24), look.blocks * (1 - c.dt / 0.22));
  if (look.colorFlash?.length && c.k >= 1) {
    const a = 0.55 * Math.exp(-c.dt * 10) * (c.accent ? 1 : 0.6);
    if (a > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = look.colorFlash[c.k % look.colorFlash.length];
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

/** Coloured light coming in along the left and right sides, breathing a little. */
export function drawRim(ctx: CanvasRenderingContext2D, W: number, H: number, colors: [string, string], a: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let side = 0; side < 2; side++) {
    const breathe = 0.85 + 0.15 * Math.sin(t * 1.3 + side * 2.4);
    const g = ctx.createLinearGradient(side ? W : 0, 0, side ? W * 0.45 : W * 0.55, 0);
    g.addColorStop(0, colors[side]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = clamp01(a * breathe);
    ctx.fillStyle = g;
    ctx.fillRect(side ? W * 0.45 : 0, 0, W * 0.55, H);
  }
  ctx.restore();
}

/** After the on-beat effects: dust, scan lines, grain, vignette, the black dips and the opening. */
export function finishLook(ctx: CanvasRenderingContext2D, W: number, H: number, c: CutClock, look: CapcutLook, grain: boolean, salt: number) {
  const t = c.t;
  if (look.dust) drawDust(ctx, W, H, t, look.dust);
  if (look.scan) drawScanlines(ctx, W, H, t, look.scan);
  if (look.intro === "burn" && t < 0.35) drawFilmBurn(ctx, W, H, (t + 0.2) / 0.55, salt + 5);
  if (grain) drawGrain(ctx, W, H, t, 0.07);
  if (look.vignette) drawVignette(ctx, W, H, look.vignette);
  if (look.blackDip && c.accent && c.dt < 0.1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - clamp01((c.dt - 0.06) / 0.04)})`;
    ctx.fillRect(0, 0, W, H);
  }
  const ia = introVeil(look.intro, t);
  if (ia.white > 0) {
    ctx.fillStyle = `rgba(255,252,246,${ia.white})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (ia.black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${ia.black})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (look.intro === "glitch" && t < 0.35) {
    const a = 1 - t / 0.35;
    drawBlocks(ctx, W, H, salt + Math.floor(t * 24), a);
    chromaHit(ctx, W, H, a * W * 0.03);
  }
}

/** The opening's veil: white (a dreamy fade in) or black (fade up, or the first frames of a zoom). */
export function introVeil(intro: IntroStyle, t: number): { white: number; black: number } {
  switch (intro) {
    case "white":
      return { white: 1 - outCubic(t / 0.8), black: 0 };
    case "black":
      return { white: 0, black: 1 - inOutCubic(t / 0.9) };
    case "zoom":
      return { white: 0, black: 1 - clamp01(t / 0.15) };
    case "burn":
      return { white: 0, black: 1 - clamp01(t / 0.12) };
    default:
      return { white: 0, black: 0 };
  }
}

/** The letterbox bars coming in at the start of a look that opens from black. */
export function letterboxIn(intro: IntroStyle, t: number) {
  return intro === "black" ? outCubic((t - 0.2) / 0.8) : 1;
}

// Red one way, cyan the other.
function chromaHit(ctx: CanvasRenderingContext2D, W: number, H: number, d: number) {
  if (Math.abs(d) < 0.5) return;
  const src = copyOf(ctx, W, H, 69);
  const red = layer(70, W, H);
  red.drawImage(src, 0, 0);
  red.globalCompositeOperation = "multiply";
  red.fillStyle = "#ff0000";
  red.fillRect(0, 0, W, H);
  const cyan = layer(71, W, H);
  cyan.drawImage(src, 0, 0);
  cyan.globalCompositeOperation = "multiply";
  cyan.fillStyle = "#00ffff";
  cyan.fillRect(0, 0, W, H);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  const s = 1 + (2 * Math.abs(d)) / W;
  ctx.drawImage(red.canvas, (W - W * s) / 2 + d, (H - H * s) / 2, W * s, H * s);
  ctx.drawImage(cyan.canvas, (W - W * s) / 2 - d, (H - H * s) / 2, W * s, H * s);
  ctx.restore();
}

/** Behind the ending text: the last picture softened and darkened (d 0-1 as it comes in). */
export function outroBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, d: number) {
  if (d <= 0) return;
  const a = smallCopy(ctx, W, H, 12, 74, 72);
  const w2 = Math.max(8, Math.round(W / 4));
  const h2 = Math.max(8, Math.round(H / 4));
  const b = layer(73, w2, h2);
  b.imageSmoothingQuality = "high";
  b.drawImage(a.canvas, 0, 0, w2, h2);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = clamp01(d);
  ctx.drawImage(b.canvas, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(0,0,0,${0.38 * clamp01(d)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
