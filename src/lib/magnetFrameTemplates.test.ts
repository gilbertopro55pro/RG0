import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { ALBUM_FONT_DEFS } from "@/lib/albumFontFiles";
import { findOrnament } from "@/lib/albumOrnaments";
import { findMagnetFrameFloral } from "@/lib/magnetFrameFlorals";
import { findMagnetFrameTexture } from "@/lib/magnetFrameTextures";
import { DEFAULT_MAGNET_FRAME_SETTINGS, MAGNET_FRAME_SIZES, getMatInsetPct, magnetDesignDimensions, magnetSafeMarginPct } from "@/lib/magnetFrameShared";
import {
  BLANK_TEMPLATE_KEY,
  MAGNET_FRAME_TEMPLATES,
  TEMPLATE_DATE_TEXT,
  estimateTextHeightPx,
  estimateTextWidthPx,
  instantiateTemplate,
  templateDateText,
  templateKinds,
} from "@/lib/magnetFrameTemplates";
import type { MagnetFrameDecorationElement, MagnetFrameSizeKey, MagnetFrameTextElement } from "@/lib/types";

const FONT_DIR = fileURLToPath(new URL("../assets/fonts/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const fontFiles = new Map(ALBUM_FONT_DEFS.map((d) => [d.key, d.file]));
const fontCache = new Map<string, { hasGlyphForCodePoint(cp: number): boolean }>();
function fontFor(key: string) {
  if (!fontCache.has(key)) fontCache.set(key, fontkit.create(readFileSync(FONT_DIR + fontFiles.get(key))));
  return fontCache.get(key)!;
}

const LONG_NAMES = "משפחת בן־אבו־רוזנבלום ומשפחת אלמוג־שטרנברג";
const texts = (els: { type: string }[]) => els.filter((el): el is MagnetFrameTextElement => el.type === "text");
const SIZES = MAGNET_FRAME_SIZES.map((s) => s.key);

// A text's box in % of the landscape frame of a size, from the conservative estimates.
function textBox(el: MagnetFrameTextElement, sizeKey: MagnetFrameSizeKey) {
  const { widthPx, heightPx } = magnetDesignDimensions("landscape", sizeKey);
  const halfW = (estimateTextWidthPx(el) / widthPx) * 50;
  const halfH = (estimateTextHeightPx(el) / heightPx) * 50;
  return { left: el.xPct - halfW, right: el.xPct + halfW, top: el.yPct - halfH, bottom: el.yPct + halfH };
}

// Where a decoration's ink is inside its square box (0–1 each way), measured from the image the
// export draws: the PNG for florals and digits (contained in the square, like the editor and the
// export), the rendered SVG for ornaments.
type Ink = { left: number; top: number; right: number; bottom: number };
const inkById = new Map<string, Ink>();
const decoKey = (el: MagnetFrameDecorationElement) => el.floralId ?? el.ornamentId ?? "";

beforeAll(async () => {
  const decos = MAGNET_FRAME_TEMPLATES.flatMap((t) => t.elements).filter((el): el is MagnetFrameDecorationElement => el.type === "decoration");
  for (const el of decos) {
    const key = decoKey(el);
    if (inkById.has(key)) continue;
    const input = el.floralId
      ? readFileSync(PUBLIC_DIR + findMagnetFrameFloral(el.floralId)!.url.slice(1))
      : await sharp(Buffer.from(findOrnament(el.ornamentId)!.svg.replace(/currentColor/g, "#000")), { density: 300 }).resize(400, 400).png().toBuffer();
    const { width, height } = await sharp(input).metadata();
    const { info } = await sharp(input).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const side = Math.max(width!, height!);
    const left = ((side - width!) / 2 - (info.trimOffsetLeft ?? 0)) / side;
    const top = ((side - height!) / 2 - (info.trimOffsetTop ?? 0)) / side;
    inkById.set(key, { left, top, right: left + info.width / side, bottom: top + info.height / side });
  }
});

// A decoration's ink in % of the landscape frame of a size, turned with the element.
function decorationInk(el: MagnetFrameDecorationElement, sizeKey: MagnetFrameSizeKey) {
  const { widthPx, heightPx } = magnetDesignDimensions("landscape", sizeKey);
  const sidePx = (el.sizePct / 100) * Math.min(widthPx, heightPx);
  const ink = inkById.get(decoKey(el))!;
  const a = ((el.rotation ?? 0) * Math.PI) / 180;
  const corners = [
    [ink.left, ink.top],
    [ink.right, ink.top],
    [ink.left, ink.bottom],
    [ink.right, ink.bottom],
  ].map(([x, y]) => {
    const dx = (x - 0.5) * sidePx;
    const dy = (y - 0.5) * sidePx;
    return [el.xPct + ((dx * Math.cos(a) - dy * Math.sin(a)) / widthPx) * 100, el.yPct + ((dx * Math.sin(a) + dy * Math.cos(a)) / heightPx) * 100];
  });
  return { left: Math.min(...corners.map((c) => c[0])), right: Math.max(...corners.map((c) => c[0])), top: Math.min(...corners.map((c) => c[1])), bottom: Math.max(...corners.map((c) => c[1])) };
}

describe("magnet frame templates", () => {
  it("offers 12 to 14 templates with unique keys, in the kinds the owner asked for", () => {
    expect(MAGNET_FRAME_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(MAGNET_FRAME_TEMPLATES.length).toBeLessThanOrEqual(14);
    const keys = MAGNET_FRAME_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(BLANK_TEMPLATE_KEY);
    const count = (kind: string) => MAGNET_FRAME_TEMPLATES.filter((t) => t.kind === kind).length;
    expect(count("wedding")).toBeGreaterThanOrEqual(3);
    expect(count("henna")).toBeGreaterThanOrEqual(2);
    expect(count("bar_mitzvah")).toBeGreaterThanOrEqual(2);
    expect(count("bat_mitzvah")).toBeGreaterThanOrEqual(2);
    expect(count("brit")).toBeGreaterThanOrEqual(1);
    expect(count("birthday")).toBeGreaterThanOrEqual(1);
    expect(count("general")).toBeGreaterThanOrEqual(2);
    const kinds = new Set(templateKinds.map((k) => k.key));
    for (const t of MAGNET_FRAME_TEMPLATES) expect(kinds.has(t.kind), t.key).toBe(true);
  });

  describe.each(MAGNET_FRAME_TEMPLATES.map((t) => [t.key, t] as const))("%s", (_key, tpl) => {
    it("uses only known fonts, ornaments, florals, digits and textures, with unique element ids", () => {
      const ids = tpl.elements.map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
      if (tpl.namesId) expect(texts(tpl.elements).some((el) => el.id === tpl.namesId)).toBe(true);
      if (tpl.settings.textureId) expect(findMagnetFrameTexture(tpl.settings.textureId), tpl.settings.textureId).toBeDefined();
      for (const el of tpl.elements) {
        expect(el.xPct).toBeGreaterThanOrEqual(0);
        expect(el.xPct).toBeLessThanOrEqual(100);
        expect(el.yPct).toBeGreaterThanOrEqual(0);
        expect(el.yPct).toBeLessThanOrEqual(100);
        if (el.type === "text") {
          expect(fontFiles.has(el.fontKey), el.fontKey).toBe(true);
          expect(el.text.trim()).not.toBe("");
          // One weight per font in the editor; the export would thicken or slant it on its own.
          expect(el.bold || el.italic).toBe(false);
        } else {
          const sources = [el.ornamentId, el.floralId, el.customElementAssetId].filter(Boolean);
          expect(sources).toHaveLength(1);
          expect(el.customElementAssetId).toBeUndefined();
          if (el.ornamentId) expect(findOrnament(el.ornamentId), el.ornamentId).toBeDefined();
          if (el.floralId) expect(findMagnetFrameFloral(el.floralId), el.floralId).toBeDefined();
          expect(el.sizePct).toBeGreaterThan(0);
        }
      }
    });

    it("has a glyph for every character in the font file the export draws with", () => {
      for (const el of texts(tpl.elements)) {
        const font = fontFor(el.fontKey);
        const missing = [...el.text].filter((ch) => ch !== " " && !font.hasGlyphForCodePoint(ch.codePointAt(0)!));
        expect(missing, `${el.text} in ${el.fontKey}`).toEqual([]);
      }
    });

    // Also with a long client name filled in for an event.
    it.each(SIZES.flatMap((size) => [[size, null] as const, [size, LONG_NAMES] as const]))("keeps every text on the mat and inside the safe margin at %s (names: %s)", (sizeKey, names) => {
      const { frameSettings, elements } = instantiateTemplate(tpl.key, sizeKey, names ? { names, date: "2026-12-31" } : undefined);
      const inset = getMatInsetPct("landscape", sizeKey, frameSettings.borderRatioPct, frameSettings.bottomBorderRatioPct);
      const safe = magnetSafeMarginPct("landscape", sizeKey);
      for (const el of texts(elements)) {
        const box = textBox(el, sizeKey);
        const overWindow = box.right > inset.xPct && box.left < 100 - inset.xPct && box.bottom > inset.topPct && box.top < 100 - inset.bottomPct;
        expect(overWindow, `${el.text} over the photo window`).toBe(false);
        expect(box.left, `${el.text} left`).toBeGreaterThanOrEqual(safe.xPct);
        expect(box.right, `${el.text} right`).toBeLessThanOrEqual(100 - safe.xPct);
        expect(box.top, `${el.text} top`).toBeGreaterThanOrEqual(safe.yPct);
        expect(box.bottom, `${el.text} bottom`).toBeLessThanOrEqual(100 - safe.yPct);
        // A line stays within ~85% of the frame's width.
        expect(box.right - box.left, `${el.text} width`).toBeLessThanOrEqual(85);
        // ...and clear of the decorations' ink.
        for (const deco of elements) {
          if (deco.type !== "decoration") continue;
          const d = decorationInk(deco, sizeKey);
          const overlaps = box.right > d.left && box.left < d.right && box.bottom > d.top && box.top < d.bottom;
          expect(overlaps, `${el.text} over ${deco.ornamentId ?? deco.floralId}`).toBe(false);
        }
      }
    });
  });

  it("instantiates with fresh unique ids, the size set, and leaves the template untouched", () => {
    for (const tpl of MAGNET_FRAME_TEMPLATES) {
      const before = JSON.stringify(tpl);
      const a = instantiateTemplate(tpl.key, "15x10");
      const b = instantiateTemplate(tpl.key, "15x10");
      const idsA = a.elements.map((el) => el.id);
      expect(new Set(idsA).size).toBe(idsA.length);
      for (const id of idsA) {
        expect(tpl.elements.some((el) => el.id === id)).toBe(false);
        expect(b.elements.some((el) => el.id === id)).toBe(false);
      }
      expect(a.elements).toHaveLength(tpl.elements.length);
      expect(a.frameSettings.sizeKey).toBe("15x10");
      expect(JSON.stringify(tpl)).toBe(before);
    }
  });

  it("keeps the 20×15 design as drawn", () => {
    const tpl = MAGNET_FRAME_TEMPLATES[0];
    const { frameSettings, elements } = instantiateTemplate(tpl.key, "20x15");
    expect(frameSettings).toEqual({ ...DEFAULT_MAGNET_FRAME_SETTINGS, ...tpl.settings, sizeKey: "20x15" });
    elements.forEach((el, i) => expect({ ...el, id: tpl.elements[i].id }).toEqual(tpl.elements[i]));
  });

  it("gives the empty frame the default settings at the chosen size", () => {
    expect(instantiateTemplate(BLANK_TEMPLATE_KEY, "9x9")).toEqual({ frameSettings: { ...DEFAULT_MAGNET_FRAME_SETTINGS, sizeKey: "9x9" }, elements: [] });
  });

  it("fills in the event's names and date, shrinking long names to fit", () => {
    const tpl = MAGNET_FRAME_TEMPLATES.find((t) => t.key === "wedding-classic")!;
    const { elements } = instantiateTemplate(tpl.key, "20x15", { names: "  מיכל ויונתן  ", date: "2026-09-03" });
    const all = texts(elements).map((el) => el.text);
    expect(all).toContain("מיכל ויונתן");
    expect(all).toContain("03.09.2026");
    expect(all).not.toContain(TEMPLATE_DATE_TEXT);

    const filled = texts(instantiateTemplate(tpl.key, "10x7", { names: LONG_NAMES }).elements).find((el) => el.text === LONG_NAMES)!;
    expect(estimateTextWidthPx(filled)).toBeLessThanOrEqual(0.85 * magnetDesignDimensions("landscape", "10x7").widthPx + 1);

    // A date inside a longer line is replaced in place.
    const henna = texts(instantiateTemplate("henna-royal", "20x15", { date: "2026-12-31" }).elements).map((el) => el.text);
    expect(henna).toContain("חינה · 31.12.2026");
  });

  it("writes a date the way the templates do", () => {
    expect(templateDateText("2026-06-12")).toBe("12.06.2026");
    expect(templateDateText("2026-1-5")).toBe("05.01.2026");
  });
});
