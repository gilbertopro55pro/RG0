import sharp from "sharp";
import { writePsdBuffer, type Layer, type LayerEffectsInfo } from "ag-psd";
import { infoHandlers } from "ag-psd/dist/additionalInfo.js";
import {
  renderMagnetFrameBase,
  renderMagnetFrameTextureLayer,
  renderMagnetFrameWindow,
  composeMagnetFrameElements,
} from "@/lib/magnetFrame";
import { MAGNET_FRAME_DPI, MAGNET_EXPORT_SCALE as S, magnetExportDimensions } from "@/lib/magnetFrameShared";
import type { LoadedMagnetDesign } from "@/lib/magnetFrameLoad";
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
function dropShadow(opts: { angle: number; distancePx: number; sizePx: number; opacity: number }): LayerEffectsInfo {
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
        color: { r: 0, g: 0, b: 0 },
        opacity: Math.max(0, Math.min(1, opts.opacity)),
        blendMode: "multiply",
        antialiased: false,
        layerConceals: true,
        contour: LINEAR_CONTOUR,
      },
    ],
  };
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
// - One layer per text and element, in the editor's order. A text's shadow is a live Drop Shadow.
// Text is pixels, not editable type: a Hebrew type layer needs fonts and Photoshop's own text
// engine, which can't be checked from here.
export async function renderMagnetFramePsd(orientation: FrameOrientation, design: LoadedMagnetDesign): Promise<Buffer> {
  const { widthPx, heightPx } = magnetExportDimensions(orientation);
  const { elements, settings, customTextureImage, customElementBuffers } = design;
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
    const plain = el.type === "text" ? { ...el, shadowEnabled: false } : el;
    const png = await composeMagnetFrameElements([plain], orientation, customElementBuffers);
    // Same look as the PNG: the shadow there is offset by distance on each axis and blurred with
    // sigma = blur; Photoshop's Size is roughly 2.5 sigma.
    const effects =
      el.type === "text" && el.shadowEnabled
        ? dropShadow({ angle: 135, distancePx: el.shadowDistancePx * S * Math.SQRT2, sizePx: el.shadowBlurPx * S * 2.5, opacity: 0.55 })
        : undefined;
    const layer = await trimmedLayer(png, elementName(el, i), effects ? { effects } : {});
    if (layer) children.push(layer);
  }

  // The flattened image too, so previews (Finder, Bridge, the browser) show the real design.
  // The texture layer above is reused: rendering a texture at 300 DPI takes seconds.
  const matWithShadow = settings.shadowEnabled ? await renderMagnetFrameBase(orientation, settings) : mat;
  const allElements = await composeMagnetFrameElements(elements, orientation, customElementBuffers);
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
