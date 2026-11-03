// The 3D transitions of the slideshow (owner, 2026-11-02: "אפקטים מטורפים ומגוונים"). Each one says,
// for a moment p (0–1) of the move from photo A to photo B, which flat pieces of the two photos are
// where in 3D. render.ts draws them, the same way on the screen and in the video.
//
// Rules every effect keeps, so nothing jumps at the start or end of a transition:
// - at p = 0 the drawing is A exactly as it was while it was on (B unseen),
// - at p = 1 it's B exactly as it stays (A gone).

import {
  IDENTITY,
  about,
  chain,
  compose,
  rotateX,
  rotateY,
  rotateZ,
  scale,
  translate,
  type Affine3,
  type Camera,
  type PlaneGeom,
} from "./math3d";
import { seededRandom, type Transition, type TransitionId } from "./plan";

// A photo ready to draw: the image (or a smaller copy of it), its size, and a small blurred copy
// for the background behind it.
export type FxImage = { el: CanvasImageSource; w: number; h: number; bg: CanvasImageSource | null };

// A photo in the frame: its size at rest and its own placement (the drift), which every piece of it
// follows.
export type PhotoGeom = { img: FxImage | null; w: number; h: number; T: Affine3 };

export type PlaneOp =
  | {
      kind: "plane";
      img: FxImage;
      g: PlaneGeom;
      // The part of the image this plane shows, in image pixels.
      src: [number, number, number, number];
      alpha: number;
      // Extra darkening, 0–1 (a photo deep in the background).
      dim: number;
      // The soft shadow under it, 0–1.
      shadow: number;
      // Pieces of one photo are drawn this many pixels larger, so the seams between them don't show.
      bleed: number;
    }
  | { kind: "shadow"; g: PlaneGeom; shadow: number };

// The shadow under every photo while it's on.
export const REST_SHADOW = 0.6;

const DEG = Math.PI / 180;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const ease = {
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
  inCubic: (x: number) => x * x * x,
  inQuad: (x: number) => x * x,
  inOutSine: (x: number) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x: number, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
};

type Look = { alpha?: number; dim?: number; shadow?: number; bleed?: number };

// The whole photo, moved by `fx` inside its own frame.
function full(ph: PhotoGeom, fx: Affine3 = IDENTITY, look: Look = {}): PlaneOp | null {
  if (!ph.img) return null;
  return {
    kind: "plane",
    img: ph.img,
    g: { T: compose(ph.T, fx), w: ph.w, h: ph.h },
    src: [0, 0, ph.img.w, ph.img.h],
    alpha: look.alpha ?? 1,
    dim: look.dim ?? 0,
    shadow: look.shadow ?? REST_SHADOW,
    bleed: look.bleed ?? 0,
  };
}

// A piece of the photo: the share [x0, y0]–[x1, y1] of it, moved by `local` about its own center
// (after `pre`, which moves the whole photo).
function piece(
  ph: PhotoGeom,
  box: [number, number, number, number],
  local: Affine3 = IDENTITY,
  look: Look = {},
  pre: Affine3 = IDENTITY,
): PlaneOp | null {
  if (!ph.img) return null;
  const [x0, y0, x1, y1] = box;
  const cx = ((x0 + x1) / 2 - 0.5) * ph.w;
  const cy = ((y0 + y1) / 2 - 0.5) * ph.h;
  return {
    kind: "plane",
    img: ph.img,
    g: { T: chain(ph.T, pre, translate(cx, cy, 0), local), w: (x1 - x0) * ph.w, h: (y1 - y0) * ph.h },
    src: [x0 * ph.img.w, y0 * ph.img.h, (x1 - x0) * ph.img.w, (y1 - y0) * ph.img.h],
    alpha: look.alpha ?? 1,
    dim: look.dim ?? 0,
    shadow: look.shadow ?? 0,
    bleed: look.bleed ?? 0.75,
  };
}

// The shadow of a whole photo, for effects that break it into pieces (each piece casting its own
// would draw lines across the photo).
function shadowOf(ph: PhotoGeom, strength: number, fx: Affine3 = IDENTITY): PlaneOp | null {
  if (!ph.img || strength <= 0.005) return null;
  return { kind: "shadow", g: { T: compose(ph.T, fx), w: ph.w, h: ph.h }, shadow: strength };
}

// Farther first, so nearer planes cover them.
function byDepth(ops: (PlaneOp | null)[]): PlaneOp[] {
  return ops
    .filter((o): o is PlaneOp => !!o)
    .map((o, i) => ({ o, i }))
    .sort((a, b) => b.o.g.T.t[2] - a.o.g.T.t[2] || a.i - b.i)
    .map((x) => x.o);
}

const keep = (ops: (PlaneOp | null)[]): PlaneOp[] => ops.filter((o): o is PlaneOp => !!o);

export type EffectFn = (A: PhotoGeom, B: PhotoGeom, p: number, tr: Transition, cam: Camera) => PlaneOp[];

// B waiting behind A: far back and dark, coming forward as A gets out of the way.
function emergeB(B: PhotoGeom, p: number, depth = 0.5): PlaneOp | null {
  const k = ease.outCubic(p);
  return full(B, translate(0, 0, depth * B.w * (1 - k)), {
    dim: 0.6 * (1 - k),
    alpha: smoothstep(0, 0.25, p),
    shadow: REST_SHADOW * k,
  });
}

// The two photos on two faces of a turning cube.
const cube =
  (axis: "y" | "x"): EffectFn =>
  (A, B, p, tr) => {
    const e = ease.inOutCubic(p);
    const span = axis === "y" ? Math.max(A.w, B.w) : Math.max(A.h, B.h);
    const push = Math.sin(Math.PI * e) * span * 0.42;
    const face = (ph: PhotoGeom, angle: number) => {
      const d = (axis === "y" ? ph.w : ph.h) / 2;
      const R = axis === "y" ? rotateY(angle) : rotateX(angle);
      return full(ph, chain(translate(0, 0, d + push), R, translate(0, 0, -d)));
    };
    const a = axis === "y" ? tr.dir * 90 * DEG * e : -tr.dir * 90 * DEG * e;
    const b = axis === "y" ? a - tr.dir * 90 * DEG : a + tr.dir * 90 * DEG;
    return byDepth([face(A, a), face(B, b)]);
  };

// A card turning over: A on its front, B on its back, lifted back while it turns.
const flip =
  (axis: "y" | "x"): EffectFn =>
  (A, B, p, tr) => {
    const e = ease.inOutCubic(p);
    const angle = tr.dir * Math.PI * e;
    const push = Math.sin(Math.PI * e) * Math.max(A.w, B.w) * 0.55;
    const roll = tr.dir * Math.sin(Math.PI * e) * 6 * DEG;
    const R = (a: number) => (axis === "y" ? rotateY(a) : rotateX(a));
    const lift = chain(translate(0, 0, push), rotateZ(roll));
    if (Math.abs(angle) < Math.PI / 2) return keep([full(A, chain(lift, R(angle)))]);
    return keep([full(B, chain(lift, R(angle - tr.dir * Math.PI)))]);
  };

// A swings open toward the viewer on a hinge at one side, and B comes forward from behind it.
const door: EffectFn = (A, B, p, tr) => {
  const angle = tr.dir * 76 * DEG * ease.inOutSine(p);
  const opened = full(A, about([-tr.dir * (A.w / 2), 0, 0], rotateY(angle)), {
    alpha: 1 - smoothstep(0.45, 0.85, p),
    shadow: REST_SHADOW * (1 - p),
  });
  return keep([emergeB(B, p), opened]);
};

// A opens as two doors (left and right, or up and down), B comes forward behind them.
const doors: EffectFn = (A, B, p, tr) => {
  const angle = 82 * DEG * ease.inOutSine(p);
  const look = { alpha: 1 - smoothstep(0.55, 0.95, p) };
  const halves =
    tr.dir === 1
      ? [
          piece(A, [0, 0, 0.5, 1], about([-A.w / 4, 0, 0], rotateY(angle)), look),
          piece(A, [0.5, 0, 1, 1], about([A.w / 4, 0, 0], rotateY(-angle)), look),
        ]
      : [
          piece(A, [0, 0, 1, 0.5], about([0, -A.h / 4, 0], rotateX(-angle)), look),
          piece(A, [0, 0.5, 1, 1], about([0, A.h / 4, 0], rotateX(angle)), look),
        ];
  return keep([emergeB(B, p), shadowOf(A, REST_SHADOW * (1 - smoothstep(0, 0.3, p))), ...halves]);
};

// A page of a book turning over: A's half lifts on the spine and lands as B's other half.
// dir 1 turns from right to left, -1 from left to right (a Hebrew book).
const page: EffectFn = (A, B, p, tr) => {
  const e = ease.inOutCubic(p);
  const angle = Math.PI * e;
  const s = Math.sin(Math.PI * e);
  // The whole book leans back a little while the page is up.
  const book = chain(translate(0, 0, 0.1 * Math.max(A.w, B.w) * s), rotateX(-9 * DEG * s));
  const r = tr.dir === 1;
  const left: [number, number, number, number] = [0, 0, 0.5, 1];
  const right: [number, number, number, number] = [0.5, 0, 1, 1];
  // Under the page: A's half that stays (shaded as the page comes down on it), and B's half that's
  // uncovered (shaded while the page still hangs over it).
  const aStays = piece(A, r ? left : right, IDENTITY, { dim: 0.45 * smoothstep(0.5, 1, e), alpha: 1 - smoothstep(0.85, 1, p) }, book);
  const bShows = piece(B, r ? right : left, IDENTITY, { dim: 0.55 * (1 - smoothstep(0, 0.6, e)), alpha: smoothstep(0, 0.15, p) }, book);
  let turning: PlaneOp | null;
  if (angle < Math.PI / 2) {
    turning = r
      ? piece(A, right, about([-A.w / 4, 0, 0], rotateY(angle)), {}, book)
      : piece(A, left, about([A.w / 4, 0, 0], rotateY(-angle)), {}, book);
  } else {
    turning = r
      ? piece(B, left, about([B.w / 4, 0, 0], rotateY(angle - Math.PI)), {}, book)
      : piece(B, right, about([-B.w / 4, 0, 0], rotateY(Math.PI - angle)), {}, book);
  }
  const shadow = shadowOf(A, REST_SHADOW * (1 - smoothstep(0, 0.2, p)));
  const shadowB = shadowOf(B, REST_SHADOW * smoothstep(0.8, 1, p));
  return keep([shadow, shadowB, aStays, bShows, turning]);
};

// The photos on a turning ring: A goes around to the side and back, B comes around from the other.
const carousel: EffectFn = (A, B, p, tr) => {
  const e = ease.inOutCubic(p);
  const w = (A.w + B.w) / 2;
  const step = 48 * DEG;
  const R = (1.08 * w) / (2 * Math.sin(step / 2));
  const push = Math.sin(Math.PI * e) * w * 0.35;
  const at = (ph: PhotoGeom, beta: number, look: Look) => full(ph, chain(translate(0, 0, push), about([0, 0, R], rotateY(beta))), look);
  return byDepth([
    at(A, tr.dir * step * e, { alpha: 1 - smoothstep(0.75, 1, p), dim: 0.3 * e }),
    at(B, -tr.dir * step * (1 - e), { alpha: smoothstep(0, 0.25, p), dim: 0.3 * (1 - e) }),
  ]);
};

// Cover Flow: A slides to the side turning away, B slides in from the other side turning to face.
const coverflow: EffectFn = (A, B, p, tr, cam) => {
  const e = ease.inOutCubic(p);
  const side = (ph: PhotoGeom, k: number, sign: number, look: Look) =>
    full(ph, chain(translate(sign * 0.58 * cam.W * k, 0, 0.45 * ph.w * k), rotateY(-sign * 58 * DEG * smoothstep(0, 0.7, k))), {
      ...look,
      dim: 0.35 * k,
    });
  return byDepth([
    side(A, e, -tr.dir, { alpha: 1 - smoothstep(0.75, 1, p) }),
    side(B, 1 - e, tr.dir, { alpha: smoothstep(0, 0.25, p) }),
  ]);
};

// A flies at the camera and through it, B arrives from far away, both turning a little. A is gone
// in the first part, so the two hardly overlap.
const zoomThrough: EffectFn = (A, B, p, tr, cam) => {
  const eA = ease.inCubic(clamp01(p / 0.7));
  const eB = ease.outCubic(clamp01((p - 0.08) / 0.92));
  const zA = -0.8 * cam.P * eA;
  const alphaA = 1 - smoothstep(0.3, 0.62, p);
  const spinA = rotateZ(tr.dir * 14 * DEG * eA);
  const out: (PlaneOp | null)[] = [
    full(B, chain(translate(0, 0, 2.2 * cam.P * (1 - eB)), rotateZ(-tr.dir * 14 * DEG * (1 - eB))), {
      alpha: smoothstep(0.05, 0.5, p),
      dim: 0.4 * (1 - eB),
      shadow: REST_SHADOW * eB,
    }),
    full(A, chain(translate(0, 0, zA), spinA), { alpha: alphaA, shadow: REST_SHADOW * (1 - p) }),
  ];
  // Motion blur: faint copies just ahead of it, close together so they read as a streak.
  if (eA > 0.02) {
    for (let g = 1; g <= 5; g++) {
      out.push(full(A, chain(translate(0, 0, zA - g * 0.018 * cam.P * eA), spinA), { alpha: alphaA * 0.11, shadow: 0 }));
    }
  }
  return keep(out);
};

// A grid of tiles turning over in a wave, A on their fronts and B on their backs.
const tiles: EffectFn = (A, B, p, tr) => {
  const aspect = A.w / A.h;
  const cols = Math.max(3, Math.min(8, Math.round(Math.sqrt(24 * aspect))));
  const rows = Math.max(3, Math.min(8, Math.round(24 / cols)));
  const shadows = [shadowOf(A, REST_SHADOW * (1 - smoothstep(0, 0.3, p))), shadowOf(B, REST_SHADOW * smoothstep(0.7, 1, p))];
  const out: (PlaneOp | null)[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = tr.dir === 1 ? c : cols - 1 - c;
      const order = (col + r) / (cols + rows - 2);
      const q = clamp01((p - order * 0.45) / 0.55);
      const qe = ease.inOutCubic(q);
      const pop = Math.sin(Math.PI * qe);
      const box: [number, number, number, number] = [c / cols, r / rows, (c + 1) / cols, (r + 1) / rows];
      // Each tile lifts toward the viewer and shrinks a little while it turns, so it clears its
      // neighbours.
      const lift = (ph: PhotoGeom) => chain(translate(0, 0, -pop * (ph.w / cols) * 0.45), scale(1 - 0.16 * pop));
      out.push(
        qe < 0.5
          ? piece(A, box, chain(lift(A), rotateY(tr.dir * Math.PI * qe)))
          : piece(B, box, chain(lift(B), rotateY(tr.dir * Math.PI * (qe - 1)))),
      );
    }
  }
  return keep([...shadows, ...byDepth(out)]);
};

// Venetian blinds: the slats turn over almost together, top to bottom (or bottom to top), A on
// one side of them and B on the other.
const blinds: EffectFn = (A, B, p, tr) => {
  const n = A.w >= A.h ? 8 : 11;
  const shadows = [shadowOf(A, REST_SHADOW * (1 - smoothstep(0, 0.3, p))), shadowOf(B, REST_SHADOW * smoothstep(0.7, 1, p))];
  const out: (PlaneOp | null)[] = [];
  for (let i = 0; i < n; i++) {
    const order = tr.dir === 1 ? i / (n - 1) : (n - 1 - i) / (n - 1);
    const q = clamp01((p - order * 0.3) / 0.7);
    const qe = ease.inOutCubic(q);
    const pop = Math.sin(Math.PI * qe);
    const box: [number, number, number, number] = [0, i / n, 1, (i + 1) / n];
    const lift = (ph: PhotoGeom) => chain(translate(0, 0, -pop * (ph.h / n) * 0.5), scale(1, 1 - 0.12 * pop, 1));
    out.push(
      qe < 0.5
        ? piece(A, box, chain(lift(A), rotateX(-Math.PI * qe)))
        : piece(B, box, chain(lift(B), rotateX(Math.PI * (1 - qe)))),
    );
  }
  return keep([...shadows, ...byDepth(out)]);
};

// A tips over toward the viewer on its bottom edge and drops out of the frame, like a card falling
// flat; B comes forward out of the depth behind it.
const fallAway: EffectFn = (A, B, p, tr, cam) => {
  const eA = ease.inQuad(p);
  return keep([
    emergeB(B, p, 0.55),
    full(A, chain(translate(0, 0.45 * cam.H * eA, 0), rotateZ(tr.dir * 7 * DEG * eA), about([0, A.h / 2, 0], rotateX(78 * DEG * eA))), {
      alpha: 1 - smoothstep(0.6, 0.92, p),
      shadow: REST_SHADOW * (1 - p),
    }),
  ]);
};

// B swings down from a hinge at its top (or up from the bottom) with a little bounce, A sinks back.
const swingIn: EffectFn = (A, B, p, tr) => {
  const angle = 80 * DEG * (1 - ease.outBack(p, 1.3));
  return keep([
    full(A, translate(0, 0, 0.35 * A.w * ease.inOutSine(p)), {
      dim: 0.5 * p,
      alpha: 1 - smoothstep(0.35, 0.85, p),
      shadow: REST_SHADOW * (1 - p),
    }),
    full(B, about([0, -tr.dir * (B.h / 2), 0], rotateX(tr.dir * angle)), {
      alpha: smoothstep(0, 0.2, p),
      shadow: REST_SHADOW * smoothstep(0.5, 1, p),
    }),
  ]);
};

// A breaks into shards that fly out at the camera, spinning; B comes forward behind them.
const shatter: EffectFn = (A, B, p, tr, cam) => {
  const random = seededRandom(tr.seed);
  const landscape = A.w >= A.h;
  const cols = landscape ? 5 : 3;
  const rows = landscape ? 3 : 5;
  const out: (PlaneOp | null)[] = [emergeB(B, p, 0.45), shadowOf(A, REST_SHADOW * (1 - smoothstep(0, 0.2, p)))];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fx = (c + 0.5) / cols - 0.5;
      const fy = (r + 0.5) / rows - 0.5;
      const order = tr.dir === 1 ? Math.min(1, Math.hypot(fx, fy) / 0.62) : c / (cols - 1);
      const jitter = random();
      const spinY = (random() < 0.5 ? -1 : 1) * (100 + 80 * random());
      const spinX = (random() - 0.5) * 120;
      const spinZ = (random() - 0.5) * 90;
      const driftX = (random() - 0.5) * 0.25;
      const driftY = (random() - 0.35) * 0.4;
      const q = clamp01((p - (order * 0.32 + jitter * 0.08)) / 0.55);
      const qe = ease.inQuad(q);
      const T = chain(
        translate((fx * 1.2 + driftX) * A.w * qe, (fy * 1.2 + driftY) * A.h * qe, -0.55 * cam.P * qe),
        rotateY(spinY * DEG * qe),
        rotateX(spinX * DEG * qe),
        rotateZ(spinZ * DEG * qe),
      );
      out.push(piece(A, [c / cols, r / rows, (c + 1) / cols, (r + 1) / rows], T, { alpha: 1 - smoothstep(0.45, 1, q) }));
    }
  }
  const [b, s, ...shards] = out;
  return keep([b, s, ...byDepth(shards)]);
};

export const EFFECTS: Record<TransitionId, EffectFn> = {
  cube: cube("y"),
  "cube-vertical": cube("x"),
  flip: flip("y"),
  "flip-vertical": flip("x"),
  door,
  doors,
  page,
  carousel,
  coverflow,
  "zoom-through": zoomThrough,
  tiles,
  blinds,
  "fall-away": fallAway,
  "swing-in": swingIn,
  shatter,
};

// The slideshow's opening: the first photo rises out of the depth.
export function introOps(B: PhotoGeom, p: number): PlaneOp[] {
  const k = ease.outCubic(p);
  return keep([
    full(B, chain(translate(0, 0, 0.6 * B.w * (1 - k)), rotateX(16 * DEG * (1 - k))), {
      alpha: smoothstep(0, 0.55, p),
      shadow: REST_SHADOW * k,
    }),
  ]);
}

// The photo while it's on: whole, in its drift.
export function holdOps(B: PhotoGeom): PlaneOp[] {
  return keep([full(B)]);
}
