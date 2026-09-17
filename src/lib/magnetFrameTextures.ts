// Built-in texture library for the magnet-frame mat — 40 small, tileable SVG patterns the
// photographer can lay over the mat (never the photo cutout — see composeMagnetFrameTexture in
// magnetFrame.ts, which masks by the card's own alpha the same way the inner shadow does) at a
// controllable opacity. Each tile is monochrome by design — opacity alone controls strength, no
// per-texture recoloring — except the handful of "gold" ones, which lean into their own fixed
// warm tone on purpose. Same procedural-generator spirit as albumOrnaments.ts: parametric tiles
// instead of 40 hand-authored image files.

export type MagnetFrameTexture = {
  id: string;
  label: string;
  tileSizePx: number;
  // Inner SVG content of one tile — referenced by both the live CSS preview (as a standalone
  // <svg> data URI, repeated via background-repeat) and the server export (embedded once inside a
  // <pattern> that fills the whole canvas rect).
  content: string;
};

const C = "rgba(0,0,0,0.55)";
const CL = "rgba(0,0,0,0.3)";
const GOLD = "rgba(180,140,60,0.6)";

export const MAGNET_FRAME_TEXTURES: MagnetFrameTexture[] = [
  // --- Lines & geometric (10) ---
  { id: "stripes-diag-thin", label: "פסים אלכסוניים דקים", tileSizePx: 16, content: `<line x1="0" y1="16" x2="16" y2="0" stroke="${C}" stroke-width="1.5" />` },
  { id: "stripes-diag-thick", label: "פסים אלכסוניים עבים", tileSizePx: 24, content: `<line x1="0" y1="24" x2="24" y2="0" stroke="${C}" stroke-width="5" />` },
  { id: "stripes-horizontal", label: "פסים אופקיים", tileSizePx: 14, content: `<line x1="0" y1="7" x2="14" y2="7" stroke="${C}" stroke-width="1.5" />` },
  { id: "stripes-vertical", label: "פסים אנכיים", tileSizePx: 14, content: `<line x1="7" y1="0" x2="7" y2="14" stroke="${C}" stroke-width="1.5" />` },
  { id: "crosshatch", label: "קווים משוכללים", tileSizePx: 18, content: `<line x1="0" y1="18" x2="18" y2="0" stroke="${CL}" stroke-width="1.2" /><line x1="0" y1="0" x2="18" y2="18" stroke="${CL}" stroke-width="1.2" />` },
  { id: "grid-fine", label: "רשת דקה", tileSizePx: 20, content: `<line x1="0" y1="0" x2="20" y2="0" stroke="${CL}" stroke-width="1" /><line x1="0" y1="0" x2="0" y2="20" stroke="${CL}" stroke-width="1" />` },
  {
    id: "chevron",
    label: "שברונים",
    tileSizePx: 20,
    content: `<path d="M0,10 L10,0 L20,10" fill="none" stroke="${C}" stroke-width="2" />`,
  },
  {
    id: "herringbone",
    label: "עצם דג",
    tileSizePx: 16,
    content: `<line x1="0" y1="8" x2="8" y2="0" stroke="${C}" stroke-width="2.2" /><line x1="8" y1="16" x2="16" y2="8" stroke="${C}" stroke-width="2.2" />`,
  },
  {
    id: "houndstooth",
    label: "משבצות",
    tileSizePx: 14,
    content: `<rect x="0" y="0" width="7" height="7" fill="${CL}" /><rect x="7" y="7" width="7" height="7" fill="${CL}" />`,
  },
  {
    id: "basket-weave",
    label: "קליעה",
    tileSizePx: 20,
    content: `<rect x="0" y="0" width="8" height="20" fill="${CL}" /><rect x="10" y="0" width="8" height="8" fill="${CL}" /><rect x="10" y="12" width="8" height="8" fill="${CL}" />`,
  },

  // --- Dots & scatter (8) ---
  { id: "dots-small", label: "נקודות קטנות", tileSizePx: 12, content: `<circle cx="6" cy="6" r="1.4" fill="${C}" />` },
  { id: "dots-large", label: "נקודות גדולות", tileSizePx: 22, content: `<circle cx="11" cy="11" r="4" fill="${C}" />` },
  {
    id: "dot-grid",
    label: "רשת נקודות",
    tileSizePx: 16,
    content: `<circle cx="4" cy="4" r="1" fill="${CL}" /><circle cx="12" cy="4" r="1" fill="${CL}" /><circle cx="4" cy="12" r="1" fill="${CL}" /><circle cx="12" cy="12" r="1" fill="${CL}" />`,
  },
  {
    id: "confetti-scatter",
    label: "קונפטי",
    tileSizePx: 30,
    content: `<rect x="4" y="5" width="4" height="4" fill="${C}" transform="rotate(20 6 7)" /><circle cx="20" cy="10" r="2" fill="${CL}" /><rect x="14" y="20" width="3" height="3" fill="${C}" transform="rotate(-15 15 21)" /><circle cx="25" cy="24" r="1.6" fill="${CL}" />`,
  },
  {
    id: "stars-scatter",
    label: "כוכבים",
    tileSizePx: 26,
    content: `<path d="M6,2 L7.2,5.2 L10.5,5.4 L7.9,7.5 L8.8,10.7 L6,8.8 L3.2,10.7 L4.1,7.5 L1.5,5.4 L4.8,5.2 Z" fill="${CL}" /><circle cx="19" cy="18" r="1.2" fill="${C}" />`,
  },
  {
    id: "hearts-scatter",
    label: "לבבות קטנים",
    tileSizePx: 24,
    content: `<path d="M9,16 C4,12 3,8 6,6 C7.5,5 9,6 9,7.5 C9,6 10.5,5 12,6 C15,8 14,12 9,16 Z" fill="${CL}" />`,
  },
  { id: "sparkle-scatter", label: "ניצוצות", tileSizePx: 22, content: `<path d="M11,3 L12.4,9.6 L19,11 L12.4,12.4 L11,19 L9.6,12.4 L3,11 L9.6,9.6 Z" fill="${CL}" />` },
  { id: "bubbles-scatter", label: "בועות", tileSizePx: 28, content: `<circle cx="7" cy="8" r="4" fill="none" stroke="${CL}" stroke-width="1" /><circle cx="20" cy="18" r="6" fill="none" stroke="${CL}" stroke-width="1" /><circle cx="21" cy="6" r="2" fill="none" stroke="${CL}" stroke-width="1" />` },

  // --- Organic grain (turbulence-based) (8) ---
  {
    id: "paper-grain",
    label: "גרעיניות נייר",
    tileSizePx: 120,
    content: `<filter id="tex-paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0" /></filter><rect width="120" height="120" filter="url(#tex-paper)" />`,
  },
  {
    id: "linen-weave",
    label: "בד פשתן",
    tileSizePx: 100,
    content: `<filter id="tex-linen"><feTurbulence type="turbulence" baseFrequency="0.02 0.3" numOctaves="1" seed="5" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0" /></filter><rect width="100" height="100" filter="url(#tex-linen)" />`,
  },
  {
    id: "marble-veins",
    label: "ורידי שיש",
    tileSizePx: 140,
    content: `<filter id="tex-marble"><feTurbulence type="fractalNoise" baseFrequency="0.015 0.08" numOctaves="3" seed="9" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" /></filter><rect width="140" height="140" filter="url(#tex-marble)" />`,
  },
  {
    id: "watercolor-wash",
    label: "כתם צבע מים",
    tileSizePx: 130,
    content: `<filter id="tex-water"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="12" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0" /><feGaussianBlur stdDeviation="1.2" /></filter><rect width="130" height="130" filter="url(#tex-water)" />`,
  },
  {
    id: "canvas-texture",
    label: "בד קנבס",
    tileSizePx: 90,
    content: `<filter id="tex-canvas"><feTurbulence type="turbulence" baseFrequency="0.35" numOctaves="2" seed="4" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.2 0" /></filter><rect width="90" height="90" filter="url(#tex-canvas)" />`,
  },
  {
    id: "kraft-paper",
    label: "נייר קראפט",
    tileSizePx: 110,
    content: `<filter id="tex-kraft"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" seed="7" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0" /></filter><rect width="110" height="110" filter="url(#tex-kraft)" />`,
  },
  {
    id: "cloud-mist",
    label: "ערפל עדין",
    tileSizePx: 150,
    content: `<filter id="tex-mist"><feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="4" seed="15" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.14 0" /></filter><rect width="150" height="150" filter="url(#tex-mist)" />`,
  },
  {
    id: "subtle-noise",
    label: "רעש עדין",
    tileSizePx: 80,
    content: `<filter id="tex-noise"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="2" /><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0" /></filter><rect width="80" height="80" filter="url(#tex-noise)" />`,
  },

  // --- Floral & lace (8) ---
  {
    id: "floral-sprig-tile",
    label: "ענפים פרחוניים",
    tileSizePx: 40,
    content: `<path d="M20,36 Q18,24 20,14" fill="none" stroke="${CL}" stroke-width="1.2" /><ellipse cx="16" cy="20" rx="4" ry="2" fill="${CL}" transform="rotate(-30 16 20)" /><ellipse cx="24" cy="26" rx="4" ry="2" fill="${CL}" transform="rotate(30 24 26)" /><circle cx="20" cy="13" r="2.2" fill="${CL}" />`,
  },
  {
    id: "lace-scallop",
    label: "תחרה מגזרת",
    tileSizePx: 24,
    content: `<path d="M0,24 A12,12 0 0 1 24,24" fill="none" stroke="${CL}" stroke-width="1.4" />`,
  },
  {
    id: "damask-tile",
    label: "דמשק",
    tileSizePx: 44,
    content: `<path d="M22,4 C30,10 30,20 22,22 C14,20 14,10 22,4 Z" fill="none" stroke="${CL}" stroke-width="1.2" /><path d="M22,22 C30,24 30,34 22,40 C14,34 14,24 22,22 Z" fill="none" stroke="${CL}" stroke-width="1.2" />`,
  },
  {
    id: "leaf-pattern",
    label: "עלים",
    tileSizePx: 28,
    content: `<path d="M4,24 Q4,10 18,4 Q14,16 4,24 Z" fill="${CL}" />`,
  },
  {
    id: "vine-pattern",
    label: "גפן מפותלת",
    tileSizePx: 36,
    content: `<path d="M2,18 Q10,2 18,18 T34,18" fill="none" stroke="${CL}" stroke-width="1.3" /><circle cx="18" cy="18" r="1.6" fill="${CL}" />`,
  },
  {
    id: "flower-dot-tile",
    label: "פרחים ונקודות",
    tileSizePx: 26,
    content: `<circle cx="13" cy="8" r="1.5" fill="${CL}" /><circle cx="9" cy="12" r="1.5" fill="${CL}" /><circle cx="17" cy="12" r="1.5" fill="${CL}" /><circle cx="13" cy="16" r="1.5" fill="${CL}" /><circle cx="13" cy="12" r="1.8" fill="${C}" />`,
  },
  {
    id: "paisley-mini",
    label: "פייזלי מיני",
    tileSizePx: 30,
    content: `<path d="M15,6 C22,6 24,14 18,18 C22,20 20,25 15,24 C9,23 6,17 9,11 C7,9 10,6 15,6 Z" fill="none" stroke="${CL}" stroke-width="1.2" />`,
  },
  {
    id: "botanical-line",
    label: "קו בוטני",
    tileSizePx: 34,
    content: `<path d="M0,17 Q17,0 34,17" fill="none" stroke="${CL}" stroke-width="1.2" /><path d="M8,13 l4,4 M14,8 l4,4 M20,8 l-4,4" stroke="${CL}" stroke-width="1" />`,
  },

  // --- Luxury & decorative (6) ---
  { id: "gold-fleck", label: "נצנוצי זהב", tileSizePx: 34, content: `<circle cx="8" cy="9" r="1.3" fill="${GOLD}" /><circle cx="22" cy="18" r="1.8" fill="${GOLD}" /><circle cx="17" cy="6" r="1" fill="${GOLD}" /><circle cx="28" cy="28" r="1.4" fill="${GOLD}" />` },
  {
    id: "art-deco-fan",
    label: "אר-דקו מניפה",
    tileSizePx: 32,
    content: `<path d="M16,32 L16,10 M16,32 L4,16 M16,32 L28,16" fill="none" stroke="${CL}" stroke-width="1.2" />`,
  },
  {
    id: "scallop-border-tile",
    label: "מדליון קשתי",
    tileSizePx: 20,
    content: `<circle cx="10" cy="10" r="9" fill="none" stroke="${CL}" stroke-width="1" />`,
  },
  {
    id: "diamond-lattice",
    label: "רשת יהלומים",
    tileSizePx: 24,
    content: `<path d="M12,0 L24,12 L12,24 L0,12 Z" fill="none" stroke="${CL}" stroke-width="1.1" />`,
  },
  {
    id: "wave-lines",
    label: "קווי גל",
    tileSizePx: 30,
    content: `<path d="M0,15 Q7.5,5 15,15 T30,15" fill="none" stroke="${CL}" stroke-width="1.3" />`,
  },
  {
    id: "arabesque-mini",
    label: "ערבסקה",
    tileSizePx: 36,
    content: `<path d="M18,4 C26,4 26,14 18,18 C10,14 10,4 18,4 Z" fill="none" stroke="${GOLD}" stroke-width="1.1" /><circle cx="18" cy="30" r="3" fill="none" stroke="${GOLD}" stroke-width="1.1" />`,
  },
];

export function findMagnetFrameTexture(id: string | null | undefined): MagnetFrameTexture | undefined {
  return MAGNET_FRAME_TEXTURES.find((t) => t.id === id);
}

// A standalone <svg> for one tile, usable directly as a CSS background-image data URI (the live
// preview repeats it) or embedded as the child of an SVG <pattern> (the server export, which fills
// the whole canvas at once — see composeMagnetFrameTexture in magnetFrame.ts).
export function textureTileSvg(t: MagnetFrameTexture): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t.tileSizePx}" height="${t.tileSizePx}">${t.content}</svg>`;
}

export function textureDataUrl(t: MagnetFrameTexture): string {
  return `data:image/svg+xml,${encodeURIComponent(textureTileSvg(t))}`;
}
