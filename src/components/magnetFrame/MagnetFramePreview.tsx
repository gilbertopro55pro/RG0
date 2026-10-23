"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { albumFontFamilyCss } from "@/lib/albumFonts";
import { findOrnament, ornamentDataUrl } from "@/lib/albumOrnaments";
import { findMagnetFrameTexture, textureDataUrl } from "@/lib/magnetFrameTextures";
import { findMagnetFrameFloral } from "@/lib/magnetFrameFlorals";
import { getCutoutRadiusPx, getMatInsetPct, magnetDesignDimensions, magnetTextShadowRgba } from "@/lib/magnetFrameShared";
import { magnetQrUrl, qrMatrix, qrPath, qrSquareModules, type MagnetQrContext } from "@/lib/magnetQr";
import type { FrameOrientation, MagnetFrameElement, MagnetFrameQrElement, MagnetFrameSettings, MagnetFrameTextElement } from "@/lib/types";

// One magnet frame as it will be exported (owner's tool, magnetFrame.ts renders the same thing at
// 300 DPI): the mat with its color and texture, the photo window (a checker, or a sample photo to
// judge the design against), and the elements in order (texts, decorations, QR codes). Shared by the editor, which adds its own
// interaction through the element props and overlays, and by the frames list and the template
// picker, which show it as is.

// The outer card edge stays crisp — no shadow of its own — matching renderMagnetFrameBase, which
// never bleeds anything past the card's own square boundary. The mat's own fill color is a plain
// white/frameColor mix.
export function matCardStyle(settings: MagnetFrameSettings): CSSProperties {
  const ratio = Math.max(0, Math.min(1, settings.frameColorOpacity / 100));
  if (ratio <= 0) return { background: "#ffffff" };
  const hex = settings.frameColor.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  const mix = (channel: number) => Math.round(255 + (channel - 255) * ratio);
  return { background: `rgb(${mix(r)},${mix(g)},${mix(b)})` };
}

// The INNER shadow lives on the cutout as an `inset` box-shadow only, matching renderMagnetFrameBase:
// the mat's raised edge casting a shadow on the photo beneath it, never on its own surface.
// `scale` keeps the blur proportional to the preview vs. the design's 1600px long side.
function cutoutShadowStyle(settings: MagnetFrameSettings, scale: number): CSSProperties {
  if (!settings.shadowEnabled) return {};
  const alpha = Math.max(0, Math.min(1, settings.shadowOpacity / 100));
  return { boxShadow: `inset 0 0 ${settings.shadowBlurPx * scale}px ${settings.shadowDistancePx * scale}px rgba(0,0,0,${alpha})` };
}

// White under the squares: without it the texture layer (painted over the whole card) showed
// through the clear squares inside the photo window.
const CHECKER: CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0px",
};

// A text element's look at `scale` (preview px per design px): font, shadow in its color, the
// outline drawn under the fill at twice its width (so strokeWidth shows outside the letters, as the
// export draws it), and the letter spacing.
export function magnetTextStyle(el: MagnetFrameTextElement, scale: number): CSSProperties {
  const style: CSSProperties = {
    fontSize: el.fontSizePx * scale,
    color: el.color,
    fontFamily: albumFontFamilyCss(el.fontKey),
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : "none",
    textShadow: el.shadowEnabled
      ? `${el.shadowDistancePx * scale}px ${el.shadowDistancePx * scale}px ${el.shadowBlurPx * scale}px ${magnetTextShadowRgba(el.shadowColor)}`
      : undefined,
  };
  if (el.strokeWidth && el.strokeWidth > 0) {
    style.WebkitTextStroke = `${el.strokeWidth * 2 * scale}px ${el.strokeColor ?? "#000000"}`;
    style.paintOrder = "stroke fill";
  }
  if (el.letterSpacing) style.letterSpacing = `${el.letterSpacing * scale}px`;
  return style;
}

// The image a decoration shows, or null when its source is gone (a deleted upload).
export function decorationSrc(el: Extract<MagnetFrameElement, { type: "decoration" }>, customElementUrls: Record<string, string | null | undefined>): string | null {
  if (el.customElementAssetId) return customElementUrls[el.customElementAssetId] ?? null;
  if (el.floralId) return findMagnetFrameFloral(el.floralId)?.url ?? null;
  const ornament = el.ornamentId ? findOrnament(el.ornamentId) : undefined;
  return ornament ? ornamentDataUrl(ornament, el.color) : null;
}

// A QR code as drawn on the frame: its bgColor square (the quiet zone included) and the dark
// modules, from the same qrMatrix the export rasterizes. Without a link yet (no linked event, no
// portfolio, an empty link), a dashed "QR" square shows where it is; the export leaves it out.
export function MagnetQrGraphic({ el, url }: { el: Pick<MagnetFrameQrElement, "color" | "bgColor">; url: string | null }) {
  const drawn = useMemo(() => {
    if (!url) return null;
    const matrix = qrMatrix(url);
    return { n: qrSquareModules(matrix), d: qrPath(matrix) };
  }, [url]);
  if (!drawn) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full pointer-events-none block" aria-hidden="true">
        <rect x={2} y={2} width={96} height={96} rx={6} fill="rgba(255,255,255,0.82)" stroke="#7a7a7a" strokeWidth={3} strokeDasharray="9 7" />
        <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight={700} fill="#7a7a7a" style={{ fontFamily: "Arial, sans-serif" }} direction="ltr">
          QR
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${drawn.n} ${drawn.n}`} className="w-full h-full pointer-events-none block" shapeRendering="crispEdges" aria-hidden="true">
      <rect width={drawn.n} height={drawn.n} fill={el.bgColor} />
      <path d={drawn.d} fill={el.color} />
    </svg>
  );
}

export type MagnetFramePreviewHandle = { element: HTMLDivElement | null };

type Props = {
  orientation: FrameOrientation;
  settings: MagnetFrameSettings;
  elements: MagnetFrameElement[];
  // URLs of the photographer's own uploads, by id.
  customTextureUrl?: string | null;
  customElementUrls?: Record<string, string | null | undefined>;
  // A photo shown in the window instead of the checker (never part of the exported file).
  photoUrl?: string | null;
  className?: string;
  style?: CSSProperties;
  // Smooth transitions on element changes (the editor turns them off for the dragged element).
  animate?: (el: MagnetFrameElement) => boolean;
  // Interaction, for the editor.
  elementProps?: (el: MagnetFrameElement) => { onPointerDown?: (e: React.PointerEvent) => void; onDoubleClick?: (e: React.MouseEvent) => void; selected?: boolean; cursor?: string };
  // Drawn inside the element's own (rotated) box, e.g. resize and rotate handles.
  elementExtras?: (el: MagnetFrameElement, scale: number) => ReactNode;
  textRef?: (id: string, node: HTMLDivElement | null) => void;
  // Called with the preview's width in px whenever it changes.
  onWidth?: (widthPx: number) => void;
  // Overlays drawn above everything (guides, the safe area).
  children?: (scale: number) => ReactNode;
  // Shown for a text element with no text yet (the editor's "טקסט ריק").
  emptyTextLabel?: string;
  // What a QR element opens (magnetQrUrl): the frame's linked event and the photographer's
  // portfolio. Without it, a gallery or portfolio QR shows its placeholder.
  qrContext?: MagnetQrContext;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "style" | "className">;

const NO_QR_CONTEXT: MagnetQrContext = { eventId: null, portfolioSlug: null };

const MagnetFramePreview = forwardRef<MagnetFramePreviewHandle, Props>(function MagnetFramePreview(
  { orientation, settings, elements, customTextureUrl, customElementUrls = {}, photoUrl, className, style, animate, elementProps, elementExtras, textRef, onWidth, children, emptyTextLabel, qrContext = NO_QR_CONTEXT, ...rest },
  ref
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  useImperativeHandle(ref, () => ({ element: boxRef.current }));

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const update = () => {
      setWidthPx(node.clientWidth);
      onWidth?.(node.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
    // onWidth is a report-out; re-observing on each new closure isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fd = magnetDesignDimensions(orientation, settings.sizeKey);
  const scale = widthPx > 0 ? widthPx / fd.widthPx : 0;
  const shorterDisplaySide = Math.min(widthPx || 1, widthPx * (fd.heightPx / fd.widthPx) || 1);
  const inset = getMatInsetPct(orientation, settings.sizeKey, settings.borderRatioPct, settings.bottomBorderRatioPct);
  const cutoutRadiusPx = getCutoutRadiusPx(orientation, settings, widthPx);

  // The custom upload (when picked) wins over a built-in texture. CSS's unquoted url(...) closes at
  // the first ")" and the data URLs contain them, hence the quotes.
  const builtin = !settings.customTextureAssetId ? findMagnetFrameTexture(settings.textureId ?? undefined) : undefined;
  const textureStyle: CSSProperties | null =
    settings.customTextureAssetId && customTextureUrl
      ? {
          backgroundImage: `url("${customTextureUrl}")`,
          backgroundSize: `${220 * scale}px ${220 * scale}px`,
          backgroundRepeat: "repeat",
          opacity: settings.textureOpacity / 100,
        }
      : builtin
        ? {
            backgroundImage: `url("${textureDataUrl(builtin)}")`,
            backgroundSize: `${builtin.tileSizePx * scale}px ${builtin.tileSizePx * scale}px`,
            backgroundRepeat: "repeat",
            opacity: settings.textureOpacity / 100,
          }
        : null;

  return (
    <div
      ref={boxRef}
      className={`relative w-full overflow-hidden select-none ${className ?? ""}`}
      style={{ aspectRatio: `${fd.widthPx} / ${fd.heightPx}`, ...matCardStyle(settings), ...style }}
      {...rest}
    >
      {textureStyle && <div className="absolute inset-0 pointer-events-none" style={textureStyle} />}
      <div
        className="absolute overflow-hidden pointer-events-none"
        style={{
          left: `${inset.xPct}%`,
          top: `${inset.topPct}%`,
          right: `${inset.xPct}%`,
          bottom: `${inset.bottomPct}%`,
          borderRadius: cutoutRadiusPx,
          transition: "border-radius 0.2s ease, box-shadow 0.2s ease",
          ...(photoUrl ? { backgroundColor: "#ffffff", backgroundImage: `url("${photoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : CHECKER),
          ...cutoutShadowStyle(settings, scale),
        }}
      />
      {scale > 0 &&
        elements.map((el) => {
          const props = elementProps?.(el) ?? {};
          const smooth = animate ? animate(el) : false;
          // A hairline, as quiet as the corner controls on it (owner, 2026-10-23).
          const outline = props.selected ? "1px solid color-mix(in srgb, var(--color-amber-deep) 60%, transparent)" : "none";
          if (el.type === "text") {
            return (
              <div
                key={el.id}
                data-el-id={el.id}
                ref={textRef ? (node) => textRef(el.id, node) : undefined}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${el.xPct}%`,
                  top: `${el.yPct}%`,
                  transform: `translate(-50%, -50%) rotate(${el.rotation ?? 0}deg)`,
                  ...magnetTextStyle(el, scale),
                  outline,
                  outlineOffset: 4,
                  padding: 2,
                  cursor: props.cursor,
                  transition: smooth ? "left 0.18s ease, top 0.18s ease, font-size 0.18s ease, color 0.18s ease, text-shadow 0.18s ease" : "none",
                }}
                onPointerDown={props.onPointerDown}
                onDoubleClick={props.onDoubleClick}
                onClick={props.onPointerDown ? (e) => e.stopPropagation() : undefined}
              >
                {el.text || emptyTextLabel || "\u00a0"}
                {elementExtras?.(el, scale)}
              </div>
            );
          }
          if (el.type === "qr") {
            const sizePx = (el.sizePct / 100) * shorterDisplaySide;
            return (
              <div
                key={el.id}
                data-el-id={el.id}
                className="absolute"
                style={{
                  left: `${el.xPct}%`,
                  top: `${el.yPct}%`,
                  width: sizePx,
                  height: sizePx,
                  transform: `translate(-50%, -50%) rotate(${el.rotation ?? 0}deg)`,
                  outline,
                  outlineOffset: 3,
                  cursor: props.cursor,
                  transition: smooth ? "left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease" : "none",
                }}
                onPointerDown={props.onPointerDown}
                onDoubleClick={props.onDoubleClick}
                onClick={props.onPointerDown ? (e) => e.stopPropagation() : undefined}
              >
                <MagnetQrGraphic el={el} url={magnetQrUrl(el, qrContext)} />
                {elementExtras?.(el, scale)}
              </div>
            );
          }
          const src = decorationSrc(el, customElementUrls);
          if (!src) return null;
          const sizePx = (el.sizePct / 100) * shorterDisplaySide;
          return (
            <div
              key={el.id}
              data-el-id={el.id}
              className="absolute"
              style={{
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                width: sizePx,
                height: sizePx,
                transform: `translate(-50%, -50%) rotate(${el.rotation ?? 0}deg)`,
                outline,
                outlineOffset: 3,
                cursor: props.cursor,
                transition: smooth ? "left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease" : "none",
              }}
              onPointerDown={props.onPointerDown}
              onDoubleClick={props.onDoubleClick}
              onClick={props.onPointerDown ? (e) => e.stopPropagation() : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} className="w-full h-full pointer-events-none" style={{ objectFit: "contain" }} draggable={false} alt="" />
              {elementExtras?.(el, scale)}
            </div>
          );
        })}
      {children?.(scale)}
    </div>
  );
});

export default MagnetFramePreview;
