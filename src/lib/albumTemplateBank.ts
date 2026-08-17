import type { AlbumFrame } from "@/lib/types";

// Replaces the old hand-authored BUILT_IN_TEMPLATES flat list with a procedurally generated bank,
// organized into 10 tabs by photo count (2..9, "10", "10+") with 50 distinct layouts each —
// deterministic (seeded), so the picker shows the same 500 options on every open instead of
// reshuffling, unlike the album-wizard generator which is deliberately re-randomized every call.
//
// Every frame's width/height is locked to one of a handful of real print aspect ratios (10x15,
// 10x7.5, 13x18 — portrait or landscape) so nothing lands on a non-standard rectangle. Ratios are
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

// Splits n photos into rows of 1-4, biased toward smaller rows for variety.
function randomPartition(n: number, rng: () => number): number[] {
  const parts: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    const maxPart = Math.min(4, remaining);
    const size = Math.min(1 + Math.floor(rng() * maxPart), remaining);
    parts.push(size);
    remaining -= size;
  }
  // Avoid a pure single-column layout (every row exactly 1 photo, stacked top to bottom) once
  // there are enough photos that it reads as one long vertical strip rather than a couple of
  // deliberate rows. Every row is >=1 by construction, so `parts.length === n` alone already
  // means every row is exactly 1 (n rows of >=1 summing to n forces each to be 1) — merge the
  // last two singles into a row of 2 instead of re-rolling.
  if (n >= 3 && parts.length === n) {
    parts.pop();
    parts.pop();
    parts.push(2);
  }
  return parts;
}

// Fills the row's full usable width with frames whose pct-ratios are fixed, deriving a uniform
// row height from that constraint (rather than picking a height and letting ratios drift).
function layoutRow(pctRatios: number[], gapPct: number, usableWidth: number): { widths: number[]; rowHeight: number } {
  const sum = pctRatios.reduce((s, r) => s + r, 0);
  const totalGap = gapPct * (pctRatios.length - 1);
  const rowHeight = (usableWidth - totalGap) / sum;
  return { widths: pctRatios.map((r) => r * rowHeight), rowHeight };
}

function generateTemplateFrames(n: number, rng: () => number): AlbumFrame[] {
  const margin = 3 + rng() * 3;
  const gap = 1.5 + rng() * 2;
  const usableWidth = 100 - margin * 2;
  const usableHeightMax = 100 - margin * 2;

  const partition = randomPartition(n, rng);
  const rows = partition.map((count) => {
    const uniform = rng() < 0.7;
    const pctRatios = uniform
      ? new Array(count).fill(pctRatioFor(pickPrintRatio(rng)))
      : Array.from({ length: count }, () => pctRatioFor(pickPrintRatio(rng)));
    return { count, ...layoutRow(pctRatios, gap, usableWidth) };
  });

  const naturalTotalHeight = rows.reduce((s, r) => s + r.rowHeight, 0) + gap * (rows.length - 1);
  let scale = 1;
  let extraTopMargin = 0;
  if (naturalTotalHeight > usableHeightMax) {
    scale = usableHeightMax / naturalTotalHeight;
  } else {
    extraTopMargin = (usableHeightMax - naturalTotalHeight) / 2;
  }

  const frames: AlbumFrame[] = [];
  let y = margin + extraTopMargin;
  let idx = 0;
  for (const row of rows) {
    const scaledRowHeight = row.rowHeight * scale;
    const scaledWidths = row.widths.map((w) => w * scale);
    const rowTotalWidth = scaledWidths.reduce((s, w) => s + w, 0) + gap * scale * (row.count - 1);
    let x = margin + (usableWidth - rowTotalWidth) / 2;
    for (const w of scaledWidths) {
      frames.push({ id: `t-${idx}`, xPct: x, yPct: y, widthPct: w, heightPct: scaledRowHeight });
      x += w + gap * scale;
      idx++;
    }
    y += scaledRowHeight + gap * scale;
  }
  return frames;
}

function buildTabTemplates(tabKey: TemplateTabKey, tabIndex: number): { name: string; frames: AlbumFrame[] }[] {
  const out: { name: string; frames: AlbumFrame[] }[] = [];
  for (let i = 0; i < 50; i++) {
    const rng = mulberry32(tabIndex * 100003 + i * 977 + 1);
    const n = tabKey === "10+" ? 11 + Math.floor(rng() * 8) : Number(tabKey);
    out.push({ name: `${n} תמונות #${i + 1}`, frames: generateTemplateFrames(n, rng) });
  }
  return out;
}

export const TEMPLATE_BANK: Record<TemplateTabKey, { name: string; frames: AlbumFrame[] }[]> = Object.fromEntries(
  TEMPLATE_TABS.map((t, idx) => [t.key, buildTabTemplates(t.key, idx)])
) as Record<TemplateTabKey, { name: string; frames: AlbumFrame[] }[]>;
