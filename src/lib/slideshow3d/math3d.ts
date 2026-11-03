// The 3D of the slideshow (owner, 2026-11-02: "האפקטים צריכים להיות יותר תלת מימד"), on a plain 2D
// canvas: a photo is a flat rectangle placed anywhere in 3D (an affine transform), projected with
// perspective, and drawn as thin strips. Each strip is an ordinary affine drawImage, so it works in
// every browser (and in the video export) with no WebGL.
//
// Coordinates: x right, y down, z away from the viewer, all in canvas pixels, with (0, 0, 0) at the
// middle of the canvas. The camera sits at z = -P and looks into the screen.

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

// p ↦ m·p + t, with m a row-major 3×3 matrix.
export type Affine3 = { m: number[]; t: Vec3 };

export const IDENTITY: Affine3 = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export function applyAffine(a: Affine3, p: Vec3): Vec3 {
  const m = a.m;
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + a.t[0],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + a.t[1],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + a.t[2],
  ];
}

// The linear part only (directions, normals).
export function applyLinear(a: Affine3, p: Vec3): Vec3 {
  const m = a.m;
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
  ];
}

// a ∘ b: b first, then a.
export function compose(a: Affine3, b: Affine3): Affine3 {
  const x = a.m;
  const y = b.m;
  const m = [
    x[0] * y[0] + x[1] * y[3] + x[2] * y[6],
    x[0] * y[1] + x[1] * y[4] + x[2] * y[7],
    x[0] * y[2] + x[1] * y[5] + x[2] * y[8],
    x[3] * y[0] + x[4] * y[3] + x[5] * y[6],
    x[3] * y[1] + x[4] * y[4] + x[5] * y[7],
    x[3] * y[2] + x[4] * y[5] + x[5] * y[8],
    x[6] * y[0] + x[7] * y[3] + x[8] * y[6],
    x[6] * y[1] + x[7] * y[4] + x[8] * y[7],
    x[6] * y[2] + x[7] * y[5] + x[8] * y[8],
  ];
  const t = applyAffine(a, b.t);
  return { m, t };
}

// chain(A, B, C) = A ∘ B ∘ C: C acts first. Reads like CSS `transform: A B C`.
export function chain(...parts: Affine3[]): Affine3 {
  let out = IDENTITY;
  for (const p of parts) out = compose(out, p);
  return out;
}

export const translate = (x: number, y: number, z = 0): Affine3 => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [x, y, z] });

export const scale = (sx: number, sy = sx, sz = sx): Affine3 => ({ m: [sx, 0, 0, 0, sy, 0, 0, 0, sz], t: [0, 0, 0] });

// Turns about the vertical axis. A positive angle brings the right edge toward the viewer.
export function rotateY(a: number): Affine3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { m: [c, 0, s, 0, 1, 0, -s, 0, c], t: [0, 0, 0] };
}

// Tilts about the horizontal axis. A positive angle brings the top edge toward the viewer.
export function rotateX(a: number): Affine3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { m: [1, 0, 0, 0, c, -s, 0, s, c], t: [0, 0, 0] };
}

// Turns in the screen's plane, clockwise for a positive angle (y points down).
export function rotateZ(a: number): Affine3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { m: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] };
}

// `a` about a pivot point instead of the origin (a door on its hinge).
export function about(pivot: Vec3, a: Affine3): Affine3 {
  return chain(translate(pivot[0], pivot[1], pivot[2]), a, translate(-pivot[0], -pivot[1], -pivot[2]));
}

export type Camera = { W: number; H: number; P: number };

// The perspective distance: a share of the canvas's longer side, so a phone held upright and a
// Full HD video get the same depth.
export const PERSPECTIVE = 1.35;
export function cameraFor(W: number, H: number): Camera {
  return { W, H, P: PERSPECTIVE * Math.max(W, H) };
}

// Nothing is drawn closer to the camera than this share of P (a photo flying through the camera
// fades out before it gets there).
const NEAREST = 0.9;

// A world point on the canvas (pixels), with its scale factor.
export function project(cam: Camera, p: Vec3): { x: number; y: number; f: number } {
  const z = Math.max(p[2], -cam.P * NEAREST);
  const f = cam.P / (cam.P + z);
  return { x: cam.W / 2 + p[0] * f, y: cam.H / 2 + p[1] * f, f };
}

// A photo (or a piece of one) as a rectangle w × h, centered on its own origin, placed by T.
export type PlaneGeom = { T: Affine3; w: number; h: number };

export function planeCenter(g: PlaneGeom): Vec3 {
  return g.T.t;
}

// The side facing the camera is the one the photo is printed on: false when it's seen from behind
// or exactly edge-on (then nothing is drawn).
export function facesCamera(cam: Camera, g: PlaneGeom): boolean {
  const n = applyLinear(g.T, [0, 0, -1]);
  const c = g.T.t;
  const dot = n[0] * c[0] + n[1] * c[1] + n[2] * (c[2] + cam.P);
  const len = Math.hypot(n[0], n[1], n[2]) * Math.hypot(c[0], c[1], c[2] + cam.P);
  return len > 0 && dot / len < -1e-6;
}

export type Quad = { tl: Vec2; tr: Vec2; br: Vec2; bl: Vec2; z: { tl: number; tr: number; br: number; bl: number } };

export function planeQuad(cam: Camera, g: PlaneGeom): Quad {
  const hw = g.w / 2;
  const hh = g.h / 2;
  const pt = (u: number, v: number) => {
    const w = applyAffine(g.T, [u, v, 0]);
    const p = project(cam, w);
    return { xy: [p.x, p.y] as Vec2, z: w[2] };
  };
  const tl = pt(-hw, -hh);
  const tr = pt(hw, -hh);
  const br = pt(hw, hh);
  const bl = pt(-hw, hh);
  return { tl: tl.xy, tr: tr.xy, br: br.xy, bl: bl.xy, z: { tl: tl.z, tr: tr.z, br: br.z, bl: bl.z } };
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);

export function quadArea(q: Quad): number {
  const pts = [q.tl, q.tr, q.br, q.bl];
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % 4];
    a += p[0] * n[1] - n[0] * p[1];
  }
  return Math.abs(a) / 2;
}

// One strip: the unit square (s, t) ∈ [0,1]² lands on o + s·ax + t·ay (a canvas setTransform).
// s runs along the photo's width and t along its height in both slicing directions, so the source
// rectangle maps straight on. The pads widen the strip a little on each side (in units of ax/ay):
// `padS` overlaps the next strip so no hairline shows between them, `padT` covers the strip's
// slanted far end, and the plane's exact outline is then clipped.
export type Strip = {
  // The share of the photo this strip covers, along its width (u) or its height (v).
  from: number;
  to: number;
  o: Vec2;
  ax: Vec2;
  ay: Vec2;
  padS: number;
  padT: number;
};

export type PlaneSlices = {
  quad: Quad;
  // "u": vertical strips (the depth changes across the width, a turn about the vertical axis);
  // "v": horizontal strips (a tilt about the horizontal axis).
  axis: "u" | "v";
  strips: Strip[];
  // False when one affine draw is exact enough (no clip needed).
  sliced: boolean;
};

// How many strips, and where. `maxErr` is how far (in canvas pixels) a strip's affine drawing may
// stray from the true perspective at its far corner; the exact outline is clipped anyway.
export function planeStrips(
  cam: Camera,
  g: PlaneGeom,
  opts: { maxErr?: number; maxStrips?: number; seam?: number } = {},
): PlaneSlices | null {
  if (!(g.w > 0) || !(g.h > 0)) return null;
  if (!facesCamera(cam, g)) return null;
  const quad = planeQuad(cam, g);
  if (quadArea(quad) < 0.5) return null;
  const maxErr = opts.maxErr ?? 1;
  const maxStrips = opts.maxStrips ?? 96;
  const seam = opts.seam ?? 0.6;
  // How far a single affine (from tl, tr, bl) misses the fourth corner.
  const dev = len(sub(quad.br, add(quad.tr, sub(quad.bl, quad.tl))));
  // Which way the perspective changes more: the left and right edges' lengths (a turn), or the
  // top and bottom edges' (a tilt).
  const dU = Math.abs(len(sub(quad.bl, quad.tl)) - len(sub(quad.br, quad.tr)));
  const dV = Math.abs(len(sub(quad.tr, quad.tl)) - len(sub(quad.br, quad.bl)));
  const axis: "u" | "v" = dU >= dV ? "u" : "v";
  if (dev <= maxErr) {
    const ax = sub(quad.tr, quad.tl);
    const ay = sub(quad.bl, quad.tl);
    return { quad, axis, sliced: false, strips: [{ from: 0, to: 1, o: quad.tl, ax, ay, padS: 0, padT: 0 }] };
  }
  // Along the slicing direction, a strip narrower than ~2px adds nothing.
  const span = axis === "u" ? Math.max(len(sub(quad.tr, quad.tl)), len(sub(quad.br, quad.bl))) : Math.max(len(sub(quad.bl, quad.tl)), len(sub(quad.br, quad.tr)));
  const n = Math.max(2, Math.min(maxStrips, Math.ceil(dev / maxErr), Math.ceil(span / 2)));
  const hw = g.w / 2;
  const hh = g.h / 2;
  const at = (u: number, v: number): Vec2 => {
    const p = project(cam, applyAffine(g.T, [u, v, 0]));
    return [p.x, p.y];
  };
  const strips: Strip[] = [];
  // The points along the two long edges, shared between neighbouring strips.
  const edgeA: Vec2[] = [];
  const edgeB: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    if (axis === "u") {
      const u = -hw + g.w * k;
      edgeA.push(at(u, -hh));
      edgeB.push(at(u, hh));
    } else {
      const v = -hh + g.h * k;
      edgeA.push(at(-hw, v));
      edgeB.push(at(hw, v));
    }
  }
  for (let i = 0; i < n; i++) {
    const a0 = edgeA[i];
    const a1 = edgeA[i + 1];
    const b0 = edgeB[i];
    const b1 = edgeB[i + 1];
    if (axis === "u") {
      // Vertical strip: top edge a0→a1 exact, the "down" direction averaged over its two sides.
      const ax = sub(a1, a0);
      const d0 = sub(b0, a0);
      const d1 = sub(b1, a1);
      const ay = mid(d0, d1);
      const lx = len(ax);
      const ly = len(ay);
      if (lx < 1e-3 || ly < 1e-3) continue;
      const miss = len(sub(d1, d0)) / 2;
      strips.push({ from: i / n, to: (i + 1) / n, o: a0, ax, ay, padS: seam / lx, padT: miss / ly });
    } else {
      // Horizontal strip: left edge a0→a1 exact, the "across" direction averaged.
      const ay = sub(a1, a0);
      const r0 = sub(b0, a0);
      const r1 = sub(b1, a1);
      const ax = mid(r0, r1);
      const lx = len(ax);
      const ly = len(ay);
      if (lx < 1e-3 || ly < 1e-3) continue;
      const miss = len(sub(r1, r0)) / 2;
      strips.push({ from: i / n, to: (i + 1) / n, o: a0, ax, ay, padS: miss / lx, padT: seam / ly });
    }
  }
  return { quad, axis, sliced: true, strips };
}

// The projected width of the plane's outline (its bounding box), for the tests and for culling
// tiny pieces.
export function quadWidth(q: Quad): number {
  const xs = [q.tl[0], q.tr[0], q.br[0], q.bl[0]];
  return Math.max(...xs) - Math.min(...xs);
}
