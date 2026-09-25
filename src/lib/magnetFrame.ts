import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { svgTextLayer, ornamentLayerRaw } from "@/lib/albumRaster";
import { findOrnament } from "@/lib/albumOrnaments";
import { findMagnetFrameTexture } from "@/lib/magnetFrameTextures";
import { findMagnetFrameFloral } from "@/lib/magnetFrameFlorals";
import { MAGNET_FRAME_DIMENSIONS, MAGNET_EXPORT_SCALE as S, magnetExportDimensions } from "@/lib/magnetFrameShared";
import type { FrameOrientation, MagnetFrameElement, MagnetFrameSettings } from "@/lib/types";

export { MAGNET_FRAME_DIMENSIONS };

const MAX_SHADOW_BLUR_PX = 40;
const MAX_SHADOW_SPREAD_PX = 30;

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
  const { widthPx, heightPx } = magnetExportDimensions(orientation);
  const shorterSide = Math.min(widthPx, heightPx);

  const border = Math.round((settings.borderRatioPct / 100) * shorterSide);
  const bottomBorder = Math.round((settings.bottomBorderRatioPct / 100) * shorterSide);
  const cutoutW = widthPx - border * 2;
  const cutoutH = heightPx - border - bottomBorder;
  const maxRadius = Math.min(cutoutW, cutoutH) / 2;
  const radius = Math.min(maxRadius, (settings.cornerRadiusPct / 100) * maxRadius);

  const matFill = mixWithWhite(settings.frameColor, Math.max(0, Math.min(1, settings.frameColorOpacity / 100)));
  const outerPath = `M0,0 H${widthPx} V${heightPx} H0 Z`;
  const innerPath = roundedRectPath(border, border, cutoutW, cutoutH, radius);
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

async function renderBuiltinTextureLayer(textureId: string, widthPx: number, heightPx: number, opacityPct: number): Promise<Buffer | null> {
  const texture = findMagnetFrameTexture(textureId);
  if (!texture) return null;
  const alpha = Math.max(0, Math.min(1, opacityPct / 100));
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="tex" width="${texture.tileSizePx * S}" height="${texture.tileSizePx * S}" patternUnits="userSpaceOnUse"><g transform="scale(${S})">${texture.content}</g></pattern></defs><rect width="${widthPx}" height="${heightPx}" fill="url(#tex)" opacity="${alpha}" /></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const CUSTOM_TEXTURE_TILE_PX = Math.round(220 * S);

// Tiles the photographer's own uploaded image across the full canvas (sharp has no native
// "repeating pattern fill" for an arbitrary raster, unlike the SVG <pattern> the built-in textures
// use, so this composites the resized tile once per grid cell), then scales the whole layer's
// alpha down to the requested opacity in one pass over the raw buffer.
async function renderCustomTextureLayer(customImage: Buffer, widthPx: number, heightPx: number, opacityPct: number): Promise<Buffer> {
  const tile = await sharp(customImage).resize(CUSTOM_TEXTURE_TILE_PX, CUSTOM_TEXTURE_TILE_PX, { fit: "cover" }).ensureAlpha().png().toBuffer();
  const cols = Math.ceil(widthPx / CUSTOM_TEXTURE_TILE_PX);
  const rows = Math.ceil(heightPx / CUSTOM_TEXTURE_TILE_PX);
  const composites: OverlayOptions[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      composites.push({ input: tile, left: c * CUSTOM_TEXTURE_TILE_PX, top: r * CUSTOM_TEXTURE_TILE_PX });
    }
  }
  const tiled = await sharp({ create: { width: widthPx, height: heightPx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
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
  const { widthPx, heightPx } = magnetExportDimensions(orientation);
  const textureLayer = customImage
    ? await renderCustomTextureLayer(customImage, widthPx, heightPx, settings.textureOpacity)
    : settings.textureId
      ? await renderBuiltinTextureLayer(settings.textureId, widthPx, heightPx, settings.textureOpacity)
      : null;
  if (!textureLayer) return base;
  const masked = await sharp(textureLayer).composite([{ input: base, blend: "dest-in" }]).png().toBuffer();
  return sharp(base).composite([{ input: masked, left: 0, top: 0 }]).png().toBuffer();
}

// Renders one text element as glyph-outline paths (same layoutTextAsSvgPaths machinery
// albumRaster.ts's other renderers use — plain SVG <text> comes back blank on Vercel's Node
// runtime, no fontconfig) twice when a shadow is on: once blurred/offset in a dark tone behind,
// once sharp in the real color on top — the standard two-layer fake for a per-glyph shadow, since
// a text string's silhouette isn't a rectangle a single box-shadow-style blur could hug.
async function composeTextElement(base: Buffer, el: Extract<MagnetFrameElement, { type: "text" }>, widthPx: number, heightPx: number): Promise<Buffer> {
  if (!el.text.trim()) return base;
  // Stored sizes are in design pixels; the export canvas is S times larger.
  const fontSizePx = el.fontSizePx * S;
  const shadowDistancePx = el.shadowDistancePx * S;
  const shadowBlurPx = el.shadowBlurPx * S;
  const boxWidth = widthPx * 0.92;
  const xPx = (el.xPct / 100) * widthPx - boxWidth / 2;
  const yPx = (el.yPct / 100) * heightPx - fontSizePx / 2;

  const composites: OverlayOptions[] = [];
  if (el.shadowEnabled) {
    const shadowLayer = await svgTextLayer(el.text.trim(), {
      xPx: xPx + shadowDistancePx,
      yPx: yPx + shadowDistancePx,
      widthPx: boxWidth,
      fontSizePx: fontSizePx,
      color: "rgba(0,0,0,0.55)",
      align: "center",
      pageWidthPx: widthPx,
      pageHeightPx: heightPx,
      fontFamily: el.fontKey,
      bold: el.bold,
      italic: el.italic,
      underline: el.underline,
    });
    const blurred = shadowBlurPx > 0 ? await sharp(shadowLayer).blur(Math.max(0.3, shadowBlurPx)).png().toBuffer() : shadowLayer;
    composites.push({ input: blurred, left: 0, top: 0 });
  }

  const mainLayer = await svgTextLayer(el.text.trim(), {
    xPx,
    yPx,
    widthPx: boxWidth,
    fontSizePx: fontSizePx,
    color: el.color,
    align: "center",
    pageWidthPx: widthPx,
    pageHeightPx: heightPx,
    fontFamily: el.fontKey,
    bold: el.bold,
    italic: el.italic,
    underline: el.underline,
  });
  composites.push({ input: mainLayer, left: 0, top: 0 });

  return sharp(base).composite(composites).png().toBuffer();
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

  if (el.customElementAssetId) {
    const customImage = customElementBuffers.get(el.customElementAssetId);
    if (!customImage) return base;
    const resized = await sharp(customImage).resize(sizePx, sizePx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return sharp(base)
      .composite([{ input: resized.data, raw: { width: resized.info.width, height: resized.info.height, channels: 4 }, left: Math.round(centerX - resized.info.width / 2), top: Math.round(centerY - resized.info.height / 2) }])
      .png()
      .toBuffer();
  }

  if (el.floralId) {
    const floral = findMagnetFrameFloral(el.floralId);
    if (!floral) return base;
    const floralBuffer = await fs.readFile(path.join(process.cwd(), "public", floral.url));
    const resized = await sharp(floralBuffer).resize(sizePx, sizePx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return sharp(base)
      .composite([{ input: resized.data, raw: { width: resized.info.width, height: resized.info.height, channels: 4 }, left: Math.round(centerX - resized.info.width / 2), top: Math.round(centerY - resized.info.height / 2) }])
      .png()
      .toBuffer();
  }

  const ornament = findOrnament(el.ornamentId);
  if (!ornament) return base;
  const source = Buffer.from(ornament.svg.replace("<svg ", `<svg style="color:${el.color}" `));
  const rendered = await ornamentLayerRaw(source, sizePx, sizePx, undefined, undefined);
  if (!rendered) return base;
  return sharp(base)
    .composite([{ input: rendered.data, raw: { width: rendered.width, height: rendered.height, channels: 4 }, left: Math.round(centerX - rendered.width / 2), top: Math.round(centerY - rendered.height / 2) }])
    .png()
    .toBuffer();
}

// Paints every element (text and decorations, IN ORDER, so later elements land on top of earlier
// ones — matching what the editor shows) onto a blank TRANSPARENT widthPx x heightPx canvas — the
// unpadded, native coordinate space every xPct/yPct is defined in. customElementBuffers resolves
// any customElementAssetId decorations to their real image bytes (the caller looks these up via
// the DB + storage — this function has no DB access of its own).
export async function composeMagnetFrameElements(elements: MagnetFrameElement[], orientation: FrameOrientation, customElementBuffers: Map<string, Buffer> = new Map()): Promise<Buffer> {
  const { widthPx, heightPx } = magnetExportDimensions(orientation);
  let buffer = await sharp({ create: { width: widthPx, height: heightPx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
  for (const el of elements) {
    buffer = el.type === "text" ? await composeTextElement(buffer, el, widthPx, heightPx) : await composeDecorationElement(buffer, el, widthPx, heightPx, customElementBuffers);
  }
  return buffer;
}
