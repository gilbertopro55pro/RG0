// Draws one moment of the 3D slideshow on a canvas. The screen (player.ts) and the video
// (slideshowVideo.ts) both draw every frame with drawShowFrame, so the file is what was on screen.
//
// A frame: the blurred, darkened photo filling the background (for depth, instead of flat black),
// then the photos as 3D planes (effects.ts), each with its soft shadow, light and depth shading.

import { type Affine3, type Camera, type PlaneGeom, type PlaneSlices, applyLinear, cameraFor, chain, planeQuad, planeStrips, rotateX, rotateY, rotateZ, scale, translate } from "./math3d";
import { EFFECTS, holdOps, introOps, smoothstep, type FxImage, type PhotoGeom, type PlaneOp } from "./effects";
import { driftAt, type Drift, type Transition } from "./plan";

export type { FxImage } from "./effects";

export type FxPhoto = { img: FxImage | null; age: number; drift: Drift };

export type FxFrame = {
  // The photo coming on (or on).
  incoming: FxPhoto;
  // The photo going off, during a transition.
  outgoing: FxPhoto | null;
  // The effect bringing `incoming` on; null is the slideshow's opening entrance.
  transition: Transition | null;
  // 0–1 through the transition; 1 when it's over (only `incoming`, in its drift).
  progress: number;
  // Going back (the "previous" button): the transition that brought `outgoing` on, played backward.
  reverse?: boolean;
};

// How much of the canvas a photo takes at rest: the rest shows the blurred background around it.
export const FIT = 0.88;

export function restSize(img: { w: number; h: number } | null, W: number, H: number): { w: number; h: number } {
  const iw = img && img.w > 0 ? img.w : 16;
  const ih = img && img.h > 0 ? img.h : 9;
  const k = FIT * Math.min(W / iw, H / ih);
  return { w: iw * k, h: ih * k };
}

// While a transition runs, each photo's own drift eases out to nothing at its middle and back, so
// the two photos meet cleanly (the edges of a cube, the halves of a page).
export function driftWeight(p: number): number {
  const c = Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
  return c * c;
}

export function photoGeom(cam: Camera, ph: FxPhoto, weight = 1): PhotoGeom {
  const { w, h } = restSize(ph.img, cam.W, cam.H);
  const d = driftAt(ph.drift, ph.age);
  const k = weight;
  const T: Affine3 = chain(
    translate(d.x * k * cam.W, d.y * k * cam.H, 0),
    rotateY(d.ry * k),
    rotateX(d.rx * k),
    rotateZ(d.rz * k),
    scale(1 + (d.s - 1) * k),
  );
  return { img: ph.img, w, h, T };
}

export type FrameScene = {
  ops: PlaneOp[];
  // The background: `from` fully, then `to` over it at `mix`; `fade` the whole background's opacity
  // (the opening comes out of black).
  bgFrom: FxImage | null;
  bgTo: FxImage | null;
  mix: number;
  fade: number;
};

// What to draw for a frame (pure: tested without a canvas).
export function frameScene(cam: Camera, frame: FxFrame): FrameScene {
  const p = Math.min(1, Math.max(0, frame.progress));
  if (p >= 1 || (frame.transition && !frame.outgoing)) {
    return { ops: holdOps(photoGeom(cam, frame.incoming)), bgFrom: frame.incoming.img, bgTo: null, mix: 0, fade: 1 };
  }
  if (!frame.transition) {
    return { ops: introOps(photoGeom(cam, frame.incoming), p), bgFrom: frame.incoming.img, bgTo: null, mix: 0, fade: smoothstep(0, 0.8, p) };
  }
  const out = frame.outgoing!;
  // Backward: the same effect from the photo we go back to, to the one now on, at 1 - p.
  const q = frame.reverse ? 1 - p : p;
  const [a, b] = frame.reverse ? [frame.incoming, out] : [out, frame.incoming];
  const w = driftWeight(q);
  const A = photoGeom(cam, a, w);
  const B = photoGeom(cam, b, w);
  const ops = EFFECTS[frame.transition.id](A, B, q, frame.transition, cam);
  return { ops, bgFrom: a.img, bgTo: b.img, mix: smoothstep(0.15, 0.85, q), fade: 1 };
}

export type FxQuality = "screen" | "video";
const QUALITY: Record<FxQuality, { maxErr: number; maxStrips: number; smoothing: ImageSmoothingQuality }> = {
  // The screen redraws 60 times a second on a phone: fewer strips, and a cheaper filter.
  screen: { maxErr: 1.25, maxStrips: 64, smoothing: "medium" },
  video: { maxErr: 0.6, maxStrips: 128, smoothing: "high" },
};

type Ctx2D = CanvasRenderingContext2D;

// Light from the upper left, in front: a photo turned toward it brightens a little, one turned
// away darkens, as on a real card.
const LIGHT = (() => {
  const v = [-0.35, -0.5, -1];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const LIGHT_BASE = -LIGHT[2];

export function planeLight(g: PlaneGeom): { dark: number; sheen: number; facing: number } {
  const n = applyLinear(g.T, [0, 0, -1]);
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const lambert = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l);
  const ratio = lambert / LIGHT_BASE;
  return {
    dark: Math.min(0.62, Math.max(0, (1 - ratio) * 0.7)),
    sheen: Math.min(0.16, Math.max(0, (ratio - 1) * 0.7)),
    facing: Math.abs(n[2] / l),
  };
}

// The deeper, the darker (a little fog into the distance).
const fog = (cam: Camera, z: number) => (z > 0 ? Math.min(0.6, z / (2.4 * cam.P)) : 0);

// A soft shadow made once: a dark rectangle blurred, scaled under each photo.
let shadowSprite: HTMLCanvasElement | null = null;
const SPRITE = 128;
const SPRITE_INSET = 34;
function getShadowSprite(): HTMLCanvasElement | null {
  if (shadowSprite) return shadowSprite;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = SPRITE;
  c.height = SPRITE;
  const x = c.getContext("2d");
  if (!x) return null;
  x.shadowColor = "rgba(0,0,0,1)";
  x.shadowBlur = 22;
  x.fillStyle = "#000";
  x.fillRect(SPRITE_INSET, SPRITE_INSET, SPRITE - 2 * SPRITE_INSET, SPRITE - 2 * SPRITE_INSET);
  shadowSprite = c;
  return c;
}

function drawShadow(ctx: Ctx2D, cam: Camera, g: PlaneGeom, strength: number) {
  // Only under a photo that faces the viewer: the shadow is the photo's box, which would show
  // around a photo turned on its side.
  const { facing } = planeLight(g);
  const k = strength * smoothstep(0.86, 0.98, facing);
  if (k <= 0.005) return;
  const sprite = getShadowSprite();
  if (!sprite) return;
  const q = planeQuad(cam, g);
  const xs = [q.tl[0], q.tr[0], q.br[0], q.bl[0]];
  const ys = [q.tl[1], q.tr[1], q.br[1], q.bl[1]];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return;
  // The sprite's inner rectangle lands a little inside the photo's box; its blur spreads by about
  // 5% around it.
  const spread = Math.max(w, h) * 0.05 + 6;
  const sx = (w + 2 * spread) / (SPRITE - 2 * SPRITE_INSET);
  const sy = (h + 2 * spread) / (SPRITE - 2 * SPRITE_INSET);
  const drop = cam.H * 0.012;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, k * 0.8);
  // A blur needs no fine filtering, and the finer ones cost several times more for a big stretch.
  const quality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(sprite, x0 - spread - SPRITE_INSET * sx, y0 - spread - SPRITE_INSET * sy + drop, SPRITE * sx, SPRITE * sy);
  ctx.imageSmoothingQuality = quality;
  ctx.globalAlpha = 1;
}

function quadPath(ctx: Ctx2D, s: PlaneSlices) {
  const q = s.quad;
  ctx.beginPath();
  ctx.moveTo(q.tl[0], q.tl[1]);
  ctx.lineTo(q.tr[0], q.tr[1]);
  ctx.lineTo(q.br[0], q.br[1]);
  ctx.lineTo(q.bl[0], q.bl[1]);
  ctx.closePath();
}

// The photo (or piece) itself, its strips and its shading, at full opacity.
function drawPlaneBody(ctx: Ctx2D, cam: Camera, op: Extract<PlaneOp, { kind: "plane" }>, s: PlaneSlices) {
  const [sx, sy, sw, sh] = op.src;
  const img = op.img;
  ctx.save();
  if (s.sliced) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    quadPath(ctx, s);
    ctx.clip();
  }
  for (const st of s.strips) {
    const lx = Math.hypot(st.ax[0], st.ax[1]);
    const ly = Math.hypot(st.ay[0], st.ay[1]);
    const bs = s.sliced ? st.padS : op.bleed / lx;
    const bt = s.sliced ? st.padT : op.bleed / ly;
    ctx.setTransform(st.ax[0], st.ax[1], st.ay[0], st.ay[1], st.o[0], st.o[1]);
    let x = sx;
    let y = sy;
    let w = sw;
    let h = sh;
    if (s.axis === "u") {
      x = sx + sw * st.from;
      w = sw * (st.to - st.from);
    } else {
      y = sy + sh * st.from;
      h = sh * (st.to - st.from);
    }
    // Inside the image, whatever the rounding.
    x = Math.max(0, Math.min(img.w - 0.01, x));
    y = Math.max(0, Math.min(img.h - 0.01, y));
    w = Math.max(0.01, Math.min(img.w - x, w));
    h = Math.max(0.01, Math.min(img.h - y, h));
    ctx.drawImage(img.el, x, y, w, h, -bs, -bt, 1 + 2 * bs, 1 + 2 * bt);
  }
  // Shading: the light on the plane, its depth (darker at its far side), and its own dimming.
  const light = planeLight(op.g);
  const q = s.quad;
  const alongU = Math.abs(q.z.tl + q.z.bl - q.z.tr - q.z.br) >= Math.abs(q.z.tl + q.z.tr - q.z.bl - q.z.br);
  const [z0, z1] = alongU ? [(q.z.tl + q.z.bl) / 2, (q.z.tr + q.z.br) / 2] : [(q.z.tl + q.z.tr) / 2, (q.z.bl + q.z.br) / 2];
  const shadeAt = (z: number) => 1 - (1 - light.dark) * (1 - fog(cam, z)) * (1 - op.dim);
  const a0 = shadeAt(z0);
  const a1 = shadeAt(z1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Below 2% the shading can't be seen; skipping it saves a fill over the whole photo per frame.
  if (Math.max(a0, a1) > 0.02) {
    quadPath(ctx, s);
    if (Math.abs(a0 - a1) > 0.01) {
      const [p0, p1] = alongU
        ? [
            [(q.tl[0] + q.bl[0]) / 2, (q.tl[1] + q.bl[1]) / 2],
            [(q.tr[0] + q.br[0]) / 2, (q.tr[1] + q.br[1]) / 2],
          ]
        : [
            [(q.tl[0] + q.tr[0]) / 2, (q.tl[1] + q.tr[1]) / 2],
            [(q.bl[0] + q.br[0]) / 2, (q.bl[1] + q.br[1]) / 2],
          ];
      const grad = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      grad.addColorStop(0, `rgba(0,0,0,${a0.toFixed(3)})`);
      grad.addColorStop(1, `rgba(0,0,0,${a1.toFixed(3)})`);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = `rgba(0,0,0,${((a0 + a1) / 2).toFixed(3)})`;
    }
    ctx.fill();
  }
  if (light.sheen > 0.01) {
    quadPath(ctx, s);
    ctx.fillStyle = `rgba(255,255,255,${light.sheen.toFixed(3)})`;
    ctx.fill();
  }
  ctx.restore();
}

// A photo fading while it turns is drawn whole on a scratch canvas first, then faded in one go:
// fading strip by strip would show the overlaps between them as lines.
const layers = new WeakMap<object, HTMLCanvasElement>();
function layerFor(canvas: object, W: number, H: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  let layer = layers.get(canvas);
  if (!layer) {
    layer = document.createElement("canvas");
    layers.set(canvas, layer);
  }
  if (layer.width !== W || layer.height !== H) {
    layer.width = W;
    layer.height = H;
  }
  return layer;
}

function drawOp(ctx: Ctx2D, cam: Camera, op: PlaneOp, quality: FxQuality) {
  if (op.kind === "shadow") {
    drawShadow(ctx, cam, op.g, op.shadow);
    return;
  }
  if (op.alpha <= 0.002) return;
  const q = QUALITY[quality];
  const s = planeStrips(cam, op.g, { maxErr: q.maxErr, maxStrips: q.maxStrips });
  if (!s) return;
  if (op.shadow > 0.005) drawShadow(ctx, cam, op.g, op.shadow * op.alpha);
  const alpha = Math.min(1, op.alpha);
  if (alpha >= 0.995 || !s.sliced) {
    ctx.globalAlpha = alpha;
    drawPlaneBody(ctx, cam, op, s);
    ctx.globalAlpha = 1;
    return;
  }
  const layer = layerFor(ctx.canvas, cam.W, cam.H);
  const lctx = layer?.getContext("2d");
  if (!layer || !lctx) {
    ctx.globalAlpha = alpha;
    drawPlaneBody(ctx, cam, op, s);
    ctx.globalAlpha = 1;
    return;
  }
  const xs = [s.quad.tl[0], s.quad.tr[0], s.quad.br[0], s.quad.bl[0]];
  const ys = [s.quad.tl[1], s.quad.tr[1], s.quad.br[1], s.quad.bl[1]];
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
  const x1 = Math.min(cam.W, Math.ceil(Math.max(...xs)) + 2);
  const y1 = Math.min(cam.H, Math.ceil(Math.max(...ys)) + 2);
  if (x1 <= x0 || y1 <= y0) return;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(x0, y0, x1 - x0, y1 - y0);
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = q.smoothing;
  drawPlaneBody(lctx, cam, op, s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.globalAlpha = 1;
}

// The background: the photo blurred (its small copy stretched), covering the canvas.
function drawBackdrop(ctx: Ctx2D, cam: Camera, img: FxImage | null, alpha: number) {
  if (!img?.bg || alpha <= 0.002) return;
  const bg = img.bg as CanvasImageSource & { width: number; height: number };
  const bw = bg.width;
  const bh = bg.height;
  if (!(bw > 0) || !(bh > 0)) return;
  const k = Math.max(cam.W / bw, cam.H / bh) * 1.08;
  const w = bw * k;
  const h = bh * k;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  const quality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(bg, (cam.W - w) / 2, (cam.H - h) / 2, w, h);
  ctx.imageSmoothingQuality = quality;
  ctx.globalAlpha = 1;
}

export function drawShowFrame(ctx: Ctx2D, W: number, H: number, frame: FxFrame, quality: FxQuality) {
  const cam = cameraFor(W, H);
  const scene = frameScene(cam, frame);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = QUALITY[quality].smoothing;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  drawBackdrop(ctx, cam, scene.bgFrom, scene.fade);
  if (scene.bgTo) drawBackdrop(ctx, cam, scene.bgTo, scene.fade * scene.mix);
  // Darkened, and darker toward the corners.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  for (const op of scene.ops) drawOp(ctx, cam, op, quality);
  ctx.restore();
}
