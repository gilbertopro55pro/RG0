// Automatic collage layout (admin, 2026-10-23): N photos on one landscape page, edge to edge with an
// even gap between them and around them, every photo shown as large as the page allows and cropped
// as little as possible. Pure and deterministic: the same photos, page and variant always give the
// same layout, so the preview and the exported file are the same picture.
//
// Three shapes, each tried in many arrangements; the one that crops least wins:
// - rows: justified rows across the page (every photo in a row is as tall as the others in it);
// - columns: the same, standing (good for many portrait photos);
// - hero: one photo the full height of the page on one side, the others in rows or columns beside it.
// A justified row gives every photo its own width at a common height, so the only crop is the one
// that makes the rows (or columns) fill the page exactly: the same factor for every photo in them.

export type CollageFace = { x: number; y: number; width: number; height: number };
export type CollagePhoto = { id: string; aspect: number };
export type CollageStyle = "hero" | "rows" | "columns";
// x, y, w, h: fractions of the page (0–1).
export type CollageCell = { photoId: string; x: number; y: number; w: number; h: number };
export type CollageLayout = { style: CollageStyle; cells: CollageCell[]; maxCrop: number; signature: string };

export type CollageLayoutOptions = {
  // The page's width over its height (landscape: 1 or more).
  aspect: number;
  // The gap between photos and around them, as a fraction of the page's width.
  gap: number;
  style?: CollageStyle | "auto";
  // 0 = the best layout; 1, 2, … the next best ones that look different ("עיצוב אחר").
  variant?: number;
};

// A layout cropping more than this is a last resort: shown only when nothing crops less.
export const COLLAGE_MAX_CROP = 1.45;

type Rect = { x: number; y: number; w: number; h: number };
type Placed = { photoId: string; rect: Rect };
type Candidate = { style: CollageStyle; placed: Placed[]; maxCrop: number; score: number; signature: string };

// Deterministic shuffles (mulberry32): the same seed, the same order.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Splits n photos into k rows, each with a count near n/k (the even rows a person would make; very
// uneven splits only crop worse).
function compositions(n: number, k: number): number[][] {
  // With many photos the rows only differ by one (more freedom adds thousands of near-identical
  // tries and no better layout).
  const slack = n <= 9 ? 1 : 0;
  const lo = Math.max(1, Math.floor(n / k) - slack);
  const hi = Math.ceil(n / k) + slack;
  const out: number[][] = [];
  const walk = (left: number, rows: number, acc: number[]) => {
    if (rows === 0) {
      if (left === 0) out.push(acc);
      return;
    }
    for (let c = lo; c <= Math.min(hi, left - (rows - 1) * lo); c++) walk(left - c, rows - 1, [...acc, c]);
  };
  walk(n, k, []);
  return out;
}

// Justified rows filling `rect`: each row as tall as its photos need to fill the width, then all rows
// scaled together so they fill the height. Returns the crop that costs (the same for every photo) and
// how uneven the rows' heights are.
function fillRows(rect: Rect, photos: CollagePhoto[], sizes: number[], gap: number): { placed: Placed[]; crop: number; uneven: number } | null {
  const rows: CollagePhoto[][] = [];
  let at = 0;
  for (const s of sizes) {
    rows.push(photos.slice(at, at + s));
    at += s;
  }
  const natural = rows.map((row) => (rect.w - (row.length - 1) * gap) / row.reduce((sum, p) => sum + p.aspect, 0));
  if (natural.some((h) => !(h > 0))) return null;
  const room = rect.h - (rows.length - 1) * gap;
  if (room <= 0) return null;
  const scale = room / natural.reduce((a, b) => a + b, 0);
  const placed: Placed[] = [];
  let y = rect.y;
  rows.forEach((row, r) => {
    const height = natural[r] * scale;
    let x = rect.x;
    row.forEach((p, i) => {
      // The last photo takes what's left, so the row ends exactly at the edge.
      const width = i === row.length - 1 ? rect.x + rect.w - x : p.aspect * natural[r];
      placed.push({ photoId: p.id, rect: { x, y, w: width, h: height } });
      x += width + gap;
    });
    y += height + gap;
  });
  const heights = natural.map((h) => h * scale);
  return { placed, crop: Math.max(scale, 1 / scale), uneven: Math.max(...heights) / Math.min(...heights) };
}

// The same, as columns: rows of the page turned on its side.
function fillColumns(rect: Rect, photos: CollagePhoto[], sizes: number[], gap: number) {
  const turned = fillRows({ x: rect.y, y: rect.x, w: rect.h, h: rect.w }, photos.map((p) => ({ id: p.id, aspect: 1 / p.aspect })), sizes, gap);
  if (!turned) return null;
  return { ...turned, placed: turned.placed.map(({ photoId, rect: r }) => ({ photoId, rect: { x: r.y, y: r.x, w: r.h, h: r.w } })) };
}

// How many rows (or columns) are worth trying for n photos in a box of this shape: around the count
// that makes the cells about as tall as they are wide, one either side.
function rowCounts(n: number, boxAspect: number, avgAspect: number): number[] {
  const ideal = Math.sqrt((n * avgAspect) / boxAspect);
  const center = Math.max(1, Math.round(ideal));
  const out = new Set<number>();
  for (let k = center - 1; k <= center + 1; k++) if (k >= 1 && k <= n && k <= 6) out.add(k);
  if (out.size === 0) out.add(1);
  return [...out];
}

function score(maxCrop: number, uneven: number): number {
  // Cropping is what a photographer notices; very different row heights next, a little.
  return (maxCrop - 1) * 4 + (uneven - 1) * 0.6 + (maxCrop > COLLAGE_MAX_CROP ? 10 : 0);
}

function gridCandidates(rect: Rect, photos: CollagePhoto[], gap: number, style: "rows" | "columns", orders: CollagePhoto[][], tag: string): Candidate[] {
  const n = photos.length;
  const avg = photos.reduce((s, p) => s + p.aspect, 0) / n;
  const counts = style === "rows" ? rowCounts(n, rect.w / rect.h, avg) : rowCounts(n, rect.h / rect.w, 1 / avg);
  const out: Candidate[] = [];
  for (const k of counts) {
    for (const sizes of compositions(n, k)) {
      for (const order of orders) {
        const filled = style === "rows" ? fillRows(rect, order, sizes, gap) : fillColumns(rect, order, sizes, gap);
        if (!filled) continue;
        out.push({ style, placed: filled.placed, maxCrop: filled.crop, score: score(filled.crop, filled.uneven), signature: `${tag}${style}:${sizes.join("-")}` });
      }
    }
  }
  return out;
}

// The orders tried: as given, then shuffles. A row's crop depends on which photos share it, so the
// same row sizes with other photos together can crop a lot less.
function ordersOf(photos: CollagePhoto[], count: number, seed: number): CollagePhoto[][] {
  const orders = [photos];
  // Portraits and landscapes alternating: rows of mixed shapes fill evenly.
  const portrait = photos.filter((p) => p.aspect < 1);
  const landscape = photos.filter((p) => p.aspect >= 1);
  const mixed: CollagePhoto[] = [];
  for (let i = 0; i < Math.max(portrait.length, landscape.length); i++) {
    if (landscape[i]) mixed.push(landscape[i]);
    if (portrait[i]) mixed.push(portrait[i]);
  }
  orders.push(mixed);
  for (let i = 0; i < count; i++) orders.push(shuffled(photos, seed * 7919 + i * 104729 + 17));
  return orders;
}

function heroCandidates(inner: Rect, photos: CollagePhoto[], gap: number, seed: number): Candidate[] {
  if (photos.length < 3) return [];
  const out: Candidate[] = [];
  // Hero choices: the photos best shaped to stand the full height, the given order's first photo
  // (the picker puts the best one first) always among them.
  const byFit = [...photos].sort((a, b) => a.aspect - b.aspect);
  const heroes = [...new Set([photos[0], ...byFit.slice(0, 2)])];
  for (const hero of heroes) {
    const rest = photos.filter((p) => p !== hero);
    const natural = hero.aspect * inner.h;
    // Its own width at the full height when that's a fair share of the page, and two fixed shares.
    const widths = [natural, inner.w * 0.36, inner.w * 0.45].map((w) => Math.min(Math.max(w, inner.w * 0.3), inner.w * 0.55));
    for (const w of [...new Set(widths.map((v) => Math.round(v * 1e6) / 1e6))]) {
      const share = w / inner.w;
      const heroCrop = Math.max(natural / w, w / natural);
      for (const side of ["left", "right"] as const) {
        const heroRect: Rect = side === "left" ? { x: inner.x, y: inner.y, w, h: inner.h } : { x: inner.x + inner.w - w, y: inner.y, w, h: inner.h };
        const restRect: Rect = side === "left" ? { x: inner.x + w + gap, y: inner.y, w: inner.w - w - gap, h: inner.h } : { x: inner.x, y: inner.y, w: inner.w - w - gap, h: inner.h };
        if (restRect.w <= 0) continue;
        const orders = ordersOf(rest, rest.length > 12 ? 2 : 4, seed + hero.id.length + (side === "left" ? 1 : 2));
        for (const style of ["rows", "columns"] as const) {
          for (const c of gridCandidates(restRect, rest, gap, style, orders, `hero-${side}-${Math.round(share * 100)}+`)) {
            const maxCrop = Math.max(c.maxCrop, heroCrop);
            // A hero is the point of this shape: a small bonus over plain rows that crop the same.
            out.push({ style: "hero", placed: [{ photoId: hero.id, rect: heroRect }, ...c.placed], maxCrop, score: c.score + (maxCrop - c.maxCrop) * 4 - 0.05, signature: `${c.signature}|${hero.id}` });
          }
        }
      }
    }
  }
  return out;
}

export function collageLayout(photos: CollagePhoto[], opts: CollageLayoutOptions): CollageLayout | null {
  const usable = photos.filter((p) => p.aspect > 0 && Number.isFinite(p.aspect));
  if (usable.length === 0 || !(opts.aspect > 0)) return null;
  const W = opts.aspect;
  const H = 1;
  const gap = Math.max(0, opts.gap) * W;
  const inner: Rect = { x: gap, y: gap, w: W - 2 * gap, h: H - 2 * gap };
  const variant = Math.max(0, Math.floor(opts.variant ?? 0));
  const style = opts.style ?? "auto";

  const candidates: Candidate[] = [];
  const orders = ordersOf(usable, usable.length > 12 ? 4 : 10, 1);
  if (style === "auto" || style === "rows") candidates.push(...gridCandidates(inner, usable, gap, "rows", orders, ""));
  if (style === "auto" || style === "columns") candidates.push(...gridCandidates(inner, usable, gap, "columns", orders, ""));
  if (style === "auto" || style === "hero") candidates.push(...heroCandidates(inner, usable, gap, 1));
  if (candidates.length === 0) {
    // A hero needs 3 photos: fewer fall back to rows.
    candidates.push(...gridCandidates(inner, usable, gap, "rows", orders, ""));
  }
  candidates.sort((a, b) => a.score - b.score || (a.signature < b.signature ? -1 : 1));

  // One per look (shape and row sizes), best first. "עיצוב אחר" should look different at once, so the
  // variant takes the families in turn (the big photo on the left, on the right, rows, columns), the
  // best of each first, the good ones before the rest, and comes back around.
  const seen = new Set<string>();
  const distinct: Candidate[] = [];
  for (const c of candidates) {
    const look = c.signature.replace(/\|.*$/, "");
    if (seen.has(look)) continue;
    seen.add(look);
    distinct.push(c);
  }
  const good = distinct.filter((c) => c.maxCrop <= COLLAGE_MAX_CROP);
  const families = new Map<string, Candidate[]>();
  for (const c of good.length > 0 ? good : distinct) {
    const family = c.style === "hero" ? c.signature.slice(0, c.signature.indexOf("-", 5)) : c.style;
    const list = families.get(family) ?? [];
    list.push(c);
    families.set(family, list);
  }
  const lists = [...families.values()];
  const pool: Candidate[] = [];
  for (let round = 0; pool.length < lists.reduce((s, l) => s + l.length, 0); round++) for (const l of lists) if (l[round]) pool.push(l[round]);
  const chosen = pool[variant % pool.length];
  return {
    style: chosen.style,
    maxCrop: chosen.maxCrop,
    signature: chosen.signature,
    cells: chosen.placed.map(({ photoId, rect }) => ({ photoId, x: rect.x / W, y: rect.y / H, w: rect.w / W, h: rect.h / H })),
  };
}

// The part of a photo a cell shows (fractions of the photo): the cell's shape cut from the photo, as
// little as possible, placed around the faces when there are any. The main faces (at least 40% the
// height of the biggest) stay inside, with room above the head; without faces a wide photo is cut
// at its middle and a tall one a third of the way down, where heads usually are.
export function collageCrop(photoAspect: number, cellAspect: number, faces: CollageFace[] = []): { sx: number; sy: number; sw: number; sh: number } {
  if (!(photoAspect > 0) || !(cellAspect > 0)) return { sx: 0, sy: 0, sw: 1, sh: 1 };
  const biggest = Math.max(0, ...faces.map((f) => f.height));
  const main = faces.filter((f) => f.width > 0 && f.height > 0 && f.height >= biggest * 0.4);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  if (photoAspect > cellAspect) {
    const sw = cellAspect / photoAspect;
    if (main.length === 0) return { sx: (1 - sw) / 2, sy: 0, sw, sh: 1 };
    const left = Math.min(...main.map((f) => f.x));
    const right = Math.max(...main.map((f) => f.x + f.width));
    // Centered on the faces; when they're wider than the window, on their middle.
    return { sx: clamp((left + right) / 2 - sw / 2, 1 - sw), sy: 0, sw, sh: 1 };
  }
  const sh = photoAspect / cellAspect;
  if (main.length === 0) return { sx: 0, sy: clamp((1 - sh) * 0.3, 1 - sh), sw: 1, sh };
  // The highest head's top: a face box starts at the eyebrows, so the hair needs about a third more.
  const headTop = Math.min(...main.map((f) => f.y - f.height * 0.35));
  const bottom = Math.max(...main.map((f) => f.y + f.height));
  const center = (Math.min(...main.map((f) => f.y)) + bottom) / 2;
  // The faces about two fifths down the window, never the heads cut and never the faces' bottom.
  let sy = center - sh * 0.4;
  sy = Math.min(sy, headTop);
  sy = Math.max(sy, bottom - sh);
  return { sx: 0, sy: clamp(sy, 1 - sh), sw: 1, sh };
}
