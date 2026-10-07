import type { ReelFit, ReelSettings, ReelTemplate } from "./templates";

// The pieces every frame is drawn from: a photo in a rectangle (moved by the template's motion),
// one "segment" (a photo, a framed photo, or two stacked), and the helpers transitions share.
// Every size is relative to the canvas, so the small preview and the full export look the same.

export type ReelImage = { el: CanvasImageSource; width: number; height: number };

export type Scene = { W: number; H: number; tpl: ReelTemplate; settings: ReelSettings; images: ReelImage[] };

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
const FIT_MIN_VISIBLE = 0.72;

// A blurred, slightly darkened copy of a photo for backgrounds, made once per photo and strength
// (0-100). Built by shrinking (stronger = smaller) and scaling back up in two steps, which works
// in every browser (Safari's canvas has no reliable blur filter) and costs nothing per frame.
const blurCache = new WeakMap<object, Map<number, ReelImage>>();
export function blurredCopy(img: ReelImage, strength = 60): ReelImage {
  const level = Math.round(Math.max(0, Math.min(100, strength)) / 5) * 5;
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

// The photo pre-shrunk close to the size it's drawn at. Drawing a 1600px photo into a much smaller
// canvas every frame made a slow zoom shimmer and step (the browser resamples it roughly, and a
// little differently each frame); from a source just above the drawn size the motion is smooth.
const sizedCache = new WeakMap<object, Map<number, ReelImage>>();
function sizedFor(img: ReelImage, drawW: number): ReelImage {
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
  if (motion === "kenburns") {
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
    const k = 1 - (1.18 - Math.min(1.18, s)) * 0.5;
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
    ctx.drawImage(sizedFor(img, coverScale * 1.2 * img.width * drawScale(ctx)).el, r.x + (r.w - dw) / 2 + dx, r.y + (r.h - dh) / 2, dw, dh);
  }
  ctx.restore();
}

// How much the context is scaled (the blurred-transition layer draws at a fraction of the size).
function drawScale(ctx: CanvasRenderingContext2D) {
  const m = ctx.getTransform();
  return Math.max(0.05, Math.hypot(m.a, m.b));
}

// One segment's picture (a photo, a framed photo, or two photos stacked) filling the canvas.
export function drawSegment(ctx: CanvasRenderingContext2D, sc: Scene, k: number, p: number) {
  const { W, H, tpl, images } = sc;
  const fit = sc.settings.fit;
  const blur = sc.settings.blur ?? 60;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (!images.length) return;
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
