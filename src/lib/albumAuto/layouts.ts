import type { AlbumElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "@/lib/types";
import { textHeightPctForFontSize } from "@/lib/albumTextSizing";
import type { AutoStyleId, CoverInput, LayoutInput, LayoutOutput, LayoutPhoto } from "./types";

// The layout engine of the auto album designer (see types.ts for the contract). Pure and
// deterministic: the same input always gives the same spread; variety between consecutive spreads
// comes from a seeded hash of spreadIndex + the photo ids, never Math.random.
//
// Everything is computed in real centimetres (so aspect ratios are true) and converted to percent
// of the whole spread only when the elements are built. The core is a guillotine ("slicing tree")
// packer: every way of cutting a page region into rows/columns of the given photos is enumerated,
// each laid out with the photos' own aspect ratios (a uniform stretch of at most MAX_STRETCH
// absorbs the leftover), and the best-scoring arrangement is used. That keeps crops tiny and edges
// aligned, which is most of what makes a page look designed. Each style then decides how photos are
// split between the two pages, the margins/gaps, and the decoration.
//
// Hebrew albums open right to left, so on a double page the first photos (reading order) go on the
// right-hand page.
//
// Finishing pass (owner's rules, 2026-09-29), applied to every style in finalizeSpread():
//   - every framed photo gets a 3px white outline and a 35% shadow; full-bleed photos get neither;
//   - on a double page, a photo left alone on its page fills that whole half page (a bleed element);
//   - every photo's crop (focalX/focalY) is placed from its face boxes so no head is cut.
// Some spreads (not catalog) use the "overlap + fade" variant: one big photo bleeding across the
// fold with a faded inner edge, the other photos overlapping the faded zone on the other page.

type P = { id: string; aspect: number };
type Rect = { x: number; y: number; w: number; h: number };
type Placed = { idx: number; r: Rect };
type Align = "start" | "center" | "end";

// A frame's aspect may differ from its photo's by at most this factor in the packer (the photo is
// cropped to fill the frame; 1.2 keeps ~83% of the picture).
const MAX_STRETCH = 1.2;
// Hard limit anywhere (the deliberate full-bleed hero of "modern" may use it): keeps 75%.
const MAX_CROP = 1.335;

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

// Makes sure the hero is clearly the largest frame on the spread by shrinking the other frames (per
// page, around the centre of that page's group) when needed.
function enforceHero(placed: Placed[], heroIdx: number | undefined, groups: Placed[][]) {
  if (heroIdx === undefined) return;
  const hero = placed.find((p) => p.idx === heroIdx);
  if (!hero) return;
  const heroA = area(hero.r);
  for (const grp of groups) {
    const others = grp.filter((p) => p.idx !== heroIdx);
    if (!others.length) continue;
    const maxA = Math.max(...others.map((p) => area(p.r)));
    if (maxA * 1.3 <= heroA) continue;
    const f = Math.sqrt(heroA / (maxA * 1.3));
    const b = boundsOf(others.map((p) => p.r));
    for (const p of others) p.r = scaleRect(p.r, f, b.x + b.w / 2, b.y + b.h / 2);
  }
  // Last resort (the hero shares a page with frames the packer couldn't make smaller): shrink each
  // offending frame around its own centre.
  for (const p of placed) {
    if (p.idx === heroIdx) continue;
    const a = area(p.r);
    if (a * 1.3 > heroA) p.r = scaleRect(p.r, Math.sqrt(heroA / (a * 1.3)), p.r.x + p.r.w / 2, p.r.y + p.r.h / 2);
  }
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
// entirely inside the zone (always true when faces are unknown).
export function faceCropFocal(
  photoAspect: number,
  frameAspect: number,
  faces?: FaceBox[] | null,
  zone?: Partial<FaceZone>
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
    const maxW = Math.max(...list.map((f) => f.width));
    const maxH = Math.max(...list.map((f) => f.height));
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

// Splits the spread's photos between the two pages: tries a few split points, in reading order and
// grouped by orientation (landscapes together pack far better than a landscape beside a portrait),
// and keeps the pair of pages that packs best. Returns [first page, second page].
function bestSplit(ctx: Ctx, regionOf: (p: number) => Rect, gap: number, opts: PackOpts = {}): Placed[][] | null {
  const { photos, heroIdx, rng } = ctx;
  const n = photos.length;
  const all = range(0, n);
  const land = all.filter((i) => photos[i].aspect >= 1);
  const port = all.filter((i) => photos[i].aspect < 1);
  const orders: { order: number[]; pen: number }[] = [{ order: all, pen: 0 }];
  if (land.length && port.length) {
    orders.push({ order: [...land, ...port], pen: 0.05 });
    orders.push({ order: [...port, ...land], pen: 0.05 });
  }
  let best: { a: number[]; b: number[]; score: number } | null = null;
  const seen = new Set<string>();
  for (const { order, pen } of orders) {
    for (let k = 1; k < n; k++) {
      if (Math.abs(k - n / 2) > 1) continue;
      const a = order.slice(0, k);
      const b = order.slice(k);
      const key = `${[...a].sort().join(",")}|${[...b].sort().join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ra = pack(photos, a, regionOf(FIRST), gap, { ...opts, heroIdx, permute: true });
      const rb = pack(photos, b, regionOf(SECOND), gap, { ...opts, heroIdx, permute: true });
      if (!ra || !rb) continue;
      // A photo alone on a page fills the whole half page (finishing pass): with a hero on the spread,
      // a non-hero must not get that page to itself.
      const loneOther = heroIdx !== undefined && n > 2 && [a, b].some((g) => g.length === 1 && g[0] !== heroIdx);
      const score =
        ra.score + rb.score - pen - Math.abs(a.length - b.length) * 0.04 - Math.abs(ra.score - rb.score) * 0.3 - (loneOther ? 0.6 : 0);
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  if (!best) return null;
  const ra = pack(photos, best.a, regionOf(FIRST), gap, { ...opts, heroIdx, permute: true, rng });
  const rb = pack(photos, best.b, regionOf(SECOND), gap, { ...opts, heroIdx, permute: true, rng });
  if (!ra || !rb) return null;
  return [ra.placed, rb.placed];
}

// ---------------------------------------------------------------------------------------------
// "clean" — white page, generous whitespace, thin even gaps, no borders/shadows/rotation.
// ---------------------------------------------------------------------------------------------

function layoutClean(ctx: Ctx): AlbumElement[] {
  const { geo, photos, heroIdx, rng, input } = ctx;
  const n = photos.length;
  const H = geo.H;
  const m = 0.12 * H;
  const gap = 0.022 * H;
  const all = range(0, n);

  if (!geo.double) {
    const region = pageRegion(geo, 0, m, 0, m, m);
    const res = pack(photos, all, region, gap, { heroIdx, rng, permute: true, cropWeight: 1.4 });
    if (!res) return [];
    enforceHero(res.placed, heroIdx, []);
    return placedToEls(ctx, res.placed);
  }

  const regionOf = (p: number) => pageRegion(geo, p, m, 0.09 * H, m, m);

  if (n === 1) {
    const page = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
    const r = fitOne(photos[0].aspect, regionOf(page), "center", "center", 1.1);
    return placedToEls(ctx, [{ idx: 0, r }]);
  }

  const feature = heroIdx ?? 0;
  const heroPageEligible = n <= 4 || (heroIdx !== undefined && n <= 5);
  const useHeroPage = heroPageEligible && (heroIdx !== undefined || input.spreadIndex % 3 === 0 || n === 2);

  if (useHeroPage) {
    // The feature alone on one page, the rest smaller on the other, aligned to the feature's top and
    // bottom so both pages share the same horizontal lines.
    const heroPage = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
    const otherPage = 1 - heroPage;
    const heroRegion = regionOf(heroPage);
    const heroR = fitOne(photos[feature].aspect, heroRegion, "center", "center", 1.1);
    const rest = all.filter((i) => i !== feature);
    const base = regionOf(otherPage);
    let restRegion: Rect = { x: base.x, y: heroR.y, w: base.w, h: heroR.h };
    if (heroR.h < base.h * 0.7) restRegion = { x: base.x, y: base.y + base.h * 0.1, w: base.w, h: base.h * 0.8 };
    if (rest.length === 1) restRegion = inset(restRegion, restRegion.w * 0.14, restRegion.h * 0.14);
    else restRegion = inset(restRegion, restRegion.w * 0.06, 0);
    const res = pack(photos, rest, restRegion, gap, { rng, permute: true, cropWeight: 1.4 });
    const placed: Placed[] = [{ idx: feature, r: heroR }, ...(res ? res.placed : [])];
    enforceHero(placed, feature, [res ? res.placed : []]);
    return placedToEls(ctx, placed);
  }

  const groups = bestSplit(ctx, regionOf, gap, { cropWeight: 1.4 });
  if (!groups) return [];
  const placed = groups.flat();
  if (heroIdx !== undefined) enforceHero(placed, heroIdx, groups.filter((g) => !g.some((p) => p.idx === heroIdx)));
  return placedToEls(ctx, placed);
}

// ---------------------------------------------------------------------------------------------
// "catalog" — equal cells in consistent rows, uniform gutters, a thin caption rule under the grid.
// ---------------------------------------------------------------------------------------------

type CatalogPage = { idxs: number[]; region: Rect };

// Per-photo cell aspect: all landscapes share one cell shape and all portraits another, so cells are
// equal within an orientation; an outlier (panorama etc.) keeps a shape close to its own.
function cellAspects(photos: P[]): number[] {
  const geoMean = (xs: number[]) => Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);
  const land = photos.filter((p) => p.aspect >= 1).map((p) => p.aspect);
  const port = photos.filter((p) => p.aspect < 1).map((p) => p.aspect);
  const L = land.length ? geoMean(land) : 1.5;
  const Pt = port.length ? geoMean(port) : 0.67;
  return photos.map((p) => {
    const c = p.aspect >= 1 ? L : Pt;
    const crop = Math.max(c / p.aspect, p.aspect / c);
    if (crop <= 1.15) return c;
    return Math.min(p.aspect * 1.15, Math.max(p.aspect / 1.15, c));
  });
}

// A grid of equal-width columns (the same column count throughout); landscapes and portraits never
// share a row, so every row is truly equal cells, and portrait rows are simply taller. Returns the
// column width that fits (cm) and the rows.
function catalogRows(cells: number[], idxs: number[], region: Rect, g: number, photos: P[]): { h: number; rows: number[][] } {
  const k = idxs.length;
  const land = idxs.filter((i) => photos[i].aspect >= 1);
  const port = idxs.filter((i) => photos[i].aspect < 1);
  const groups = [land, port].filter((x) => x.length);
  if (idxs.length && photos[idxs[0]].aspect < 1) groups.reverse();
  let best: { h: number; rows: number[][]; score: number } = { h: 0, rows: [idxs], score: -Infinity };
  for (let c = 1; c <= k; c++) {
    const rows: number[][] = [];
    for (const grp of groups) {
      // Balanced chunks of at most c (5 at 3 columns -> 3+2, never 3+1+1).
      const r = Math.ceil(grp.length / c);
      const base = Math.floor(grp.length / r);
      let extra = grp.length % r;
      let at = 0;
      for (let i = 0; i < r; i++) {
        const cnt = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra--;
        rows.push(grp.slice(at, at + cnt));
        at += cnt;
      }
    }
    // Row height = cw / rowAspect; total height sum(cw / rowAspect) + gaps <= region.h.
    const invSum = rows.reduce((s, row) => s + 1 / rowAspect(cells, row), 0);
    let h = (region.h - g * (rows.length - 1)) / invSum;
    for (const row of rows) {
      const widthPerCw = row.reduce((s, i) => s + cells[i] / rowAspect(cells, row), 0);
      h = Math.min(h, (region.w - g * (row.length - 1)) / widthPerCw);
    }
    if (h <= 0) continue;
    const covered = rows.reduce((s, row) => s + row.reduce((t, i) => t + (cells[i] / rowAspect(cells, row)) * (h * h) / rowAspect(cells, row), 0), 0);
    // Prefer full rows (a lone photo in the last row reads as a leftover).
    const ragged = rows.filter((row) => row.length < Math.max(...rows.map((x) => x.length))).length;
    const score = covered / area(region) - ragged * 0.02;
    if (score > best.score + 1e-9) best = { h, rows, score };
  }
  return { h: best.h, rows: best.rows };
}

// The shared cell aspect of a row (its cells are one orientation class).
function rowAspect(cells: number[], row: number[]): number {
  return Math.exp(row.reduce((s, i) => s + Math.log(cells[i]), 0) / row.length);
}

// Places rows for column width `cw`: row height cw / rowAspect, rows centred on the page.
function placeCatalogPage(cells: number[], page: CatalogPage, cw: number, rows: number[][], g: number): Placed[] {
  const heights = rows.map((row) => cw / rowAspect(cells, row));
  const blockH = heights.reduce((s, h) => s + h, 0) + (rows.length - 1) * g;
  let y = page.region.y + (page.region.h - blockH) / 2;
  const out: Placed[] = [];
  rows.forEach((row, ri) => {
    const h = heights[ri];
    const rowW = row.reduce((s, i) => s + cells[i] * h, 0) + g * (row.length - 1);
    let x = page.region.x + (page.region.w - rowW) / 2;
    for (const i of row) {
      const w = cells[i] * h;
      out.push({ idx: i, r: { x, y, w, h } });
      x += w + g;
    }
    y += h + g;
  });
  return out;
}

function layoutCatalog(ctx: Ctx): AlbumElement[] {
  const { geo, photos, heroIdx, input } = ctx;
  const n = photos.length;
  const H = geo.H;
  const gap = 0.018 * H;
  const cells = cellAspects(photos);
  const els: AlbumElement[] = [];
  const captionColor = "#a3a3a3";
  const regionOf = (p: number) => pageRegion(geo, p, 0.08 * H, 0.075 * H, 0.08 * H, 0.13 * H);

  const addCaption = (placed: Placed[], key: string, pageBottomLimit: number) => {
    if (!placed.length) return;
    const b = boundsOf(placed.map((p) => p.r));
    const y = b.y + b.h + 0.035 * H;
    if (y > pageBottomLimit) return;
    const len = Math.min(b.w * 0.3, 0.16 * geo.pageW);
    els.push(lineEl(`${ctx.prefix}-cap-${key}`, b.x + b.w - len, y, len, geo, captionColor));
  };

  if (!geo.double) {
    const region = regionOf(0);
    let placed: Placed[];
    if (heroIdx !== undefined && n > 1) {
      // Hero as a wide top cell, the rest as an equal-cell row(s) below.
      const heroRegion = { ...region, h: region.h * 0.52 };
      const heroR = fitOne(photos[heroIdx].aspect, heroRegion);
      const restRegion = { x: region.x, y: heroR.y + heroR.h + gap, w: region.w, h: region.y + region.h - (heroR.y + heroR.h + gap) };
      const rest = range(0, n).filter((i) => i !== heroIdx);
      const { h, rows } = catalogRows(cells, rest, restRegion, gap, photos);
      placed = [{ idx: heroIdx, r: heroR }, ...placeCatalogPage(cells, { idxs: rest, region: restRegion }, h, rows, gap)];
      enforceHero(placed, heroIdx, [placed.filter((p) => p.idx !== heroIdx)]);
    } else {
      const { h, rows } = catalogRows(cells, range(0, n), region, gap, photos);
      placed = placeCatalogPage(cells, { idxs: range(0, n), region }, h, rows, gap);
    }
    const out: AlbumElement[] = placedToEls(ctx, placed);
    addCaption(placed, "0", geo.H - 0.05 * H);
    return [...out, ...els];
  }

  if (n === 1) {
    const page = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
    const region = inset(regionOf(page), regionOf(page).w * 0.06, 0);
    const placed = [{ idx: 0, r: fitOne(photos[0].aspect, region) }];
    const out: AlbumElement[] = placedToEls(ctx, placed);
    addCaption(placed, "0", geo.H - 0.05 * H);
    return [...out, ...els];
  }

  // Hero: alone as the big cell on one page, the grid on the other.
  if (heroIdx !== undefined) {
    const heroPage = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
    const heroR = fitOne(photos[heroIdx].aspect, regionOf(heroPage));
    const rest = range(0, n).filter((i) => i !== heroIdx);
    let restRegion = regionOf(1 - heroPage);
    if (rest.length === 1) restRegion = inset(restRegion, restRegion.w * 0.18, restRegion.h * 0.18);
    const { h, rows } = catalogRows(cells, rest, restRegion, gap, photos);
    const grid = placeCatalogPage(cells, { idxs: rest, region: restRegion }, h, rows, gap);
    // Align the grid's top with the hero's top when there's room: consistent rows across the spread.
    const gb = boundsOf(grid.map((p) => p.r));
    if (gb.h <= heroR.h + 0.01 && rest.length > 1) {
      const dy = heroR.y + (heroR.h - gb.h) / 2 - gb.y;
      for (const p of grid) p.r = { ...p.r, y: p.r.y + dy };
    }
    const placed = [{ idx: heroIdx, r: heroR }, ...grid];
    enforceHero(placed, heroIdx, [grid]);
    const out: AlbumElement[] = placedToEls(ctx, placed);
    addCaption([{ idx: heroIdx, r: heroR }], "h", geo.H - 0.05 * H);
    addCaption(grid, "g", geo.H - 0.05 * H);
    return [...out, ...els];
  }

  // Grid on both pages. Try the reading order and orientation-grouped orders (so a page tends to hold
  // one orientation = truly equal cells), and a few split points; keep the one with the biggest
  // common cell height.
  const all = range(0, n);
  const land = all.filter((i) => photos[i].aspect >= 1);
  const port = all.filter((i) => photos[i].aspect < 1);
  const orders: number[][] = [all];
  if (land.length && port.length) orders.push([...land, ...port], [...port, ...land]);
  let best: { placed: Placed[][]; score: number } | null = null;
  orders.forEach((order, oi) => {
    for (let k = 1; k < n; k++) {
      const a = order.slice(0, k);
      const b = order.slice(k);
      const pa: CatalogPage = { idxs: a, region: regionOf(FIRST) };
      const pb: CatalogPage = { idxs: b, region: regionOf(SECOND) };
      const ra = catalogRows(cells, a, pa.region, gap, photos);
      const rb = catalogRows(cells, b, pb.region, gap, photos);
      // One common row height across the spread when the two pages are comparable.
      const common = Math.min(ra.h, rb.h);
      const cls = (idxs: number[]) => (idxs.every((i) => photos[i].aspect >= 1) ? "L" : idxs.every((i) => photos[i].aspect < 1) ? "P" : "M");
      const unify = cls(a) === cls(b) && common >= 0.7 * Math.max(ra.h, rb.h);
      const ha = unify ? common : ra.h;
      const hb = unify ? common : rb.h;
      const cov = (idxs: number[], cw: number) => idxs.reduce((s, i) => s + (cw * cw) / cells[i], 0);
      const homo = (idxs: number[]) => (idxs.every((i) => photos[i].aspect >= 1) || idxs.every((i) => photos[i].aspect < 1) ? 0.08 : 0);
      const score =
        (cov(a, ha) + cov(b, hb)) / (area(pa.region) + area(pb.region)) +
        homo(a) +
        homo(b) +
        (unify ? 0.05 : 0) -
        Math.max(0, Math.abs(a.length - b.length) - 1) * 0.07 -
        (oi > 0 ? 0.02 : 0);
      if (!best || score > best.score)
        best = { placed: [placeCatalogPage(cells, pa, ha, ra.rows, gap), placeCatalogPage(cells, pb, hb, rb.rows, gap)], score };
    }
  });
  if (!best) return [];
  const groups = (best as { placed: Placed[][] }).placed;
  // Align both grids to the same top line when they're the same height class.
  const ba = boundsOf(groups[0].map((p) => p.r));
  const bb = boundsOf(groups[1].map((p) => p.r));
  const top = Math.min(ba.y, bb.y);
  if (Math.abs(ba.h - bb.h) < 0.5 * Math.max(ba.h, bb.h)) {
    for (const [grp, b] of [
      [groups[0], ba],
      [groups[1], bb],
    ] as const)
      for (const p of grp) p.r = { ...p.r, y: p.r.y - (b.y - top) };
  }
  const out: AlbumElement[] = placedToEls(ctx, groups.flat());
  addCaption(groups[0], "a", geo.H - 0.05 * H);
  addCaption(groups[1], "b", geo.H - 0.05 * H);
  return [...out, ...els];
}

// ---------------------------------------------------------------------------------------------
// "scribble" — polaroid-bordered, tilted, slightly overlapping, with tape.
// ---------------------------------------------------------------------------------------------

type Tilted = Placed & { rot: number };

function rotatedHalfExtents(r: Rect, deg: number): [number, number] {
  const t = (Math.abs(deg) * Math.PI) / 180;
  return [(r.w * Math.cos(t) + r.h * Math.sin(t)) / 2, (r.w * Math.sin(t) + r.h * Math.cos(t)) / 2];
}

// Keeps a rotated frame's bounding box inside `lim` (shrinking it when needed).
function clampTilted(t: Tilted, lim: Rect) {
  let [ex, ey] = rotatedHalfExtents(t.r, t.rot);
  const f = Math.min(1, lim.w / (2 * ex), lim.h / (2 * ey));
  let cx = t.r.x + t.r.w / 2;
  let cy = t.r.y + t.r.h / 2;
  if (f < 1) {
    t.r = scaleRect(t.r, f, cx, cy);
    ex *= f;
    ey *= f;
  }
  cx = Math.min(lim.x + lim.w - ex, Math.max(lim.x + ex, cx));
  cy = Math.min(lim.y + lim.h - ey, Math.max(lim.y + ey, cy));
  t.r = { ...t.r, x: cx - t.r.w / 2, y: cy - t.r.h / 2 };
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

function layoutScribble(ctx: Ctx): AlbumElement[] {
  const { geo, photos, heroIdx, rng, input } = ctx;
  const n = photos.length;
  const H = geo.H;
  const m = 0.1 * H;
  const gap = 0.065 * H;
  const all = range(0, n);
  const groups: { placed: Placed[]; lim: Rect }[] = [];

  const limitOf = (p: number): Rect => {
    if (!geo.double) return { x: 0.045 * geo.W, y: 0.045 * H, w: geo.W * 0.91, h: H * 0.91 };
    const fold = 0.032 * geo.W;
    const outer = 0.045 * geo.W;
    return p === 0
      ? { x: outer, y: 0.045 * H, w: geo.pageW - outer - fold, h: H * 0.91 }
      : { x: geo.pageW + fold, y: 0.045 * H, w: geo.pageW - outer - fold, h: H * 0.91 };
  };
  const regionOf = (p: number) => pageRegion(geo, p, m, 0.1 * H, m, m);

  if (!geo.double) {
    const res = pack(photos, all, regionOf(0), gap, { heroIdx, rng, permute: true });
    if (res) groups.push({ placed: res.placed, lim: limitOf(0) });
  } else if (n === 1) {
    const page = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
    const reg = inset(regionOf(page), regionOf(page).w * 0.05, regionOf(page).h * 0.05);
    groups.push({ placed: [{ idx: 0, r: fitOne(photos[0].aspect, reg) }], lim: limitOf(page) });
  } else if (heroIdx !== undefined && n <= 4) {
    // Few photos with a hero: the hero alone on one page, the rest gathered on the other.
    const heroPage = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
    const hr = regionOf(heroPage);
    groups.push({ placed: [{ idx: heroIdx, r: fitOne(photos[heroIdx].aspect, inset(hr, hr.w * 0.03, hr.h * 0.03)) }], lim: limitOf(heroPage) });
    const rest = all.filter((i) => i !== heroIdx);
    const or = regionOf(1 - heroPage);
    const restRegion = rest.length === 1 ? inset(or, or.w * 0.14, or.h * 0.14) : or;
    const res = pack(photos, rest, restRegion, gap, { rng, permute: true });
    if (res) groups.push({ placed: res.placed, lim: limitOf(1 - heroPage) });
  } else {
    const split = bestSplit(ctx, regionOf, gap);
    if (split) {
      groups.push({ placed: split[0], lim: limitOf(FIRST) });
      groups.push({ placed: split[1], lim: limitOf(SECOND) });
    }
  }
  const flat = groups.flatMap((g) => g.placed);
  if (heroIdx !== undefined)
    enforceHero(
      flat,
      heroIdx,
      groups.filter((g) => !g.placed.some((p) => p.idx === heroIdx)).map((g) => g.placed)
    );

  // Tilt, enlarge a little (so neighbours overlap at the corners), jitter, clamp to the page.
  const signStart = rng() < 0.5 ? 1 : -1;
  const tilted: { t: Tilted; lim: Rect }[] = [];
  groups.forEach((g) => {
    g.placed.forEach((p) => {
      const k = tilted.length;
      const mag = 2.5 + rng() * 4.5;
      const rot = Math.round((k % 2 === 0 ? signStart : -signStart) * mag * 10) / 10;
      const grow = p.idx === heroIdx ? 1.06 : 1.1 + rng() * 0.04;
      const cx = p.r.x + p.r.w / 2 + (rng() - 0.5) * 0.04 * H;
      const cy = p.r.y + p.r.h / 2 + (rng() - 0.5) * 0.04 * H;
      const t: Tilted = { idx: p.idx, r: scaleRect({ ...p.r, x: cx - p.r.w / 2, y: cy - p.r.h / 2 }, grow, cx, cy), rot };
      clampTilted(t, g.lim);
      tilted.push({ t, lim: g.lim });
    });
  });

  // Hero on top of the pile; otherwise reading order.
  tilted.sort((a, b) => (a.t.idx === heroIdx ? 1 : b.t.idx === heroIdx ? -1 : a.t.idx - b.t.idx));
  // (The 3px white outline + shadow are set by the finishing pass, like every style.)
  const els: AlbumElement[] = tilted.map(({ t }, i) => photoEl(`${ctx.prefix}-${i}`, photos[t.idx].id, t.r, geo, { rotation: t.rot }));

  els.push(...tapeEls(ctx, tilted.map(({ t }) => t), signStart > 0 ? 0 : 1, n));
  return els;
}

// ---------------------------------------------------------------------------------------------
// "modern" — a bold hero (full page height, or a full-bleed across the spread), asymmetric blocks,
// thin accent lines, lots of negative space.
// ---------------------------------------------------------------------------------------------

// Splits a page area into a bleeding hero frame and (optionally) a leftover area for more photos.
// `page` is the full page rect; `foldSide` is -1 when the fold is on the left of it, +1 right, 0 none.
function modernHeroSplit(
  page: Rect,
  foldSide: -1 | 0 | 1,
  aspect: number,
  wantRest: boolean,
  geo: Geo,
  anchorTop: boolean,
  minRestFrac = 0.3
): { hero: Rect; rest: Rect | null } {
  const gut = foldSide === 0 ? 0 : 0.03 * geo.W;
  const usableX = foldSide === -1 ? page.x + gut : page.x;
  const usableW = page.w - gut;
  const gap = 0.035 * geo.H;
  const minRestW = minRestFrac * usableW;
  const minRestH = minRestFrac * page.h;
  // The hero hugs the page's outer edge: the left edge unless the fold is on the left (right page).
  const outerLeft = foldSide !== -1;

  type Cand = { hero: Rect; rest: Rect | null; cost: number };
  const cands: Cand[] = [];
  // Side split: hero full height, anchored to the outer edge.
  {
    const maxW = usableW - (wantRest ? minRestW + gap : 0);
    let w = page.h * aspect;
    let s = 1;
    if (w > maxW) {
      s = maxW / w;
      w = maxW;
    }
    if (s >= 1 / MAX_STRETCH) {
      const hero = outerLeft ? { x: usableX, y: page.y, w, h: page.h } : { x: usableX + usableW - w, y: page.y, w, h: page.h };
      const restW = usableW - w - gap;
      const rest =
        wantRest && restW >= minRestW * 0.95
          ? outerLeft
            ? { x: hero.x + w + gap, y: page.y, w: restW, h: page.h }
            : { x: usableX, y: page.y, w: restW, h: page.h }
          : null;
      cands.push({ hero, rest, cost: Math.abs(Math.log(s)) + (aspect >= 1.15 ? 0.15 : 0) + (wantRest && !rest ? 1 : 0) });
    }
  }
  // Band: hero across the page's usable width, anchored to top or bottom.
  {
    const maxH = page.h - (wantRest ? minRestH + gap : 0);
    let h = usableW / aspect;
    let s = 1;
    if (h > maxH) {
      s = h / maxH;
      h = maxH;
    }
    if (s <= MAX_STRETCH) {
      const hero = anchorTop ? { x: usableX, y: page.y, w: usableW, h } : { x: usableX, y: page.y + page.h - h, w: usableW, h };
      const restH = page.h - h - gap;
      const rest =
        wantRest && restH >= minRestH * 0.95
          ? anchorTop
            ? { x: usableX, y: hero.y + h + gap, w: usableW, h: restH }
            : { x: usableX, y: page.y, w: usableW, h: restH }
          : null;
      cands.push({ hero, rest, cost: Math.abs(Math.log(s)) + (aspect < 1.15 ? 0.15 : 0) + (wantRest && !rest ? 1 : 0) });
    }
  }
  cands.sort((a, b) => a.cost - b.cost);
  if (cands.length && (!wantRest || cands[0].rest)) return { hero: cands[0].hero, rest: cands[0].rest };
  if (!wantRest) {
    // Nothing bleeds nicely: a large inset frame.
    const hero = fitOne(aspect, inset({ x: usableX, y: page.y, w: usableW, h: page.h }, 0.05 * geo.H, 0.06 * geo.H));
    return { hero, rest: null };
  }
  // Room is needed for more photos but no bleeding hero leaves it: split the page in two parts along
  // its longer side and put the hero (bleeding on its outer edges, as close to its aspect as the
  // stretch allows) in the bigger one.
  const side = usableW / page.h >= aspect;
  if (side) {
    const hw = Math.min(usableW * (1 - minRestFrac), page.h * aspect * MAX_STRETCH);
    const hh = Math.min(page.h, (hw / aspect) * MAX_STRETCH);
    const hero = outerLeft
      ? { x: usableX, y: page.y + (page.h - hh) / 2, w: hw, h: hh }
      : { x: usableX + usableW - hw, y: page.y + (page.h - hh) / 2, w: hw, h: hh };
    const rest = outerLeft ? { x: hero.x + hw + gap, y: page.y, w: usableW - hw - gap, h: page.h } : { x: usableX, y: page.y, w: usableW - hw - gap, h: page.h };
    return { hero, rest };
  }
  const hh = Math.min(page.h * (1 - minRestFrac), (usableW / aspect) * MAX_STRETCH);
  const hw = Math.min(usableW, hh * aspect * MAX_STRETCH);
  const hero = anchorTop ? { x: usableX + (usableW - hw) / 2, y: page.y, w: hw, h: hh } : { x: usableX + (usableW - hw) / 2, y: page.y + page.h - hh, w: hw, h: hh };
  const rest = anchorTop ? { x: usableX, y: hero.y + hh + gap, w: usableW, h: page.h - hh - gap } : { x: usableX, y: page.y, w: usableW, h: page.h - hh - gap };
  return { hero, rest };
}

// Leaves inner margins on the sides of a leftover area that touch page edges (not the hero side).
function restInner(rest: Rect, geo: Geo): Rect {
  const mx = 0.06 * geo.H;
  const my = 0.07 * geo.H;
  const x0 = Math.max(rest.x, (rest.x < 0.5 ? 0.045 * geo.W : rest.x));
  const x1 = Math.min(rest.x + rest.w, rest.x + rest.w > geo.W - 0.5 ? geo.W - Math.max(mx, 0.045 * geo.W) : rest.x + rest.w);
  const y0 = rest.y < 0.5 ? Math.max(my, 0.045 * geo.H) : rest.y;
  const y1 = rest.y + rest.h > geo.H - 0.5 ? geo.H - Math.max(my, 0.045 * geo.H) : rest.y + rest.h;
  return { x: x0, y: y0, w: Math.max(0.5, x1 - x0), h: Math.max(0.5, y1 - y0) };
}

function layoutModern(ctx: Ctx): AlbumElement[] {
  const { geo, photos, heroIdx, rng, input } = ctx;
  const n = photos.length;
  const H = geo.H;
  const feature = heroIdx ?? 0;
  const fa = photos[feature].aspect;
  const lineColor = rng() < 0.5 ? "#1a1a1a" : "#b08d57";
  const blockGap = 0.014 * H;
  const lines: AlbumShapeElement[] = [];
  let lineN = 0;
  const addLine = (x: number, y: number, len: number, vertical = false) => {
    lines.push(lineEl(`${ctx.prefix}-line-${lineN++}`, x, y, len, geo, lineColor, vertical));
  };
  const rest = range(0, n).filter((i) => i !== feature);
  const placed: Placed[] = [];

  // Block of photos in a region, with a line accent on the side of the negative space.
  const block = (idxs: number[], region: Rect, ax: Align, ay: Align, accent: boolean) => {
    if (!idxs.length) return;
    const res = pack(photos, idxs, region, blockGap, { rng, permute: true, alignX: ax, alignY: ay, preferEqual: 0.4 });
    if (!res) return;
    placed.push(...res.placed);
    if (!accent) return;
    const u = res.used;
    const len = Math.min(0.42 * geo.pageW, Math.max(u.w * 0.55, 0.18 * geo.pageW));
    const below = u.y + u.h + 0.045 * H;
    const above = u.y - 0.045 * H;
    const startX = ax === "end" ? u.x + u.w - len : u.x;
    if (below < H - 0.07 * H) addLine(startX, below, len);
    else if (above > 0.07 * H) addLine(startX, above, len);
  };

  if (!geo.double) {
    const page = { x: 0, y: 0, w: geo.W, h: H };
    if (n === 1) {
      const full = geo.W / H;
      const crop = Math.max(full / fa, fa / full);
      if (crop <= MAX_STRETCH) {
        placed.push({ idx: 0, r: page });
        const els = placedToEls(ctx, placed);
        ctx.bleed.add(els[0].id);
        return els;
      } else {
        const { hero } = modernHeroSplit(page, 0, fa, false, geo, true);
        placed.push({ idx: 0, r: hero });
      }
    } else {
      const restFrac = Math.min(0.5, 0.3 + 0.05 * (rest.length - 1));
      const { hero, rest: left } = modernHeroSplit(page, 0, fa, true, geo, input.spreadIndex % 2 === 0, restFrac);
      placed.push({ idx: feature, r: hero });
      if (left) block(rest, restInner(left, geo), "center", "center", true);
    }
    enforceHero(placed, feature, [placed.filter((p) => p.idx !== feature)]);
    return [...placedToEls(ctx, placed), ...lines];
  }

  // (A single photo that can't fill the whole spread falls through: alone on a page, the finishing
  // pass makes it a full half page.)
  const bleed = input.spreadIndex % 4 === 2 && fa >= 1.3 && n <= 4 && (n > 1 || geo.W / H / fa <= MAX_CROP);
  if (bleed) {
    // The one deliberate spread-wide hero: full height, from the left edge across the fold.
    if (n === 1) {
      placed.push({ idx: 0, r: { x: 0, y: 0, w: geo.W, h: H } });
    } else {
      const stripW = Math.min(0.36 * geo.W, Math.max(0.22 * geo.W, geo.W - H * fa));
      let heroW = geo.W - stripW;
      heroW = Math.min(heroW, H * fa * MAX_STRETCH);
      heroW = Math.max(heroW, H * fa / MAX_STRETCH);
      placed.push({ idx: feature, r: { x: 0, y: 0, w: heroW, h: H } });
      const region = { x: heroW + 0.03 * H, y: 0.1 * H, w: geo.W - heroW - 0.03 * H - 0.05 * geo.W, h: 0.8 * H };
      block(rest, region, "start", rest.length === 1 ? "end" : "center", true);
    }
    enforceHero(placed, feature, [placed.filter((p) => p.idx !== feature)]);
    const els = placedToEls(ctx, placed);
    const heroEl = els.find((e) => e.photoId === photos[feature].id);
    if (heroEl) ctx.bleed.add(heroEl.id);
    return [...els, ...lines];
  }

  const heroPage = input.spreadIndex % 2 === 0 ? FIRST : SECOND;
  const otherPage = 1 - heroPage;
  const pageRect = (p: number): Rect => ({ x: p * geo.pageW, y: 0, w: geo.pageW, h: H });
  const heroFold: -1 | 1 = heroPage === 1 ? -1 : 1;
  // A landscape hero leaves a band under/over it: one or two small photos sit there once the other
  // page would get busy. A portrait hero leaves only a narrow column, used for the 7th/8th photo.
  const heroHolds = fa >= 1.15 ? (rest.length >= 5 ? 2 : rest.length >= 3 ? 1 : 0) : rest.length > 5 ? Math.min(2, rest.length - 5) : 0;
  const split = modernHeroSplit(pageRect(heroPage), heroFold, fa, heroHolds > 0, geo, input.spreadIndex % 4 < 2);
  placed.push({ idx: feature, r: split.hero });
  let onOther = rest;
  if (heroHolds > 0 && split.rest) {
    // Landscapes suit the band under a landscape hero, portraits the column beside a portrait one;
    // take the best-suited photos from the end of the reading order.
    const wantLand = split.rest.w > split.rest.h;
    const byFit = rest
      .map((i, pos) => ({ i, pos }))
      .sort((a, b) => {
        const fa2 = (photos[a.i].aspect >= 1) === wantLand ? 0 : 1;
        const fb2 = (photos[b.i].aspect >= 1) === wantLand ? 0 : 1;
        return fa2 - fb2 || b.pos - a.pos;
      });
    const mineSet = new Set(byFit.slice(0, heroHolds).map((x) => x.i));
    const mine = rest.filter((i) => mineSet.has(i));
    onOther = rest.filter((i) => !mineSet.has(i));
    const inner = restInner(split.rest, geo);
    const bandBelow = split.rest.y > split.hero.y;
    block(mine, inner, heroPage === 0 ? "start" : "end", split.rest.w < geo.pageW * 0.6 ? "center" : bandBelow ? "start" : "end", false);
  } else {
    // Negative space next to the hero gets a single accent line.
    const hr = split.hero;
    const pr = pageRect(heroPage);
    const len = 0.3 * geo.pageW;
    const outerX = heroPage === 0 ? pr.x + 0.07 * H : pr.x + pr.w - 0.07 * H - len;
    if (hr.h < H * 0.8) {
      const y = hr.y < 1 ? hr.y + hr.h + 0.07 * H : hr.y - 0.07 * H;
      addLine(outerX, y, len);
    } else if (pr.w - hr.w > 0.28 * geo.pageW) {
      const free = heroPage === 0 ? { x0: hr.x + hr.w, x1: pr.x + pr.w - 0.03 * geo.W } : { x0: pr.x + 0.03 * geo.W, x1: hr.x };
      const l2 = Math.min(len, (free.x1 - free.x0) * 0.6);
      addLine(heroPage === 0 ? free.x0 + 0.04 * H : free.x1 - 0.04 * H - l2, H * 0.88, l2);
    }
  }

  // The other page: an asymmetric block pushed toward one side, the rest negative space.
  const k = onOther.length;
  const full = pageRegion(geo, otherPage, 0.07 * H, 0.08 * H, 0.08 * H, 0.08 * H);
  if (k === 0) {
    const len = full.w * 0.4;
    addLine(full.x + (otherPage === 1 ? full.w - len : 0), H * 0.62, len);
  } else {
    const towardOuter = rng() < 0.5;
    const wFrac = k === 1 ? 0.66 : k === 2 ? 0.86 : k <= 4 ? 0.92 : 1;
    const hFrac = k === 1 ? 0.66 : k <= 3 ? 0.84 : 0.88;
    const w = full.w * wFrac;
    const h = full.h * hFrac;
    const outerIsLeft = otherPage === 0;
    const atLeft = towardOuter ? outerIsLeft : !outerIsLeft;
    const top = rng() < 0.5;
    const region = { x: atLeft ? full.x : full.x + full.w - w, y: top ? full.y : full.y + full.h - h, w, h };
    block(onOther, region, atLeft ? "start" : "end", top ? "start" : "end", true);
  }
  enforceHero(placed, feature, [placed.filter((p) => p.idx !== feature)]);
  return [...placedToEls(ctx, placed), ...lines];
}

// ---------------------------------------------------------------------------------------------
// "overlap + fade" — one big photo from its outer edge across the fold to ~70% of the spread, its
// inner edge faded (fade-right-25 / fade-left-25); the other 1-4 photos on the other page, partly
// over the faded zone. Used on some spreads of every style but catalog.
// ---------------------------------------------------------------------------------------------

const OVERLAP_BIG_FRAC = 0.7;

function layoutOverlap(ctx: Ctx): AlbumElement[] | null {
  const { geo, photos, heroIdx, input, rng } = ctx;
  const n = photos.length;
  if (!geo.double || input.style === "catalog" || n < 2 || n > 5 || input.spreadIndex % 3 !== 1) return null;
  // The big photo: the hero, or else the first landscape. A portrait would be cropped to a sliver.
  const bigIdx = heroIdx !== undefined ? (photos[heroIdx].aspect >= 1.2 ? heroIdx : -1) : photos.findIndex((p) => p.aspect >= 1.2);
  if (bigIdx < 0) return null;
  const { W, H } = geo;
  const bigW = OVERLAP_BIG_FRAC * W;
  const fold = W / 2;
  const gut = 0.03 * W;
  const big = photos[bigIdx];
  const faces = ctx.faces.get(big.id) ?? [];
  // Faces stay on the big photo's own page (off the fold), which also keeps them out of the faded
  // 25% and from under the overlapping photos (both are past the fold).
  const zoneFor = (left: boolean): Partial<FaceZone> =>
    left ? { x0: 0.03, x1: (fold - gut) / bigW } : { x0: (fold + gut - (W - bigW)) / bigW, x1: 0.97 };
  const preferLeft = Math.floor(input.spreadIndex / 3) % 2 === 0;
  let left: boolean | null = null;
  let crop: ReturnType<typeof faceCropFocal> | null = null;
  for (const side of [preferLeft, !preferLeft]) {
    const c = faceCropFocal(big.aspect, bigW / H, faces, zoneFor(side));
    if (c.fits) {
      left = side;
      crop = c;
      break;
    }
  }
  if (left === null || !crop) return null; // a wide group photo: no side keeps every face clear

  const bigR: Rect = left ? { x: 0, y: 0, w: bigW, h: H } : { x: W - bigW, y: 0, w: bigW, h: H };
  // The others' block starts inside the faded zone (which spans the big photo's inner 25%).
  const reach = 0.14 * W;
  const outer = 0.05 * W;
  const region: Rect = left
    ? { x: bigW - reach, y: 0.1 * H, w: W - outer - (bigW - reach), h: 0.8 * H }
    : { x: outer, y: 0.1 * H, w: W - bigW + reach - outer, h: 0.8 * H };
  const rest = range(0, n).filter((i) => i !== bigIdx);
  const res = pack(photos, rest, region, 0.025 * H, { rng, permute: true, alignX: left ? "start" : "end", alignY: "center", cropWeight: 1.2 });
  if (!res) return null;

  const bigEl = photoEl(`${ctx.prefix}-0`, big.id, bigR, geo, {
    maskId: left ? "fade-right-25" : "fade-left-25",
    focalX: crop.focalX,
    focalY: crop.focalY,
  });
  ctx.bleed.add(bigEl.id);
  ctx.fixedFocal.add(bigEl.id);

  const sorted = res.placed.slice().sort((a, b) => a.idx - b.idx);
  if (input.style !== "scribble") return [bigEl, ...sorted.map((p, i) => photoEl(`${ctx.prefix}-${i + 1}`, photos[p.idx].id, p.r, geo))];

  // Scribble keeps its character: small tilts and tape.
  const lim: Rect = left
    ? { x: fold + 0.032 * W, y: 0.045 * H, w: W - 0.045 * W - (fold + 0.032 * W), h: 0.91 * H }
    : { x: 0.045 * W, y: 0.045 * H, w: fold - 0.032 * W - 0.045 * W, h: 0.91 * H };
  const sign = rng() < 0.5 ? 1 : -1;
  const tilted: Tilted[] = sorted.map((p, k) => {
    const rot = Math.round((k % 2 === 0 ? sign : -sign) * (1.5 + rng() * 2.5) * 10) / 10;
    const t: Tilted = { idx: p.idx, r: p.r, rot };
    clampTilted(t, lim);
    return t;
  });
  return [
    bigEl,
    ...tilted.map((t, i) => photoEl(`${ctx.prefix}-${i + 1}`, photos[t.idx].id, t.r, geo, { rotation: t.rot })),
    ...tapeEls(ctx, tilted, 0, tilted.length),
  ];
}

// ---------------------------------------------------------------------------------------------
// Finishing pass (all styles): lone photo -> full half page, borders/shadows, face-aware crops.
// ---------------------------------------------------------------------------------------------

const FRAME_BORDER = { borderWidth: 3, borderColor: "#ffffff", shadow: 35 } as const;

function frameAspectOf(e: AlbumPhotoElement, geo: Geo): number {
  return (e.widthPct * geo.W) / Math.max(1e-6, e.heightPct * geo.H);
}

function finalizeSpread(ctx: Ctx, input: AlbumElement[]): LayoutOutput {
  const { geo, photos } = ctx;
  let els = input.slice();
  const isPhoto = (e: AlbumElement): e is AlbumPhotoElement => e.type === "photo";
  const aspectOf = (id: string | null) => photos.find((p) => p.id === id)?.aspect ?? 1.5;

  if (geo.double) {
    for (const page of [0, 1]) {
      const x0 = page * 50;
      const x1 = x0 + 50;
      const onPage = (e: AlbumElement) => {
        const cx = e.xPct + e.widthPct / 2;
        return cx >= x0 && cx < x1;
      };
      // A bleed element reaching into this page (the overlap/spread-wide hero) owns it already.
      const taken = els.some((e) => ctx.bleed.has(e.id) && e.xPct < x1 - 1 && e.xPct + e.widthPct > x0 + 1);
      if (taken) continue;
      const lone = els.filter((e) => isPhoto(e) && onPage(e));
      if (lone.length !== 1) continue;
      const el = lone[0] as AlbumPhotoElement;
      const faces = ctx.faces.get(el.photoId ?? "") ?? [];
      const crop = faceCropFocal(aspectOf(el.photoId), geo.pageW / geo.H, faces);
      // Known faces that no half-page crop can keep whole (a wide group): leave it framed.
      if (!crop.fits) continue;
      const full: AlbumPhotoElement = { ...el, xPct: x0, yPct: 0, widthPct: 50, heightPct: 100, focalX: crop.focalX, focalY: crop.focalY };
      delete full.rotation;
      ctx.bleed.add(el.id);
      ctx.fixedFocal.add(el.id);
      // Accent lines / tape on that page would now sit on the photo.
      els = els.filter((e) => e === el || isPhoto(e) || e.type === "text" || !onPage(e)).map((e) => (e === el ? full : e));
    }
  }

  els = els.map((e) => {
    if (!isPhoto(e)) return e;
    const out: AlbumPhotoElement = { ...e };
    delete out.shadowAngle;
    if (ctx.bleed.has(e.id)) {
      delete out.borderWidth;
      delete out.borderColor;
      delete out.shadow;
    } else Object.assign(out, FRAME_BORDER);
    if (!ctx.fixedFocal.has(e.id)) {
      const c = faceCropFocal(aspectOf(e.photoId), frameAspectOf(e, geo), ctx.faces.get(e.photoId ?? "") ?? []);
      out.focalX = c.focalX;
      out.focalY = c.focalY;
    }
    out.zoom = 100;
    return out;
  });
  // Bleed photos at the bottom of the stack; everything else keeps its order above them.
  const bottom = els.filter((e) => ctx.bleed.has(e.id));
  const top = els.filter((e) => !ctx.bleed.has(e.id));
  const bleedIds = bottom.map((e) => e.id);
  return bleedIds.length ? { elements: [...bottom, ...top], bleedIds } : { elements: top };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

function fallbackLayout(ctx: Ctx): AlbumElement[] {
  const { geo, photos, heroIdx } = ctx;
  const H = geo.H;
  const gap = 0.02 * H;
  const regionOf = (p: number) => pageRegion(geo, p, 0.08 * H, 0.07 * H, 0.08 * H, 0.08 * H);
  let placed: Placed[] = [];
  if (geo.double && photos.length > 1) {
    const k = Math.ceil(photos.length / 2);
    for (const [page, idxs] of [
      [FIRST, range(0, k)],
      [SECOND, range(k, photos.length)],
    ] as const) {
      const res = pack(photos, idxs, regionOf(page), gap, { heroIdx });
      if (res) placed.push(...res.placed);
      else idxs.forEach((i, j) => placed.push({ idx: i, r: fitOne(photos[i].aspect, stripCell(regionOf(page), j, idxs.length)) }));
    }
  } else {
    const region = regionOf(geo.double ? FIRST : 0);
    const res = pack(photos, range(0, photos.length), region, gap, { heroIdx });
    placed = res ? res.placed : photos.map((p, j) => ({ idx: j, r: fitOne(p.aspect, stripCell(region, j, photos.length)) }));
  }
  enforceHero(placed, heroIdx, []);
  return placedToEls(ctx, placed);
}

// The j-th of `count` equal columns of a region (last-resort placement).
function stripCell(region: Rect, j: number, count: number): Rect {
  const w = region.w / count;
  return inset({ x: region.x + j * w, y: region.y, w, h: region.h }, w * 0.03, 0);
}

const STYLE_LAYOUTS: Record<AutoStyleId, (ctx: Ctx) => AlbumElement[]> = {
  clean: layoutClean,
  catalog: layoutCatalog,
  scribble: layoutScribble,
  modern: layoutModern,
};

export function layoutSpread(input: LayoutInput): LayoutOutput {
  if (!input.photos.length) return { elements: [] };
  const ctx = makeCtx({ ...input, photos: input.photos.slice(0, 8) });
  const fn = STYLE_LAYOUTS[input.style] ?? layoutClean;
  const elements = layoutOverlap(ctx) ?? fn(ctx);
  // Safety net: a dropped photo means a missing picture in a printed book. Should a style ever fail
  // to place every photo exactly once, fall back to a plain packed layout that always does.
  const placedIds = elements.filter((e): e is AlbumPhotoElement => e.type === "photo").map((e) => e.photoId);
  const complete = placedIds.length === ctx.photos.length && ctx.photos.every((p) => placedIds.includes(p.id));
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
