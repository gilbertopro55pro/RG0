import type { AlbumFrame } from "@/lib/types";

// Powers the album-creation wizard's "build the whole book at once" step: given a total page
// count, a total photo count, and a chosen visual style, produces one frame layout per page —
// every frame left photoId-less (a placeholder), same as applying a page template — so the
// photographer's only remaining job is dragging photos into the boxes. Randomized on every call
// (page-count distribution AND the per-page layout choice) so regenerating with identical inputs
// still produces a different book each time, per the explicit requirement this exists for.
//
// The five styles were tuned against real reference albums the photographer supplied (magazine /
// "מעוצב" / "מקושקש" / urban print-lab templates) rather than guessed from scratch:
//  - magazine: one dominant hero photo against a dense small-photo grid cluster, hard edges.
//  - classic ("מעוצב" reference): fewer, more generous frames with a white mat border and a soft
//    lifted shadow — the closest this system can get to that reference's feathered/vignetted
//    edges without a genuinely new soft-mask rendering primitive (noted as a possible follow-up).
//  - scribbled ("מקושקש"): a loose scrapbook scatter — tilted, white-bordered "polaroid" frames
//    at jittered positions instead of a strict grid.
//  - urban: clean, disciplined, mostly-uniform grids with generous white gutters — no reference
//    named "clean line" was supplied, so the album's own gap/margin conventions carry the "clean"
//    read instead of a busy collage.
//  - clean: no reference supplied for this one — kept deliberately minimal (one photo per page,
//    generous matting) since that's the least ambiguous reading of "קו נקי" on its own.

export type AlbumStyleId = "magazine" | "classic" | "scribbled" | "urban" | "clean";

export const ALBUM_STYLE_OPTIONS: { id: AlbumStyleId; label: string; description: string }[] = [
  { id: "magazine", label: "מגזין", description: "תמונה מרכזית דומיננטית לצד רשת תמונות קטנות דחוסה" },
  { id: "classic", label: "קלאסי", description: "מסגרת לבנה וצל רך לכל תמונה, קומפוזיציה מאוזנת ורגועה" },
  { id: "scribbled", label: "מקושקש", description: "תמונות מפוזרות בזוויות שונות, כמו אלבום גזירים" },
  { id: "urban", label: "אורבני", description: "רשתות אחידות ונקיות עם המון רווח לבן בין התמונות" },
  { id: "clean", label: "קו נקי", description: "מינימליסטי: תמונה אחת בעמוד, המון רווח לבן" },
];

type StyleParams = {
  maxPerPage: number;
  gap: number; // pct
  margin: number; // pct — outer inset (a picture-mat effect); 0 reads as full-bleed
  heroChance: number; // probability an n>=2 page gets one dominant frame instead of a plain grid
  fullBleedChance: number; // for n=1 pages, chance of a 0-margin frame vs a matted one
  borderWidth?: number; // px, applied to every frame when set (the "polaroid"/mat look)
  borderColor?: string;
  shadow?: number; // 0-100, applied to every frame when set
};

const STYLE_PARAMS: Record<AlbumStyleId, StyleParams> = {
  magazine: { maxPerPage: 9, gap: 1, margin: 2, heroChance: 0.6, fullBleedChance: 0.4 },
  classic: { maxPerPage: 4, gap: 4, margin: 7, heroChance: 0.2, fullBleedChance: 0.3, borderWidth: 10, borderColor: "#ffffff", shadow: 35 },
  scribbled: { maxPerPage: 5, gap: 0, margin: 8, heroChance: 0, fullBleedChance: 0, borderWidth: 12, borderColor: "#ffffff", shadow: 45 },
  urban: { maxPerPage: 9, gap: 2.5, margin: 4, heroChance: 0.1, fullBleedChance: 0.5 },
  clean: { maxPerPage: 1, gap: 5, margin: 14, heroChance: 0, fullBleedChance: 0.25 },
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
// tile in a strip alongside it — the "magazine spread" look: a hero portrait against a dense
// cluster of small candid shots.
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

// A loose scrapbook scatter: a near-square grid of cells, but each frame is shrunk within its
// cell and nudged/rotated at random — the "מקושקש" reference's tilted, hand-arranged look,
// approximated without true photo-photo collision detection (the shrink + conservative jitter
// keeps neighbors from meaningfully overlapping in practice).
function scatterLayout(n: number, prefix: string, margin: number, rng: () => number): AlbumFrame[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const usableW = 100 - margin * 2;
  const usableH = 100 - margin * 2;
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const frames: AlbumFrame[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const itemsInRow = Math.min(cols, n - idx);
    const rowOffset = ((cols - itemsInRow) * cellW) / 2;
    for (let c = 0; c < itemsInRow; c++) {
      const cellX = margin + rowOffset + c * cellW;
      const cellY = margin + r * cellH;
      const shrink = 0.62 + rng() * 0.14;
      const w = cellW * shrink;
      const h = cellH * shrink;
      const jitterX = (cellW - w) * (rng() - 0.5) * 0.9;
      const jitterY = (cellH - h) * (rng() - 0.5) * 0.9;
      const rotation = Math.round((rng() - 0.5) * 24);
      frames.push({
        id: `${prefix}-${idx}`,
        xPct: cellX + (cellW - w) / 2 + jitterX,
        yPct: cellY + (cellH - h) / 2 + jitterY,
        widthPct: w,
        heightPct: h,
        rotation,
      });
      idx++;
    }
  }
  return frames;
}

function applyStylePresentation(frames: AlbumFrame[], style: StyleParams): AlbumFrame[] {
  if (!style.borderWidth && !style.shadow) return frames;
  return frames.map((f) => ({ ...f, borderWidth: style.borderWidth, borderColor: style.borderColor, shadow: style.shadow }));
}

function layoutForCount(n: number, prefix: string, styleId: AlbumStyleId, style: StyleParams, rng: () => number): AlbumFrame[] {
  let frames: AlbumFrame[];
  if (styleId === "scribbled") {
    frames = scatterLayout(n, prefix, style.margin, rng);
  } else if (n <= 1) {
    const matted = rng() >= style.fullBleedChance;
    const m = matted ? style.margin : 0;
    frames = [frame(`${prefix}-0`, m, m, 100 - m * 2, 100 - m * 2)];
  } else if (rng() < style.heroChance) {
    frames = heroLayout(n, prefix, style.gap, style.margin, rng);
  } else {
    frames = gridLayout(n, prefix, style.gap, style.margin);
  }
  return applyStylePresentation(frames, style);
}

// Returns one AlbumFrame[] per page (length === the actual page count used, which may be less
// than requested if there weren't enough photos to give every page at least one).
export function generateStyledAlbum(pageCount: number, photoCount: number, styleId: AlbumStyleId): AlbumFrame[][] {
  const style = STYLE_PARAMS[styleId];
  const effectivePageCount = Math.max(1, Math.min(pageCount, Math.max(1, photoCount)));
  const rng = Math.random;
  const counts = distributeCounts(Math.max(photoCount, effectivePageCount), effectivePageCount, style.maxPerPage, rng);
  return counts.map((n, i) => layoutForCount(n, `p${i}`, styleId, style, rng));
}
