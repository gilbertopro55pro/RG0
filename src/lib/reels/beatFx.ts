import type { ReelBeatFx, ReelFxSpec, ReelSettings, ReelTemplate } from "./templates";
import { clamp01, drawSegment, layer, rand, type ReelImage, type Scene } from "./scene";
import type { ReelTimeline } from "./render";

// Effects that hit on the beat (owner, 2026-10-15: "templates like CapCut's, where the transitions
// happen exactly on the beat, with special effects"). An effect fires at a cut (the beat templates
// put every cut on a beat), at the beats in between (softer), or on every few cuts (stronger), and
// fades out within a fraction of a second. Like everything in a reel, a pure function of the time,
// so the preview and the file are the same. Two kinds: a move of the whole picture (zoom punch,
// shake), applied before it's drawn, and a pass over the drawn picture (the rest). The text and
// the letterbox are drawn after, so they stay steady.

export type FxEvent = {
  fx: ReelBeatFx;
  // Seconds since the hit.
  dt: number;
  strength: number;
  // Makes the random parts (shake direction, glitch slices) differ between hits.
  salt: number;
  // Time until the next cut or beat: a held effect (black and white, three screens) ends before it.
  hold: number;
};

// How long each effect lasts (seconds), at most.
const LENGTH: Record<ReelBeatFx, number> = {
  punch: 0.34,
  shake: 0.32,
  flash: 0.22,
  rgb: 0.3,
  zoomblur: 0.28,
  glitch: 0.26,
  strobe: 0.27,
  invert: 0.1,
  bw: 0.6,
  mirror: 0.3,
};

const NONE: Required<ReelFxSpec> = { cut: [], pulse: [], accent: [], accentEvery: 0 };

// The effects in use: the template's own, or the photographer's pick. A picked effect fires on
// every cut; the template's softer hits between the beats stay for the picked effects among them.
export function fxSpec(tpl: ReelTemplate, settings: ReelSettings): Required<ReelFxSpec> {
  const own = tpl.fx;
  if (settings.fx == null) {
    if (!own) return NONE;
    return { cut: own.cut, pulse: own.pulse ?? [], accent: own.accent ?? [], accentEvery: own.accentEvery ?? 0 };
  }
  const picked = settings.fx;
  return { cut: picked, pulse: (own?.pulse ?? []).filter((f) => picked.includes(f)), accent: [], accentEvery: 0 };
}

// The hits that are still fading at time t.
export function fxEvents(t: number, tl: ReelTimeline, spec: Required<ReelFxSpec>): FxEvent[] {
  if (!spec.cut.length && !spec.pulse.length && !spec.accent.length) return [];
  const out: FxEvent[] = [];
  const end = tl.total - tl.tail;
  let k = 0;
  while (k < tl.segments - 1 && t >= tl.starts[k + 1]) k++;
  if (k >= 1 && t < end) {
    const dt = t - tl.starts[k];
    const hold = (k + 1 < tl.segments ? tl.starts[k + 1] : end) - tl.starts[k];
    for (const fx of spec.cut) out.push({ fx, dt, strength: 1, salt: k * 7 + 1, hold });
    if (spec.accentEvery > 0 && k % spec.accentEvery === 0) for (const fx of spec.accent) out.push({ fx, dt, strength: 1.15, salt: k * 7 + 3, hold });
  }
  if (spec.pulse.length && tl.beat) {
    const n = Math.floor((t - tl.phase) / tl.beat + 1e-6);
    const bt = tl.phase + n * tl.beat;
    // A beat that is also a cut already has its hit.
    if (n >= 1 && bt < end - 0.05 && !tl.starts.some((s) => Math.abs(s - bt) < 0.06)) {
      for (const fx of spec.pulse) out.push({ fx, dt: t - bt, strength: 0.45, salt: n * 13 + 5, hold: tl.beat });
    }
  }
  return out;
}

// How strong an effect is at this moment (0 when it's over).
function amount(e: FxEvent): number {
  const len = Math.min(LENGTH[e.fx], Math.max(0.05, e.hold * (e.fx === "mirror" ? 0.6 : 0.9)));
  if (e.dt < 0 || e.dt >= len) return 0;
  const x = e.dt / len;
  switch (e.fx) {
    case "invert":
      return e.strength;
    case "mirror":
      return 1;
    case "bw":
      return e.strength * (x < 0.75 ? 1 : 1 - (x - 0.75) / 0.25);
    case "strobe":
      // White on every other 15th of a second: 2 frames on, 2 off at 30 fps.
      return Math.floor(e.dt * 15) % 2 === 0 ? e.strength * (1 - x * 0.5) : 0;
    default:
      return e.strength * (1 - x) * (1 - x);
  }
}

// The strongest hit of each effect (a cut and a beat can overlap).
function strongest(events: FxEvent[]): Map<ReelBeatFx, { a: number; e: FxEvent }> {
  const out = new Map<ReelBeatFx, { a: number; e: FxEvent }>();
  for (const e of events) {
    const a = amount(e);
    if (a <= 0.01) continue;
    const cur = out.get(e.fx);
    if (!cur || a > cur.a) out.set(e.fx, { a, e });
  }
  return out;
}

// Zoom punch and shake: moves the whole picture (call before drawing it, inside save/restore).
// The picture is scaled up a little while it moves, so its edges never show.
export function applyFxTransform(ctx: CanvasRenderingContext2D, W: number, H: number, events: FxEvent[]) {
  if (!events.length) return;
  const on = strongest(events);
  const punch = on.get("punch");
  const shake = on.get("shake");
  if (!punch && !shake) return;
  let s = 1;
  let ox = 0;
  let oy = 0;
  let rot = 0;
  if (punch) s *= 1 + 0.17 * punch.a;
  if (shake) {
    const a = shake.a;
    const amp = Math.min(W, H) * 0.035 * a;
    const { dt, salt } = shake.e;
    ox = (rand(salt, 1) < 0.5 ? -1 : 1) * amp * Math.cos(dt * 55);
    oy = (rand(salt, 2) < 0.5 ? -1 : 1) * amp * 0.7 * Math.sin(dt * 47);
    rot = (rand(salt, 3) - 0.5) * 0.036 * a * Math.cos(dt * 40);
    s *= 1 + 0.1 * a;
  }
  ctx.translate(W / 2 + ox, H / 2 + oy);
  if (rot) ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
}

// A copy of what's on the canvas so far (the canvas is W×H: the preview's or the export's).
function snapshot(ctx: CanvasRenderingContext2D, W: number, H: number): HTMLCanvasElement {
  const g = layer(30, W, H);
  g.drawImage(ctx.canvas, 0, 0, W, H);
  return g.canvas;
}

// Red one way, green and blue the other (each a little larger, so no edge is left without a colour).
function rgbSplit(ctx: CanvasRenderingContext2D, W: number, H: number, d: number) {
  if (Math.abs(d) < 0.5) return;
  const src = snapshot(ctx, W, H);
  const red = layer(31, W, H);
  red.drawImage(src, 0, 0);
  red.globalCompositeOperation = "multiply";
  red.fillStyle = "#ff0000";
  red.fillRect(0, 0, W, H);
  const cyan = layer(32, W, H);
  cyan.drawImage(src, 0, 0);
  cyan.globalCompositeOperation = "multiply";
  cyan.fillStyle = "#00ffff";
  cyan.fillRect(0, 0, W, H);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  const s = 1 + (2 * Math.abs(d)) / W;
  const w = W * s;
  const h = H * s;
  ctx.drawImage(red.canvas, (W - w) / 2 + d, (H - h) / 2, w, h);
  ctx.drawImage(cyan.canvas, (W - w) / 2 - d, (H - h) / 2, w, h);
  ctx.restore();
}

// The passes over the drawn picture, in a fixed order (call after drawing it, with no transform).
export function applyFxPost(ctx: CanvasRenderingContext2D, W: number, H: number, events: FxEvent[]) {
  if (!events.length) return;
  const on = strongest(events);
  if (!on.size) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;

  if (on.has("mirror")) {
    // Three screens stacked, each the middle band of the picture.
    const src = snapshot(ctx, W, H);
    const gap = Math.max(1, Math.round(W * 0.008));
    const h = (H - 2 * gap) / 3;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) ctx.drawImage(src, 0, (H - h) / 2, W, h, 0, i * (h + gap), W, h);
  }

  const zb = on.get("zoomblur");
  if (zb) {
    const src = snapshot(ctx, W, H);
    ctx.save();
    for (let i = 1; i <= 4; i++) {
      const s = 1 + 0.055 * i * zb.a;
      ctx.globalAlpha = 0.24 * Math.min(1, zb.a);
      ctx.drawImage(src, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
    }
    ctx.restore();
  }

  const gl = on.get("glitch");
  if (gl) {
    const src = snapshot(ctx, W, H);
    const bucket = Math.floor(gl.e.dt * 24);
    for (let i = 0; i < 7; i++) {
      const y = Math.floor(rand(gl.e.salt, bucket, i) * H * 0.95);
      const h = Math.max(2, Math.min(H - y, Math.round((0.015 + rand(gl.e.salt, bucket, i, 1) * 0.07) * H)));
      const shift = (rand(gl.e.salt, bucket, i, 2) - 0.5) * 2 * W * 0.09 * gl.a;
      ctx.drawImage(src, 0, y, W, h, shift, y, W, h);
    }
    rgbSplit(ctx, W, H, W * 0.012 * gl.a);
  }

  const rgb = on.get("rgb");
  if (rgb) rgbSplit(ctx, W, H, W * 0.025 * rgb.a * (rand(rgb.e.salt, 9) < 0.5 ? -1 : 1));

  const bw = on.get("bw");
  if (bw) {
    // A grey "saturation" layer takes the colour out (works in every browser, unlike ctx.filter).
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = clamp01(bw.a);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const inv = on.get("invert");
  if (inv) {
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.globalAlpha = clamp01(inv.a);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const strobe = on.get("strobe");
  if (strobe) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, 0.7 * strobe.a)})`;
    ctx.fillRect(0, 0, W, H);
  }

  const flash = on.get("flash");
  if (flash) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.92, 0.85 * Math.pow(flash.a, 1.5))})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// One effect on a loop, for the picker's thumbnails: the first photo, a cut onto the second with
// the effect hitting, then the second.
export function drawFxPreview(ctx: CanvasRenderingContext2D, W: number, H: number, fx: ReelBeatFx, q: number, tpl: ReelTemplate, settings: ReelSettings, images: ReelImage[]) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (images.length) {
    const sc: Scene = { W, H, tpl, settings, images };
    const cutAt = 0.4;
    const dt = (q - cutAt) * 1.8;
    const events: FxEvent[] = dt >= 0 ? [{ fx, dt, strength: 1, salt: 11, hold: 0.9 }] : [];
    ctx.save();
    applyFxTransform(ctx, W, H, events);
    drawSegment(ctx, sc, dt >= 0 && images.length > 1 ? 1 : 0, q);
    ctx.restore();
    applyFxPost(ctx, W, H, events);
  }
  ctx.restore();
}
