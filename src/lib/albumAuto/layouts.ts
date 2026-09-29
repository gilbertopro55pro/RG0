import type { AlbumElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "@/lib/types";
import { textHeightPctForFontSize } from "@/lib/albumTextSizing";
import type { AutoStyleId, CoverInput, LayoutInput, LayoutOutput, LayoutPhoto } from "./types";

// The layout engine of the auto album designer (see types.ts for the contract). Pure and
// deterministic: the same input always gives the same spread; variety between consecutive spreads
// comes from a seeded hash of spreadIndex + the photo ids, never Math.random.
//
// Everything is computed in real centimetres (so aspect ratios are true) and converted to percent
// of the whole spread only when the elements are built.
//
// Composition (owner's rules, 2026-09-29, the same for every style — see composeSpread): one
// dominant hero photo bleeding to the page edges (a half page, a faded ~60-80% of the spread, or with
// many photos a band across its page) plus ONE tight, centred block of the other photos per page,
// at least 70% of the canvas covered by photos. Blocks are justified rows or, for a few photos, the
// best guillotine ("slicing tree") arrangement. The styles differ in their preferences and finish:
// clean = straight blocks; catalog = strict justified grid, plain half-page hero; scribble = small
// tilts and tape; modern = bolder faded hero, thin accent lines in existing whitespace.
//
// Hebrew albums open right to left, so on a double page the first photos (reading order) go on the
// right-hand page.
//
// Finishing pass, applied to every style in finalizeSpread(): every framed photo gets a 3px white
// outline and a 35% shadow, bleeding photos get neither; every photo's crop (focalX/focalY) is placed
// from its face boxes so no head is cut (bleeding photos also keep faces off the fold, out of the
// fade and from under the block).

type P = { id: string; aspect: number };
type Rect = { x: number; y: number; w: number; h: number };
type Placed = { idx: number; r: Rect };
type Align = "start" | "center" | "end";

// A frame's aspect may differ from its photo's by at most this factor in the packer (the photo is
// cropped to fill the frame; 1.2 keeps ~83% of the picture).
const MAX_STRETCH = 1.2;

// ---------------------------------------------------------------------------------------------
// Seeded pseudo-randomness
// ---------------------------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

type Geo = { W: number; H: number; double: boolean; pageW: number };

function geoFor(widthCm: number, heightCm: number): Geo {
  const W = widthCm > 0 ? widthCm : 60;
  const H = heightCm > 0 ? heightCm : 30;
  const double = W / H >= 1.6;
  return { W, H, double, pageW: double ? W / 2 : W };
}

// Page 0 = left, page 1 = right (double page). For a single page there's only page 0.
// Margins in cm: `outer` from the page's outer edge, `fold` from the fold, top/bottom.
function pageRegion(geo: Geo, page: number, outer: number, fold: number, top: number, bottom: number): Rect {
  const o = Math.max(outer, 0.04 * geo.W);
  const t = Math.max(top, 0.04 * geo.H);
  const b = Math.max(bottom, 0.04 * geo.H);
  if (!geo.double) return { x: o, y: t, w: geo.W - 2 * o, h: geo.H - t - b };
  const f = Math.max(fold, 0.03 * geo.W);
  if (page === 0) return { x: o, y: t, w: geo.pageW - o - f, h: geo.H - t - b };
  return { x: geo.pageW + f, y: t, w: geo.pageW - f - o, h: geo.H - t - b };
}

function area(r: Rect): number {
  return r.w * r.h;
}

function inset(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: Math.max(0.1, r.w - 2 * dx), h: Math.max(0.1, r.h - 2 * dy) };
}

function scaleRect(r: Rect, f: number, cx: number, cy: number): Rect {
  return { x: cx + (r.x - cx) * f, y: cy + (r.y - cy) * f, w: r.w * f, h: r.h * f };
}

function boundsOf(rs: Rect[]): Rect {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function alignOffset(space: number, used: number, a: Align): number {
  if (a === "start") return 0;
  if (a === "end") return space - used;
  return (space - used) / 2;
}

// Fits one photo into a region at its own aspect (optionally stretched up to MAX_STRETCH toward the
// region's shape) and aligns it.
function fitOne(aspect: number, region: Rect, ax: Align = "center", ay: Align = "center", maxStretch = MAX_STRETCH): Rect {
  const regionAspect = region.w / region.h;
  const target = Math.min(aspect * maxStretch, Math.max(aspect / maxStretch, regionAspect));
  let w = region.w;
  let h = w / target;
  if (h > region.h) {
    h = region.h;
    w = h * target;
  }
  return { x: region.x + alignOffset(region.w, w, ax), y: region.y + alignOffset(region.h, h, ay), w, h };
}

// ---------------------------------------------------------------------------------------------
// Slicing-tree packer
// ---------------------------------------------------------------------------------------------

// A node lays out its children side by side ("h", equal heights) or stacked ("v", equal widths).
type Node = { leaf: number } | { dir: "h" | "v"; kids: Node[] };

const treeCache = new Map<string, Node[]>();

// All slicing trees over positions [i..j] whose root cuts in `dir` (a single position is a leaf).
function treesFor(i: number, j: number, dir: "h" | "v"): Node[] {
  if (i === j) return [{ leaf: i }];
  const key = `${i}-${j}-${dir}`;
  const cached = treeCache.get(key);
  if (cached) return cached;
  const other = dir === "h" ? "v" : "h";
  const out: Node[] = [];
  // Every composition of [i..j] into >= 2 consecutive parts.
  const rec = (start: number, acc: Node[][]) => {
    if (start > j) {
      if (acc.length < 2) return;
      let combos: Node[][] = [[]];
      for (const opts of acc) {
        const next: Node[][] = [];
        for (const c of combos) for (const o of opts) next.push([...c, o]);
        combos = next;
      }
      for (const kids of combos) out.push({ dir, kids });
      return;
    }
    for (let end = start; end <= j; end++) {
      if (start === i && end === j) continue; // at least two parts
      acc.push(treesFor(start, end, other));
      rec(end + 1, acc);
      acc.pop();
    }
  };
  rec(i, []);
  treeCache.set(key, out);
  return out;
}

function allTrees(n: number): Node[] {
  if (n === 1) return [{ leaf: 0 }];
  return [...treesFor(0, n - 1, "h"), ...treesFor(0, n - 1, "v")];
}

// Every node's width is linear in its height: w = alpha * h + beta (beta carries the gaps).
function coef(node: Node, asp: number[], s: number, g: number): [number, number] {
  if ("leaf" in node) return [asp[node.leaf] * s, 0];
  const cs = node.kids.map((k) => coef(k, asp, s, g));
  const k = cs.length;
  if (node.dir === "h") {
    let a = 0;
    let b = g * (k - 1);
    for (const [ca, cb] of cs) {
      a += ca;
      b += cb;
    }
    return [a, b];
  }
  let inv = 0;
  let sb = 0;
  for (const [ca, cb] of cs) {
    inv += 1 / ca;
    sb += cb / ca;
  }
  const a = 1 / inv;
  return [a, a * (sb - g * (k - 1))];
}

function layoutNode(node: Node, asp: number[], s: number, g: number, r: Rect, out: { pos: number; r: Rect }[]) {
  if ("leaf" in node) {
    out.push({ pos: node.leaf, r });
    return;
  }
  const cs = node.kids.map((k) => coef(k, asp, s, g));
  if (node.dir === "h") {
    let x = r.x;
    node.kids.forEach((kid, i) => {
      const w = cs[i][0] * r.h + cs[i][1];
      layoutNode(kid, asp, s, g, { x, y: r.y, w, h: r.h }, out);
      x += w + g;
    });
  } else {
    let y = r.y;
    node.kids.forEach((kid, i) => {
      const h = (r.w - cs[i][1]) / cs[i][0];
      layoutNode(kid, asp, s, g, { x: r.x, y, w: r.w, h }, out);
      y += h + g;
    });
  }
}

function permutations(arr: number[]): number[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: number[][] = [];
  arr.forEach((v, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([v, ...p]);
  });
  return out;
}

function inversions(order: number[]): number {
  let c = 0;
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (order[i] > order[j]) c++;
  return c;
}

type PackOpts = {
  heroIdx?: number; // must end up clearly the largest frame
  alignX?: Align;
  alignY?: Align;
  permute?: boolean; // allow reordering (small pages only)
  maxStretch?: number;
  rng?: () => number; // pick among near-best arrangements for variety
  preferEqual?: number; // weight of the "similar sizes" preference (default 1)
  cropWeight?: number; // how much cropping costs against filling the region (default 0.9)
};

type PackResult = { placed: Placed[]; used: Rect; score: number };

// Lays out `idxs` (indices into `photos`) inside `region` with gap `g` (cm).
function pack(photos: P[], idxs: number[], region: Rect, g: number, opts: PackOpts = {}): PackResult | null {
  const n = idxs.length;
  if (n === 0) return null;
  const maxS = opts.maxStretch ?? MAX_STRETCH;
  const trees = allTrees(n);
  const orders: number[][] = [];
  if (opts.permute && n <= 4) orders.push(...permutations(idxs));
  else {
    orders.push(idxs.slice());
    // Grouping by orientation often packs much better.
    const land = idxs.filter((i) => photos[i].aspect >= 1);
    const port = idxs.filter((i) => photos[i].aspect < 1);
    // (Skipped for 7+ photos, where the tree count alone is in the tens of thousands.)
    if (land.length && port.length && n <= 6) {
      orders.push([...land, ...port]);
      orders.push([...port, ...land]);
    }
  }
  const maxInv = (n * (n - 1)) / 2 || 1;
  const regionArea = area(region);
  const cands: { score: number; order: number[]; tree: Node; s: number; w: number; h: number }[] = [];

  for (const order of orders) {
    const asp = order.map((i) => photos[i].aspect);
    const orderPen = (inversions(order.map((i) => idxs.indexOf(i))) / maxInv) * 0.06;
    for (const tree of trees) {
      // Stretch that makes the arrangement's shape match the region exactly, clamped to the limit.
      const widthAt = (s: number) => {
        const [a, b] = coef(tree, asp, s, g);
        return a * region.h + b;
      };
      let lo = Math.log(1 / maxS);
      let hi = Math.log(maxS);
      let s: number;
      if (widthAt(Math.exp(lo)) >= region.w) s = Math.exp(lo);
      else if (widthAt(Math.exp(hi)) <= region.w) s = Math.exp(hi);
      else {
        for (let it = 0; it < 22; it++) {
          const mid = (lo + hi) / 2;
          if (widthAt(Math.exp(mid)) > region.w) hi = mid;
          else lo = mid;
        }
        s = Math.exp((lo + hi) / 2);
      }
      const evalAt = (sv: number) => {
        const [a, b] = coef(tree, asp, sv, g);
        let h = Math.min(region.h, (region.w - b) / a);
        let w = a * h + b;
        if (w > region.w + 1e-6) {
          w = region.w;
          h = (w - b) / a;
        }
        if (!(h > 0) || !(w > 0)) return null;
        const out: { pos: number; r: Rect }[] = [];
        layoutNode(tree, asp, sv, g, { x: 0, y: 0, w, h }, out);
        let minSide = Infinity;
        let maxA = 0;
        let minA = Infinity;
        let heroA = 0;
        let otherMax = 0;
        let otherMin = Infinity;
        let photoArea = 0;
        for (const o of out) {
          const aR = area(o.r);
          photoArea += aR;
          minSide = Math.min(minSide, o.r.w, o.r.h);
          maxA = Math.max(maxA, aR);
          minA = Math.min(minA, aR);
          if (order[o.pos] === opts.heroIdx) heroA = aR;
          else {
            otherMax = Math.max(otherMax, aR);
            otherMin = Math.min(otherMin, aR);
          }
        }
        if (minSide <= 0) return null;
        const fill = photoArea / regionArea;
        let score = fill - Math.abs(Math.log(sv)) * (opts.cropWeight ?? 0.9) - orderPen;
        const eqW = opts.preferEqual ?? 1;
        if (opts.heroIdx !== undefined && idxs.includes(opts.heroIdx) && n > 1) {
          if (heroA < otherMax * 1.3) score -= 1 + (otherMax * 1.3 - heroA) / regionArea; // last resort
          const ratio = otherMin / otherMax;
          score -= Math.max(0, 0.5 - ratio) * 0.8 * eqW;
          score += Math.min(0.08, (heroA / otherMax - 1.3) * 0.04);
        } else if (n > 1) {
          const ratio = minA / maxA;
          score -= Math.max(0, 0.5 - ratio) * 1.2 * eqW;
        }
        const minRel = minSide / Math.min(region.w, region.h);
        if (minRel < 0.22) score -= (0.22 - minRel) * 5;
        return { score, w, h };
      };
      const e1 = evalAt(s);
      const e2 = Math.abs(Math.log(s)) > 1e-3 ? evalAt(1) : null;
      const best = e2 && (!e1 || e2.score > e1.score) ? { ...e2, s: 1 } : e1 ? { ...e1, s } : null;
      if (best) cands.push({ score: best.score, order, tree, s: best.s, w: best.w, h: best.h });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  let pick = cands[0];
  if (opts.rng) {
    const near = cands.filter((c) => c.score >= cands[0].score - 0.025).slice(0, 6);
    pick = near[Math.floor(opts.rng() * near.length) % near.length];
  }
  const asp = pick.order.map((i) => photos[i].aspect);
  const out: { pos: number; r: Rect }[] = [];
  const ox = region.x + alignOffset(region.w, pick.w, opts.alignX ?? "center");
  const oy = region.y + alignOffset(region.h, pick.h, opts.alignY ?? "center");
  layoutNode(pick.tree, asp, pick.s, g, { x: ox, y: oy, w: pick.w, h: pick.h }, out);
  return {
    placed: out.map((o) => ({ idx: pick.order[o.pos], r: o.r })),
    used: { x: ox, y: oy, w: pick.w, h: pick.h },
    score: pick.score,
  };
}

// ---------------------------------------------------------------------------------------------
// Face-aware crop
// ---------------------------------------------------------------------------------------------

type FaceBox = { x: number; y: number; width: number; height: number };
// A sub-area of the FRAME (0-1 fractions of its width/height) the faces must stay inside, e.g. the
// part of a faded photo that isn't faded or covered by other photos.
export type FaceZone = { x0: number; x1: number; y0: number; y1: number };

function validFaces(p: LayoutPhoto | undefined): FaceBox[] {
  return (p?.faces ?? []).filter(
    (f) =>
      [f.x, f.y, f.width, f.height].every(Number.isFinite) && f.width > 0 && f.height > 0 && f.x < 1 && f.y < 1 && f.x + f.width > 0 && f.y + f.height > 0
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Where the heads are assumed to be when face detection didn't run: the upper middle of the photo.
const ASSUMED_FACES: FaceBox = { x: 0.35, y: 0.15, width: 0.3, height: 0.3 };

// Picks focalX/focalY (0-100, zoom 100) for a photo of `photoAspect` shown cover-fit in a frame of
// `frameAspect` (real proportions, cm), matching computePhotoFraming in lib/albumRender.ts: with
// v = the visible fraction of the photo along the cropped axis, the visible window starts at
// (1 - v) * focal / 100 (in photo fractions). The union of the face boxes (padded: ~25% of a face's
// height above the top face for hair, a little on the other sides) is kept fully visible — inside
// `zone` of the frame when given — centred horizontally and sitting in the upper-middle vertically.
// Unknown faces: the crop leans to the upper part of the photo. `fits` = the padded faces are
// entirely inside the zone (always true when faces are unknown). pad = false checks the bare face boxes.
export function faceCropFocal(
  photoAspect: number,
  frameAspect: number,
  faces?: FaceBox[] | null,
  zone?: Partial<FaceZone>,
  pad = true
): { focalX: number; focalY: number; zoom: number; fits: boolean } {
  const z: FaceZone = { x0: 0, x1: 1, y0: 0, y1: 1, ...zone };
  const pa = safeAspect(photoAspect);
  const fr = safeAspect(frameAspect);
  const vx = pa > fr ? fr / pa : 1;
  const vy = pa < fr ? pa / fr : 1;
  const list = (faces ?? []).filter((f) => f.width > 0 && f.height > 0);
  const known = list.length > 0;
  let ax: number, bx: number, ay: number, by: number;
  if (known) {
    const maxW = pad ? Math.max(...list.map((f) => f.width)) : 0;
    const maxH = pad ? Math.max(...list.map((f) => f.height)) : 0;
    ax = clamp(Math.min(...list.map((f) => f.x)) - 0.08 * maxW, 0, 1);
    bx = clamp(Math.max(...list.map((f) => f.x + f.width)) + 0.08 * maxW, 0, 1);
    ay = clamp(Math.min(...list.map((f) => f.y)) - 0.25 * maxH, 0, 1);
    by = clamp(Math.max(...list.map((f) => f.y + f.height)) + 0.08 * maxH, 0, 1);
  } else {
    ax = ASSUMED_FACES.x;
    bx = ASSUMED_FACES.x + ASSUMED_FACES.width;
    ay = ASSUMED_FACES.y;
    by = ASSUMED_FACES.y + ASSUMED_FACES.height;
  }
  // One axis: the window [s, s + v] (photo fractions) must hold [a, b] inside the zone [u0, u1] of the
  // frame, i.e. s + u0 * v <= a and b <= s + u1 * v.
  const axis = (v: number, a: number, b: number, u0: number, u1: number, want: number, fallback: number) => {
    const slack = 1 - v;
    if (slack < 1e-6) return { f: 50, ok: a >= u0 - 1e-6 && b <= u1 + 1e-6 };
    const lo = Math.max(0, b - u1 * v);
    const hi = Math.min(slack, a - u0 * v);
    const ok = lo <= hi + 1e-9;
    const s = ok ? clamp(want, lo, Math.max(lo, hi)) : clamp(fallback, 0, slack);
    return { f: Math.round((s / slack) * 1000) / 10, ok };
  };
  const wantX = (ax + bx) / 2 - (vx * (z.x0 + z.x1)) / 2;
  const hx = axis(vx, ax, bx, z.x0, z.x1, wantX, wantX);
  // Vertically: faces' centre at 40% of the zone; unknown faces: the window's centre at 40% of the
  // photo. When the faces can't all fit, keep their tops (a cut chin beats a cut forehead).
  const wantY = known ? (ay + by) / 2 - vy * (z.y0 + 0.4 * (z.y1 - z.y0)) : 0.4 - vy / 2;
  const hy = axis(vy, ay, by, z.y0, z.y1, wantY, ay - z.y0 * vy);
  return { focalX: hx.f, focalY: hy.f, zoom: 100, fits: !known || (hx.ok && hy.ok) };
}

// ---------------------------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------------------------

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function photoEl(id: string, photoId: string, r: Rect, geo: Geo, extra: Partial<AlbumPhotoElement> = {}): AlbumPhotoElement {
  return {
    id,
    type: "photo",
    photoId,
    xPct: r3((r.x / geo.W) * 100),
    yPct: r3((r.y / geo.H) * 100),
    widthPct: r3((r.w / geo.W) * 100),
    heightPct: r3((r.h / geo.H) * 100),
    focalX: 50,
    focalY: 50,
    ...extra,
  };
}

function shapeEl(id: string, r: Rect, geo: Geo, color: string, extra: Partial<AlbumShapeElement> = {}): AlbumShapeElement {
  return {
    id,
    type: "shape",
    xPct: r3((r.x / geo.W) * 100),
    yPct: r3((r.y / geo.H) * 100),
    widthPct: r3((r.w / geo.W) * 100),
    heightPct: r3((r.h / geo.H) * 100),
    color,
    ...extra,
  };
}

// A thin horizontal (or vertical) accent line, `len` cm long.
function lineEl(id: string, x: number, y: number, len: number, geo: Geo, color: string, vertical = false): AlbumShapeElement {
  const t = Math.max(0.06, geo.H * 0.004);
  const r = vertical ? { x: x - t / 2, y, w: t, h: len } : { x, y: y - t / 2, w: len, h: t };
  return shapeEl(id, r, geo, color, { shapeStyle: "line" });
}

type Ctx = {
  input: LayoutInput;
  geo: Geo;
  photos: P[];
  heroIdx: number | undefined;
  rng: () => number;
  prefix: string;
  faces: Map<string, FaceBox[]>;
  // Element ids that deliberately run to the page edges (no border/shadow, no safe-margin fitting).
  bleed: Set<string>;
  // Element ids whose focal point a layout already placed (with constraints the finishing pass
  // doesn't know about, e.g. "keep the faces out of the fade").
  fixedFocal: Set<string>;
  // Cluster layouts already computed for this spread (many candidates share them).
  cache: Map<string, Rel | null>;
};

function safeAspect(a: number): number {
  return a > 0.05 && Number.isFinite(a) ? a : 1.5;
}

function makeCtx(input: LayoutInput): Ctx {
  const photos = input.photos.map((p) => ({ id: p.id, aspect: safeAspect(p.aspect) }));
  const hi = input.heroId ? photos.findIndex((p) => p.id === input.heroId) : -1;
  const seed = hashString(`${input.style}|${input.spreadIndex}|${photos.map((p) => p.id).join(",")}`);
  return {
    input,
    geo: geoFor(input.widthCm, input.heightCm),
    photos,
    heroIdx: hi >= 0 ? hi : undefined,
    rng: makeRng(seed),
    prefix: `auto-${input.spreadIndex}`,
    faces: new Map(input.photos.map((p) => [p.id, validFaces(p)])),
    bleed: new Set(),
    fixedFocal: new Set(),
    cache: new Map(),
  };
}

function placedToEls(ctx: Ctx, placed: Placed[], extra: (p: Placed, i: number) => Partial<AlbumPhotoElement> = () => ({})): AlbumPhotoElement[] {
  // Keep reading order in the element list (stable z-order, predictable ids).
  const sorted = placed.slice().sort((a, b) => a.idx - b.idx);
  return sorted.map((p, i) => photoEl(`${ctx.prefix}-${i}`, ctx.photos[p.idx].id, p.r, ctx.geo, extra(p, i)));
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

// Reading-order pages of a double spread: right page first.
const FIRST = 1;
const SECOND = 0;

// ---------------------------------------------------------------------------------------------
// Scribble helpers
// ---------------------------------------------------------------------------------------------

type Tilted = Placed & { rot: number };

function rotatedHalfExtents(r: Rect, deg: number): [number, number] {
  const t = (Math.abs(deg) * Math.PI) / 180;
  return [(r.w * Math.cos(t) + r.h * Math.sin(t)) / 2, (r.w * Math.sin(t) + r.h * Math.cos(t)) / 2];
}

// Tape strips across one or two top corners of some of the (tilted) frames.
function tapeEls(ctx: Ctx, frames: Tilted[], phase: number, n: number): AlbumShapeElement[] {
  const { geo } = ctx;
  const H = geo.H;
  const out: AlbumShapeElement[] = [];
  let tapeN = 0;
  frames.forEach((t, i) => {
    if ((i + phase) % 2 === 1 && n > 1) return;
    const corners = n <= 2 ? [-1, 1] : [i % 2 === 0 ? -1 : 1];
    for (const side of corners) {
      const tw = Math.min(0.13 * H, t.r.w * 0.36);
      const th = tw * 0.3;
      const rad = (t.rot * Math.PI) / 180;
      // Corner position (top-left / top-right) of the rotated frame, pulled slightly inward.
      const lx = side * (t.r.w / 2 - tw * 0.18);
      const ly = -(t.r.h / 2 - th * 0.15);
      const cx = t.r.x + t.r.w / 2 + lx * Math.cos(rad) - ly * Math.sin(rad);
      const cy = t.r.y + t.r.h / 2 + lx * Math.sin(rad) + ly * Math.cos(rad);
      const rect = { x: cx - tw / 2, y: cy - th / 2, w: tw, h: th };
      if (rect.x < 0.01 * geo.W || rect.y < 0.01 * H || rect.x + rect.w > geo.W * 0.99 || rect.y + rect.h > H * 0.99) continue;
      out.push(
        shapeEl(`${ctx.prefix}-tape-${tapeN++}`, rect, geo, "#e8dcc4", {
          rotation: Math.round((t.rot + side * -38) * 10) / 10,
          opacity: 72,
        })
      );
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Clusters: the non-hero photos of a page, packed into one tight block
// ---------------------------------------------------------------------------------------------

// A cluster laid out at the origin: rects relative to (0,0), its size, and a quality score.
type Rel = { rects: Placed[]; w: number; h: number; score: number };

// Fill of the box, minus crop and "one photo far smaller than the rest".
function rateRel(photos: P[], rects: Placed[], bw: number, bh: number): number {
  let a = 0;
  let mn = Infinity;
  let mx = 0;
  let crop = 0;
  for (const p of rects) {
    const ar = area(p.r);
    a += ar;
    mn = Math.min(mn, ar);
    mx = Math.max(mx, ar);
    crop += Math.abs(Math.log(p.r.w / p.r.h / photos[p.idx].aspect));
  }
  return a / (bw * bh) - (0.7 * crop) / rects.length - 0.6 * Math.max(0, 0.3 - mn / mx);
}

// Rows of consecutive photos whose aspect sums are as equal as possible (equal-height rows then
// have equal natural widths).
function balancedRows(photos: P[], idxs: number[], r: number): number[][] {
  const k = idxs.length;
  const pre = [0];
  for (const i of idxs) pre.push(pre[pre.length - 1] + photos[i].aspect);
  const T = pre[k] / r;
  // dp[j][m] = best cost splitting the first m photos into j rows.
  const dp: number[][] = Array.from({ length: r + 1 }, () => Array(k + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: r + 1 }, () => Array(k + 1).fill(0));
  dp[0][0] = 0;
  for (let j = 1; j <= r; j++)
    for (let m = j; m <= k; m++)
      for (let s = j - 1; s < m; s++) {
        const c = dp[j - 1][s] + (pre[m] - pre[s] - T) ** 2;
        if (c < dp[j][m]) {
          dp[j][m] = c;
          cut[j][m] = s;
        }
      }
  const rows: number[][] = [];
  let m = k;
  for (let j = r; j >= 1; j--) {
    const s = cut[j][m];
    rows.unshift(idxs.slice(s, m));
    m = s;
  }
  return rows;
}

// Same, ignoring the reading order (largest aspect first into the lightest row).
function lptRows(photos: P[], idxs: number[], r: number): number[][] {
  const rows: number[][] = Array.from({ length: r }, () => []);
  const sums = Array(r).fill(0);
  for (const i of idxs.slice().sort((a, b) => photos[b].aspect - photos[a].aspect || a - b)) {
    let j = 0;
    for (let t = 1; t < r; t++) if (sums[t] < sums[j] - 1e-9) j = t;
    rows[j].push(i);
    sums[j] += photos[i].aspect;
  }
  for (const row of rows) row.sort((a, b) => a - b);
  return rows.filter((row) => row.length).sort((a, b) => a[0] - b[0]);
}

// Justified rows: one common row height, each row stretched (at most MAX_STRETCH, the photos
// cropped a little) to the box width. `strict` (catalog) punishes rows that can't reach the width.
function placeRows(photos: P[], rows: number[][], bw: number, bh: number, g: number, strict: boolean, k: number): Rel | null {
  const r = rows.length;
  const A = rows.map((row) => row.reduce((s, i) => s + photos[i].aspect, 0));
  let h = (bh - (r - 1) * g) / r;
  rows.forEach((row, i) => {
    h = Math.min(h, ((bw - g * (row.length - 1)) * MAX_STRETCH) / A[i]);
  });
  if (!(h > 0.3)) return null;
  const fit = rows.map((row, i) => {
    const s = clamp((bw - g * (row.length - 1)) / (h * A[i]), 1 / MAX_STRETCH, MAX_STRETCH);
    return { s, w: h * A[i] * s + g * (row.length - 1) };
  });
  const maxW = Math.max(...fit.map((f) => f.w));
  const rects: Placed[] = [];
  let y = 0;
  let ragged = 0;
  rows.forEach((row, i) => {
    let x = (maxW - fit[i].w) / 2;
    for (const idx of row) {
      const w = h * photos[idx].aspect * fit[i].s;
      rects.push({ idx, r: { x, y, w, h } });
      x += w + g;
    }
    y += h + g;
    if (fit[i].w < maxW * 0.97) ragged++;
  });
  const lonely = k >= 4 ? rows.filter((row) => row.length === 1).length : 0;
  const score = rateRel(photos, rects, bw, bh) - ragged * (strict ? 0.3 : 0.12) - lonely * 0.06;
  return { rects, w: maxW, h: r * h + (r - 1) * g, score };
}

type Alt = Rel & { fill: number };

function justifyAll(photos: P[], idxs: number[], bw: number, bh: number, g: number, strict: boolean): Alt[] {
  const k = idxs.length;
  const out: Alt[] = [];
  for (let r = 1; r <= Math.min(k, 8); r++) {
    const parts = [balancedRows(photos, idxs, r)];
    if (r > 1 && k > r) parts.push(lptRows(photos, idxs, r));
    for (const rows of parts) {
      const res = placeRows(photos, rows, bw, bh, g, strict, k);
      if (res) out.push({ ...res, fill: res.rects.reduce((s, p) => s + area(p.r), 0) / (bw * bh) });
    }
  }
  return out;
}

function justify(photos: P[], idxs: number[], bw: number, bh: number, g: number, strict: boolean): Rel | null {
  let best: Rel | null = null;
  for (const a of justifyAll(photos, idxs, bw, bh, g, strict)) if (!best || a.score > best.score) best = a;
  return best;
}

// The best block for `idxs` inside a bw x bh box: justified rows, or (few photos, not catalog) any
// guillotine arrangement (a column of portraits beside a bigger photo, a 2x2 grid...). `fill` picks
// the block covering the most of the box instead (used when the tidiest block misses the coverage).
function clusterIn(ctx: Ctx, idxs: number[], bw: number, bh: number, g: number, strict: boolean, fill = false): Rel | null {
  const key = `${idxs.join(",")}|${bw.toFixed(3)}|${bh.toFixed(3)}|${g.toFixed(3)}|${strict ? 1 : 0}|${fill ? 1 : 0}`;
  const hit = ctx.cache.get(key);
  if (hit !== undefined) return hit;
  const alts = justifyAll(ctx.photos, idxs, bw, bh, g, strict);
  if (!strict && idxs.length <= 5) {
    const res = pack(ctx.photos, idxs, { x: 0, y: 0, w: bw, h: bh }, g, { permute: idxs.length <= 4, preferEqual: 0.6, cropWeight: 1.2 });
    if (res) {
      const b = boundsOf(res.placed.map((p) => p.r));
      const rects = res.placed.map((p) => ({ idx: p.idx, r: { ...p.r, x: p.r.x - b.x, y: p.r.y - b.y } }));
      // (+0.01: on a tie the guillotine block, which aligns every edge, wins.)
      alts.push({ rects, w: b.w, h: b.h, score: rateRel(ctx.photos, rects, bw, bh) + 0.01, fill: rects.reduce((s, p) => s + area(p.r), 0) / (bw * bh) });
    }
  }
  let best: Alt | null = null;
  for (const a of alts) if (!best || (fill ? a.fill > best.fill + 1e-9 : a.score > best.score)) best = a;
  ctx.cache.set(key, best);
  return best;
}

// The largest box centred on `avail`'s centre that stays inside `region` (so a cluster laid out in
// it and centred is centred in its available space and respects the margins).
function centeredBox(avail: Rect, region: Rect): Rect | null {
  const cx = avail.x + avail.w / 2;
  const cy = avail.y + avail.h / 2;
  const hw = Math.min(cx - region.x, region.x + region.w - cx);
  const hh = Math.min(cy - region.y, region.y + region.h - cy);
  if (hw < 0.5 || hh < 0.5) return null;
  return { x: cx - hw, y: cy - hh, w: 2 * hw, h: 2 * hh };
}

// Union area of axis-aligned rects clipped to the canvas (coordinate compression; n is small).
function unionArea(rs: Rect[], W: number, H: number): number {
  const cl = rs
    .map((r) => ({ x0: clamp(r.x, 0, W), x1: clamp(r.x + r.w, 0, W), y0: clamp(r.y, 0, H), y1: clamp(r.y + r.h, 0, H) }))
    .filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  const xs = [...new Set(cl.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(cl.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  let s = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j + 1 < ys.length; j++) {
      const my = (ys[j] + ys[j + 1]) / 2;
      if (cl.some((r) => mx > r.x0 && mx < r.x1 && my > r.y0 && my < r.y1)) s += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Spread composition (all styles): one dominant hero + one tight cluster per page
// ---------------------------------------------------------------------------------------------
//
// Owner's rules (2026-09-29, after testing on a real event):
//   - one dominant hero that bleeds to the page edges (a half page, or ~60-75% of the spread with a
//     25% fade toward the other page), and the other photos in ONE tight block per page, centred
//     vertically in its half and balanced horizontally in the space it has — no scattered islands;
//   - at least 70% of the canvas is covered by photos (measured below; candidates under it lose);
//   - 2-20 photos per spread; with many photos the hero gets smaller (a band across its page) and
//     each page carries a justified-rows block.
// Every candidate composition ("template") is laid out, measured (coverage, the smallest photo, crop,
// how dominant the hero is) and scored; the style's preferences and a seeded jitter (variety between
// spreads) pick among those that pass.

type MaskId = "fade-right-25" | "fade-left-25";
type BleedSpec = { idx: number; r: Rect; mask?: MaskId; zone: Partial<FaceZone> };
type ClusterSpec = { idxs: number[]; avail: Rect; region: Rect };
type Kind = "fade" | "half" | "two" | "dense" | "band" | "side" | "sfade" | "inset";
type Spec = {
  kind: Kind;
  bleeds: BleedSpec[];
  clusters: ClusterSpec[];
  // Bleeds that depend on where the clusters landed (the faded hero reaches under the cluster).
  adjust?: (cbs: Rect[]) => BleedSpec[] | null;
  pen?: number;
};
type Frame = { idx: number; r: Rect; rot: number };
type Cand = {
  kind: Kind;
  bleeds: (BleedSpec & { focalX: number; focalY: number })[];
  frames: Frame[];
  clusters: { bounds: Rect; avail: Rect }[];
  coverage: number;
  score: number;
};

type StyleCfg = {
  gap: number; // fraction of the spread height
  strict: boolean; // catalog: strict justified grid
  tilt: boolean; // scribble
  fadeMin: number; // faded hero width, fraction of the spread width
  fadeMax: number;
  w: Record<Kind, number>;
};

const STYLE_CFG: Record<AutoStyleId, StyleCfg> = {
  clean: { gap: 0.022, strict: false, tilt: false, fadeMin: 0.6, fadeMax: 0.75, w: { fade: 1, half: 0.8, two: 0.78, dense: 0.85, band: 1, side: 0.92, sfade: 0.85, inset: 0.2 } },
  catalog: { gap: 0.02, strict: true, tilt: false, fadeMin: 0.6, fadeMax: 0.72, w: { fade: 0.45, half: 1, two: 0.25, dense: 0.9, band: 1, side: 0.9, sfade: 0.3, inset: 0.2 } },
  scribble: { gap: 0.034, strict: false, tilt: true, fadeMin: 0.6, fadeMax: 0.75, w: { fade: 0.95, half: 0.88, two: 0.72, dense: 0.85, band: 0.95, side: 0.92, sfade: 0.8, inset: 0.2 } },
  modern: { gap: 0.02, strict: false, tilt: false, fadeMin: 0.66, fadeMax: 0.8, w: { fade: 1.15, half: 0.65, two: 0.95, dense: 0.85, band: 0.9, side: 0.95, sfade: 1.05, inset: 0.2 } },
};

const MIN_COVERAGE = 0.7;
// A bleeding hero may be cropped more than a framed photo (it's the page's background), up to this;
// only when nothing else reaches the coverage, up to BLEED_CROP_MAX.
const BLEED_CROP = 1.5;
const BLEED_CROP_MAX = 1.85;

function cropOf(photoAspect: number, r: Rect): number {
  const fa = r.w / r.h;
  return Math.max(fa / photoAspect, photoAspect / fa);
}

// The hero when the planner didn't name one: the first comfortable landscape (it can bleed wide).
function pickHero(photos: P[]): number {
  let best = 0;
  let bs = -Infinity;
  photos.forEach((p, i) => {
    const s = (p.aspect >= 1.25 && p.aspect <= 1.9 ? 2 : p.aspect >= 1 ? 1 : 0) - i * 0.01;
    if (s > bs) {
      bs = s;
      best = i;
    }
  });
  return best;
}

// Small tilts for scribble (from the photo id, so a candidate's tilt doesn't depend on what was
// evaluated before it), then the block is shrunk about its centre until the tilted corners are
// back inside its region.
function tiltCluster(ctx: Ctx, frames: Frame[], region: Rect, cx: number, cy: number): Frame[] {
  const order = frames.slice().sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
  const sign0 = hashString(`${ctx.input.spreadIndex}|tilt`) % 2 === 0 ? 1 : -1;
  const out = order.map((f, k) => {
    const mag = 2 + ((hashString(`${ctx.photos[f.idx].id}|${ctx.input.spreadIndex}`) % 1000) / 1000) * 1.8;
    return { ...f, rot: Math.round((k % 2 === 0 ? sign0 : -sign0) * mag * 10) / 10 };
  });
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const f of out) {
    const [ex, ey] = rotatedHalfExtents(f.r, f.rot);
    const fx = f.r.x + f.r.w / 2;
    const fy = f.r.y + f.r.h / 2;
    x0 = Math.min(x0, fx - ex);
    x1 = Math.max(x1, fx + ex);
    y0 = Math.min(y0, fy - ey);
    y1 = Math.max(y1, fy + ey);
  }
  const s = Math.min(
    1,
    (region.x + region.w - cx) / Math.max(1e-6, x1 - cx),
    (cx - region.x) / Math.max(1e-6, cx - x0),
    (region.y + region.h - cy) / Math.max(1e-6, y1 - cy),
    (cy - region.y) / Math.max(1e-6, cy - y0)
  );
  if (s < 1) for (const f of out) f.r = scaleRect(f.r, s * 0.999, cx, cy);
  return out;
}

// Face-safe crop of a bleeding photo inside `zone`; unpadded faces as a last resort (penalised).
function bleedFocal(ctx: Ctx, idx: number, r: Rect, zone: Partial<FaceZone>): { focalX: number; focalY: number; pen: number } | null {
  const faces = ctx.faces.get(ctx.photos[idx].id) ?? [];
  const a = ctx.photos[idx].aspect;
  const c = faceCropFocal(a, r.w / r.h, faces, zone);
  if (c.fits) return { focalX: c.focalX, focalY: c.focalY, pen: 0 };
  const c2 = faceCropFocal(a, r.w / r.h, faces, zone, false);
  if (c2.fits) return { focalX: c2.focalX, focalY: c2.focalY, pen: 0.15 };
  return null;
}

function evaluate(ctx: Ctx, cfg: StyleCfg, spec: Spec, hero: number, bc: number, jitter: number, fillMode = false): Cand | null {
  const { geo, photos } = ctx;
  const { W, H } = geo;
  const g = cfg.gap * H;
  const frames: Frame[] = [];
  const clusters: { bounds: Rect; avail: Rect }[] = [];
  let fill = 0;
  for (const cl of spec.clusters) {
    if (!cl.idxs.length) continue;
    const box = centeredBox(cl.avail, cl.region);
    if (!box) return null;
    const rel = clusterIn(ctx, cl.idxs, box.w, box.h, g, cfg.strict, fillMode);
    if (!rel) return null;
    const ox = box.x + (box.w - rel.w) / 2;
    const oy = box.y + (box.h - rel.h) / 2;
    let fs: Frame[] = rel.rects.map((p) => ({ idx: p.idx, r: { x: p.r.x + ox, y: p.r.y + oy, w: p.r.w, h: p.r.h }, rot: 0 }));
    if (cfg.tilt) fs = tiltCluster(ctx, fs, cl.region, box.x + box.w / 2, box.y + box.h / 2);
    frames.push(...fs);
    clusters.push({ bounds: boundsOf(fs.map((f) => f.r)), avail: cl.avail });
    fill += rel.score / spec.clusters.length;
  }
  const bleedSpecs = spec.adjust ? spec.adjust(clusters.map((c) => c.bounds)) : spec.bleeds;
  if (!bleedSpecs) return null;
  let pen = (spec.pen ?? 0) + (fillMode ? 0.5 : 0);
  const bleeds: Cand["bleeds"] = [];
  for (const b of bleedSpecs) {
    if (cropOf(photos[b.idx].aspect, b.r) > bc + 1e-9) return null;
    const f = bleedFocal(ctx, b.idx, b.r, b.zone);
    if (!f) return null;
    pen += f.pen;
    bleeds.push({ ...b, focalX: f.focalX, focalY: f.focalY });
  }
  // The hero is clearly the biggest photo.
  const all = [...bleeds.map((b) => ({ idx: b.idx, r: b.r })), ...frames];
  const heroR = all.find((p) => p.idx === hero);
  if (!heroR) return null;
  const heroA = area(heroR.r);
  if (all.some((p) => p.idx !== hero && area(p.r) > heroA * 0.97)) return null;
  const coverage = unionArea(all.map((p) => p.r), W, H) / (W * H);
  const minArea = frames.length ? Math.min(...frames.map((f) => area(f.r))) : 0.05 * W * H;
  const crop = frames.length ? frames.reduce((s, f) => s + Math.log(cropOf(photos[f.idx].aspect, f.r)), 0) / frames.length : 0;
  const bleedCrop = bleeds.reduce((s, b) => s + Math.max(0, Math.log(cropOf(photos[b.idx].aspect, b.r)) - Math.log(1.25)), 0);
  const score =
    cfg.w[spec.kind] +
    jitter +
    1.2 * Math.min(1, minArea / (0.03 * W * H)) +
    0.3 * fill -
    0.5 * crop -
    0.4 * bleedCrop +
    0.3 * (heroA / (W * H)) +
    (coverage >= MIN_COVERAGE + 0.02 ? 0.05 : 0) -
    pen;
  return { kind: spec.kind, bleeds, frames, clusters, coverage, score };
}

// The faded hero: from its outer edge to just under the cluster (the cluster covers the faded 25%
// and the unfaded picture ends about where the cluster starts). `near` = distance from the hero's
// outer edge to the cluster's near edge; returns the hero's width or null.
function fadeWidth(near: number, cb: Rect, lo: number, hi: number, aspect: number, H: number, bc: number, W: number): number | null {
  let e = clamp(near + 0.3 * cb.w, lo, hi);
  e = Math.min(e, (near + 0.02 * W) / 0.75);
  e = clamp(e, (H * aspect) / bc, H * aspect * bc);
  if (e < near + Math.min(1, 0.1 * cb.w)) return null; // nothing overlaps the fade
  if (0.75 * e > near + 0.02 * W + 1e-6) return null; // the cluster would hide the unfaded picture
  return e;
}

function doubleSpecs(ctx: Ctx, cfg: StyleCfg, hero: number, bc: number): Spec[] {
  const { geo, photos, input } = ctx;
  const { W, H, pageW: pw } = geo;
  const n = photos.length;
  const others = range(0, n).filter((i) => i !== hero);
  const k = others.length;
  const a = photos[hero].aspect;
  const g = cfg.gap * H;
  const gut = 0.03 * W;
  const outer = 0.04 * W;
  const tb = 0.04 * H;
  const heroPage = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
  const region = (p: number): Rect => (p === 0 ? { x: outer, y: tb, w: pw - outer - gut, h: H - 2 * tb } : { x: pw + gut, y: tb, w: pw - gut - outer, h: H - 2 * tb });
  const availOf = (p: number): Rect => ({ x: region(p).x, y: 0, w: region(p).w, h: H });
  const offFold = (p: number): Partial<FaceZone> => (p === 0 ? { x0: 0.02, x1: 1 - gut / pw } : { x0: gut / pw, x1: 0.98 });
  const pageRect = (p: number): Rect => ({ x: p * pw, y: 0, w: pw, h: H });
  const specs: Spec[] = [];

  for (const hp of [heroPage, 1 - heroPage]) {
    const op = 1 - hp;
    const sidePen = hp === heroPage ? 0 : 0.2;
    // Half page: the hero fills its page, the cluster sits on the other one.
    specs.push({ kind: "half", pen: sidePen, bleeds: [{ idx: hero, r: pageRect(hp), zone: offFold(hp) }], clusters: [{ idxs: others, avail: availOf(op), region: region(op) }] });
    if (!k) continue;
    // Faded hero across the fold, the cluster over its faded edge.
    specs.push({
      kind: "fade",
      pen: sidePen,
      bleeds: [],
      clusters: [{ idxs: others, avail: availOf(op), region: region(op) }],
      adjust: ([cb]) => {
        const left = hp === 0;
        const near = left ? cb.x : W - (cb.x + cb.w);
        const e = fadeWidth(near, cb, cfg.fadeMin * W, cfg.fadeMax * W, a, H, bc, W);
        if (e === null) return null;
        const r = left ? { x: 0, y: 0, w: e, h: H } : { x: W - e, y: 0, w: e, h: H };
        const zone = left ? { x0: 0.03, x1: Math.min(0.75, (pw - gut) / e) } : { x0: Math.max(0.25, (pw + gut - (W - e)) / e), x1: 0.97 };
        return [{ idx: hero, r, mask: left ? "fade-right-25" : "fade-left-25", zone }];
      },
    });
    // Two heroes: the hero fills its page; on the other page a second, narrower photo bleeds from the
    // outer edge with its inner edge faded, and the cluster sits over that fade.
    if (k >= 3) {
      const seconds = others
        .map((s) => {
          const w2 = clamp(H * photos[s].aspect, 0.5 * pw, 0.72 * pw);
          return { s, w2, crop: cropOf(photos[s].aspect, { x: 0, y: 0, w: w2, h: H }) };
        })
        .filter((c) => c.crop <= Math.min(bc, 1.4))
        .sort((x, y) => x.crop - y.crop || x.s - y.s)
        .slice(0, 2);
      for (const { s, w2 } of seconds) {
        const rest = others.filter((i) => i !== s);
        const reg: Rect =
          op === 0
            ? { x: Math.max(outer, 0.7 * w2), y: tb, w: pw - gut - Math.max(outer, 0.7 * w2), h: H - 2 * tb }
            : { x: pw + gut, y: tb, w: W - Math.max(outer, 0.7 * w2) - (pw + gut), h: H - 2 * tb };
        if (reg.w < 0.28 * pw) continue;
        specs.push({
          kind: "two",
          pen: sidePen,
          bleeds: [],
          clusters: [{ idxs: rest, avail: { x: reg.x, y: 0, w: reg.w, h: H }, region: reg }],
          adjust: ([cb]) => {
            const left = op === 0;
            const near = left ? cb.x : W - (cb.x + cb.w);
            const e = fadeWidth(near, cb, 0.45 * pw, 0.8 * pw, photos[s].aspect, H, Math.min(bc, 1.4), W);
            if (e === null) return null;
            const r2 = left ? { x: 0, y: 0, w: e, h: H } : { x: W - e, y: 0, w: e, h: H };
            const zone2 = left ? { x0: 0.03, x1: Math.min(0.75, (near - 0.3) / e) } : { x0: Math.max(0.25, 1 - (near - 0.3) / e), x1: 0.97 };
            return [
              { idx: s, r: r2, mask: left ? "fade-right-25" : "fade-left-25", zone: zone2 },
              { idx: hero, r: pageRect(hp), zone: offFold(hp) },
            ];
          },
        });
      }
    }
    // Dense: a smaller hero as a band across its page (top/bottom; a portrait: a column at the outer
    // edge) with a block beside it, and a justified block on the other page.
    if (k >= 5 && hp === heroPage) {
      const bands: { r: Rect; avail: Rect; reg: Rect }[] = [];
      const R = region(hp);
      if (a >= 0.95) {
        const top = Math.floor(input.spreadIndex / 2) % 2 === 0;
        for (const hh of [...new Set([clamp(pw / a, 0.42 * H, 0.66 * H), 0.5 * H, 0.6 * H].map((v) => Math.round(v * 100) / 100))]) {
          bands.push({
            r: { x: hp * pw, y: top ? 0 : H - hh, w: pw, h: hh },
            avail: { x: R.x, y: top ? hh : 0, w: R.w, h: H - hh },
            reg: { x: R.x, y: top ? hh + g : tb, w: R.w, h: H - hh - g - tb },
          });
        }
      } else {
        for (const hw of [...new Set([clamp(H * a, 0.5 * pw, 0.7 * pw), 0.6 * pw].map((v) => Math.round(v * 100) / 100))]) {
          const r = hp === 0 ? { x: 0, y: 0, w: hw, h: H } : { x: W - hw, y: 0, w: hw, h: H };
          const x0 = hp === 0 ? hw + g : pw + gut;
          const w = pw - gut - hw - g;
          bands.push({ r, avail: { x: hp === 0 ? hw : pw, y: 0, w: pw - hw, h: H }, reg: { x: x0, y: tb, w, h: H - 2 * tb } });
        }
      }
      for (const band of bands)
        for (let kA = 1; kA <= Math.min(6, k - 1); kA++) {
          const A = heroPage === FIRST ? others.slice(0, kA) : others.slice(k - kA);
          const B = others.filter((i) => !A.includes(i));
          specs.push({
            kind: "dense",
            bleeds: [{ idx: hero, r: band.r, zone: offFold(hp) }],
            clusters: [
              { idxs: A, avail: band.avail, region: band.reg },
              { idxs: B, avail: availOf(op), region: region(op) },
            ],
          });
        }
    }
  }
  return specs;
}

function singleSpecs(ctx: Ctx, cfg: StyleCfg, hero: number, bc: number): Spec[] {
  const { geo, photos, input } = ctx;
  const { W, H } = geo;
  const others = range(0, photos.length).filter((i) => i !== hero);
  const a = photos[hero].aspect;
  const g = cfg.gap * H;
  const o = 0.04 * W;
  const tb = 0.04 * H;
  const specs: Spec[] = [];
  const uniq = (vs: number[]) => [...new Set(vs.map((v) => Math.round(v * 100) / 100))];
  const pref = input.spreadIndex % 2 === 0;
  for (const first of [pref, !pref]) {
    const pen = first === pref ? 0 : 0.2;
    // A band across the top (or bottom), the cluster centred in the rest.
    for (const hh of uniq([clamp(W / a, 0.35 * H, 0.68 * H), 0.45 * H, 0.58 * H])) {
      const top = first;
      specs.push({
        kind: "band",
        pen,
        bleeds: [{ idx: hero, r: { x: 0, y: top ? 0 : H - hh, w: W, h: hh }, zone: {} }],
        clusters: [{ idxs: others, avail: { x: 0, y: top ? hh : 0, w: W, h: H - hh }, region: { x: o, y: top ? hh + g : tb, w: W - 2 * o, h: H - hh - g - tb } }],
      });
    }
    // A full-height column at one side.
    for (const hw of uniq([clamp(H * a, 0.4 * W, 0.66 * W), 0.5 * W, 0.6 * W])) {
      const left = first;
      specs.push({
        kind: "side",
        pen,
        bleeds: [{ idx: hero, r: { x: left ? 0 : W - hw, y: 0, w: hw, h: H }, zone: {} }],
        clusters: [{ idxs: others, avail: { x: left ? hw : 0, y: 0, w: W - hw, h: H }, region: { x: left ? hw + g : o, y: tb, w: W - hw - g - o, h: H - 2 * tb } }],
      });
    }
    // Faded hero from one side, the cluster over its faded edge.
    if (others.length) {
      const left = first;
      const reg: Rect = left ? { x: 0.45 * W, y: tb, w: 0.55 * W - o, h: H - 2 * tb } : { x: o, y: tb, w: 0.55 * W - o, h: H - 2 * tb };
      specs.push({
        kind: "sfade",
        pen,
        bleeds: [],
        clusters: [{ idxs: others, avail: { x: reg.x, y: 0, w: reg.w, h: H }, region: reg }],
        adjust: ([cb]) => {
          const near = left ? cb.x : W - (cb.x + cb.w);
          const e = fadeWidth(near, cb, 0.55 * W, 0.8 * W, a, H, bc, W);
          if (e === null) return null;
          const r = left ? { x: 0, y: 0, w: e, h: H } : { x: W - e, y: 0, w: e, h: H };
          const zone = left ? { x0: 0.03, x1: Math.min(0.75, (near - 0.3) / e) } : { x0: Math.max(0.25, 1 - (near - 0.3) / e), x1: 0.97 };
          return [{ idx: hero, r, mask: left ? "fade-right-25" : "fade-left-25", zone }];
        },
      });
    }
    // (Few photos only, when nothing else reaches the coverage.) The hero covers the whole page and
    // the others sit framed over one side of it, clear of its faces.
    if (others.length && others.length <= 3) {
      const left = !first;
      const reg: Rect = left ? { x: o, y: tb, w: 0.44 * W - o, h: H - 2 * tb } : { x: 0.56 * W, y: tb, w: 0.44 * W - o, h: H - 2 * tb };
      specs.push({
        kind: "inset",
        pen,
        bleeds: [],
        clusters: [{ idxs: others, avail: { x: reg.x, y: 0, w: reg.w, h: H }, region: reg }],
        adjust: ([cb]) => {
          const zone = left ? { x0: Math.min(0.97, (cb.x + cb.w + 0.3) / W), x1: 0.98 } : { x0: 0.02, x1: Math.max(0.03, (cb.x - 0.3) / W) };
          return [{ idx: hero, r: { x: 0, y: 0, w: W, h: H }, zone }];
        },
      });
    }
  }
  return specs;
}

function composeSpread(ctx: Ctx): AlbumElement[] | null {
  const { geo, photos, input } = ctx;
  const cfg = STYLE_CFG[input.style] ?? STYLE_CFG.clean;
  const hero = ctx.heroIdx ?? pickHero(photos);
  const jit = makeRng(hashString(`${input.style}|${input.spreadIndex}|jitter`));
  const jitter = Object.fromEntries((["fade", "half", "two", "dense", "band", "side", "sfade", "inset"] as Kind[]).map((kd) => [kd, jit() * 0.3])) as Record<Kind, number>;
  let best: Cand | null = null;
  let bestAny: Cand | null = null;
  for (const bc of [BLEED_CROP, BLEED_CROP_MAX]) {
    const specs = geo.double ? doubleSpecs(ctx, cfg, hero, bc) : singleSpecs(ctx, cfg, hero, bc);
    for (const spec of specs) {
      for (const fillMode of [false, true]) {
        const c = evaluate(ctx, cfg, spec, hero, bc, jitter[spec.kind] - (bc > BLEED_CROP ? 0.3 : 0), fillMode);
        if (!c) continue;
        if (!bestAny || c.coverage > bestAny.coverage + 1e-9) bestAny = c;
        if (c.coverage >= MIN_COVERAGE && (!best || c.score > best.score)) best = c;
        if (c.coverage >= MIN_COVERAGE) break; // the tidiest block already passes
      }
    }
    if (best) break;
  }
  const pick = best ?? bestAny;
  if (!pick) return null;
  return buildElements(ctx, pick);
}

function buildElements(ctx: Ctx, c: Cand): AlbumElement[] {
  const { geo, photos, input } = ctx;
  const { W, H } = geo;
  const els: AlbumElement[] = [];
  let n = 0;
  // Faded photos first (the bottom of the stack), then the other bleeds, then the framed photos.
  const bleeds = c.bleeds.slice().sort((a, b) => (a.mask ? 0 : 1) - (b.mask ? 0 : 1));
  for (const b of bleeds) {
    const el = photoEl(`${ctx.prefix}-${n++}`, photos[b.idx].id, b.r, geo, { focalX: b.focalX, focalY: b.focalY, ...(b.mask ? { maskId: b.mask } : {}) });
    ctx.bleed.add(el.id);
    ctx.fixedFocal.add(el.id);
    els.push(el);
  }
  const frames = c.frames.slice().sort((a, b) => a.idx - b.idx);
  for (const f of frames) els.push(photoEl(`${ctx.prefix}-${n++}`, photos[f.idx].id, f.r, geo, f.rot ? { rotation: f.rot } : {}));
  if (input.style === "scribble" && frames.length) {
    const phase = hashString(`${input.spreadIndex}|tape`) % 2;
    els.push(...tapeEls(ctx, frames, phase, frames.length));
  }
  if (input.style === "modern") {
    // A thin accent line in the space under a block that doesn't reach the page's lower part.
    const lineColor = hashString(`${input.spreadIndex}|line`) % 2 === 0 ? "#1a1a1a" : "#b08d57";
    c.clusters.forEach((cl, i) => {
      const cb = cl.bounds;
      const below = cl.avail.y + cl.avail.h - (cb.y + cb.h);
      if (below < 0.12 * H) return;
      const len = Math.min(0.4 * cb.w, 0.16 * W);
      const y = cb.y + cb.h + below / 2;
      const t = Math.max(0.06, H * 0.004);
      for (const x of [cb.x + cb.w - len, cb.x]) {
        const lr = { x, y: y - t / 2, w: len, h: t };
        const hits = [...c.bleeds.map((b) => b.r), ...c.frames.map((f) => f.r)].some(
          (r) => lr.x < r.x + r.w && lr.x + lr.w > r.x && lr.y < r.y + r.h && lr.y + lr.h > r.y
        );
        if (!hits && x >= 0.04 * W && x + len <= 0.96 * W) {
          els.push(lineEl(`${ctx.prefix}-line-${i}`, x, y, len, geo, lineColor));
          break;
        }
      }
    });
  }
  return els;
}

// ---------------------------------------------------------------------------------------------
// Finishing pass (all styles): borders/shadows, face-aware crops, stacking order.
// ---------------------------------------------------------------------------------------------

const FRAME_BORDER = { borderWidth: 3, borderColor: "#ffffff", shadow: 35 } as const;

function frameAspectOf(e: AlbumPhotoElement, geo: Geo): number {
  return (e.widthPct * geo.W) / Math.max(1e-6, e.heightPct * geo.H);
}

function finalizeSpread(ctx: Ctx, input: AlbumElement[]): LayoutOutput {
  const { geo, photos } = ctx;
  const isPhoto = (e: AlbumElement): e is AlbumPhotoElement => e.type === "photo";
  const aspectOf = (id: string | null) => photos.find((p) => p.id === id)?.aspect ?? 1.5;
  const els = input.map((e) => {
    if (!isPhoto(e)) return e;
    const out: AlbumPhotoElement = { ...e };
    delete out.shadowAngle;
    if (ctx.bleed.has(e.id)) {
      delete out.borderWidth;
      delete out.borderColor;
      delete out.shadow;
      delete out.rotation;
    } else Object.assign(out, FRAME_BORDER);
    if (!ctx.fixedFocal.has(e.id)) {
      const c = faceCropFocal(aspectOf(e.photoId), frameAspectOf(e, geo), ctx.faces.get(e.photoId ?? "") ?? []);
      out.focalX = c.focalX;
      out.focalY = c.focalY;
    }
    out.zoom = 100;
    return out;
  });
  // Bleed photos at the bottom of the stack (in their given order: faded ones first); everything
  // else keeps its order above them.
  const bottom = els.filter((e) => ctx.bleed.has(e.id));
  const top = els.filter((e) => !ctx.bleed.has(e.id));
  const bleedIds = bottom.map((e) => e.id);
  return bleedIds.length ? { elements: [...bottom, ...top], bleedIds } : { elements: top };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

// Last resort (should never be needed): everything packed into the page(s).
function fallbackLayout(ctx: Ctx): AlbumElement[] {
  const { geo, photos } = ctx;
  const H = geo.H;
  const gap = 0.02 * H;
  const regionOf = (p: number) => pageRegion(geo, p, 0.08 * H, 0.07 * H, 0.08 * H, 0.08 * H);
  const placed: Placed[] = [];
  const groups: [number, number[]][] = geo.double && photos.length > 1
    ? [
        [FIRST, range(0, Math.ceil(photos.length / 2))],
        [SECOND, range(Math.ceil(photos.length / 2), photos.length)],
      ]
    : [[geo.double ? FIRST : 0, range(0, photos.length)]];
  for (const [page, idxs] of groups) {
    const region = regionOf(page);
    const res = justify(photos, idxs, region.w, region.h, gap, false);
    if (res) {
      const ox = region.x + (region.w - res.w) / 2;
      const oy = region.y + (region.h - res.h) / 2;
      for (const p of res.rects) placed.push({ idx: p.idx, r: { ...p.r, x: p.r.x + ox, y: p.r.y + oy } });
    } else idxs.forEach((i, j) => placed.push({ idx: i, r: fitOne(photos[i].aspect, stripCell(region, j, idxs.length)) }));
  }
  return placedToEls(ctx, placed);
}

// The j-th of `count` equal columns of a region (last-resort placement).
function stripCell(region: Rect, j: number, count: number): Rect {
  const w = region.w / count;
  return inset({ x: region.x + j * w, y: region.y, w, h: region.h }, w * 0.03, 0);
}

export function layoutSpread(input: LayoutInput): LayoutOutput {
  if (!input.photos.length) return { elements: [] };
  // Every photo exactly once: an id the planner repeated is placed once.
  const seen = new Set<string>();
  const photos = input.photos.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const ctx = makeCtx({ ...input, photos });
  const elements = composeSpread(ctx);
  // Safety net: a dropped photo means a missing picture in a printed book. Should the composer ever
  // fail to place every photo exactly once, fall back to a plain packed layout that always does.
  const placedIds = (elements ?? []).filter((e): e is AlbumPhotoElement => e.type === "photo").map((e) => e.photoId);
  const complete = elements && placedIds.length === ctx.photos.length && ctx.photos.every((p) => placedIds.includes(p.id));
  if (complete) return finalizeSpread(ctx, elements);
  ctx.bleed.clear();
  ctx.fixedFocal.clear();
  return finalizeSpread(ctx, fallbackLayout(ctx));
}

type CoverStyle = { font: string; color: string; maxFs: number };

const COVER_TYPE: Record<AutoStyleId, CoverStyle> = {
  clean: { font: "assistant", color: "#2b2b2b", maxFs: 78 },
  catalog: { font: "frank-ruhl-libre", color: "#1f1f1f", maxFs: 84 },
  scribble: { font: "amatic-sc", color: "#3a3530", maxFs: 96 },
  modern: { font: "bellefair", color: "#ffffff", maxFs: 96 },
};

export function layoutCover(input: CoverInput): LayoutOutput {
  const geo = geoFor(input.widthCm, input.heightCm);
  const { W, H } = geo;
  const style = COVER_TYPE[input.style] ? input.style : "clean";
  const ts = COVER_TYPE[style];
  const title = input.title.trim() || "אלבום";
  const photo = input.photo ? { id: input.photo.id, aspect: safeAspect(input.photo.aspect) } : null;
  const els: AlbumElement[] = [];
  const album = { width_cm: W, height_cm: H };
  // Text of `chars` characters at most ~78% of the page width (Hebrew averages ~0.55em per glyph).
  const fsFor = (maxFs: number, widthFrac = 0.78) =>
    Math.round(Math.max(24, Math.min(maxFs, (widthFrac * 1600) / (Math.max(4, title.length) * (style === "scribble" ? 0.42 : 0.55)))));

  const text = (fs: number, centerYPct: number, color: string, font: string, extra: Partial<AlbumTextElement> = {}): AlbumTextElement => {
    const h = textHeightPctForFontSize(fs, album);
    return {
      id: "auto-cover-title",
      type: "text",
      text: title,
      xPct: 8,
      yPct: r3(Math.max(0, Math.min(100 - h, centerYPct - h / 2))),
      widthPct: 84,
      heightPct: r3(h),
      fontSize: fs,
      fontFamily: font,
      color,
      align: "center",
      ...extra,
    };
  };

  if (photo) {
    // The photo covers the whole canvas (a bleed element, no border), cropped around the faces and
    // keeping them above the title band; the title sits on the photo, white with a soft shadow.
    const TITLE_Y = 80;
    const c = faceCropFocal(photo.aspect, W / H, validFaces(input.photo ?? undefined), { y0: 0.03, y1: 0.66 });
    const fallback = c.fits ? c : faceCropFocal(photo.aspect, W / H, validFaces(input.photo ?? undefined));
    els.push(photoEl("auto-cover-photo", photo.id, { x: 0, y: 0, w: W, h: H }, geo, { focalX: fallback.focalX, focalY: fallback.focalY, zoom: 100 }));
    const fs = fsFor(ts.maxFs);
    els.push(text(fs, TITLE_Y, "#ffffff", ts.font, { shadow: 60 }));
    if (style === "modern") {
      const th = textHeightPctForFontSize(fs, album);
      const ly = TITLE_Y + th / 2 + 2.5;
      if (ly < 96) els.push(lineEl("auto-cover-line", W * 0.42, (H * ly) / 100, W * 0.16, geo, "#d8b77a"));
    }
    return { elements: els, bleedIds: ["auto-cover-photo"] };
  }

  if (style === "modern") {
    els.push(shapeEl("auto-cover-bg", { x: 0, y: 0, w: W, h: H }, geo, "#161616"));
    const fs = fsFor(ts.maxFs);
    els.push(text(fs, 46, "#f4efe6", ts.font));
    const th = textHeightPctForFontSize(fs, album);
    els.push(lineEl("auto-cover-line", W * 0.4, (H * (46 + th / 2 + 3)) / 100, W * 0.2, geo, "#b08d57"));
    els.push(lineEl("auto-cover-line-2", W * 0.4, (H * (46 - th / 2 - 3)) / 100, W * 0.2, geo, "#b08d57"));
    return { elements: els };
  }

  if (style === "scribble") {
    const fs = fsFor(ts.maxFs);
    els.push(text(fs, 48, ts.color, ts.font));
    const th = textHeightPctForFontSize(fs, album);
    els.push(lineEl("auto-cover-line", W * 0.3, (H * (48 + th / 2 + 1)) / 100, W * 0.4, geo, "#c9a96e"));
    els.push(shapeEl("auto-cover-tape", { x: W * 0.08, y: H * 0.1, w: W * 0.18, h: W * 0.05 }, geo, "#e8dcc4", { rotation: -32, opacity: 72 }));
    els.push(shapeEl("auto-cover-tape-2", { x: W * 0.74, y: H * 0.84, w: W * 0.18, h: W * 0.05 }, geo, "#e8dcc4", { rotation: -32, opacity: 72 }));
    return { elements: els };
  }

  if (style === "catalog") {
    const fs = fsFor(ts.maxFs);
    const th = textHeightPctForFontSize(fs, album);
    els.push(lineEl("auto-cover-line", W * 0.12, (H * (50 - th / 2 - 3)) / 100, W * 0.76, geo, "#9e9e9e"));
    els.push(text(fs, 50, ts.color, ts.font));
    els.push(lineEl("auto-cover-line-2", W * 0.12, (H * (50 + th / 2 + 3)) / 100, W * 0.76, geo, "#9e9e9e"));
    return { elements: els };
  }

  // clean
  els.push(text(fsFor(ts.maxFs, 0.6), 50, ts.color, ts.font));
  return { elements: els };
}

