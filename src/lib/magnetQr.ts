import { create } from "qrcode";
import { DEFAULT_MAGNET_FRAME_SETTINGS, MAGNET_DECORATION_SIZE_RANGE, MAGNET_SAFE_MARGIN_CM, getMatInsetPct, hexToRgbTriple, magnetSize } from "@/lib/magnetFrameShared";
import { uuidPrefixCode, uuidPrefixRange } from "@/lib/shortLinks";
import { SITE_URL } from "@/lib/siteUrl";
import type { FrameOrientation, MagnetFrameQrElement, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";

// A QR code on a magnet frame (stage 3, owner 2026-10-22): guests take the printed magnet home, and
// the code opens the event's photos (view only), the photographer's portfolio, or a link they type.
// Pure and shared: the editor's preview (MagnetFramePreview), the panel (QrPanel) and the 300 DPI
// export (magnetFrame.ts) draw the code from the same qrMatrix, so what the photographer sees is
// exactly what prints.

// --- Where the code leads ---

// The event's guest link: myframeflow.com/m/<code>, one per EVENT, not per frame (frames get
// duplicated and deleted; a printed magnet lives for years). The code is the event id's first 16
// hex digits in base 62 (60 random bits, the same scheme as the short client links), so nothing is
// stored and the link exists before the gallery does. app/m/[code] finds the event by that prefix,
// and opens only while one of the event's frames still has a gallery QR (lib/magnetGuest.ts).
export function magnetGuestCode(eventId: string): string | null {
  return uuidPrefixCode(eventId);
}

export function magnetGuestUrl(eventId: string, origin: string = SITE_URL): string | null {
  const code = magnetGuestCode(eventId);
  return code ? `${origin}/m/${code}` : null;
}

// The event ids a guest code stands for, as a range on events.id. Null for a code this never made.
export function magnetGuestRange(code: string): { from: string; to: string } | null {
  return uuidPrefixRange(code);
}

export const MAGNET_GUEST_CODE_RE = /^[0-9a-zA-Z]{11}$/;

// What a QR needs to know besides itself: the frame's linked event, and the photographer's public
// portfolio (magnetPortfolioSlug).
export type MagnetQrContext = { eventId: string | null; portfolioSlug: string | null };

// The portfolio a "portfolio" QR opens: only when it's switched on (a slug without it is a dead page).
export function magnetPortfolioSlug(row: { portfolio_slug?: string | null; portfolio_enabled?: boolean | null } | null | undefined): string | null {
  return row?.portfolio_enabled && row.portfolio_slug ? row.portfolio_slug : null;
}

// A link the photographer typed, ready for a QR: trimmed, https:// added to a bare domain
// ("instagram.com/studio"). Null unless it's a web address (no mailto:, javascript:, spaces, or a
// host without a dot).
export function normalizeQrUrl(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s || s.length > 600 || /\s/.test(s)) return null;
  let full: string;
  if (/^https?:\/\//i.test(s)) full = s;
  else if (s.includes("://") || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return null;
  else full = `https://${s.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(full);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) return null;
  if (url.username || url.password) return null;
  return full;
}

// What the QR encodes, or null when it has nothing to open yet (no linked event, no portfolio, an
// empty or invalid link): the editor then draws a placeholder and the export leaves it out.
export function magnetQrUrl(el: Pick<MagnetFrameQrElement, "target" | "url">, ctx: MagnetQrContext): string | null {
  if (el.target === "gallery") return ctx.eventId ? magnetGuestUrl(ctx.eventId) : null;
  if (el.target === "portfolio") return ctx.portfolioSlug ? `${SITE_URL}/p/${encodeURIComponent(ctx.portfolioSlug)}` : null;
  return normalizeQrUrl(el.url);
}

// --- The code itself ---

// Light modules around the code, inside its bgColor square. The standard asks for 4; 2 keep the
// code larger in the same square and every phone scanner reads them, because the square is always
// drawn (the mat behind it may be any color or texture).
export const QR_QUIET_ZONE_MODULES = 2;

// Dark modules, row-major (data[row * size + col] = 1).
export type QrMatrix = { size: number; data: Uint8Array };

const matrixCache = new Map<string, QrMatrix>();

// The code's modules, error correction "M" (15% of the code can be lost and it still reads).
// Synchronous and deterministic, so the browser and the server draw the same code. Cached: the
// preview redraws on every drag.
export function qrMatrix(text: string): QrMatrix {
  const hit = matrixCache.get(text);
  if (hit) return hit;
  const qr = create(text, { errorCorrectionLevel: "M" });
  const matrix = { size: qr.modules.size, data: Uint8Array.from(qr.modules.data) };
  if (matrixCache.size > 50) matrixCache.clear();
  matrixCache.set(text, matrix);
  return matrix;
}

// Modules across the whole square, quiet zone included.
export function qrSquareModules(matrix: QrMatrix, quiet = QR_QUIET_ZONE_MODULES): number {
  return matrix.size + quiet * 2;
}

// The dark modules as one SVG path in module units (the square is 0..qrSquareModules), each row's
// runs merged into one rectangle. Drawn over a bgColor square of the same units.
export function qrPath(matrix: QrMatrix, quiet = QR_QUIET_ZONE_MODULES): string {
  const { size, data } = matrix;
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!data[r * size + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && data[r * size + c]) c++;
      parts.push(`M${start + quiet} ${r + quiet}h${c - start}v1h${start - c}z`);
    }
  }
  return parts.join("");
}

// --- Size on paper ---

// Under 2 cm a phone may not read it; 2.5 cm and up reads at arm's length (owner's rule for print).
export const QR_MIN_CM = 2;
export const QR_RECOMMENDED_CM = 2.5;
export const QR_DEFAULT_CM = 3;

// sizePct is of the frame's shorter side (like decorations), the same centimeters in both
// orientations.
function shorterSideCm(sizeKey: MagnetFrameSizeKey | null | undefined): number {
  const s = magnetSize(sizeKey);
  return Math.min(s.widthCm, s.heightCm);
}

export function qrSizeCm(sizePct: number, sizeKey: MagnetFrameSizeKey | null | undefined): number {
  return (sizePct / 100) * shorterSideCm(sizeKey);
}

export function qrPctForCm(cm: number, sizeKey: MagnetFrameSizeKey | null | undefined): number {
  return (cm / shorterSideCm(sizeKey)) * 100;
}

// The smallest a QR may be on this print size (2 cm), and where the "too small" warning starts (2.5 cm).
export function qrMinSizePct(sizeKey: MagnetFrameSizeKey | null | undefined): number {
  return qrPctForCm(QR_MIN_CM, sizeKey);
}

export function qrRecommendedSizePct(sizeKey: MagnetFrameSizeKey | null | undefined): number {
  return qrPctForCm(QR_RECOMMENDED_CM, sizeKey);
}

export function qrSizeRangePct(sizeKey: MagnetFrameSizeKey | null | undefined): { min: number; recommended: number; max: number } {
  return { min: qrMinSizePct(sizeKey), recommended: qrRecommendedSizePct(sizeKey), max: MAGNET_DECORATION_SIZE_RANGE.max };
}

// One module on paper, in millimeters. A long link makes a denser code: under QR_MIN_MODULE_MM it
// needs to be bigger to read.
export const QR_MIN_MODULE_MM = 0.5;
export function qrModuleMm(text: string, sizeCm: number): number {
  return (sizeCm * 10) / qrSquareModules(qrMatrix(text));
}

// --- Colors ---

function luminance(hex: string): number {
  const [r, g, b] = hexToRgbTriple(hex, [0, 0, 0]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio between the modules and the background (1..21).
export function qrContrastRatio(color: string, bgColor: string): number {
  const a = luminance(color);
  const b = luminance(bgColor);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Under this, a phone may not tell the modules from the background (gold on white is ~2.2).
export const QR_MIN_CONTRAST = 4;

// "inverted": light modules on a dark background, which many phone cameras don't read.
// "low": too little contrast. null: fine.
export function qrColorProblem(color: string, bgColor: string): "inverted" | "low" | null {
  if (luminance(color) > luminance(bgColor)) return "inverted";
  return qrContrastRatio(color, bgColor) < QR_MIN_CONTRAST ? "low" : null;
}

// --- A new code ---

const GAP_CM = 0.5;

// A new QR: dark #111111 on white, about 3 cm (2.5 cm on the small magnets, where 3 cm would cover
// half the frame), on the bottom mat toward a corner: centered on the mat when it fits there (made
// smaller to fit, down to 2.5 cm), otherwise its bottom edge half a centimeter above the frame's
// edge, over the window's corner.
export function newQrElement(
  target: MagnetFrameQrElement["target"],
  opts: {
    sizeKey: MagnetFrameSizeKey | null | undefined;
    orientation: FrameOrientation;
    mat?: Pick<MagnetFrameSettings, "borderRatioPct" | "bottomBorderRatioPct">;
    url?: string;
    corner?: "left" | "right";
    id?: string;
  },
): MagnetFrameQrElement {
  const { sizeKey, orientation } = opts;
  const mat = opts.mat ?? DEFAULT_MAGNET_FRAME_SETTINGS;
  const s = magnetSize(sizeKey);
  const wCm = orientation === "landscape" ? s.widthCm : s.heightCm;
  const hCm = orientation === "landscape" ? s.heightCm : s.widthCm;
  const inset = getMatInsetPct(orientation, sizeKey, mat.borderRatioPct, mat.bottomBorderRatioPct);
  const sideCm = (inset.xPct / 100) * wCm;
  const bottomCm = (inset.bottomPct / 100) * hCm;
  // The room on the bottom mat between the margins. A mat that holds at least the recommended size
  // gets a code that fits it (a 3.3 cm mat: 2.7 cm), so it doesn't reach over the photo.
  const matRoom = bottomCm - 2 * MAGNET_SAFE_MARGIN_CM;
  const preferred = Math.min(QR_DEFAULT_CM, Math.max(QR_RECOMMENDED_CM, shorterSideCm(sizeKey) * 0.3));
  const cm = matRoom >= QR_RECOMMENDED_CM ? Math.min(preferred, matRoom) : preferred;
  const sizePct = qrPctForCm(cm, sizeKey);
  const edge = Math.max(GAP_CM, MAGNET_SAFE_MARGIN_CM);
  // Its center: in the middle of the bottom mat when the code fits between the margins there.
  const fitsMat = cm <= matRoom + 1e-9;
  const centerFromBottom = fitsMat ? bottomCm / 2 : edge + cm / 2;
  const centerFromSide = fitsMat && cm + 2 * MAGNET_SAFE_MARGIN_CM <= sideCm ? sideCm / 2 : edge + cm / 2;
  const xFromSide = (centerFromSide / wCm) * 100;
  return {
    id: opts.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `qr-${Date.now()}`),
    type: "qr",
    target,
    ...(target === "url" ? { url: opts.url ?? "" } : {}),
    xPct: opts.corner === "right" ? 100 - xFromSide : xFromSide,
    yPct: 100 - (centerFromBottom / hCm) * 100,
    sizePct,
    color: "#111111",
    bgColor: "#ffffff",
  };
}
