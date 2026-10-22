import { DEFAULT_MAGNET_FRAME_SETTINGS, DEFAULT_MAGNET_SIZE, getMatInsetPct, magnetDesignDimensions, magnetSafeMarginPct } from "@/lib/magnetFrameShared";
import type { MagnetFrameDecorationElement, MagnetFrameElement, MagnetFrameSettings, MagnetFrameSizeKey, MagnetFrameTextElement } from "@/lib/types";

// Ready-made magnet frames (owner, 2026-10-22): what most photographers start a new frame from.
// Each one is drawn on the landscape 20×15 frame (1600×1200 design px). Positions are percentages,
// so they carry to every size; instantiateTemplate fits the text to the other sizes (sizeFit).
//
// Rules every template keeps (magnetFrameTemplates.test.ts checks them):
// - text sits on the mat (mostly the bottom one, which these make thicker), never over the photo
//   window, and inside the 3 mm safe margin;
// - every character has a glyph in the font file the export draws with (src/assets/fonts), so the
//   download matches the screen: "&" and digits only in fonts that have them;
// - bold/italic stay off: the editor loads one weight per font, and the export would thicken it.

export type MagnetTemplateKind = "wedding" | "henna" | "bar_mitzvah" | "bat_mitzvah" | "brit" | "birthday" | "general";

export const templateKinds: { key: MagnetTemplateKind; label: string }[] = [
  { key: "wedding", label: "חתונה" },
  { key: "henna", label: "חינה" },
  { key: "bar_mitzvah", label: "בר מצווה" },
  { key: "bat_mitzvah", label: "בת מצווה" },
  { key: "brit", label: "ברית" },
  { key: "birthday", label: "יום הולדת" },
  { key: "general", label: "כללי" },
];

export type MagnetFrameTemplate = {
  key: string;
  name: string;
  kind: MagnetTemplateKind;
  settings: Partial<MagnetFrameSettings>;
  elements: MagnetFrameElement[];
  // The text element holding the couple's / family's names, which a frame made for an event takes
  // from the event's client name.
  namesId?: string;
};

// The date every template shows; a frame made for an event shows the event's date instead.
export const TEMPLATE_DATE_TEXT = "12.06.2026";

// The empty frame (the "ריק" choice).
export const BLANK_TEMPLATE_KEY = "blank";

type TextOpts = Partial<Omit<MagnetFrameTextElement, "id" | "type" | "text" | "xPct" | "yPct" | "fontKey" | "fontSizePx" | "color">>;

function text(id: string, value: string, xPct: number, yPct: number, fontKey: string, fontSizePx: number, color: string, opts: TextOpts = {}): MagnetFrameTextElement {
  return {
    id,
    type: "text",
    text: value,
    xPct,
    yPct,
    fontKey,
    fontSizePx,
    color,
    bold: false,
    italic: false,
    underline: false,
    shadowEnabled: false,
    shadowBlurPx: 6,
    shadowDistancePx: 3,
    ...opts,
  };
}

type DecoSource = { ornamentId: string } | { floralId: string };

function deco(id: string, source: DecoSource, xPct: number, yPct: number, sizePct: number, color = "#000000", rotation?: number): MagnetFrameDecorationElement {
  return { id, type: "decoration", ...source, xPct, yPct, sizePct, color, ...(rotation ? { rotation } : {}) };
}

const shadow = (color: string, blurPx: number, distancePx: number): TextOpts => ({ shadowEnabled: true, shadowColor: color, shadowBlurPx: blurPx, shadowDistancePx: distancePx });

export const MAGNET_FRAME_TEMPLATES: MagnetFrameTemplate[] = [
  // --- Wedding ---
  {
    key: "wedding-classic",
    name: "קלאסי אלגנטי",
    kind: "wedding",
    settings: { borderRatioPct: 7, bottomBorderRatioPct: 25, frameColor: "#f8f3ea", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 22, shadowBlurPx: 20, shadowDistancePx: 6, textureId: "paper-grain", textureOpacity: 30 },
    namesId: "names",
    elements: [
      text("names", "רותם & דניאל", 50, 82.8, "bellefair", 112, "#2f2a25"),
      deco("divider", { ornamentId: "filigree-divider-outline" }, 50, 90.3, 22, "#b08d4a"),
      text("date", TEMPLATE_DATE_TEXT, 50, 94.9, "cormorant-garamond", 42, "#8c6d33", { letterSpacing: 8 }),
    ],
  },
  {
    key: "wedding-modern",
    name: "מודרני נקי",
    kind: "wedding",
    settings: { borderRatioPct: 5, bottomBorderRatioPct: 17, frameColor: "#ffffff", frameColorOpacity: 0, shadowEnabled: true, shadowOpacity: 18, shadowBlurPx: 16, shadowDistancePx: 4, textureId: null },
    namesId: "names",
    elements: [
      text("names", "רותם & דניאל", 76.5, 91.5, "ibm-plex-sans-hebrew", 66, "#161616", { letterSpacing: 1 }),
      deco("line", { ornamentId: "geo-dots-2" }, 48, 91.5, 18, "#a3a3a3"),
      text("date", TEMPLATE_DATE_TEXT, 20.5, 91.5, "julius-sans-one", 36, "#2b2b2b", { letterSpacing: 6 }),
    ],
  },
  {
    key: "wedding-watercolor",
    name: "פרחי מים",
    kind: "wedding",
    settings: { borderRatioPct: 8, bottomBorderRatioPct: 23, frameColor: "#ffffff", frameColorOpacity: 0, shadowEnabled: true, shadowOpacity: 20, shadowBlurPx: 18, shadowDistancePx: 5, textureId: null },
    namesId: "names",
    elements: [
      deco("flowers-bottom", { floralId: "wc2-corner-blush" }, 12, 80, 42),
      deco("flowers-top", { floralId: "wc2-corner-blush" }, 88.5, 18.5, 36, "#000000", 180),
      text("names", "רותם & דניאל", 50, 84.4, "gveret-levin", 106, "#a26d6d"),
      text("date", TEMPLATE_DATE_TEXT, 50, 94.4, "cormorant-garamond", 40, "#8f7f78", { letterSpacing: 6 }),
    ],
  },
  // --- Henna ---
  {
    key: "henna-royal",
    name: "בורדו וזהב",
    kind: "henna",
    settings: { borderRatioPct: 7, bottomBorderRatioPct: 25, frameColor: "#6e1a1f", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 40, shadowBlurPx: 22, shadowDistancePx: 6, textureId: "damask-tile", textureOpacity: 22 },
    namesId: "names",
    elements: [
      deco("mandala-r", { ornamentId: "mandala-outline" }, 85.5, 87.5, 17, "#d4a84f"),
      deco("mandala-l", { ornamentId: "mandala-outline" }, 14.5, 87.5, 17, "#d4a84f"),
      text("names", "נועה & איתי", 50, 84, "bellefair", 100, "#e6c27a", shadow("#2a0508", 8, 3)),
      text("title", `חינה · ${TEMPLATE_DATE_TEXT}`, 50, 94.3, "bellefair", 42, "#f3dfb8", { letterSpacing: 3 }),
    ],
  },
  {
    key: "henna-warm",
    name: "חם ומעוטר",
    kind: "henna",
    settings: { borderRatioPct: 10, bottomBorderRatioPct: 24, frameColor: "#f4e4cc", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 25, shadowBlurPx: 18, shadowDistancePx: 5, textureId: "arabesque-mini", textureOpacity: 16 },
    namesId: "names",
    elements: [
      text("title", "חינה", 50, 5.5, "suez-one", 48, "#9b2c1f", { letterSpacing: 12 }),
      deco("hamsa-r", { ornamentId: "hamsa-outline" }, 85, 88, 15, "#c4581f"),
      deco("hamsa-l", { ornamentId: "hamsa-outline" }, 15, 88, 15, "#c4581f"),
      text("names", "נועה & איתי", 50, 85, "bona-nova", 86, "#9b2c1f"),
      text("date", TEMPLATE_DATE_TEXT, 50, 94.5, "cinzel", 32, "#b0603a", { letterSpacing: 8 }),
    ],
  },
  // --- Bar mitzvah ---
  {
    key: "bar-mitzvah-navy",
    name: "כחול וזהב",
    kind: "bar_mitzvah",
    settings: { borderRatioPct: 7, bottomBorderRatioPct: 25, frameColor: "#16223f", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 45, shadowBlurPx: 24, shadowDistancePx: 8, textureId: "gold-fleck", textureOpacity: 75 },
    elements: [
      deco("digit", { floralId: "digit-gold-13" }, 13, 87.5, 25),
      deco("star", { ornamentId: "star-of-david-outline" }, 87, 87.5, 14, "#d6b25e"),
      text("title", "בר המצווה של אורי", 50, 84, "frank-ruhl-libre", 80, "#e3c172"),
      text("date", TEMPLATE_DATE_TEXT, 50, 94, "cinzel", 36, "#cdb07a", { letterSpacing: 8 }),
    ],
  },
  {
    key: "bar-mitzvah-modern",
    name: "לבן ותכלת",
    kind: "bar_mitzvah",
    settings: { borderRatioPct: 6, bottomBorderRatioPct: 25, frameColor: "#f3f6fa", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 20, shadowBlurPx: 18, shadowDistancePx: 5, textureId: null },
    elements: [
      deco("digit", { floralId: "digit-barmitzva-13" }, 38, 87.6, 23),
      text("kicker", "בר מצווה", 58, 80.9, "ibm-plex-sans-hebrew", 32, "#5b6b88", { letterSpacing: 6 }),
      text("title", "אורי", 58, 88, "karantina", 132, "#1c3461"),
      text("date", TEMPLATE_DATE_TEXT, 58, 95.2, "julius-sans-one", 28, "#5b6b88", { letterSpacing: 8 }),
    ],
  },
  // --- Bat mitzvah ---
  {
    key: "bat-mitzvah-blush",
    name: "ורוד ופרחים",
    kind: "bat_mitzvah",
    settings: { borderRatioPct: 7, bottomBorderRatioPct: 25, frameColor: "#f6e3e1", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 20, shadowBlurPx: 18, shadowDistancePx: 5, textureId: "paper-grain", textureOpacity: 25 },
    elements: [
      deco("flowers", { floralId: "wc3-butterfly-blossoms" }, 12.5, 86, 32),
      deco("digit", { floralId: "digit-batmitzva-12" }, 87, 87.5, 23),
      text("title", "בת המצווה של נועה", 50, 84, "gveret-levin", 88, "#b4566e"),
      text("date", TEMPLATE_DATE_TEXT, 50, 94.3, "cormorant-garamond", 40, "#a67c86", { letterSpacing: 6 }),
    ],
  },
  {
    key: "bat-mitzvah-gold",
    name: "זהב ונצנוצים",
    kind: "bat_mitzvah",
    settings: { borderRatioPct: 6, bottomBorderRatioPct: 25, frameColor: "#ffffff", frameColorOpacity: 0, shadowEnabled: true, shadowOpacity: 20, shadowBlurPx: 18, shadowDistancePx: 5, textureId: "gold-fleck", textureOpacity: 85 },
    elements: [
      deco("digit", { floralId: "digit-gold-12" }, 14, 87.5, 25),
      deco("sparkle", { ornamentId: "sym-sparkle-3" }, 86, 87, 14, "#c9a24a"),
      text("title", "שירה", 50, 83.6, "bellefair", 130, "#b8923f", shadow("#e8d3a3", 6, 2)),
      text("date", `בת מצווה · ${TEMPLATE_DATE_TEXT}`, 50, 94.4, "bellefair", 40, "#8c7b5f", { letterSpacing: 2 }),
    ],
  },
  // --- Brit ---
  {
    key: "brit-sky",
    name: "תכלת רך",
    kind: "brit",
    settings: { borderRatioPct: 7, bottomBorderRatioPct: 25, frameColor: "#e4eef7", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 18, shadowBlurPx: 18, shadowDistancePx: 5, textureId: "cloud-mist", textureOpacity: 25 },
    elements: [
      deco("sprig-r", { floralId: "wc2-sprig-blue" }, 89, 85, 25, "#000000", 12),
      deco("sprig-l", { floralId: "wc2-sprig-blue" }, 11, 85, 25, "#000000", -12),
      text("kicker", "ברית מילה", 50, 80.9, "varela-round", 34, "#6c8db0", { letterSpacing: 5 }),
      text("title", "איתן", 50, 87.9, "varela-round", 104, "#3a6890"),
      text("date", TEMPLATE_DATE_TEXT, 50, 95.2, "quicksand", 30, "#6c8db0", { letterSpacing: 4 }),
    ],
  },
  // --- Birthday ---
  {
    key: "birthday-party",
    name: "מסיבה צבעונית",
    kind: "birthday",
    settings: { borderRatioPct: 6, bottomBorderRatioPct: 25, frameColor: "#ffffff", frameColorOpacity: 0, shadowEnabled: true, shadowOpacity: 18, shadowBlurPx: 16, shadowDistancePx: 4, textureId: "confetti-scatter", textureOpacity: 18 },
    elements: [
      deco("digit", { floralId: "digit-balloon-1" }, 13, 87.5, 27),
      deco("balloons", { ornamentId: "sym-balloon-2" }, 87, 87, 17, "#f2a541"),
      text("title", "יום הולדת שמח", 50, 83.8, "fredoka", 74, "#e0457b"),
      text("date", `נועם · ${TEMPLATE_DATE_TEXT}`, 50, 94, "fredoka", 40, "#4a6fd1"),
    ],
  },
  // --- General ---
  {
    key: "general-minimal",
    name: "לבן נקי",
    kind: "general",
    settings: { borderRatioPct: 6, bottomBorderRatioPct: 19, frameColor: "#ffffff", frameColorOpacity: 0, shadowEnabled: true, shadowOpacity: 20, shadowBlurPx: 18, shadowDistancePx: 5, textureId: null },
    namesId: "names",
    elements: [
      text("names", "משפחת כהן", 50, 87.6, "frank-ruhl-libre", 70, "#222222"),
      text("date", TEMPLATE_DATE_TEXT, 50, 95, "julius-sans-one", 28, "#666666", { letterSpacing: 8 }),
    ],
  },
  {
    key: "general-black-gold",
    name: "שחור וזהב",
    kind: "general",
    settings: { borderRatioPct: 6, bottomBorderRatioPct: 21, frameColor: "#141414", frameColorOpacity: 100, shadowEnabled: true, shadowOpacity: 50, shadowBlurPx: 20, shadowDistancePx: 6, textureId: "gold-fleck", textureOpacity: 55 },
    namesId: "names",
    elements: [
      deco("sparkle-r", { ornamentId: "sym-sparkle-3" }, 73, 87.2, 10, "#d4af62"),
      deco("sparkle-l", { ornamentId: "sym-sparkle-3" }, 27, 87.2, 10, "#d4af62"),
      text("names", "ערב חגיגי", 50, 86.6, "bellefair", 96, "#d4af62"),
      text("date", TEMPLATE_DATE_TEXT, 50, 95.1, "cinzel", 30, "#bfa26a", { letterSpacing: 10 }),
    ],
  },
];

export function findMagnetFrameTemplate(key: string | null | undefined): MagnetFrameTemplate | undefined {
  return MAGNET_FRAME_TEMPLATES.find((tpl) => tpl.key === key);
}

// A conservative width of a one-line text, in design px: Hebrew letters and digits about 0.58 of
// the font size (measured: 0.41–0.5), capitals wider, plus the letter spacing and the outline.
export function estimateTextWidthPx(el: Pick<MagnetFrameTextElement, "text" | "fontSizePx" | "letterSpacing" | "strokeWidth">): number {
  let em = 0;
  for (const ch of el.text) {
    if (ch === " ") em += 0.3;
    else if (".,·:'׳-".includes(ch)) em += 0.32;
    else if (ch === "&") em += 0.75;
    else if (/[A-Z]/.test(ch)) em += 0.72;
    else em += 0.58;
  }
  const chars = [...el.text].length;
  return em * el.fontSizePx + (el.letterSpacing ?? 0) * chars + 2 * (el.strokeWidth ?? 0);
}

// The height a line takes, in design px: the font's ascent to descent (measured 1.0–1.4 of the
// size across the fonts the templates use), plus the outline.
export function estimateTextHeightPx(el: Pick<MagnetFrameTextElement, "fontSizePx" | "strokeWidth">): number {
  return 1.25 * el.fontSizePx + 2 * (el.strokeWidth ?? 0);
}

// "2026-06-12" → "12.06.2026", the way the templates write a date.
export function templateDateText(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}` : isoDate;
}

// The widest a filled-in names line may get: 85% of the frame.
const MAX_LINE_WIDTH_PCT = 85;

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

// How a template drawn on 20×15 fits another size. Text on a mat keeps its place between the photo
// window and the 3 mm safe margin, which is a bigger share of a small frame (17% of a 10×7 frame's
// bottom mat): its distance from the window shrinks by the same factor as that band, and so does its
// size, never growing past the design. On the square frame the decorations shrink by 3/4, so they
// take the same share of the width as on 20×15.
function sizeFit(tpl: MagnetFrameTemplate, sizeKey: MagnetFrameSizeKey) {
  const settings = { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...tpl.settings };
  const base = magnetSafeMarginPct("landscape", DEFAULT_MAGNET_SIZE).yPct;
  const safe = magnetSafeMarginPct("landscape", sizeKey).yPct;
  const inset = getMatInsetPct("landscape", sizeKey, settings.borderRatioPct, settings.bottomBorderRatioPct);
  const { widthPx, heightPx } = magnetDesignDimensions("landscape", sizeKey);
  const windowBottom = 100 - inset.bottomPct;
  const bottomBand = (100 - safe - windowBottom) / (100 - base - windowBottom);
  const topBand = (inset.topPct - safe) / (inset.topPct - base);
  return {
    widthPx,
    // Text on the bottom mat, the top mat, or elsewhere: its new y and the factor for its size.
    text(yPct: number): { yPct: number; factor: number } {
      const band = yPct > windowBottom ? bottomBand : yPct < inset.topPct ? topBand : 1;
      const y = yPct > windowBottom ? windowBottom + (yPct - windowBottom) * band : yPct < inset.topPct ? inset.topPct - (inset.topPct - yPct) * band : yPct;
      return { yPct: roundTo(y, 0.01), factor: Math.min(1, (heightPx / 1200) * band) };
    },
    decoFactor: Math.min(1, (widthPx / heightPx) / (4 / 3)),
  };
}

// A new frame's settings and elements from a template, at a size, with fresh element ids. With
// `fill` (a frame made for an event): the names line takes the client's name and every date the
// event's date, the names shrinking to fit when they're long.
export function instantiateTemplate(
  key: string,
  sizeKey: MagnetFrameSizeKey = DEFAULT_MAGNET_SIZE,
  fill?: { names?: string | null; date?: string | null }
): { frameSettings: MagnetFrameSettings; elements: MagnetFrameElement[] } {
  const tpl = findMagnetFrameTemplate(key);
  const frameSettings: MagnetFrameSettings = { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...(tpl?.settings ?? {}), sizeKey };
  if (!tpl) return { frameSettings, elements: [] };

  const fit = sizeFit(tpl, sizeKey);
  const names = fill?.names?.trim();
  const date = fill?.date ? templateDateText(fill.date) : null;

  const elements = tpl.elements.map((el): MagnetFrameElement => {
    // A decoration on a mat moves with the text around it (a divider between two lines).
    if (el.type !== "text") return { ...el, id: crypto.randomUUID(), yPct: fit.text(el.yPct).yPct, sizePct: roundTo(el.sizePct * fit.decoFactor, 0.1) };
    let value = el.text;
    if (names && el.id === tpl.namesId) value = names;
    if (date) value = value.replace(TEMPLATE_DATE_TEXT, date);
    const { yPct, factor } = fit.text(el.yPct);
    const sized: MagnetFrameTextElement = {
      ...el,
      id: crypto.randomUUID(),
      text: value,
      yPct,
      fontSizePx: Math.round(el.fontSizePx * factor),
      shadowBlurPx: roundTo(el.shadowBlurPx * factor, 0.1),
      shadowDistancePx: roundTo(el.shadowDistancePx * factor, 0.1),
      ...(el.letterSpacing ? { letterSpacing: roundTo(el.letterSpacing * factor, 0.1) } : {}),
      ...(el.strokeWidth ? { strokeWidth: roundTo(el.strokeWidth * factor, 0.1) } : {}),
    };
    const maxWidth = (MAX_LINE_WIDTH_PCT / 100) * fit.widthPx;
    const width = estimateTextWidthPx(sized);
    if (value !== el.text && width > maxWidth) sized.fontSizePx = Math.max(10, Math.floor((sized.fontSizePx * maxWidth) / width));
    return sized;
  });
  return { frameSettings, elements };
}
