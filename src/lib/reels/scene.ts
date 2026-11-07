import type { ReelFit, ReelSettings, ReelTemplate } from "./templates";
import { DEFAULT_TIMING, pipPlan, poseTransform, type PipCard, type PipPose, type SegTiming } from "./proshow";
import { cameraFor, compose, planeQuad, translate, type Camera, type PlaneGeom } from "../slideshow3d/math3d";
import { drawPlaneOp } from "../slideshow3d/render";

// The pieces every frame is drawn from: a photo in a rectangle (moved by the template's motion),
// one "segment" (a photo, a framed photo, or two stacked), and the helpers transitions share.
// Every size is relative to the canvas, so the small preview and the full export look the same.

// A photo, or a video clip (from the device or the gallery; `live`: its element shows a different
// frame every time, so nothing drawn from it is cached, and it plays as it is, without the photo
// motion). A clip plays from `start` seconds into it (the photographer's in-point), for at most
// `duration` seconds (what's left after the in-point). `focus` (0-1) is where a clip that's cropped
// to the reel's shape is cut: 0 keeps its left (or top) edge, 0.5 the middle, 1 the right (bottom).
export type ReelImage = {
  el: CanvasImageSource;
  width: number;
  height: number;
  live?: boolean;
  video?: { duration: number; start: number };
  focus?: number;
  // A clip's own way to fit the reel's shape, over the reel's setting (clips fill it by default).
  fit?: ReelFit;
};

// `timing`: when each segment is on (render.ts, segmentTiming), for picture in picture, whose
// layers move in seconds and land on the beat; without it they move by the segment's progress.
export type Scene = { W: number; H: number; tpl: ReelTemplate; settings: ReelSettings; images: ReelImage[]; timing?: (k: number) => SegTiming };

export type Rect = { x: number; y: number; w: number; h: number };

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeInOut = (v: number) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);
export const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
export const easeIn = (v: number) => v * v * v;

// A repeatable random number in [0, 1) for these integers, so the "random" transitions are the
// same in the preview and in the exported file (every frame is a pure function of the time).
export function rand(...nums: number[]): number {
  let h = 0x811c9dc5;
  for (const x of nums) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

// A photo whose visible part under "cover" would be less than this is shown whole instead (a
// landscape photo in a vertical reel, or in a square post). A portrait photo in a 9:16 reel only
// loses a little at the sides, so it still fills the screen.
export const FIT_MIN_VISIBLE = 0.72;

// A blurred, slightly darkened copy of a photo for backgrounds, made once per photo and strength
// (0-100). Built by shrinking (stronger = smaller) and scaling back up in two steps, which works
// in every browser (Safari's canvas has no reliable blur filter) and costs nothing per frame.
const blurCache = new WeakMap<object, Map<number, ReelImage>>();
const liveBlur = new WeakMap<object, { a: HTMLCanvasElement; c: HTMLCanvasElement }>();
export function blurredCopy(img: ReelImage, strength = 60): ReelImage {
  const level = Math.round(Math.max(0, Math.min(100, strength)) / 5) * 5;
  if (img.live) return liveBlurredCopy(img, level);
  let byLevel = blurCache.get(img.el as object);
  if (!byLevel) {
    byLevel = new Map();
    blurCache.set(img.el as object, byLevel);
  }
  const hit = byLevel.get(level);
  if (hit) return hit;
  const tiny = Math.max(12, Math.round(420 / (1 + level / 8)));
  const th = Math.max(8, Math.round((tiny * img.height) / img.width));
  const a = document.createElement("canvas");
  a.width = tiny;
  a.height = th;
  const ga = a.getContext("2d")!;
  ga.imageSmoothingEnabled = true;
  ga.imageSmoothingQuality = "high";
  ga.drawImage(img.el, 0, 0, tiny, th);
  const w = Math.min(480, tiny * 4);
  const h = Math.max(1, Math.round((w * img.height) / img.width));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(a, 0, 0, w, h);
  g.fillStyle = "rgba(0,0,0,0.16)";
  g.fillRect(0, 0, w, h);
  const out = { el: c, width: w, height: h };
  byLevel.set(level, out);
  return out;
}

// A video's blurred copy, redrawn from its current frame every time (into canvases kept per clip).
function liveBlurredCopy(img: ReelImage, level: number): ReelImage {
  const tiny = Math.max(12, Math.round(420 / (1 + level / 8)));
  const th = Math.max(8, Math.round((tiny * img.height) / img.width));
  const w = Math.min(480, tiny * 4);
  const h = Math.max(1, Math.round((w * img.height) / img.width));
  let cv = liveBlur.get(img.el as object);
  if (!cv || cv.a.width !== tiny || cv.c.width !== w) {
    cv = { a: document.createElement("canvas"), c: document.createElement("canvas") };
    cv.a.width = tiny;
    cv.a.height = th;
    cv.c.width = w;
    cv.c.height = h;
    liveBlur.set(img.el as object, cv);
  }
  const ga = cv.a.getContext("2d")!;
  ga.imageSmoothingQuality = "high";
  ga.drawImage(img.el, 0, 0, tiny, th);
  const g = cv.c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(cv.a, 0, 0, w, h);
  g.fillStyle = "rgba(0,0,0,0.16)";
  g.fillRect(0, 0, w, h);
  return { el: cv.c, width: w, height: h };
}

// The photo pre-shrunk close to the size it's drawn at. Drawing a 1600px photo into a much smaller
// canvas every frame made a slow zoom shimmer and step (the browser resamples it roughly, and a
// little differently each frame); from a source just above the drawn size the motion is smooth.
const sizedCache = new WeakMap<object, Map<number, ReelImage>>();
function sizedFor(img: ReelImage, drawW: number): ReelImage {
  if (img.live) return img;
  const want = Math.ceil((drawW * 1.25) / 64) * 64;
  if (img.width <= want * 1.4) return img;
  let byW = sizedCache.get(img.el as object);
  if (!byW) {
    byW = new Map();
    sizedCache.set(img.el as object, byW);
  }
  const hit = byW.get(want);
  if (hit) return hit;
  // Halve in steps for a clean result, then the last step to size.
  let src: CanvasImageSource = img.el;
  let w = img.width;
  let h = img.height;
  while (w / 2 >= want) {
    const c = document.createElement("canvas");
    c.width = Math.round(w / 2);
    c.height = Math.round(h / 2);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, c.width, c.height);
    src = c;
    w = c.width;
    h = c.height;
  }
  const out = { el: src, width: img.width, height: img.height };
  byW.set(want, out);
  return out;
}

// The photo in `r`, moved by the template's motion at progress p (0-1 through its segment).
// With fit "black"/"blur", a photo that doesn't match the rectangle's shape is shown whole (its
// motion stays inside the rectangle, so nothing of it is ever cut off).
export function drawPhoto(ctx: CanvasRenderingContext2D, img: ReelImage, r: Rect, p: number, motion: ReelTemplate["motion"], index: number, fit: ReelFit, blur = 60) {
  const dir = index % 2 === 0 ? 1 : -1;
  let s = 1;
  let dx = 0;
  if (img.live) {
    // A video moves by itself.
  } else if (motion === "kenburns") {
    s = dir > 0 ? 1.04 + 0.1 * p : 1.14 - 0.1 * p;
    dx = dir * 0.03 * p * r.w;
  } else if (motion === "punch") {
    s = 1.18 - 0.16 * easeOut(clamp01(p * 3));
  } else if (motion === "pan") {
    s = 1.16;
    dx = dir * (p - 0.5) * 0.1 * r.w;
  } else {
    s = 1.03 + 0.04 * p;
  }
  fit = img.fit ?? fit;
  const coverScale = Math.max(r.w / img.width, r.h / img.height);
  const containScale = Math.min(r.w / img.width, r.h / img.height);
  const visible = containScale / coverScale;
  const whole = fit !== "cover" && visible < FIT_MIN_VISIBLE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (whole) {
    if (fit === "blur") {
      const bg = blurredCopy(img, blur);
      const bs = Math.max(r.w / bg.width, r.h / bg.height) * 1.08;
      ctx.drawImage(bg.el, r.x + (r.w - bg.width * bs) / 2, r.y + (r.h - bg.height * bs) / 2, bg.width * bs, bg.height * bs);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // The same motion, kept at or under the whole-photo size.
    const k = img.live ? 1 : 1 - (1.18 - Math.min(1.18, s)) * 0.5;
    const base = containScale * k;
    const dw = img.width * base;
    const dh = img.height * base;
    const room = Math.max(0, (r.w - dw) / 2);
    const mx = Math.max(-room, Math.min(room, dx * 0.5));
    ctx.drawImage(sizedFor(img, containScale * img.width * drawScale(ctx)).el, r.x + (r.w - dw) / 2 + mx, r.y + (r.h - dh) / 2, dw, dh);
  } else {
    const base = coverScale * s;
    const dw = img.width * base;
    const dh = img.height * base;
    const f = img.focus ?? 0.5;
    ctx.drawImage(sizedFor(img, coverScale * 1.2 * img.width * drawScale(ctx)).el, r.x + (r.w - dw) * f + dx, r.y + (r.h - dh) * f, dw, dh);
  }
  ctx.restore();
}

// How much the context is scaled (the blurred-transition layer draws at a fraction of the size).
function drawScale(ctx: CanvasRenderingContext2D) {
  const m = ctx.getTransform();
  return Math.max(0.05, Math.hypot(m.a, m.b));
}

// Picture in picture like ProShow's (owner, 2026-11-04, proshow.ts plans it): the segment's first
// photo on the whole screen, still moving with the template's motion and a little darker, and one
// or two photos in white frames as layers over it, each flying in, moving and going out on its own
// path (from a side, out of the distance, dropped from near the camera, turning like a door,
// swinging, spinning), a moment apart. The layers are the slideshow's 3D planes (perspective strips,
// its light and depth shading), with a soft shadow that follows the frame and, on some, a
// reflection under it. With one photo in the reel, the main photo alone.
const cardCache = new WeakMap<object, Map<string, ReelImage>>();
const liveCards = new WeakMap<object, HTMLCanvasElement>();

// The photo in its white frame (rounded corners on some styles), drawn once per photo and size; a
// video clip's every frame.
function cardImage(img: ReelImage, c: PipCard): ReelImage {
  const res = Math.min(1.2, 1600 / Math.max(c.w, c.h));
  const cw = Math.max(8, Math.round(c.w * res));
  const ch = Math.max(8, Math.round(c.h * res));
  const b = Math.max(1, Math.round(c.border * res));
  const rad = Math.round(c.radius * res);
  const focus = img.focus ?? 0.5;
  const key = `${cw}x${ch}:${b}:${rad}:${focus.toFixed(3)}`;
  let byKey = cardCache.get(img.el as object);
  if (!img.live) {
    const hit = byKey?.get(key);
    if (hit) return hit;
  }
  let cv = img.live ? liveCards.get(img.el as object) : undefined;
  if (!cv) {
    cv = document.createElement("canvas");
    if (img.live) liveCards.set(img.el as object, cv);
  }
  if (cv.width !== cw || cv.height !== ch) {
    cv.width = cw;
    cv.height = ch;
  }
  const g = cv.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, ch);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  roundRectPath(g, 0, 0, cw, ch, rad);
  g.fillStyle = "#ffffff";
  g.fill();
  const iw = cw - 2 * b;
  const ih = ch - 2 * b;
  g.save();
  roundRectPath(g, b, b, iw, ih, Math.max(0, rad - b));
  g.clip();
  const s = Math.max(iw / img.width, ih / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  g.drawImage(sizedFor(img, dw).el, b + (iw - dw) * focus, b + (ih - dh) * focus, dw, dh);
  g.restore();
  const out = { el: cv, width: cw, height: ch };
  if (!img.live) {
    if (!byKey) {
      byKey = new Map();
      cardCache.set(img.el as object, byKey);
    }
    // A few sizes per photo (the preview, the export, the thumbnails), the oldest dropped.
    if (byKey.size >= 6) byKey.delete(byKey.keys().next().value as string);
    byKey.set(key, out);
  }
  return out;
}

// The frame's lower part, mirrored and fading, for the reflection under it.
const reflectionCache = new WeakMap<object, HTMLCanvasElement>();
const REFLECTION = 0.42;
function reflectionOf(card: ReelImage, live: boolean): HTMLCanvasElement {
  let rc = reflectionCache.get(card.el as object);
  const rw = card.width;
  const rh = Math.max(2, Math.round(card.height * REFLECTION));
  if (rc && !live && rc.width === rw && rc.height === rh) return rc;
  if (!rc) {
    rc = document.createElement("canvas");
    reflectionCache.set(card.el as object, rc);
  }
  rc.width = rw;
  rc.height = rh;
  const g = rc.getContext("2d")!;
  g.setTransform(1, 0, 0, -1, 0, card.height);
  g.drawImage(card.el, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "destination-in";
  const fade = g.createLinearGradient(0, 0, 0, rh);
  fade.addColorStop(0, "rgba(0,0,0,0.34)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, rw, rh);
  g.globalCompositeOperation = "source-over";
  return rc;
}

// A soft shadow made once (built pixel by pixel, like the slideshow's: shadowBlur differs between
// browsers and comes out as a hard slab without a GPU), tighter than the slideshow's, for a print.
let cardShadow: HTMLCanvasElement | null = null;
const SHADOW_SIZE = 128;
const SHADOW_INSET = 18;
function cardShadowSprite(): HTMLCanvasElement {
  if (cardShadow) return cardShadow;
  const c = document.createElement("canvas");
  c.width = c.height = SHADOW_SIZE;
  const g = c.getContext("2d")!;
  const data = g.createImageData(SHADOW_SIZE, SHADOW_SIZE);
  const lo = SHADOW_INSET;
  const hi = SHADOW_SIZE - SHADOW_INSET;
  for (let y = 0; y < SHADOW_SIZE; y++) {
    for (let x = 0; x < SHADOW_SIZE; x++) {
      const dx = Math.max(lo - (x + 0.5), 0, x + 0.5 - hi);
      const dy = Math.max(lo - (y + 0.5), 0, y + 0.5 - hi);
      data.data[(y * SHADOW_SIZE + x) * 4 + 3] = Math.round(255 * Math.exp(-((Math.hypot(dx, dy) / 7.5) ** 2)));
    }
  }
  g.putImageData(data, 0, 0);
  cardShadow = c;
  return c;
}

type Base = { a: number; b: number; c: number; d: number; e: number; f: number };

// Under the frame's outline as it's turned (not its box), dropped a little below it.
function drawCardShadow(ctx: CanvasRenderingContext2D, cam: Camera, g: PlaneGeom, strength: number, base: Base, baseAlpha: number) {
  if (strength <= 0.01) return;
  const q = planeQuad(cam, g);
  const cx = (q.tl[0] + q.tr[0] + q.br[0] + q.bl[0]) / 4;
  const cy = (q.tl[1] + q.tr[1] + q.br[1] + q.bl[1]) / 4;
  const grow = 1.03;
  const at = (p: [number, number]): [number, number] => [cx + (p[0] - cx) * grow, cy + (p[1] - cy) * grow];
  const tl = at(q.tl);
  const tr = at(q.tr);
  const bl = at(q.bl);
  const inner = SHADOW_SIZE - 2 * SHADOW_INSET;
  const ax: [number, number] = [(tr[0] - tl[0]) / inner, (tr[1] - tl[1]) / inner];
  const ay: [number, number] = [(bl[0] - tl[0]) / inner, (bl[1] - tl[1]) / inner];
  if (Math.abs(ax[0] * ay[1] - ax[1] * ay[0]) < 1e-4) return;
  const drop = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) * 0.03 + cam.H * 0.004;
  const ox = tl[0] - SHADOW_INSET * (ax[0] + ay[0]) + drop * 0.25;
  const oy = tl[1] - SHADOW_INSET * (ax[1] + ay[1]) + drop;
  ctx.setTransform(
    base.a * ax[0] + base.c * ax[1],
    base.b * ax[0] + base.d * ax[1],
    base.a * ay[0] + base.c * ay[1],
    base.b * ay[0] + base.d * ay[1],
    base.a * ox + base.c * oy + base.e,
    base.b * ox + base.d * oy + base.f,
  );
  ctx.globalAlpha = baseAlpha * Math.min(1, strength);
  const quality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(cardShadowSprite(), 0, 0);
  ctx.imageSmoothingQuality = quality;
  ctx.globalAlpha = baseAlpha;
}

function drawCard(ctx: CanvasRenderingContext2D, cam: Camera, img: ReelImage, c: PipCard, pose: PipPose, base: Base, baseAlpha: number) {
  const T = poseTransform(pose);
  const card = cardImage(img, c);
  const fx = { el: card.el, w: card.width, h: card.height, bg: null };
  if (c.reflection) {
    const ref = reflectionOf(card, !!img.live);
    const rh = c.h * REFLECTION;
    const g = { T: compose(T, translate(0, c.h / 2 + c.h * 0.012 + rh / 2, 0)), w: c.w, h: rh };
    drawPlaneOp(ctx, cam, { kind: "plane", img: { el: ref, w: ref.width, h: ref.height, bg: null }, g, src: [0, 0, ref.width, ref.height], alpha: pose.alpha, dim: 0, shadow: 0, bleed: 0 }, "video", base, baseAlpha);
  }
  const g = { T, w: c.w, h: c.h };
  drawCardShadow(ctx, cam, g, pose.alpha * 0.6, base, baseAlpha);
  drawPlaneOp(ctx, cam, { kind: "plane", img: fx, g, src: [0, 0, fx.w, fx.h], alpha: pose.alpha, dim: 0, shadow: 0, bleed: 0 }, "video", base, baseAlpha);
}

function drawPip(ctx: CanvasRenderingContext2D, sc: Scene, k: number, p: number) {
  const { W, H, tpl, images } = sc;
  const fit = sc.settings.fit;
  const blur = sc.settings.blur ?? 60;
  const insets = Math.max(1, Math.min(2, tpl.insets ?? 1));
  const per = 1 + insets;
  const seg = Array.from({ length: Math.min(per, images.length) }, (_, j) => images[(per * k + j) % images.length]);
  const main = seg[0];
  const full = { x: 0, y: 0, w: W, h: H };
  if (seg.length < 2) {
    drawPhoto(ctx, main, full, p, tpl.motion, per * k, fit, blur);
    return;
  }
  const timing = sc.timing?.(k) ?? DEFAULT_TIMING;
  const plan = pipPlan({
    W,
    H,
    k,
    seed: sc.settings.seed,
    aspects: seg.map((im) => im.width / Math.max(1, im.height)),
    insets: Math.min(insets, seg.length - 1),
    timing,
    title: timing.title && sc.settings.text.show ? sc.settings.text.position : null,
  });
  // The background keeps moving the whole time; darker, and darker toward the corners, so the
  // layers stand out.
  if (plan.background === "blurred") drawPhoto(ctx, blurredCopy(main, Math.max(55, blur)), full, p, "kenburns", per * k, "cover");
  else drawPhoto(ctx, main, full, p, tpl.motion, per * k, fit, blur);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const u = clamp01(p) * timing.life;
  const on = plan.cards.map((c) => ({ c, pose: c.pose(u) })).filter((x) => x.pose.alpha > 0.002);
  if (!on.length) return;
  const cam = cameraFor(W, H);
  // Farther first, so nearer layers cover them. Close to the screen's plane they count as the same
  // depth (the later one on top), so a print's little bounce on landing doesn't flip it under the
  // one below it.
  const depth = (z: number) => (Math.abs(z) < cam.P * 0.1 ? 0 : z);
  on.sort((a, b) => depth(b.pose.z) - depth(a.pose.z));
  const m = ctx.getTransform();
  const base = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const { c, pose } of on) drawCard(ctx, cam, seg[c.image], c, pose, base, baseAlpha);
  ctx.restore();
}

// One segment's picture (a photo, a framed photo, two photos stacked, or a photo in a photo)
// filling the canvas.
export function drawSegment(ctx: CanvasRenderingContext2D, sc: Scene, k: number, p: number) {
  const { W, H, tpl, images } = sc;
  const fit = sc.settings.fit;
  const blur = sc.settings.blur ?? 60;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!images.length) return;
  if (tpl.frame === "pip") {
    drawPip(ctx, sc, k, p);
    return;
  }
  if (tpl.frame === "split") {
    const a = images[(2 * k) % images.length];
    const b = images[(2 * k + 1) % images.length];
    if (images.length === 1) {
      drawPhoto(ctx, a, { x: 0, y: 0, w: W, h: H }, p, tpl.motion, k, fit, blur);
      return;
    }
    const gap = Math.round(W * 0.012);
    const half = (H - gap) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    drawPhoto(ctx, a, { x: 0, y: 0, w: W, h: half }, p, tpl.motion, 2 * k, fit, blur);
    drawPhoto(ctx, b, { x: 0, y: half + gap, w: W, h: half }, p, tpl.motion, 2 * k + 1, fit, blur);
    return;
  }
  const img = images[k % images.length];
  if (tpl.frame === "framed") {
    // A blurred, darkened copy as the background (blurred once per photo, small, then scaled up);
    // the photo in a white frame over it. The frame already shows the whole photo.
    drawPhoto(ctx, blurredCopy(img, blur), { x: 0, y: 0, w: W, h: H }, 0.5, "drift", k, "cover");
    const fitScale = Math.min((W * 0.82) / img.width, (H * 0.6) / img.height);
    const fw = img.width * fitScale;
    const fh = img.height * fitScale;
    const fx = (W - fw) / 2;
    const fy = (H - fh) / 2 - H * 0.04;
    const border = Math.round(W * 0.016);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = W * 0.04;
    ctx.shadowOffsetY = W * 0.012;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(fx - border, fy - border, fw + 2 * border, fh + 2 * border);
    ctx.restore();
    drawPhoto(ctx, img, { x: fx, y: fy, w: fw, h: fh }, p, "drift", k, "cover");
    return;
  }
  drawPhoto(ctx, img, { x: 0, y: 0, w: W, h: H }, p, tpl.motion, k, fit, blur);
}

// Off-screen canvases reused between frames (one set per size: the preview, the export and the
// transition thumbnails each have their own).
const layers = new Map<string, HTMLCanvasElement>();
export function layer(slot: number, w: number, h: number): CanvasRenderingContext2D {
  const key = `${slot}:${w}x${h}`;
  let c = layers.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    layers.set(key, c);
  }
  const g = c.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  return g;
}

// The segment drawn soft: rendered small and scaled back up (works in every browser, unlike
// ctx.filter, and costs far less than a real blur on a full-size frame). amount 0-1.
export function drawBlurred(ctx: CanvasRenderingContext2D, sc: Scene, k: number, p: number, amount: number) {
  if (amount <= 0.02) {
    drawSegment(ctx, sc, k, p);
    return;
  }
  const f = 2 + amount * 22;
  const w = Math.max(4, Math.round(sc.W / f));
  const h = Math.max(4, Math.round(sc.H / f));
  const g = layer(9, w, h);
  g.scale(w / sc.W, h / sc.H);
  drawSegment(g, sc, k, p);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(g.canvas, 0, 0, sc.W, sc.H);
  ctx.restore();
}

let grainTile: HTMLCanvasElement | null = null;
export function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d")!;
  const data = g.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = c;
  return c;
}

export function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, alpha: number, scale = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const tile = grain();
  const ox = Math.floor((t * 997) % 160);
  const oy = Math.floor((t * 613) % 160);
  ctx.scale(scale, scale);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, W / scale + 160, H / scale + 160);
  ctx.restore();
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
