import type { AlbumFrame } from "./types";

// Five ready-made whole-book layouts in the black-border / soft-shadow style of the reference
// album (gallery "7.7.2026 בר מצווה - אלירן"), generated on demand for whatever page count and
// total photo count the photographer asks for — unlike a saved `album_book_templates` row (a
// fixed, previously-captured page list), these are pure functions of (pageIndex, photosOnPage).
export type StarterTemplateId = "columns" | "hero-cluster" | "mosaic-grid" | "hero-strip" | "scatter-cluster";

export const STARTER_BOOK_TEMPLATES: { id: StarterTemplateId; name: string; description: string }[] = [
  { id: "columns", name: "רצועות קלאסיות", description: "עמודות מלאות גובה עם מסגרת שחורה וצל עדין" },
  { id: "hero-cluster", name: "תמונה ראשית ואשכול", description: "תמונה גדולה אחת לצד אשכול תמונות קטנות" },
  { id: "mosaic-grid", name: "פסיפס רשת", description: "רשת תמונות שוות גודל בפריסה צפופה" },
  { id: "hero-strip", name: "תמונה מלאה ורצועה", description: "תמונה בגזרה מלאה לצד רצועת תמונות אנכית" },
  { id: "scatter-cluster", name: "פיזור אמנותי", description: "פיזור לא סימטרי של תמונות בגדלים משתנים" },
];

const GAP = 1.6;

function fr(id: string, x: number, y: number, w: number, h: number, extra: Partial<AlbumFrame> = {}): AlbumFrame {
  return { id, xPct: x, yPct: y, widthPct: w, heightPct: h, borderWidth: 4, borderColor: "#000000", shadow: 35, ...extra };
}

// Stacks `count` frames down one column of the given area, switching to a 2-column sub-grid once
// a single column would make each frame too thin to read.
function stackArea(x: number, y: number, w: number, h: number, count: number, idPrefix: string, extra: Partial<AlbumFrame> = {}): AlbumFrame[] {
  if (count <= 5) {
    const cellH = (h - GAP * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => fr(`${idPrefix}-${i}`, x, y + i * (cellH + GAP), w, cellH, extra));
  }
  const cols = 2;
  const rows = Math.ceil(count / cols);
  const cellW = (w - GAP) / cols;
  const cellH = (h - GAP * (rows - 1)) / rows;
  const frames: AlbumFrame[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    frames.push(fr(`${idPrefix}-${i}`, x + c * (cellW + GAP), y + r * (cellH + GAP), cellW, cellH, extra));
  }
  return frames;
}

function genColumns(n: number, pageIdx: number): AlbumFrame[] {
  const cols = n <= 6 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const rowH = (100 - GAP * (rows - 1)) / rows;
  const frames: AlbumFrame[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const remaining = n - r * cols;
    const thisCols = Math.min(cols, remaining);
    const colW = (100 - GAP * (thisCols - 1)) / thisCols;
    for (let c = 0; c < thisCols; c++) {
      frames.push(fr(`col-${pageIdx}-${i}`, c * (colW + GAP), r * (rowH + GAP), colW, rowH, { borderWidth: 5 }));
      i++;
    }
  }
  return frames;
}

function genHeroCluster(n: number, pageIdx: number): AlbumFrame[] {
  if (n === 1) return [fr(`hero-${pageIdx}-0`, 0, 0, 100, 100, { borderWidth: 5 })];
  const heroOnLeft = pageIdx % 2 === 0;
  const heroW = 58;
  const restW = 100 - heroW - GAP;
  const restX = heroOnLeft ? heroW + GAP : 0;
  const heroX = heroOnLeft ? 0 : restW + GAP;
  return [fr(`hero-${pageIdx}-0`, heroX, 0, heroW, 100, { borderWidth: 5 }), ...stackArea(restX, 0, restW, 100, n - 1, `hero-${pageIdx}-r`)];
}

function genMosaicGrid(n: number, pageIdx: number): AlbumFrame[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = (100 - GAP * (cols - 1)) / cols;
  const cellH = (100 - GAP * (rows - 1)) / rows;
  const frames: AlbumFrame[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const itemsInRow = Math.min(cols, n - r * cols);
    const rowOffset = ((cols - itemsInRow) * (cellW + GAP)) / 2;
    frames.push(fr(`mosaic-${pageIdx}-${i}`, rowOffset + c * (cellW + GAP), r * (cellH + GAP), cellW, cellH, { shadow: 36 }));
  }
  return frames;
}

function genHeroStrip(n: number, pageIdx: number): AlbumFrame[] {
  if (n === 1) return [fr(`strip-${pageIdx}-0`, 0, 0, 100, 100, { borderWidth: 0, shadow: 0 })];
  const heroOnLeft = pageIdx % 2 === 1;
  const heroW = 42;
  const restW = 100 - heroW;
  const heroX = heroOnLeft ? 0 : restW;
  const restX = heroOnLeft ? heroW : 0;
  return [
    fr(`strip-${pageIdx}-0`, heroX, 0, heroW, 100, { borderWidth: 0, shadow: 0 }),
    ...stackArea(restX, 0, restW, 100, n - 1, `strip-${pageIdx}-r`),
  ];
}

function genScatter(n: number, pageIdx: number): AlbumFrame[] {
  const cols = Math.max(2, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const frames: AlbumFrame[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const jitter = (pageIdx * 7 + i * 13) % 5;
    const inset = 6 + jitter;
    const rotation = (jitter - 2) * 1.5;
    const isAccent = n > 2 && i === 0;
    const w = cellW - inset;
    const h = cellH - inset;
    const x = c * cellW + inset / 2;
    const y = r * cellH + inset / 2;
    const scale = isAccent ? 1.12 : 1;
    frames.push(
      fr(`scatter-${pageIdx}-${i}`, Math.max(0, x - (w * scale - w) / 2), y, Math.min(100 - x, w * scale), h, {
        rotation,
        borderWidth: 5,
        shadow: 34,
      })
    );
  }
  return frames;
}

const GENERATORS: Record<StarterTemplateId, (n: number, pageIdx: number) => AlbumFrame[]> = {
  columns: genColumns,
  "hero-cluster": genHeroCluster,
  "mosaic-grid": genMosaicGrid,
  "hero-strip": genHeroStrip,
  "scatter-cluster": genScatter,
};

// Splits `totalPhotoCount` as evenly as possible across `pageCount` pages (at least one photo per
// page — if the requested total is lower than the page count, every page still gets one), then
// runs each page's count through the chosen template's layout generator.
export function generateStarterBookPages(templateId: StarterTemplateId, pageCount: number, totalPhotoCount: number): AlbumFrame[][] {
  const pages = Math.max(1, Math.floor(pageCount));
  const total = Math.max(pages, Math.floor(totalPhotoCount));
  const base = Math.floor(total / pages);
  const remainder = total % pages;
  const gen = GENERATORS[templateId];
  return Array.from({ length: pages }, (_, i) => gen(base + (i < remainder ? 1 : 0), i));
}
