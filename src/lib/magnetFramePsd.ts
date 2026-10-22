import sharp from "sharp";
import { writePsdBuffer, type Layer, type LayerEffectsInfo } from "ag-psd";
import { infoHandlers } from "ag-psd/dist/additionalInfo.js";
import {
  renderMagnetFrameBase,
  renderMagnetFrameTextureLayer,
  renderMagnetFrameWindow,
  composeMagnetFrameElements,
} from "@/lib/magnetFrame";
import { MAGNET_FRAME_DPI, MAGNET_TEXT_SHADOW_ALPHA, hexToRgbTriple, magnetExportDimensions, magnetExportScale } from "@/lib/magnetFrameShared";
import type { LoadedMagnetDesign } from "@/lib/magnetFrameLoad";
import { getAlbumFontDef } from "@/lib/albumFontFiles";
import type { FrameOrientation, MagnetFrameElement } from "@/lib/types";

// Same fix as albumPsd.ts (see its comment): ag-psd also writes the legacy `lrFX` effects block,
// which real Photoshop rejects ("problems reading layers"). Only the modern `lfx2` block stays.
// Idempotent: whichever module loads first removes it.
const lrFXHandlerIndex = infoHandlers.findIndex((h) => h.key === "lrFX");
if (lrFXHandlerIndex !== -1) infoHandlers.splice(lrFXHandlerIndex, 1);

const RESOLUTION_INFO = {
  horizontalResolution: MAGNET_FRAME_DPI,
  horizontalResolutionUnit: "PPI" as const,
  widthUnit: "Inches" as const,
  verticalResolution: MAGNET_FRAME_DPI,
  verticalResolutionUnit: "PPI" as const,
  heightUnit: "Inches" as const,
};

const LINEAR_CONTOUR = { name: "Linear", curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };

// A live Photoshop Drop Shadow, with the full descriptor real Photoshop writes (see albumPsd.ts).
// angle is Photoshop's light direction: 135 = light from the top left, shadow down and right.
function dropShadow(opts: { angle: number; distancePx: number; sizePx: number; opacity: number; color?: string }): LayerEffectsInfo {
  const [r, g, b] = hexToRgbTriple(opts.color);
  return {
    dropShadow: [
      {
        enabled: true,
        present: true,
        showInDialog: true,
        useGlobalLight: false,
        angle: opts.angle,
        distance: { units: "Pixels", value: Math.max(0, Math.round(opts.distancePx)) },
        choke: { units: "Pixels", value: 0 },
        size: { units: "Pixels", value: Math.max(0, Math.round(opts.sizePx)) },
        color: { r, g, b },
        opacity: Math.max(0, Math.min(1, opts.opacity)),
        blendMode: "multiply",
        antialiased: false,
        layerConceals: true,
        contour: LINEAR_CONTOUR,
      },
    ],
  };
}

// A text's outline as a live Stroke outside the letters: the same Stroke descriptor albumPsd.ts
// verified in real Photoshop, positioned outside. Photoshop takes whole pixels, up to 250.
function outlineStroke(sizePx: number, color: string | undefined): NonNullable<LayerEffectsInfo["stroke"]> {
  const [r, g, b] = hexToRgbTriple(color);
  return [
    {
      enabled: true,
      present: true,
      showInDialog: true,
      position: "outside",
      fillType: "color",
      color: { r, g, b },
      opacity: 1,
      blendMode: "normal",
      size: { units: "Pixels", value: Math.max(1, Math.min(250, Math.round(sizePx))) },
      overprint: false,
    },
  ];
}

// A full-canvas transparent PNG cut down to its visible pixels, as a positioned PSD layer. Null
// when nothing is visible.
async function trimmedLayer(png: Buffer, name: string, extra: Partial<Layer> = {}): Promise<Layer | null> {
  const { data, info } = await sharp(png).ensureAlpha().trim({ threshold: 0 }).raw().toBuffer({ resolveWithObject: true });
  if (info.width <= 1 && info.height <= 1) return null;
  const left = -(info.trimOffsetLeft ?? 0);
  const top = -(info.trimOffsetTop ?? 0);
  return {
    name,
    left,
    top,
    right: left + info.width,
    bottom: top + info.height,
    imageData: { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height },
    ...extra,
  };
}

// Photoshop finds a font by its PostScript name. For these Google fonts that's the family without
// spaces plus the style ("Heebo-Bold", "FrankRuhlLibre-Regular", "PlayfairDisplay-Italic"). Fonts
// that come in one weight only get Photoshop's faux bold/italic instead of a style that doesn't exist.
const SINGLE_STYLE_FONTS = new Set(["secular-one", "suez-one", "great-vibes", "pacifico", "permanent-marker", "gveret-levin", "alef"]);
const HEBREW_RE = /[\u0590-\u05FF]/;

function typeLayerData(el: Extract<MagnetFrameElement, { type: "text" }>, widthPx: number, heightPx: number, S: number): NonNullable<Layer["text"]> {
  const text = el.text.trim();
  // A Latin-only font with Hebrew text renders the Hebrew in Heebo, here as in the PNG.
  const def = HEBREW_RE.test(text) && getAlbumFontDef(el.fontKey).category === "latin" ? getAlbumFontDef("heebo") : getAlbumFontDef(el.fontKey);
  const family = def.label.replace(/\s*\(.*\)\s*$/, "").replace(/\s+/g, "");
  const single = SINGLE_STYLE_FONTS.has(def.key);
  const styleName = single ? "Regular" : el.bold && el.italic ? "BoldItalic" : el.bold ? "Bold" : el.italic ? "Italic" : "Regular";
  const fontSizePx = el.fontSizePx * S;
  // Point text anchored at the middle of its baseline (centered paragraph); the baseline sits about
  // a third of the size below the visual center. Rotation turns around that anchor.
  const cx = (el.xPct / 100) * widthPx;
  const cy = (el.yPct / 100) * heightPx + fontSizePx * 0.35;
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const color = el.color.replace("#", "");
  const full = color.length === 3 ? color.split("").map((c) => c + c).join("") : color;
  const n = parseInt(full, 16);
  // Letter spacing as Photoshop tracking, in thousandths of an em.
  const tracking = el.letterSpacing ? Math.max(-1000, Math.min(10000, Math.round((el.letterSpacing / el.fontSizePx) * 1000))) : 0;
  return {
    text,
    transform: [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), cx, cy],
    antiAlias: "smooth",
    style: {
      font: { name: `${family}-${styleName}` },
      // Photoshop's type size is this number times the transform's scale (1 here), in pixels.
      fontSize: fontSizePx,
      fillColor: { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 },
      fauxBold: single && el.bold,
      fauxItalic: single && el.italic,
      underline: el.underline,
      ...(tracking ? { tracking } : {}),
    },
    paragraphStyle: { justification: "center" },
  };
}

function elementName(el: MagnetFrameElement, index: number): string {
  if (el.type === "text") return (el.text.trim() || "טקסט").replace(/\s+/g, " ").slice(0, 40);
  if (el.floralId?.startsWith("digit-")) return `ספרה ${index + 1}`;
  return `אלמנט ${index + 1}`;
}

// A layered .psd of one orientation, for continuing the design in Photoshop (owner's request,
// 2026-10-05). Bottom to top:
// - "מקום לתמונה" (hidden): the photo window's shape. A photo placed above it and clipped to it
//   (Alt-click between the layers) fills the window.
// - "מסגרת": the mat, with the inner shadow as a live Drop Shadow layer style (under the mat it only
//   shows inside the window, like the PNG's shadow).
// - "טקסטורה": clipped to the mat, opacity already in the pixels.
// - One layer per text and element, in the editor's order. A text's shadow is a live Drop Shadow in
//   its color, and its outline a live Stroke outside the letters.
// Each text is an editable type layer (see typeLayerData), with a hidden picture of it as a backup.
// The frame's size is the design's (settings.sizeKey), at 300 DPI.
export async function renderMagnetFramePsd(orientation: FrameOrientation, design: Omit<LoadedMagnetDesign, "orientation">): Promise<Buffer> {
  const { elements, settings, customTextureImage, customElementBuffers } = design;
  const sizeKey = settings.sizeKey;
  const { widthPx, heightPx } = magnetExportDimensions(orientation, sizeKey);
  const S = magnetExportScale(sizeKey);
  const children: Layer[] = [];

  const windowLayer = await trimmedLayer(await renderMagnetFrameWindow(orientation, settings), "מקום לתמונה", { hidden: true });
  if (windowLayer) children.push(windowLayer);

  const mat = await renderMagnetFrameBase(orientation, { ...settings, shadowEnabled: false });
  const matEffects = settings.shadowEnabled
    ? dropShadow({
        angle: 90,
        distancePx: 0,
        sizePx: (Math.max(0, settings.shadowDistancePx) + Math.max(0, settings.shadowBlurPx) * 2) * S,
        opacity: settings.shadowOpacity / 100,
      })
    : undefined;
  children.push({
    name: "מסגרת",
    left: 0,
    top: 0,
    right: widthPx,
    bottom: heightPx,
    imageData: await rawImage(mat),
    ...(matEffects ? { effects: matEffects } : {}),
  });

  const texture = await renderMagnetFrameTextureLayer(mat, settings, orientation, customTextureImage);
  if (texture) {
    const layer = await trimmedLayer(texture, "טקסטורה", { clipping: true });
    if (layer) children.push(layer);
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "text") {
      const layer = await trimmedLayer(await composeMagnetFrameElements([el], orientation, sizeKey, customElementBuffers), elementName(el, i));
      if (layer) children.push(layer);
      continue;
    }
    // The picture of the text with its outline (the shadow is a live effect, not pixels).
    const pictured = await composeMagnetFrameElements([{ ...el, shadowEnabled: false }], orientation, sizeKey, customElementBuffers);
    const name = elementName(el, i);
    const layer = await trimmedLayer(pictured, name);
    if (!layer) continue;
    // Same look as the PNG: the shadow there is offset by distance on each axis and blurred with
    // sigma = blur / 2 (a CSS blur radius, as in the editor); Photoshop's Size is roughly 2.5 sigma.
    const shadow = el.shadowEnabled
      ? dropShadow({ angle: 135, distancePx: el.shadowDistancePx * S * Math.SQRT2, sizePx: el.shadowBlurPx * S * 1.25, opacity: MAGNET_TEXT_SHADOW_ALPHA, color: el.shadowColor })
      : undefined;
    // Text (owner, 2026-10-06): a real, editable Photoshop type layer carrying our own rendering as
    // its pixels, so it looks right the moment the file opens. Photoshop asks to "Update" type
    // layers written this way; after updating it redraws them with its own engine and the
    // photographer's installed font. A hidden picture of the same text stays underneath as a
    // backup, in case that redraw comes out different (a missing font, or Hebrew in a Photoshop
    // without Middle Eastern features turned on).
    children.push({ ...layer, name: `${name} (תמונה, גיבוי)`, hidden: true });
    // An outline is a live Stroke on the type layer, so it survives Photoshop's redraw; the type
    // layer's own pixels are then the letters without it, or the outline would show twice.
    const outlined = !!el.strokeWidth && el.strokeWidth > 0;
    const typePixels = outlined
      ? await trimmedLayer(await composeMagnetFrameElements([{ ...el, shadowEnabled: false, strokeWidth: 0 }], orientation, sizeKey, customElementBuffers), name)
      : layer;
    if (!typePixels) continue;
    const effects: LayerEffectsInfo = { ...shadow, ...(outlined ? { stroke: outlineStroke(el.strokeWidth! * S, el.strokeColor) } : {}) };
    children.push({ ...typePixels, text: typeLayerData(el, widthPx, heightPx, S), ...(Object.keys(effects).length > 0 ? { effects } : {}) });
  }

  // The flattened image too, so previews (Finder, Bridge, the browser) show the real design.
  // The texture layer above is reused: rendering a texture at 300 DPI takes seconds.
  const matWithShadow = settings.shadowEnabled ? await renderMagnetFrameBase(orientation, settings) : mat;
  const allElements = await composeMagnetFrameElements(elements, orientation, sizeKey, customElementBuffers);
  const composite = await sharp(matWithShadow)
    .composite([...(texture ? [{ input: texture, left: 0, top: 0 }] : []), { input: allElements, left: 0, top: 0 }])
    .png()
    .toBuffer();

  return writePsdBuffer({
    width: widthPx,
    height: heightPx,
    children,
    imageData: await rawImage(composite),
    imageResources: { resolutionInfo: RESOLUTION_INFO },
  });
}

async function rawImage(png: Buffer): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}
