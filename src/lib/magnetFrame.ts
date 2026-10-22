import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { svgTextLayer, ornamentLayerRaw } from "@/lib/albumRaster";
import type { TextShadowSpec } from "@/lib/albumRender";
import { findOrnament } from "@/lib/albumOrnaments";
import { findMagnetFrameTexture } from "@/lib/magnetFrameTextures";
import { findMagnetFrameFloral } from "@/lib/magnetFrameFlorals";
import { MAGNET_FRAME_DPI, MAGNET_TEXT_SHADOW_ALPHA, hexToRgbTriple, magnetExportDimensions, magnetExportScale } from "@/lib/magnetFrameShared";
import type { FrameOrientation, MagnetFrameElement, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";

// Every function here renders at the print size of the design's sizeKey (settings.sizeKey, missing
// = 20×15): the canvas is magnetExportDimensions, and every design-px value (font sizes, shadows,
// outlines, texture tiles) is multiplied by magnetExportScale. Design px are relative to the frame
// (its long side is always 1600), so a design looks the same at every size, only in fewer pixels.

// Shadow caps, in design px.
const MAX_SHADOW_BLUR_PX = 40;
const MAX_SHADOW_SPREAD_PX = 30;
// The photographer's own texture repeats every 220 design px (the editor's background-size).
const CUSTOM_TEXTURE_TILE_DESIGN_PX = 220;

function transparentCanvas(widthPx: number, heightPx: number) {
  return sharp({ create: { width: widthPx, height: heightPx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
}

// A rounded-rect path (clockwise) — degenerates cleanly to a plain rect at radius 0.
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0.5) return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

// Blends `tint` into a white base by `ratio` (0 = pure white, 1 = pure tint) — the mat's own fill
// color is computed once in JS rather than composited as a separate layer, since a flat-color
// shape only ever needs one resolved color either way.
function mixWithWhite(tint: string, ratio: number): string {
  const hex = tint.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (channel: number) => Math.round(255 + (channel - 255) * ratio);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// The export canvas and the photo window's outline. The borders are a % of the shorter side.
function matGeometry(orientation: FrameOrientation, settings: MagnetFrameSettings): { widthPx: number; heightPx: number; innerPath: string } {
  const { widthPx, heightPx } = magnetExportDimensions(orientation, settings.sizeKey);
  const shorterSide = Math.min(widthPx, heightPx);
  const border = Math.round((settings.borderRatioPct / 100) * shorterSide);
  const bottomBorder = Math.round((settings.bottomBorderRatioPct / 100) * shorterSide);
  const cutoutW = widthPx - border * 2;
  const cutoutH = heightPx - border - bottomBorder;
  const maxRadius = Math.min(cutoutW, cutoutH) / 2;
  const radius = Math.min(maxRadius, (settings.cornerRadiusPct / 100) * maxRadius);
  return { widthPx, heightPx, innerPath: roundedRectPath(border, border, cutoutW, cutoutH, radius) };
}

// The mat card, with a transparent photo cutout in the middle (only the cutout's corners are
// roundable — the physical card edge itself always stays square, per the "round the inner corners"
// spec) and an optional INNER shadow — a soft, blurred band traced along the cutout's own boundary
// and masked to keep ONLY the half that falls INSIDE the transparent hole, discarding the half that
// would've fallen on the mat. The mat itself must stay perfectly crisp/unshadowed (confirmed: the
// photographer wants the effect entirely on the photo side of the seam, not the white frame's own
// surface) — like the mat's raised edge casting a shadow down onto the photo beneath it, never onto
// itself. The photo that eventually fills this cutout (outside this tool, later in production) sits
// BEHIND this exported PNG, so the shadow needs its own visible (semi-transparent) pixels over the
// hole to have anything to darken once a real photo is behind it. Never touching or bleeding past
// the card's own crisp outer edge. borderRatioPct sets the top/left/right thickness;
// bottomBorderRatioPct is independent, for a classic bottom-weighted mat. frameColor/
// frameColorOpacity tint the mat itself (0 opacity = pure white). All of this is a genuine, saved
// design choice (not just editor chrome), so it's baked into this export too, not only shown in
// the live CSS preview.
export async function renderMagnetFrameBase(orientation: FrameOrientation, settings: MagnetFrameSettings): Promise<Buffer> {
  const { widthPx, heightPx, innerPath } = matGeometry(orientation, settings);
  const S = magnetExportScale(settings.sizeKey);

  const matFill = mixWithWhite(settings.frameColor, Math.max(0, Math.min(1, settings.frameColorOpacity / 100)));
  const outerPath = `M0,0 H${widthPx} V${heightPx} H0 Z`;
  const cardSvg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${outerPath} ${innerPath}" fill="${matFill}" /></svg>`;
  const cardBuf = await sharp(Buffer.from(cardSvg)).png().toBuffer();

  if (!settings.shadowEnabled) return cardBuf;

  // Clamped in design units, then scaled to the export resolution.
  const blurPx = Math.min(MAX_SHADOW_BLUR_PX, Math.max(0, settings.shadowBlurPx)) * S;
  const spreadPx = Math.min(MAX_SHADOW_SPREAD_PX, Math.max(0, settings.shadowDistancePx)) * S;
  const alpha = Math.max(0, Math.min(1, settings.shadowOpacity / 100));

  // A thick stroke traced along the cutout's own boundary, then blurred, produces a soft band
  // straddling both sides of that line. Masking it against a FILLED cutout silhouette ("dest-in" —
  // keep the stroke's pixels only where the cutout shape itself is opaque) throws away the half that
  // fell on the mat, keeping only the half that falls inside the transparent hole — the photo side.
  const strokeWidth = Math.max(1, spreadPx * 2);
  const ringSvg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><path d="${innerPath}" fill="none" stroke="rgba(0,0,0,${alpha})" stroke-width="${strokeWidth}" /></svg>`;
  const ringBuf = await sharp(Buffer.from(ringSvg)).blur(Math.max(0.3, blurPx)).png().toBuffer();

  const cutoutMaskSvg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><path d="${innerPath}" fill="#000" /></svg>`;
  const cutoutMaskBuf = await sharp(Buffer.from(cutoutMaskSvg)).png().toBuffer();
  const maskedRing = await sharp(ringBuf).composite([{ input: cutoutMaskBuf, blend: "dest-in" }]).png().toBuffer();

  return sharp(cardBuf).composite([{ input: maskedRing, left: 0, top: 0 }]).png().toBuffer();
}

async function renderBuiltinTextureLayer(textureId: string, widthPx: number, heightPx: number, opacityPct: number, S: number): Promise<Buffer | null> {
  const texture = findMagnetFrameTexture(textureId);
  if (!texture) return null;
  const alpha = Math.max(0, Math.min(1, opacityPct / 100));
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="tex" width="${texture.tileSizePx * S}" height="${texture.tileSizePx * S}" patternUnits="userSpaceOnUse"><g transform="scale(${S})">${texture.content}</g></pattern></defs><rect width="${widthPx}" height="${heightPx}" fill="url(#tex)" opacity="${alpha}" /></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Tiles the photographer's own uploaded image across the full canvas (sharp has no native
// "repeating pattern fill" for an arbitrary raster, unlike the SVG <pattern> the built-in textures
// use, so this composites the resized tile once per grid cell), then scales the whole layer's
// alpha down to the requested opacity in one pass over the raw buffer.
async function renderCustomTextureLayer(customImage: Buffer, widthPx: number, heightPx: number, opacityPct: number, S: number): Promise<Buffer> {
  const tilePx = Math.max(1, Math.round(CUSTOM_TEXTURE_TILE_DESIGN_PX * S));
  const tile = await sharp(customImage).resize(tilePx, tilePx, { fit: "cover" }).ensureAlpha().png().toBuffer();
  const cols = Math.ceil(widthPx / tilePx);
  const rows = Math.ceil(heightPx / tilePx);
  const composites: OverlayOptions[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      composites.push({ input: tile, left: c * tilePx, top: r * tilePx });
    }
  }
  const tiled = await transparentCanvas(widthPx, heightPx)
    .composite(composites)
    .png()
    .toBuffer();

  const alpha = Math.max(0, Math.min(1, opacityPct / 100));
  const { data, info } = await sharp(tiled).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += info.channels) {
    data[i] = Math.round(data[i] * alpha);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

// Lays the chosen texture (built-in or the photographer's own upload) over the mat ONLY — masked
// by `base`'s own alpha ("dest-in", same technique as the inner shadow) so it never reaches into
// the transparent photo cutout. `base` doubles as the mask because renderMagnetFrameBase's shadow
// step never changes the card's alpha footprint (it only darkens pixels that were already opaque),
// so base's alpha channel is identical to the plain card's. customImage, when given, always wins
// over settings.textureId — matching the editor's "picking one clears the other" rule.
export async function composeMagnetFrameTexture(base: Buffer, settings: MagnetFrameSettings, orientation: FrameOrientation, customImage: Buffer | null): Promise<Buffer> {
  // Masked by the plain mat, not `base`: with the inner shadow on, base also has semi-transparent
  // pixels INSIDE the photo window, and the texture showed there along the shadow band (owner,
  // 2026-10-06: the texture belongs on the white frame only).
  const mask = settings.shadowEnabled ? await renderMagnetFrameBase(orientation, { ...settings, shadowEnabled: false }) : base;
  const masked = await renderMagnetFrameTextureLayer(mask, settings, orientation, customImage);
  if (!masked) return base;
  return sharp(base).composite([{ input: masked, left: 0, top: 0 }]).png().toBuffer();
}

// The texture alone, already cut to the mat's shape (`matMask`'s alpha), or null when the design
// has no texture. The PSD export keeps it as its own layer above the mat.
export async function renderMagnetFrameTextureLayer(matMask: Buffer, settings: MagnetFrameSettings, orientation: FrameOrientation, customImage: Buffer | null): Promise<Buffer | null> {
  const { widthPx, heightPx } = magnetExportDimensions(orientation, settings.sizeKey);
  const S = magnetExportScale(settings.sizeKey);
  const textureLayer = customImage
    ? await renderCustomTextureLayer(customImage, widthPx, heightPx, settings.textureOpacity, S)
    : settings.textureId
      ? await renderBuiltinTextureLayer(settings.textureId, widthPx, heightPx, settings.textureOpacity, S)
      : null;
  if (!textureLayer) return null;
  return sharp(textureLayer).composite([{ input: matMask, blend: "dest-in" }]).png().toBuffer();
}

// The photo window's own shape, filled flat gray: the PSD's hidden "מקום לתמונה" layer, which a
// photo placed above it can be clipped to in Photoshop.
export async function renderMagnetFrameWindow(orientation: FrameOrientation, settings: MagnetFrameSettings): Promise<Buffer> {
  const { widthPx, heightPx, innerPath } = matGeometry(orientation, settings);
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><path d="${innerPath}" fill="#d9d9d9" /></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Rotates whatever a full-canvas layer holds around its own visible center (the element's center),
// by `degrees` clockwise. sharp rotates around the image's middle and grows it, so the layer is cut
// down to its visible pixels, rotated, and put back centered where it was.
async function rotateLayerAroundContent(layer: Buffer, degrees: number, widthPx: number, heightPx: number): Promise<Buffer> {
  if (!degrees || Math.abs(degrees % 360) < 0.01) return layer;
  const trimmed = await sharp(layer).trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
  const cx = -(trimmed.info.trimOffsetLeft ?? 0) + trimmed.info.width / 2;
  const cy = -(trimmed.info.trimOffsetTop ?? 0) + trimmed.info.height / 2;
  const rotated = await sharp(trimmed.data).rotate(degrees, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
  return placeCentered(rotated.data, rotated.info.width, rotated.info.height, cx, cy, widthPx, heightPx);
}

// An image on a transparent widthPx×heightPx canvas, centered at (cx, cy); whatever falls off the
// edges is cropped (sharp's composite rejects an overlay that doesn't fit inside the base).
async function placeCentered(img: Buffer, w: number, h: number, cx: number, cy: number, widthPx: number, heightPx: number): Promise<Buffer> {
  const left = Math.round(cx - w / 2);
  const top = Math.round(cy - h / 2);
  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  const cropW = Math.min(w - cropLeft, widthPx - Math.max(0, left));
  const cropH = Math.min(h - cropTop, heightPx - Math.max(0, top));
  const canvas = transparentCanvas(widthPx, heightPx);
  if (cropW <= 0 || cropH <= 0) return canvas.png().toBuffer();
  const piece = await sharp(img).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).png().toBuffer();
  return canvas.composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
}

// The text's shadow and outline as svgTextLayer effects, at `S` export px per design px. The
// shadow is offset by its distance on both axes, in its color at 55% (magnetTextShadowRgba), and
// blurred with a Gaussian sigma of its blur (svgTextLayer halves `blur`, a CSS radius). The outline
// is drawn under the letters at twice its width, so strokeWidth shows outside them.
export function magnetTextEffects(el: Extract<MagnetFrameElement, { type: "text" }>, S: number) {
  const shadows: TextShadowSpec[] = el.shadowEnabled
    ? [{ dx: el.shadowDistancePx, dy: el.shadowDistancePx, blur: el.shadowBlurPx * 2, rgb: hexToRgbTriple(el.shadowColor), alpha: MAGNET_TEXT_SHADOW_ALPHA }]
    : [];
  const strokeWidth = el.strokeWidth && el.strokeWidth > 0 ? el.strokeWidth : undefined;
  return { shadows, strokeWidth, strokeColor: el.strokeColor ?? "#000000", unitPx: S };
}

// Renders one text element as glyph-outline paths (same layoutTextAsSvgPaths machinery
// albumRaster.ts's other renderers use — plain SVG <text> comes back blank on Vercel's Node
// runtime, no fontconfig), with its shadow, outline and letter spacing (see magnetTextEffects).
async function composeTextElement(base: Buffer, el: Extract<MagnetFrameElement, { type: "text" }>, widthPx: number, heightPx: number, S: number): Promise<Buffer> {
  const text = el.text.trim();
  if (!text) return base;
  // Stored sizes are in design pixels; the export canvas is S times larger.
  const fontSizePx = el.fontSizePx * S;
  const boxWidth = widthPx * 0.92;
  const layer = await svgTextLayer(text, {
    xPx: (el.xPct / 100) * widthPx - boxWidth / 2,
    yPx: (el.yPct / 100) * heightPx - fontSizePx / 2,
    widthPx: boxWidth,
    fontSizePx,
    color: el.color,
    align: "center",
    pageWidthPx: widthPx,
    pageHeightPx: heightPx,
    fontFamily: el.fontKey,
    bold: el.bold,
    italic: el.italic,
    underline: el.underline,
    letterSpacingPx: (el.letterSpacing ?? 0) * S,
    effects: magnetTextEffects(el, S),
  });
  // Text, shadow and outline turn together, like the editor's CSS rotate (the shadow offset turns too).
  const turned = el.rotation ? await rotateLayerAroundContent(layer, el.rotation, widthPx, heightPx) : layer;
  return sharp(base).composite([{ input: turned, left: 0, top: 0 }]).png().toBuffer();
}

// customElementBuffers resolves customElementAssetId -> the photographer's own uploaded bytes (the
// caller looks these up via the DB + storage, same as the custom-texture flow) — composited as-is
// (resized, no recoloring, since it's already a real image) rather than through the
// findOrnament/ornamentLayerRaw path a built-in ornamentId takes.
async function composeDecorationElement(base: Buffer, el: Extract<MagnetFrameElement, { type: "decoration" }>, widthPx: number, heightPx: number, customElementBuffers: Map<string, Buffer>): Promise<Buffer> {
  const shorterSide = Math.min(widthPx, heightPx);
  const sizePx = Math.max(4, Math.round((el.sizePct / 100) * shorterSide));
  const centerX = (el.xPct / 100) * widthPx;
  const centerY = (el.yPct / 100) * heightPx;

  // The element's own sizePx×sizePx image (transparent around it), from whichever source it uses.
  let image: Buffer | null = null;
  if (el.customElementAssetId) {
    const customImage = customElementBuffers.get(el.customElementAssetId);
    if (!customImage) return base;
    image = await sharp(customImage).resize(sizePx, sizePx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
  } else if (el.floralId) {
    const floral = findMagnetFrameFloral(el.floralId);
    if (!floral) return base;
    const floralBuffer = await fs.readFile(path.join(process.cwd(), "public", floral.url));
    image = await sharp(floralBuffer).resize(sizePx, sizePx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
  } else {
    const ornament = findOrnament(el.ornamentId);
    if (!ornament) return base;
    const source = Buffer.from(ornament.svg.replace("<svg ", `<svg style="color:${el.color}" `));
    const rendered = await ornamentLayerRaw(source, sizePx, sizePx, undefined, undefined);
    if (!rendered) return base;
    image = await sharp(rendered.data, { raw: { width: rendered.width, height: rendered.height, channels: 4 } }).png().toBuffer();
  }

  // Turned around its own center (clockwise, like the editor's CSS rotate).
  const turned = el.rotation ? await sharp(image).rotate(el.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true }) : null;
  const meta = turned ? turned.info : await sharp(image).metadata();
  const layer = await placeCentered(turned ? turned.data : image, meta.width!, meta.height!, centerX, centerY, widthPx, heightPx);
  return sharp(base).composite([{ input: layer, left: 0, top: 0 }]).png().toBuffer();
}

// Paints every element (text and decorations, IN ORDER, so later elements land on top of earlier
// ones — matching what the editor shows) onto a blank TRANSPARENT widthPx x heightPx canvas — the
// unpadded, native coordinate space every xPct/yPct is defined in. customElementBuffers resolves
// any customElementAssetId decorations to their real image bytes (the caller looks these up via
// the DB + storage — this function has no DB access of its own).
export async function composeMagnetFrameElements(
  elements: MagnetFrameElement[],
  orientation: FrameOrientation,
  sizeKey: MagnetFrameSizeKey | null | undefined,
  customElementBuffers: Map<string, Buffer> = new Map()
): Promise<Buffer> {
  const { widthPx, heightPx } = magnetExportDimensions(orientation, sizeKey);
  const S = magnetExportScale(sizeKey);
  let buffer: Buffer = await transparentCanvas(widthPx, heightPx).png().toBuffer();
  for (const el of elements) {
    buffer = el.type === "text" ? await composeTextElement(buffer, el, widthPx, heightPx, S) : await composeDecorationElement(buffer, el, widthPx, heightPx, customElementBuffers);
  }
  return buffer;
}

// The downloadable PNG of one orientation: mat (with its inner shadow) → texture → elements, at
// 300 DPI and stamped with it, so it opens at its real size in centimeters.
export async function renderMagnetFramePng(
  orientation: FrameOrientation,
  design: { elements: MagnetFrameElement[]; settings: MagnetFrameSettings; customTextureImage: Buffer | null; customElementBuffers: Map<string, Buffer> }
): Promise<Buffer> {
  const { elements, settings, customTextureImage, customElementBuffers } = design;
  let base = await renderMagnetFrameBase(orientation, settings);
  base = await composeMagnetFrameTexture(base, settings, orientation, customTextureImage);
  const elementsLayer = await composeMagnetFrameElements(elements, orientation, settings.sizeKey, customElementBuffers);
  return sharp(base).composite([{ input: elementsLayer, left: 0, top: 0 }]).withMetadata({ density: MAGNET_FRAME_DPI }).png().toBuffer();
}
