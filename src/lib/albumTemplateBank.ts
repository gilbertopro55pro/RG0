import type { AlbumFrame } from "@/lib/types";

// Replaces the old hand-authored BUILT_IN_TEMPLATES flat list with a procedurally generated bank,
// organized into 10 tabs by photo count (2..9, "10", "10+") with 50 distinct layouts each —
// deterministic (seeded), so the picker shows the same 500 options on every open instead of
// reshuffling, unlike the album-wizard generator which is deliberately re-randomized every call.
//
// Every frame starts from one of a handful of real print aspect ratios (10x15, 10x7.5, 13x18 —
// portrait or landscape); rows are then stretched (at most ×/÷MAX_STRETCH) so every template covers
// TEMPLATE_COVERAGE (75%–95%) of the canvas — photos are cover-cropped, so the drift is fine. Ratios are
// expressed relative to REFERENCE_ASPECT, the 16:10 page shape every canvas/preview box in this
// app already renders at (see the `aspect-[16/10]` class used throughout AlbumSpreadCanvasEditor)
// — since widthPct/heightPct are both percentages of that SAME fixed-shape box, preserving their
// ratio in plain percentage terms also preserves the true on-screen print ratio, no further
// conversion needed. A differently-shaped album (chosen freely in the wizard) will see a slightly
// different effective ratio once applied, the same approximation every other template in this app
// already makes — there's no way to know the target album's real shape at picker-render time.

export type TemplateTabKey = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "10+";

export const TEMPLATE_TABS: { key: TemplateTabKey; label: string }[] = [
  { key: "2", label: "2 תמונות" },
  { key: "3", label: "3 תמונות" },
  { key: "4", label: "4 תמונות" },
  { key: "5", label: "5 תמונות" },
  { key: "6", label: "6 תמונות" },
  { key: "7", label: "7 תמונות" },
  { key: "8", label: "8 תמונות" },
  { key: "9", label: "9 תמונות" },
  { key: "10", label: "10 תמונות" },
  { key: "10+", label: "+10 תמונות" },
];

const REFERENCE_ASPECT = 16 / 10;
// Real print ratios (portrait width:height) — 10x15, 10x7.5, 13x18. Every frame gets one of these
// or its landscape inverse, never a freehand rectangle.
const PRINT_RATIOS = [2 / 3, 3 / 4, 13 / 18];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPrintRatio(rng: () => number): number {
  const base = PRINT_RATIOS[Math.floor(rng() * PRINT_RATIOS.length)];
  return rng() < 0.5 ? base : 1 / base;
}

function pctRatioFor(printRatio: number): number {
  return printRatio / REFERENCE_ASPECT;
}

// Coverage rule (owner's decision): every template's frames cover 75%–95% of the canvas —
// no big empty bands above/below a row layout.
export const TEMPLATE_COVERAGE = { min: 0.75, max: 0.95 };

// Σ(w·h)/10000 of the frames (percent-of-canvas frames, which never overlap).
export function templateCoverage(frames: AlbumFrame[]): number {
  return frames.reduce((s, f) => s + f.widthPct * f.heightPct, 0) / 10000;
}

// The tab a page with n photos belongs to: n<=2 → "2", 3..10 → String(n), >10 → "10+".
export function templateTabFor(n: number): TemplateTabKey {
  if (n <= 2) return "2";
  if (n > 10) return "10+";
  return String(Math.round(n)) as TemplateTabKey;
}

// How far a frame may drift from its print ratio once rows are stretched to fill the page height
// (photos are cover-cropped into frames, so a moderate drift is invisible). Kept a bit under the
// ×/÷1.35 limit for safety.
const MAX_STRETCH = 1.28;

// Real (16:10-page) aspect drift of a frame from the nearest print ratio, ≥ 1.
function aspectDrift(f: AlbumFrame): number {
  const real = (f.widthPct / f.heightPct) * REFERENCE_ASPECT;
  let best = Infinity;
  for (const base of PRINT_RATIOS) {
    for (const r of [base, 1 / base]) best = Math.min(best, Math.max(real / r, r / real));
  }
  return best;
}

// Splits n photos into rows. The ideal row count (≈0.8·√n) makes rows that fill the full width
// come out close to the page's height; a random ±1 nudge adds variety, and candidates whose
// height can't be reached within MAX_STRETCH are rejected by the caller and re-rolled.
function randomPartition(n: number, rng: () => number): number[] {
  const idealRows = 0.8 * Math.sqrt(n);
  const rows = Math.max(1, Math.min(n, Math.round(idealRows + (rng() - 0.5) * 1.6)));
  const base = Math.floor(n / rows);
  const remainder = n - base * rows;
  const parts = new Array(rows).fill(base);
  const order = [...parts.keys()].sort(() => rng() - 0.5);
  for (let i = 0; i < remainder; i++) parts[order[i]]++;
  // A little variety beyond the even split: occasionally shift one photo from a larger row to its
  // neighbor, so not every generated template has perfectly uniform row sizes.
  if (rows >= 2 && rng() < 0.4) {
    const from = parts.findIndex((p) => p > 1);
    if (from !== -1) {
      parts[from]--;
      parts[(from + 1) % rows]++;
    }
  }
  return parts;
}

// One candidate layout: rows that each fill the usable width with print-ratio frames, then every
// row's height stretched by the same factor (clamped to MAX_STRETCH) so the rows fill the usable
// height too. If even the clamped rows overflow, everything shrinks uniformly and is centred
// horizontally; if they fall short, the block is centred vertically. Gutters stay constant.
function candidateFrames(n: number, rng: () => number): AlbumFrame[] {
  const dense = n > 12;
  const margin = (dense ? 2.2 : 2.6) + rng() * (dense ? 1.2 : 1.8);
  const gap = (dense ? 1.1 : 1.3) + rng() * (dense ? 0.7 : 1.0);
  const usableWidth = 100 - margin * 2;
  const usableHeight = 100 - margin * 2;

  const partition = randomPartition(n, rng);
  const rows = partition.map((count) => {
    const uniform = rng() < 0.7;
    const pctRatios = uniform
      ? new Array(count).fill(pctRatioFor(pickPrintRatio(rng)))
      : Array.from({ length: count }, () => pctRatioFor(pickPrintRatio(rng)));
    const sum = pctRatios.reduce((s, r) => s + r, 0);
    const rowHeight = (usableWidth - gap * (count - 1)) / sum;
    return { pctRatios, widths: pctRatios.map((r) => r * rowHeight), rowHeight };
  });

  const gapsV = gap * (rows.length - 1);
  const natural = rows.reduce((s, r) => s + r.rowHeight, 0);
  const availV = usableHeight - gapsV;
  const stretch = Math.max(1 / MAX_STRETCH, Math.min(MAX_STRETCH, availV / natural));
  // Uniform shrink (keeps aspects) when the clamped rows still overflow the page height.
  const shrink = Math.min(1, availV / (natural * stretch));
  const totalH = natural * stretch * shrink + gapsV;

  const frames: AlbumFrame[] = [];
  let y = margin + (usableHeight - totalH) / 2;
  let idx = 0;
  for (const row of rows) {
    const h = row.rowHeight * stretch * shrink;
    const widths = row.widths.map((w) => w * shrink);
    const rowW = widths.reduce((s, w) => s + w, 0) + gap * (widths.length - 1);
    let x = margin + (usableWidth - rowW) / 2;
    for (const w of widths) {
      frames.push({ id: `t-${idx}`, xPct: x, yPct: y, widthPct: w, heightPct: h });
      x += w + gap;
      idx++;
    }
    y += h + gap;
  }
  return frames;
}

function isValidTemplate(frames: AlbumFrame[]): boolean {
  const c = templateCoverage(frames);
  if (c < TEMPLATE_COVERAGE.min + 0.005 || c > TEMPLATE_COVERAGE.max - 0.005) return false;
  return frames.every((f) => aspectDrift(f) <= MAX_STRETCH + 0.02);
}

// A plain grid fallback (never expected to be needed): near-square column count, cells filling the
// usable area.
function gridFrames(n: number): AlbumFrame[] {
  const margin = 2.5;
  const gap = 1.2;
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.3)));
  const rowsN = Math.ceil(n / cols);
  const usable = 100 - margin * 2;
  const h = (usable - gap * (rowsN - 1)) / rowsN;
  const frames: AlbumFrame[] = [];
  for (let r = 0; r < rowsN; r++) {
    const count = r === rowsN - 1 ? n - cols * (rowsN - 1) : cols;
    const w = (usable - gap * (count - 1)) / count;
    for (let c = 0; c < count; c++) {
      frames.push({ id: `t-${frames.length}`, xPct: margin + c * (w + gap), yPct: margin + r * (h + gap), widthPct: w, heightPct: h });
    }
  }
  return frames;
}

// A deterministic template with exactly n frames (n ≥ 1), coverage within TEMPLATE_COVERAGE,
// frames aligned in rows with even gutters. Same (n, seed) → same frames. Candidates that miss the
// coverage/aspect rules are re-rolled from the same seeded stream.
export function generateTemplateFrames(n: number, seed: number): AlbumFrame[] {
  const count = Math.max(1, Math.floor(n));
  const rng = mulberry32((Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(count, 40503)) + 7);
  for (let attempt = 0; attempt < 400; attempt++) {
    const frames = candidateFrames(count, rng);
    if (isValidTemplate(frames)) return frames;
  }
  return gridFrames(count);
}

function buildTabTemplates(tabKey: TemplateTabKey, tabIndex: number): { name: string; frames: AlbumFrame[] }[] {
  const out: { name: string; frames: AlbumFrame[] }[] = [];
  for (let i = 0; i < 50; i++) {
    const seed = tabIndex * 100003 + i * 977 + 1;
    const n = tabKey === "10+" ? 11 + Math.floor(mulberry32(seed)() * 8) : Number(tabKey);
    out.push({ name: `${n} תמונות #${i + 1}`, frames: generateTemplateFrames(n, seed) });
  }
  return out;
}

export const TEMPLATE_BANK: Record<TemplateTabKey, { name: string; frames: AlbumFrame[] }[]> = Object.fromEntries(
  TEMPLATE_TABS.map((t, idx) => [t.key, buildTabTemplates(t.key, idx)])
) as Record<TemplateTabKey, { name: string; frames: AlbumFrame[] }[]>;
