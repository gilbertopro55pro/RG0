import type { AlbumFrame } from "@/lib/types";

// Powers the album-creation wizard's "build the whole book at once" step: given a total page
// count, a total photo count, and a chosen visual style, produces one frame layout per page —
// every frame left photoId-less (a placeholder), same as applying a page template — so the
// photographer's only remaining job is dragging photos into the boxes. Randomized on every call
// (page-count distribution AND the hero/grid choice per page) so regenerating with identical
// inputs still produces a different book each time, per the explicit requirement this exists for.

export type AlbumStyleId = "magazine" | "classic" | "clean" | "urban";

export const ALBUM_STYLE_OPTIONS: { id: AlbumStyleId; label: string; description: string }[] = [
  { id: "magazine", label: "מגזין", description: "עמודים דינמיים, תמונה מרכזית מודגשת לצד תמונות משנה" },
  { id: "classic", label: "קלאסי", description: "סימטרי ומאוזן — תמונה אחת או שתיים בעמוד, מסגור נדיב" },
  { id: "clean", label: "קו נקי", description: "מינימליסטי — תמונה אחת בעמוד, המון רווח לבן" },
  { id: "urban", label: "אורבני", description: "רשתות צפופות ומודרניות, כמה תמונות בעמוד" },
];

type StyleParams = {
  maxPerPage: number;
  gap: number; // pct
  margin: number; // pct — outer inset (a picture-mat effect); 0 reads as full-bleed
  heroChance: number; // probability an n>=2 page gets one dominant frame instead of a plain grid
  fullBleedChance: number; // for n=1 pages, chance of a 0-margin frame vs a matted one
};

const STYLE_PARAMS: Record<AlbumStyleId, StyleParams> = {
  magazine: { maxPerPage: 5, gap: 2, margin: 3, heroChance: 0.65, fullBleedChance: 0.5 },
  classic: { maxPerPage: 2, gap: 3, margin: 6, heroChance: 0.15, fullBleedChance: 0.35 },
  clean: { maxPerPage: 1, gap: 5, margin: 14, heroChance: 0, fullBleedChance: 0.25 },
  urban: { maxPerPage: 6, gap: 1, margin: 2, heroChance: 0.2, fullBleedChance: 0.8 },
};

function frame(id: string, x: number, y: number, w: number, h: number): AlbumFrame {
  return { id, xPct: x, yPct: y, widthPct: w, heightPct: h };
}

// Spreads `photoCount` across `pageCount` pages — every page gets at least 1 (a page with zero
// photos isn't meaningful for this wizard) and the rest are handed out at random up to the
// style's per-page cap, relaxing that cap gradually if there are more photos than the cap and
// page count can otherwise absorb.
function distributeCounts(photoCount: number, pageCount: number, maxPerPage: number, rng: () => number): number[] {
  const counts = new Array(pageCount).fill(1);
  let remaining = photoCount - pageCount;
  let softCap = maxPerPage;
  let stuckStreak = 0;
  while (remaining > 0) {
    const idx = Math.floor(rng() * pageCount);
    if (counts[idx] < softCap) {
      counts[idx]++;
      remaining--;
      stuckStreak = 0;
    } else if (++stuckStreak > pageCount * 3) {
      softCap++;
      stuckStreak = 0;
    }
  }
  return counts;
}

function gridLayout(n: number, prefix: string, gap: number, margin: number): AlbumFrame[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const usableW = 100 - margin * 2;
  const usableH = 100 - margin * 2;
  const heightPct = (usableH - gap * (rows - 1)) / rows;
  const frames: AlbumFrame[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const itemsInRow = Math.min(cols, n - idx);
    const widthPct = (usableW - gap * (itemsInRow - 1)) / itemsInRow;
    for (let c = 0; c < itemsInRow; c++) {
      frames.push(frame(`${prefix}-${idx}`, margin + c * (widthPct + gap), margin + r * (heightPct + gap), widthPct, heightPct));
      idx++;
    }
  }
  return frames;
}

// One frame dominates ~55-70% of the page (left/right or top/bottom, picked at random), the rest
// tile in a strip alongside it — the "magazine spread" look.
function heroLayout(n: number, prefix: string, gap: number, margin: number, rng: () => number): AlbumFrame[] {
  const horizontal = rng() < 0.5;
  const heroFrac = 0.55 + rng() * 0.15;
  const usableW = 100 - margin * 2;
  const usableH = 100 - margin * 2;
  const restN = n - 1;
  const frames: AlbumFrame[] = [];
  if (horizontal) {
    const heroW = usableW * heroFrac - gap / 2;
    const restW = usableW - heroW - gap;
    frames.push(frame(`${prefix}-0`, margin, margin, heroW, usableH));
    const cellH = (usableH - gap * (restN - 1)) / restN;
    for (let i = 0; i < restN; i++) {
      frames.push(frame(`${prefix}-${i + 1}`, margin + heroW + gap, margin + i * (cellH + gap), restW, cellH));
    }
  } else {
    const heroH = usableH * heroFrac - gap / 2;
    const restH = usableH - heroH - gap;
    frames.push(frame(`${prefix}-0`, margin, margin, usableW, heroH));
    const cellW = (usableW - gap * (restN - 1)) / restN;
    for (let i = 0; i < restN; i++) {
      frames.push(frame(`${prefix}-${i + 1}`, margin + i * (cellW + gap), margin + heroH + gap, cellW, restH));
    }
  }
  return frames;
}

function layoutForCount(n: number, prefix: string, style: StyleParams, rng: () => number): AlbumFrame[] {
  if (n <= 1) {
    const matted = rng() >= style.fullBleedChance;
    const m = matted ? style.margin : 0;
    return [frame(`${prefix}-0`, m, m, 100 - m * 2, 100 - m * 2)];
  }
  if (rng() < style.heroChance) return heroLayout(n, prefix, style.gap, style.margin, rng);
  return gridLayout(n, prefix, style.gap, style.margin);
}

// Returns one AlbumFrame[] per page (length === the actual page count used, which may be less
// than requested if there weren't enough photos to give every page at least one).
export function generateStyledAlbum(pageCount: number, photoCount: number, styleId: AlbumStyleId): AlbumFrame[][] {
  const style = STYLE_PARAMS[styleId];
  const effectivePageCount = Math.max(1, Math.min(pageCount, Math.max(1, photoCount)));
  const rng = Math.random;
  const counts = distributeCounts(Math.max(photoCount, effectivePageCount), effectivePageCount, style.maxPerPage, rng);
  return counts.map((n, i) => layoutForCount(n, `p${i}`, style, rng));
}
