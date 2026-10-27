"use client";

import { textEffectsCss } from "@/lib/albumRender";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";
import { ALBUM_BLUR_MAX_PX, computePhotoFraming } from "@/lib/albumRender";
import { maskCssUrl, findMask } from "@/lib/albumMasks";
import { findOrnament, ornamentDataUrl } from "@/lib/albumOrnaments";
import { hasAdjustments, adjustmentsFilterId, adjustmentsSvgFilter, type PhotoAdjustments } from "@/lib/albumAdjustments";
import { sharpenFilterId, sharpenSvgFilter } from "@/lib/albumSharpen";
import { textRotationTransform } from "@/lib/albumTextRotation";
import { IconClose } from "@/components/icons/AlbumIcons";
import { useLang, useT } from "@/i18n/client";
import { dirOf } from "@/i18n/config";
import AlbumTextLines, { albumTextBoxAlign } from "@/components/AlbumTextLines";
import AlbumCorrectionMarks from "@/components/AlbumCorrectionMarks";
import { pagesToPreload, spreadImageUrls } from "@/lib/albumProofingPreload";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import { fitPhotoInFrame } from "@/lib/albumAuto/swapPhotos";
import { resetPagesLine, swapRedesignPages } from "@/lib/albumClientEdit";
import type { AlbumElement } from "@/lib/types";
import {
  CORRECTION_COLORS,
  CORRECTION_LIMITS,
  MIN_RECT,
  appendStrokePoint,
  rectFromCorners,
  type CorrectionColor,
  type CorrectionMark,
} from "@/lib/albumCorrections";

type SpreadPhoto = { id: string; url: string };
type SpreadLayout = "split" | "feature" | "stack" | "custom";

export type ClientAlbumElement =
  | {
      id: string;
      type: "photo";
      photoId?: string | null;
      url: string;
      // The photo's proportions from the server (its preview's), so the frame crops right before
      // the photo arrives. Learned from the <img> when missing.
      aspect?: number | null;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      focalX: number;
      focalY: number;
      filter?: "none" | "bw" | "sepia";
      borderWidth?: number;
      borderColor?: string;
      rotation?: number;
      opacity?: number;
      blur?: number;
      shadow?: number;
      shadowDistance?: number;
      shadowBlur?: number;
      shadowAngle?: number;
      zoom?: number;
      maskId?: string;
      exposure?: number;
      contrast?: number;
      highlights?: number;
      shadows2?: number;
      whites?: number;
      blacks?: number;
      temp?: number;
      tint?: number;
      vibrance?: number;
      saturation2?: number;
      sharpness?: number;
    }
  | {
      id: string;
      type: "text";
      text: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct?: number;
      fontSize: number;
      fontFamily?: string;
      color: string;
      align: "right" | "center" | "left";
      shadow?: number;
      glow?: number;
      strokeWidth?: number;
      strokeColor?: string;
      rotation?: number;
    }
  | {
      id: string;
      type: "ornament";
      ornamentId?: string;
      // Resolved server-side (signed URL against the "custom-ornaments" bucket) — the public
      // client view has no auth session to hit the bearer-only /api/desktop/ornaments route with.
      customUrl?: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      color?: string;
      rotation?: number;
      opacity?: number;
      shadow?: number;
      shadowAngle?: number;
      borderWidth?: number;
      borderColor?: string;
    }
  | {
      id: string;
      type: "shape";
      maskId?: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      color: string;
      rotation?: number;
      opacity?: number;
      shadow?: number;
      shadowAngle?: number;
      borderWidth?: number;
      borderColor?: string;
      shapeStyle?: "rect-outline" | "circle-outline" | "line";
    };

export function cssFilterFor(
  filter: "none" | "bw" | "sepia" | undefined,
  blurPct?: number,
  adjust?: { id: string; adj: PhotoAdjustments },
  sharpness?: number
): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  if (adjust && hasAdjustments(adjust.adj)) parts.push(`url(#${adjustmentsFilterId(adjust.id, adjust.adj)})`);
  if (adjust && sharpness) parts.push(`url(#${sharpenFilterId(adjust.id, sharpness)})`);
  return parts.length ? parts.join(" ") : undefined;
}

// Mirrors AlbumSpreadCanvasEditor's boxShadowFor — box-shadow (unlike a filter on the img) isn't
// clipped by the frame's own overflow-hidden, so it's the one that can bleed past a cropped photo.
// Mirrors albumRender.ts's boxShadowFor — distancePct/blurPct independently override the
// offset/softness that would otherwise be derived from shadowPct alone; undefined (every
// already-saved album) keeps the old coupled-to-intensity behavior exactly.
export function boxShadowFor(shadowPct: number | undefined, distancePct?: number, blurPct?: number, angleDeg?: number): string | undefined {
  if (!shadowPct) return undefined;
  const offsetPx = ((distancePct ?? shadowPct) / 100) * 10;
  const blurPx = ((blurPct ?? shadowPct) / 100) * 24;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  const magnitude = offsetPx * Math.SQRT2;
  const angleRad = ((angleDeg ?? 45) * Math.PI) / 180;
  const offsetX = (magnitude * Math.cos(angleRad)).toFixed(2);
  const offsetY = (magnitude * Math.sin(angleRad)).toFixed(2);
  return `${offsetX}px ${offsetY}px ${blurPx}px rgba(0,0,0,${alpha})`;
}

type SpreadBackground = { photoId?: string; url: string; blur: number; opacity: number } | null;

export type ClientAlbumSpread = {
  id: string;
  photo1: SpreadPhoto;
  photo2: SpreadPhoto | null;
  layout: SpreadLayout;
  focalX1: number;
  focalY1: number;
  focalX2: number;
  focalY2: number;
  elements: ClientAlbumElement[];
  background: SpreadBackground;
  comments: { id: string; text: string }[];
  // The page's real size (the spread's own size, a cover made at its own size, or the album's), so
  // the client sees it in the proportions it's printed in.
  widthCm: number;
  heightCm: number;
  // The client's own changes (lib/albumClientEdit.ts): the cover (its own size) is never redesigned;
  // an edited page differs from the photographer's design, and some have a design to go back to.
  isCover: boolean;
  edited: boolean;
  canBack: boolean;
  // "לעיצוב המקורי": changed, and still holding the photos it was sent with (not after a swap with another page).
  canOriginal: boolean;
};

function BackgroundLayer({ background, thumb = false }: { background: SpreadBackground; thumb?: boolean }) {
  if (!background) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={thumb ? thumbSrc(background.url) : background.url}
      alt=""
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ opacity: background.opacity / 100, filter: background.blur ? `blur(${(background.blur / 100) * ALBUM_BLUR_MAX_PX}px)` : undefined }}
    />
  );
}

function TextOverlay({ el }: { el: Extract<ClientAlbumElement, { type: "text" }> }) {
  // Album geometry is physical: each line carries its own reading direction and the box places
  // them on its physical right/left (albumTextBoxAlign), so a client page in English/Russian lays
  // the text out exactly as the photographer designed it.
  return (
    <div
      className="absolute font-bold flex items-center pointer-events-none"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct ?? 15}%`,
        ...albumTextBoxAlign(el.align),
        color: el.color,
        fontSize: `calc(${el.fontSize} / 1600 * 100cqw)`,
        fontFamily: albumFontFamilyCss(el.fontFamily),
        // Shadow, glow and outline exactly as in the editor and the exports.
        ...textEffectsCss(el),
        // Turned around the box's center (the default origin), like the editor and the exports.
        transform: textRotationTransform(el),
      }}
    >
      <AlbumTextLines text={el.text} />
    </div>
  );
}

function OrnamentOverlay({ el }: { el: Extract<ClientAlbumElement, { type: "ornament" }> }) {
  const ornament = el.ornamentId ? findOrnament(el.ornamentId) : undefined;
  const imgSrc = el.customUrl ?? (ornament ? ornamentDataUrl(ornament, el.color ?? "#2e3142") : undefined);
  const customTint = el.customUrl && el.color ? el.color : undefined;
  if (!imgSrc) return null;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct}%`,
        opacity: (el.opacity ?? 100) / 100,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        outline: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}` : undefined,
        outlineOffset: el.borderWidth ? `-${el.borderWidth}px` : undefined,
        boxShadow: boxShadowFor(el.shadow, undefined, undefined, el.shadowAngle),
      }}
    >
      {customTint ? (
        <div
          className="w-full h-full"
          style={{
            backgroundColor: customTint,
            WebkitMaskImage: `url(${imgSrc})`,
            maskImage: `url(${imgSrc})`,
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      ) : (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={imgSrc} className="w-full h-full" style={{ objectFit: "contain" }} />
      )}
    </div>
  );
}

function ShapeOverlay({ el }: { el: Extract<ClientAlbumElement, { type: "shape" }> }) {
  const mask = el.maskId ? findMask(el.maskId) : undefined;
  const isOutline = el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline";
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct}%`,
        opacity: (el.opacity ?? 100) / 100,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        borderRadius: el.shapeStyle === "circle-outline" ? "50%" : undefined,
        border: isOutline ? `${el.borderWidth ?? 5}px solid ${el.borderColor ?? el.color}` : undefined,
        outline: isOutline ? undefined : el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}` : undefined,
        outlineOffset: !isOutline && el.borderWidth ? `-${el.borderWidth}px` : undefined,
        boxShadow: boxShadowFor(el.shadow, undefined, undefined, el.shadowAngle),
      }}
    >
      {!isOutline && (
        <div
          className="w-full h-full"
          style={{
            backgroundColor: el.color,
            ...(mask
              ? {
                  WebkitMaskImage: maskCssUrl(mask.svg),
                  maskImage: maskCssUrl(mask.svg),
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                }
              : null),
          }}
        />
      )}
    </div>
  );
}

// The largest box of `aspect` (width / height) that fits inside the measured element: the album page
// in its real proportions, as big as the screen allows.
function useFitBox(aspect: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const fit = w / h > aspect ? { w: h * aspect, h } : { w, h: w / aspect };
      setBox((prev) => (prev && Math.abs(prev.w - fit.w) < 0.5 && Math.abs(prev.h - fit.h) < 0.5 ? prev : fit));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return { ref, box };
}

function PageArrow({ towards }: { towards: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={towards === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function pageAspectOf(spread: ClientAlbumSpread): number {
  const a = spread.widthCm / spread.heightCm;
  return Number.isFinite(a) && a > 0 ? a : 1.5;
}

// A page's thumbnail in the strip: the photo resized by the image optimizer (a few KB instead of the
// screen-size preview), or the preview route itself when the photo has no CDN preview.
function thumbSrc(url: string): string {
  return optimizedImageUrl(url, 256);
}

type PhotoEl = Extract<ClientAlbumElement, { type: "photo" }>;
const SWAP_PURPLE = "#9333ea";

// One album page, drawn inside its page box (the caller sizes the box in the page's proportions).
// A thumbnail (the page strip) draws the same page with small copies of the photos. Photos can be
// tapped to swap them (onPhotoTap): the one picked has a purple frame, and while one is picked
// every other photo is outlined as a place it can go.
function ProofPage({
  spread,
  photoAspects,
  onPhotoAspect,
  thumb = false,
  selectedElId = null,
  picking = false,
  onPhotoTap,
}: {
  spread: ClientAlbumSpread;
  photoAspects: Record<string, number>;
  onPhotoAspect?: (url: string, aspect: number) => void;
  thumb?: boolean;
  selectedElId?: string | null;
  picking?: boolean;
  onPhotoTap?: (el: PhotoEl) => void;
}) {
  const pageAspect = pageAspectOf(spread);
  const src = (url: string) => (thumb ? thumbSrc(url) : url);
  if (spread.layout === "custom") {
    return (
      <>
        <BackgroundLayer background={spread.background} thumb={thumb} />
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          {spread.elements
            .filter((el): el is PhotoEl => el.type === "photo" && hasAdjustments(el))
            .map((el) => (
              <defs key={el.id} dangerouslySetInnerHTML={{ __html: adjustmentsSvgFilter(el.id, el) }} />
            ))}
          {spread.elements
            .filter((el): el is PhotoEl => el.type === "photo" && !!el.sharpness)
            .map((el) => (
              <defs key={`sharpen-${el.id}`} dangerouslySetInnerHTML={{ __html: sharpenSvgFilter(el.id, el.sharpness) }} />
            ))}
        </svg>
        {spread.elements.map((el) =>
          el.type === "photo" ? (
            <div
              key={el.id}
              className={`absolute overflow-hidden ${onPhotoTap ? "cursor-pointer" : ""}`}
              onClick={onPhotoTap ? () => onPhotoTap(el) : undefined}
              style={{
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                width: `${el.widthPct}%`,
                height: `${el.heightPct}%`,
                // Drop shadow only — the border is a separate, later sibling below, so it paints
                // above the photo (a full-bleed <img> child hides a parent's inset box-shadow).
                boxShadow: thumb ? undefined : boxShadowFor(el.shadow, el.shadowDistance, el.shadowBlur, el.shadowAngle),
                // Rotation lives on this box (not the <img>) so the outline/box-shadow rotate with the
                // clipped photo as one rigid tile — mirrors the builder.
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              }}
            >
              {(() => {
                // The frame's real proportions: its share of the page times the page's own
                // proportions (the album's size, or the cover's own), as in the exports.
                const frameAspect = (el.widthPct / el.heightPct) * pageAspect || 1;
                const imgAspect = photoAspects[el.url] ?? el.aspect ?? frameAspect;
                const framing = computePhotoFraming(imgAspect, frameAspect, el.zoom ?? 100, el.focalX, el.focalY);
                return (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={src(el.url)}
                    alt=""
                    draggable={false}
                    loading={thumb ? "lazy" : undefined}
                    className="absolute pointer-events-none"
                    onLoad={
                      onPhotoAspect
                        ? (e) => {
                            const w = e.currentTarget.naturalWidth;
                            const h = e.currentTarget.naturalHeight;
                            if (w && h) onPhotoAspect(el.url, w / h);
                          }
                        : undefined
                    }
                    style={{
                      width: `${framing.widthPct}%`,
                      height: `${framing.heightPct}%`,
                      left: `${framing.leftPct}%`,
                      top: `${framing.topPct}%`,
                      maxWidth: "none",
                      maxHeight: "none",
                      filter: cssFilterFor(el.filter, el.blur, { id: el.id, adj: el }, el.sharpness),
                      opacity: (el.opacity ?? 100) / 100,
                      ...(el.maskId
                        ? {
                            WebkitMaskImage: maskCssUrl(findMask(el.maskId)?.svg ?? ""),
                            maskImage: maskCssUrl(findMask(el.maskId)?.svg ?? ""),
                            WebkitMaskSize: "100% 100%",
                            maskSize: "100% 100%",
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                          }
                        : null),
                    }}
                  />
                );
              })()}
              {!!el.borderWidth && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ boxShadow: `inset 0 0 0 ${thumb ? 1 : el.borderWidth}px ${el.borderColor ?? "#fff"}` }}
                />
              )}
              {el.id === selectedElId ? (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ boxShadow: `inset 0 0 0 ${thumb ? 2 : 4}px ${SWAP_PURPLE}`, background: "rgba(147, 51, 234, 0.18)" }}
                />
              ) : picking && !thumb ? (
                <div className="absolute inset-0 pointer-events-none" style={{ outline: `2px dashed ${SWAP_PURPLE}`, outlineOffset: "-3px" }} />
              ) : null}
            </div>
          ) : el.type === "ornament" ? (
            <OrnamentOverlay key={el.id} el={el} />
          ) : el.type === "shape" ? (
            <ShapeOverlay key={el.id} el={el} />
          ) : (
            <TextOverlay key={el.id} el={el} />
          )
        )}
      </>
    );
  }
  if (spread.photo2) {
    // Two photos share a spread — a real "cover" crop aimed by the photographer's focal point, so
    // what the client approves here matches what the exported PDF prints.
    return (
      <>
        <BackgroundLayer background={spread.background} thumb={thumb} />
        <div className={`absolute inset-0 flex gap-1.5 ${spread.layout === "stack" ? "flex-col" : "flex-row"}`}>
          <div className="relative overflow-hidden rounded-sm" style={{ flex: spread.layout === "feature" ? 1.6 : 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src(spread.photo1.url)}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: `${spread.focalX1}% ${spread.focalY1}%` }}
            />
          </div>
          <div className="relative overflow-hidden rounded-sm" style={{ flex: 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src(spread.photo2.url)}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: `${spread.focalX2}% ${spread.focalY2}%` }}
            />
          </div>
        </div>
        {spread.elements.filter((el) => el.type === "text").map((el) => (
          <TextOverlay key={el.id} el={el} />
        ))}
      </>
    );
  }
  return (
    <>
      <BackgroundLayer background={spread.background} thumb={thumb} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src(spread.photo1.url)} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
      {spread.elements.filter((el) => el.type === "text").map((el) => (
        <TextOverlay key={el.id} el={el} />
      ))}
    </>
  );
}

// A mark being drawn: a pencil stroke so far, or a rectangle between its first corner and the finger.
type Draft = { kind: "pen"; points: [number, number][] } | { kind: "rect"; from: [number, number]; to: [number, number] };

const COLOR_NAMES: Record<CorrectionColor, string> = { "#e5322d": "אדום", "#2563eb": "כחול", "#16a34a": "ירוק" };

// The client's guide to the corrections tool, one short line per step (owner, 2026-10-27).
const CORRECTION_GUIDE_STEPS = [
  "עוברים לעמוד שצריך בו תיקון, בחיצים או ברצועת העמודים.",
  "בוחרים עיפרון או מלבן, ואת הצבע.",
  "מסמנים על העיצוב את מה שצריך לתקן.",
  "אפשר לכתוב הערה לעמוד, מתחת לעיצוב.",
  "טעיתם? \"ביטול הסימון\" מוחק את הסימון האחרון.",
  "בסוף לוחצים \"אישור ושליחת התיקונים\".",
] as const;

type Status = "sent" | "approved" | "changes_requested";
type Pick = { spreadId: string; elId: string };
type ServerPage = { id: string; elements: AlbumElement[]; backgroundPhotoId: string | null; edited: boolean; canBack: boolean; canOriginal: boolean };
type EditReply = { ok?: boolean; error?: string; code?: string; pages?: string[]; spreads?: ServerPage[]; cycles?: Record<string, Cycle> };
type Cycle = { count: number; seen: string[] };
type PhotoInfo = { url: string; aspect: number | null };

// The pages as the client left them stay when the album view is closed and opened again on the same
// page load (the page's own data is from before the changes).
const sessions = new Map<string, { pages: ClientAlbumSpread[]; status: Status }>();
// The notes and marks not sent yet stay on the device until sent, even if the album is closed.
const notesKey = (token: string) => `album-notes:${token}`;

const aspectOf = (el: PhotoEl) => (el.aspect && el.aspect > 0 ? el.aspect : 1.5);

// Each photo's screen copy and proportions, from the pages as the server sent them: a swap or a
// redesign only moves these photos around the album.
function photoInfoOf(pages: readonly ClientAlbumSpread[]): Map<string, PhotoInfo> {
  const out = new Map<string, PhotoInfo>();
  for (const p of pages) {
    for (const el of p.elements) if (el.type === "photo" && el.photoId) out.set(el.photoId, { url: el.url, aspect: el.aspect ?? null });
    if (p.background?.photoId && !out.has(p.background.photoId)) out.set(p.background.photoId, { url: p.background.url, aspect: null });
  }
  return out;
}

// A page the server saved, drawn the way the gallery page draws it.
function fromServer(prev: ClientAlbumSpread, next: ServerPage, photos: ReadonlyMap<string, PhotoInfo>): ClientAlbumSpread {
  const prevById = new Map(prev.elements.map((el) => [el.id, el] as const));
  const elements = next.elements.flatMap((el): ClientAlbumElement[] => {
    if (el.type === "photo") {
      const p = el.photoId ? photos.get(el.photoId) : undefined;
      return p ? [{ ...el, url: p.url, aspect: p.aspect }] : [];
    }
    if (el.type === "ornament") {
      const old = prevById.get(el.id);
      if (old?.type === "ornament") return [old];
      return el.customOrnamentId ? [] : [{ ...el, customUrl: undefined }];
    }
    return [el];
  });
  const bg = next.backgroundPhotoId ? photos.get(next.backgroundPhotoId) : undefined;
  return {
    ...prev,
    layout: "custom",
    elements,
    background: bg && prev.background ? { ...prev.background, photoId: next.backgroundPhotoId as string, url: bg.url } : null,
    edited: next.edited,
    canBack: next.canBack,
    canOriginal: next.canOriginal,
  };
}

// The swap drawn at once, while the server saves it (its crop follows the faces; this one is centred).
function swapLocally(pages: ClientAlbumSpread[], a: Pick, b: Pick): ClientAlbumSpread[] {
  const find = (pk: Pick) => {
    const page = pages.find((p) => p.id === pk.spreadId);
    const el = page?.elements.find((e): e is PhotoEl => e.id === pk.elId && e.type === "photo");
    return page && el ? { page, el } : null;
  };
  const sa = find(a);
  const sb = find(b);
  if (!sa || !sb) return pages;
  const put = (page: ClientAlbumSpread, frame: PhotoEl, from: PhotoEl): PhotoEl => {
    const fit = fitPhotoInFrame(frame, page, aspectOf(from), [], false);
    return { ...frame, photoId: from.photoId, url: from.url, aspect: from.aspect, focalX: fit.focalX, focalY: fit.focalY, zoom: 100 };
  };
  return pages.map((p) => {
    if (p.id !== a.spreadId && p.id !== b.spreadId) return p;
    const elements = p.elements.map((el) =>
      p.id === a.spreadId && el.id === a.elId ? put(p, sa.el, sb.el) : p.id === b.spreadId && el.id === b.elId ? put(p, sb.el, sa.el) : el
    );
    // Between pages, a background that was the photo leaving becomes the one coming in.
    const [left, came] = p.id === a.spreadId ? [sa.el, sb.el] : [sb.el, sa.el];
    const background = a.spreadId !== b.spreadId && p.background && p.background.photoId === left.photoId ? { ...p.background, photoId: came.photoId ?? undefined, url: came.url } : p.background;
    // Until the server answers: a swap with another page brings in a photo the page wasn't sent with.
    const canOriginal = a.spreadId === b.spreadId ? p.canOriginal || !p.edited : false;
    return { ...p, elements, background, edited: true, canOriginal };
  });
}

// The client's album view (/gallery/<token>): the pages in their printed proportions, a strip of all
// the pages below them, and at the end of the album "אישור העיצוב" or the corrections (owner,
// 2026-10-27). While the album waits for approval the client can change it themselves: a tap on a
// photo marks it in purple, a tap on another photo, on this page or another one (through the strip),
// swaps the two (api/gallery/[token]/album/edit, lib/albumClientEdit.ts). A photo that doesn't fit
// its new frame redesigns the page, after a confirmation; "עיצוב מחדש" shows another design and
// "לעיצוב הקודם" goes back one, up to 3. A note per page, drawn marks included, can be added on any
// page; the notes stay on the device until sent, all at once, to the photographer
// (api/gallery/[token]/album/corrections, lib/albumCorrections.ts).
export default function GalleryAlbumProofing({
  token,
  status,
  spreads,
  onClose,
}: {
  token: string;
  status: Status;
  spreads: ClientAlbumSpread[];
  onClose: () => void;
}) {
  const t = useT();
  const isRtl = dirOf(useLang()) === "rtl";
  // Opens on the album's first page, its cover. There used to be a title screen before it (a photo
  // and the album's name), which clients took for the cover (owner, 2026-10-27).
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState<ClientAlbumSpread[]>(() => sessions.get(token)?.pages ?? spreads);
  // Natural aspect ratio per photo (the client doesn't get one from the DB), learned from each
  // <img>'s own onLoad.
  const [photoAspects, setPhotoAspects] = useState<Record<string, number>>({});
  const [currentStatus, setCurrentStatus] = useState<Status>(() => sessions.get(token)?.status ?? status);
  const [approving, setApproving] = useState(false);
  const [approveFailed, setApproveFailed] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "mark">("view");
  const [tool, setTool] = useState<"pen" | "rect">("pen");
  const [color, setColor] = useState<CorrectionColor>(CORRECTION_COLORS[0]);
  const [marks, setMarks] = useState<Record<string, CorrectionMark[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideShown = useRef(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  // The swap: the photo picked first, a swap waiting for the client's OK to redesign, what's being saved.
  const [selected, setSelected] = useState<Pick | null>(null);
  const [confirmSwap, setConfirmSwap] = useState<{ a: Pick; b: Pick; pages: string[] } | null>(null);
  const [busy, setBusy] = useState<null | "swap" | "redesign" | "back" | "reset">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const cycles = useRef<Record<string, Cycle>>({});
  const photoInfo = useMemo(() => photoInfoOf(spreads), [spreads]);

  const spread = pages[index] ?? null;
  const pageAspect = spread ? pageAspectOf(spread) : 1.5;
  const { ref: stageRef, box } = useFitBox(pageAspect);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sessions.set(token, { pages, status: currentStatus });
  }, [token, pages, currentStatus]);

  // The notes not sent yet, back from this device. Read after the first render: the album can open
  // in the server's HTML (?album=1), which knows nothing of this device.
  const notesLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(notesKey(token));
      if (raw) {
        const saved = JSON.parse(raw) as { marks?: Record<string, CorrectionMark[]>; notes?: Record<string, string> };
        const ids = new Set(spreads.map((sp) => sp.id));
        const keep = <T,>(o: Record<string, T> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([id]) => ids.has(id)));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMarks(keep(saved.marks));
        setNotes(keep(saved.notes));
      }
    } catch {}
    notesLoaded.current = true;
  }, [token, spreads]);
  useEffect(() => {
    if (!notesLoaded.current) return;
    try {
      const empty = Object.values(marks).every((m) => !m.length) && Object.values(notes).every((n) => !n.trim());
      if (empty) localStorage.removeItem(notesKey(token));
      else localStorage.setItem(notesKey(token), JSON.stringify({ marks, notes }));
    } catch {}
  }, [token, marks, notes]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);

  // The current page's thumbnail stays in view in the strip.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-page="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  // The photos of the pages around this one load ahead (lib/albumProofingPreload.ts), so turning
  // the page shows it at once, from the browser's cache. Each photo is requested once; the <img> is
  // kept only until it arrives, so a long album doesn't stay in memory.
  const requested = useRef(new Set<string>());
  const loading = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    for (const i of pagesToPreload(index, pages.length)) {
      const page = pages[i];
      if (!page) continue;
      for (const url of spreadImageUrls(page)) {
        if (requested.current.has(url)) continue;
        requested.current.add(url);
        const img = new Image();
        img.decoding = "async";
        img.fetchPriority = "low";
        img.onload = img.onerror = () => loading.current.delete(url);
        loading.current.set(url, img);
        img.src = url;
      }
    }
  }, [index, pages]);

  if (pages.length === 0) return null;
  const lastIndex = pages.length - 1;
  const firstIndex = 0;
  const approved = currentStatus === "approved";
  // The client changes the design only while it waits for their approval; after corrections it
  // waits for the photographer.
  const editable = currentStatus === "sent";
  const marking = mode === "mark";
  const comments = spread?.comments ?? [];
  const pageMarks = spread ? (marks[spread.id] ?? []) : [];
  const hasNote = (id: string) => (marks[id]?.length ?? 0) > 0 || !!notes[id]?.trim();
  const markedPages = pages.filter((p) => hasNote(p.id)).length;
  const editedNumbers = pages.flatMap((p, i) => (p.edited ? [i + 1] : []));
  const editedPages = editedNumbers.length;
  const pageNumber = (id: string) => pages.findIndex((p) => p.id === id) + 1;

  const goTo = (i: number) => setIndex(Math.max(firstIndex, Math.min(lastIndex, i)));
  const onPhotoAspect = (url: string, aspect: number) => setPhotoAspects((prev) => (prev[url] ? prev : { ...prev, [url]: aspect }));

  // --- The client's changes -------------------------------------------------------------------
  const applyServerPages = (reply: EditReply) => {
    const byId = new Map((reply.spreads ?? []).map((p) => [p.id, p] as const));
    setPages((prev) => prev.map((p) => (byId.has(p.id) ? fromServer(p, byId.get(p.id) as ServerPage, photoInfo) : p)));
    for (const [id, c] of Object.entries(reply.cycles ?? {})) cycles.current[id] = c;
  };
  const sendEdit = async (body: object): Promise<{ ok: boolean; status: number; reply: EditReply }> => {
    try {
      const res = await fetch(`/api/gallery/${token}/album/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { ok: res.ok, status: res.status, reply: ((await res.json().catch(() => ({}))) as EditReply) ?? {} };
    } catch {
      return { ok: false, status: 0, reply: {} };
    }
  };
  const failed = (status: number, reply: EditReply) => {
    if (status === 409 && !["needs_redesign", "no_design", "no_history", "photos_moved", "unchanged"].includes(reply.code ?? "")) {
      // The album isn't waiting for approval any more (approved on another device, or corrections sent).
      setNotice(t("העיצוב כבר לא פתוח לשינויים. רעננו את הדף."));
      return;
    }
    setNotice(status === 429 ? t("יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.") : reply.code === "no_design" ? t("אין עיצוב אחר לעמוד הזה") : t("השינוי לא נשמר. נסו שוב"));
  };

  const photoOf = (pk: Pick) => {
    const page = pages.find((p) => p.id === pk.spreadId);
    const el = page?.elements.find((e): e is PhotoEl => e.id === pk.elId && e.type === "photo");
    return page && el ? { page, el } : null;
  };
  const coverNotice = () => setNotice(t("התמונה הזו לא מתאימה למסגרת בכריכה. בכריכה אפשר להחליף רק בתמונה באותו כיוון (לאורך או לרוחב)."));

  const runSwap = async (a: Pick, b: Pick, redesign: boolean) => {
    setSelected(null);
    setConfirmSwap(null);
    const before = pages.filter((p) => p.id === a.spreadId || p.id === b.spreadId);
    if (!redesign) setPages((prev) => swapLocally(prev, a, b));
    setBusy(redesign ? "redesign" : "swap");
    const { ok, status, reply } = await sendEdit({ action: "swap", a, b, redesign });
    setBusy(null);
    if (ok) {
      applyServerPages(reply);
      const redesigned = Object.keys(reply.cycles ?? {}).map(pageNumber).sort((x, y) => x - y);
      if (redesigned.length > 1) {
        // Page 1 is the album's cover (owner, 2026-10-27): the client reads it named so.
        const others = redesigned.filter((n) => n !== 1);
        setNotice(
          redesigned.includes(1) ? t("הכריכה ועמוד {n} עוצבו מחדש", { n: others.join(", ") }) : t("עמודים {pages} עוצבו מחדש", { pages: redesigned.join(", ") })
        );
      }
      return;
    }
    // Back as they were; then what the server says decides.
    setPages((prev) => prev.map((p) => before.find((x) => x.id === p.id) ?? p));
    if (reply.code === "needs_redesign") setConfirmSwap({ a, b, pages: reply.pages ?? [] });
    else if (reply.code === "cover") coverNotice();
    else failed(status, reply);
  };

  const tapPhoto = (spreadId: string, el: PhotoEl) => {
    if (!editable || busy || marking) return;
    if (!selected) {
      setSelected({ spreadId, elId: el.id });
      return;
    }
    if (selected.spreadId === spreadId && selected.elId === el.id) {
      setSelected(null);
      return;
    }
    const a = selected;
    const b = { spreadId, elId: el.id };
    const sa = photoOf(a);
    const sb = photoOf(b);
    if (!sa || !sb || sa.el.photoId === sb.el.photoId) {
      setSelected(b);
      return;
    }
    const need = swapRedesignPages(
      { spreadId: sa.page.id, frame: sa.el, page: sa.page, photoAspect: aspectOf(sa.el) },
      { spreadId: sb.page.id, frame: sb.el, page: sb.page, photoAspect: aspectOf(sb.el) }
    );
    if (need.some((id) => pages.find((p) => p.id === id)?.isCover)) {
      coverNotice();
      return;
    }
    if (need.length) {
      setConfirmSwap({ a, b, pages: need });
      return;
    }
    void runSwap(a, b, false);
  };

  const redesignPage = async () => {
    if (!spread || busy) return;
    setBusy("redesign");
    const cycle = cycles.current[spread.id] ?? { count: -1, seen: [] };
    const { ok, status, reply } = await sendEdit({ action: "redesign", spreadId: spread.id, count: cycle.count, seen: cycle.seen });
    setBusy(null);
    if (ok) applyServerPages(reply);
    else failed(status, reply);
  };
  const backPage = async () => {
    if (!spread || busy) return;
    setBusy("back");
    const { ok, status, reply } = await sendEdit({ action: "back", spreadId: spread.id });
    setBusy(null);
    if (ok) applyServerPages(reply);
    else failed(status, reply);
  };
  // One page back to the photographer's design (offered only while it holds its own photos).
  const originalPage = async () => {
    if (!spread || busy) return;
    setSelected(null);
    setBusy("reset");
    const { ok, status, reply } = await sendEdit({ action: "original", spreadId: spread.id });
    setBusy(null);
    if (ok) applyServerPages(reply);
    else failed(status, reply);
  };
  const resetAll = async () => {
    setConfirmReset(false);
    setSelected(null);
    setBusy("reset");
    const { ok, status, reply } = await sendEdit({ action: "reset" });
    setBusy(null);
    if (ok) {
      applyServerPages(reply);
      cycles.current = {};
      setNotice(t("העיצוב חזר להיות כמו שהצלם שלח"));
    } else failed(status, reply);
  };

  // --- Approval and corrections ---------------------------------------------------------------
  const approve = async () => {
    setApproving(true);
    setApproveFailed(false);
    const res = await fetch(`/api/gallery/${token}/album/approve`, { method: "POST" }).catch(() => null);
    setApproving(false);
    setConfirmApproveOpen(false);
    if (res?.ok) {
      setCurrentStatus("approved");
      setSelected(null);
      discardMarks();
    } else setApproveFailed(true);
  };

  const startMarking = () => {
    setMode("mark");
    setSelected(null);
    setJustSent(false);
    setSendError(null);
    if (!guideShown.current) {
      guideShown.current = true;
      setGuideOpen(true);
    }
  };
  const discardMarks = () => {
    setMarks({});
    setNotes({});
    setDraft(null);
  };

  // Drawing: the pointer's spot as a fraction of the page box.
  const pointAt = (e: ReactPointerEvent<HTMLDivElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spread) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    setDraft(tool === "pen" ? { kind: "pen", points: appendStrokePoint([], p[0], p[1]) } : { kind: "rect", from: p, to: p });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    const p = pointAt(e);
    setDraft((d) => (!d ? d : d.kind === "pen" ? { ...d, points: appendStrokePoint(d.points, p[0], p[1]) } : { ...d, to: p }));
  };
  const onPointerUp = () => {
    if (!draft || !spread) return;
    let mark: CorrectionMark | null = null;
    if (draft.kind === "pen") mark = draft.points.length > 0 ? { kind: "pen", color, points: draft.points } : null;
    else {
      const r = rectFromCorners(draft.from, draft.to);
      mark = r.w >= MIN_RECT && r.h >= MIN_RECT ? { kind: "rect", color, ...r } : null;
    }
    if (mark) {
      const added = mark;
      setMarks((prev) => ({ ...prev, [spread.id]: [...(prev[spread.id] ?? []), added] }));
    }
    setDraft(null);
  };
  const draftMark: CorrectionMark | null = !draft
    ? null
    : draft.kind === "pen"
      ? { kind: "pen", color, points: draft.points }
      : { kind: "rect", color, ...rectFromCorners(draft.from, draft.to) };

  const undo = () => {
    if (spread) setMarks((prev) => ({ ...prev, [spread.id]: (prev[spread.id] ?? []).slice(0, -1) }));
  };
  const clearPage = () => {
    if (spread) setMarks((prev) => ({ ...prev, [spread.id]: [] }));
  };

  const submit = async () => {
    const sendPages = pages
      .map((p) => ({ spreadId: p.id, note: notes[p.id]?.trim() || null, marks: marks[p.id] ?? [] }))
      .filter((p) => p.marks.length > 0 || p.note);
    if (sendPages.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/gallery/${token}/album/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: sendPages }),
      });
      if (!res.ok) {
        setSendError(res.status === 429 ? t("יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.") : t("השליחה נכשלה. נסו שוב"));
        return;
      }
      discardMarks();
      setMode("view");
      setConfirmApproveOpen(false);
      setSelected(null);
      setCurrentStatus("changes_requested");
      setJustSent(true);
    } catch {
      setSendError(t("השליחה נכשלה. נסו שוב"));
    } finally {
      setSending(false);
    }
  };

  const toolBtn = (active: boolean) =>
    `h-9 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 border phone-landscape:h-8 phone-landscape:w-8 phone-landscape:px-0 phone-landscape:justify-center ${active ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"}`;
  // Sideways on a phone the tools sit in a narrow column beside the page: icons only, so the
  // whole panel fits next to the page without scrolling. The names stay for screen readers.
  const landscapeIconOnly = "phone-landscape:sr-only";
  const pageBtn = "h-9 px-3 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 border border-line bg-white text-ink disabled:opacity-50";
  const pageNote = spread ? notes[spread.id]?.trim() : "";
  const busyText = busy === "redesign" ? t("מעצב את הדף מחדש…") : busy === "reset" ? t("מחזיר את העיצוב של הצלם…") : busy ? t("שומר…") : null;

  return (
    <div className={`fixed inset-0 z-[80] bg-black flex flex-col phone-landscape:flex-row select-none ${ALBUM_FONT_CLASS_NAMES}`}>
      {/* The page, and the strip of all the pages below it: between the header and the panel, or, on
          a phone turned sideways, on about 80% of the screen with the controls in a column beside it
          (owner, 2026-10-27). */}
      <div className="order-3 flex-1 min-h-0 flex flex-col phone-landscape:order-1 phone-landscape:min-w-0">
        <div className="relative flex-1 min-h-0 px-3 py-1 phone-landscape:px-2 phone-landscape:pt-2 phone-landscape:pb-1">
          <div ref={stageRef} className="h-full w-full flex items-center justify-center">
            {spread ? (
              <div
                className="relative overflow-hidden shrink-0"
                style={{
                  width: box ? `${box.w}px` : "100%",
                  height: box ? `${box.h}px` : undefined,
                  aspectRatio: box ? undefined : `${spread.widthCm} / ${spread.heightCm}`,
                  containerType: "inline-size",
                }}
              >
                <ProofPage
                  spread={spread}
                  photoAspects={photoAspects}
                  onPhotoAspect={onPhotoAspect}
                  selectedElId={selected?.spreadId === spread.id ? selected.elId : null}
                  picking={!!selected}
                  onPhotoTap={editable && !marking ? (el) => tapPhoto(spread.id, el) : undefined}
                />
                <AlbumCorrectionMarks marks={draftMark ? [...pageMarks, draftMark] : pageMarks} pageAspect={pageAspect} />
                {marking && (
                  <div
                    className="absolute inset-0 cursor-crosshair"
                    style={{ touchAction: "none" }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDraft(null)}
                  />
                )}
                {(busy === "redesign" || busy === "back" || busy === "reset") && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <span className="rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-ink flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/25 border-t-ink animate-spin" aria-hidden="true" />
                      {busyText}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {notice && (
            <div role="status" className="absolute inset-x-3 bottom-2 flex justify-center pointer-events-none">
              <span className="max-w-md rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-ink text-center shadow-lg">{notice}</span>
            </div>
          )}
        </div>

        {/* Every page of the album, in reading order: in Hebrew the first page is on the right, as in
            a book. A tap opens the page; a photo picked for a swap keeps its purple mark on its page. */}
        <div
          ref={stripRef}
          dir={isRtl ? "rtl" : "ltr"}
          className="shrink-0 overflow-x-auto overflow-y-hidden [--thumb-h:52px] phone-landscape:[--thumb-h:38px]"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="flex gap-2 px-3 py-2 w-max phone-landscape:py-1.5">
            {pages.map((p, i) => {
              const current = i === index;
              const holdsPick = selected?.spreadId === p.id;
              return (
                <button
                  key={p.id}
                  data-page={i}
                  onClick={() => goTo(i)}
                  aria-label={i === 0 ? t("כריכה") : t("עמוד {n}", { n: i + 1 })}
                  aria-current={current ? "page" : undefined}
                  className={`relative shrink-0 overflow-hidden bg-neutral-800 transition-opacity ${current ? "opacity-100" : "opacity-60 hover:opacity-90"}`}
                  style={{
                    height: "var(--thumb-h)",
                    width: `calc(var(--thumb-h) * ${pageAspectOf(p)})`,
                    boxShadow: holdsPick ? `0 0 0 2px ${SWAP_PURPLE}` : current ? "0 0 0 2px #fff" : undefined,
                  }}
                >
                  <span className="absolute inset-0" style={{ containerType: "inline-size" }}>
                    <ProofPage spread={p} photoAspects={photoAspects} thumb selectedElId={holdsPick ? selected?.elId : null} />
                  </span>
                  <span dir="ltr" className="absolute bottom-0.5 start-0.5 rounded px-1 text-[10px] font-semibold leading-4 bg-black/60 text-white font-data">
                    {i === 0 ? t("כריכה") : i + 1}
                  </span>
                  {hasNote(p.id) && <span className="absolute top-1 end-1 h-2 w-2 rounded-full bg-amber-400 ring-1 ring-black/40" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* The controls. Sideways on a phone they're a column beside the page; otherwise this wrapper
          drops out of the layout (display: contents) and they stack above and below the page. */}
      <div className="contents phone-landscape:order-2 phone-landscape:flex phone-landscape:flex-col phone-landscape:w-1/5 phone-landscape:min-w-[184px] phone-landscape:shrink-0 phone-landscape:overflow-y-auto phone-landscape:py-2">
      <div className="order-1 flex items-center justify-between gap-2 px-4 py-3 shrink-0 phone-landscape:px-2 phone-landscape:py-1">
        <button onClick={onClose} aria-label={t("סגירה")} className="h-10 w-10 shrink-0 rounded-full bg-white/10 text-white flex items-center justify-center text-lg">
          <IconClose className="h-5 w-5" />
        </button>
        {marking && <span className="min-w-0 truncate text-sm font-semibold text-white phone-landscape:hidden">{t("סימון תיקונים")}</span>}
        <div className="flex items-center gap-2 shrink-0">
          {marking && (
            <button onClick={() => setGuideOpen(true)} aria-label={t("איך מסמנים?")} className="h-8 px-3 rounded-full bg-white/15 text-white text-xs font-semibold phone-landscape:w-8 phone-landscape:px-0">
              <span className="phone-landscape:hidden">{t("איך מסמנים?")}</span>
              <span className="hidden phone-landscape:inline" aria-hidden="true">?</span>
            </button>
          )}
          <span dir="ltr" className="text-xs font-semibold text-white/70 font-data">
            {`${index + 1} / ${pages.length}`}
          </span>
        </div>
      </div>

      {approved && <div className="order-2 mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-center bg-sage-bg text-sage phone-landscape:mx-2">✓ {t("האלבום אושר")}</div>}
      {!approved && !marking && currentStatus === "changes_requested" && (
        <div className="order-2 mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-center bg-amber-bg text-amber-deep phone-landscape:mx-2">
          {justSent ? `✓ ${t("התיקונים נשלחו לצלם. העיצוב המעודכן יישלח אליכם שוב.")}` : t("שלחתם תיקונים לעיצוב. הצלם יעדכן אותו וישלח אליכם שוב.")}
        </div>
      )}
      {selected && !marking && (
        <div
          className="order-2 mx-4 mb-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold flex items-center justify-between gap-3 text-white phone-landscape:mx-2 phone-landscape:flex-col phone-landscape:items-stretch phone-landscape:text-center"
          style={{ background: SWAP_PURPLE }}
        >
          <span>{busy === "swap" ? t("שומר…") : t("בחרו תמונה להחלפה, בעמוד הזה או בעמוד אחר")}</span>
          <button onClick={() => setSelected(null)} className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
            {t("ביטול")}
          </button>
        </div>
      )}

      {/* Turning pages like a book in the reader's language: in Hebrew the next page is on the left,
          with an arrow pointing left, and the previous page on the right (owner, 2026-10-27). The
          arrows are drawn: the ‹ › characters used before get mirrored in a right-to-left line, so
          each arrow pointed at the other side. */}
      <div dir={isRtl ? "rtl" : "ltr"} className="order-4 flex items-center justify-center gap-4 py-2 shrink-0 phone-landscape:py-1">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === firstIndex}
          aria-label={t("העמוד הקודם")}
          className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-30"
        >
          <PageArrow towards={isRtl ? "right" : "left"} />
        </button>
        <button
          onClick={() => goTo(index + 1)}
          disabled={index === lastIndex}
          aria-label={t("העמוד הבא")}
          className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-30"
        >
          <PageArrow towards={isRtl ? "left" : "right"} />
        </button>
      </div>

      <div className="order-5 bg-white rounded-t-3xl p-4 pb-6 shrink-0 max-h-[42vh] overflow-y-auto phone-landscape:mx-2 phone-landscape:p-3 phone-landscape:rounded-2xl phone-landscape:max-h-none phone-landscape:shrink phone-landscape:min-h-0">
        {marking ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3 phone-landscape:gap-1 phone-landscape:mb-2">
              <button onClick={() => setTool("pen")} aria-pressed={tool === "pen"} className={toolBtn(tool === "pen")}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
                </svg>
                <span className={landscapeIconOnly}>{t("עיפרון")}</span>
              </button>
              <button onClick={() => setTool("rect")} aria-pressed={tool === "rect"} className={toolBtn(tool === "rect")}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <rect x="4" y="6" width="16" height="12" />
                </svg>
                <span className={landscapeIconOnly}>{t("מלבן")}</span>
              </button>
              <div className="flex items-center gap-1.5 px-1 phone-landscape:order-last phone-landscape:px-0 phone-landscape:gap-2">
                {CORRECTION_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={t(COLOR_NAMES[c])}
                    aria-pressed={color === c}
                    className="h-8 w-8 rounded-full flex items-center justify-center"
                    style={{ boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
                  >
                    <span className="h-6 w-6 rounded-full block" style={{ background: c }} />
                  </button>
                ))}
              </div>
              <button
                onClick={undo}
                disabled={pageMarks.length === 0}
                title={t("ביטול הסימון")}
                className="h-9 px-3 rounded-full text-[13px] font-semibold border border-line bg-white text-ink disabled:opacity-40 phone-landscape:h-8 phone-landscape:w-8 phone-landscape:px-0"
              >
                ↶ <span className={landscapeIconOnly}>{t("ביטול הסימון")}</span>
              </button>
              <button
                onClick={clearPage}
                disabled={pageMarks.length === 0}
                title={t("ניקוי העמוד")}
                className="h-9 px-3 rounded-full text-[13px] font-semibold border border-line bg-white text-ink-soft disabled:opacity-40 phone-landscape:h-8 phone-landscape:w-8 phone-landscape:px-0 phone-landscape:flex phone-landscape:items-center phone-landscape:justify-center"
              >
                <svg className="hidden phone-landscape:block" viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
                </svg>
                <span className={landscapeIconOnly}>{t("ניקוי העמוד")}</span>
              </button>
            </div>
            {spread && (
              <textarea
                value={notes[spread.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [spread.id]: e.target.value.slice(0, CORRECTION_LIMITS.note) }))}
                placeholder={t("הערה לעמוד הזה (לא חובה)")}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none mb-3 phone-landscape:h-9 phone-landscape:py-1.5 phone-landscape:mb-2"
              />
            )}
            <p className="text-xs font-semibold text-ink-soft mb-2">
              {markedPages > 0 ? t("עמודים עם תיקונים: {n}", { n: markedPages }) : t("עוד לא סימנתם תיקונים")}
            </p>
            {sendError && <p className="text-sm text-rose mb-2">{sendError}</p>}
            <div className="flex gap-2 phone-landscape:flex-col">
              <button
                onClick={submit}
                disabled={sending || markedPages === 0}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60 phone-landscape:py-2 phone-landscape:leading-tight"
              >
                {sending ? t("שולח...") : t("אישור ושליחת התיקונים")}
              </button>
              {/* The notes stay (on this device) until sent: back to the album keeps them. */}
              <button onClick={() => setMode("view")} className="shrink-0 rounded-lg px-4 py-3 text-sm font-semibold bg-card border border-line text-ink-soft phone-landscape:py-2">
                {t("חזרה לאלבום")}
              </button>
            </div>
          </>
        ) : (
          <>
            {comments.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {comments.map((c) => (
                  <p key={c.id} className="text-sm rounded-lg px-3 py-2 bg-amber-bg text-amber-deep">
                    {c.text}
                  </p>
                ))}
              </div>
            )}
            {!approved && spread && (
              <div className="mb-3">
                {pageNote && <p className="text-[13px] rounded-lg px-3 py-2 mb-2 bg-amber-bg text-amber-deep whitespace-pre-line">{pageNote}</p>}
                <div className="flex flex-wrap gap-2 phone-landscape:flex-col">
                  <button onClick={startMarking} className={pageBtn}>
                    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
                    </svg>
                    {hasNote(spread.id) ? t("עריכת ההערה לעמוד") : t("הערה לעמוד")}
                  </button>
                  {/* Any page but the cover, changed or not (owner, 2026-10-27). */}
                  {editable && !spread.isCover && (
                    <button onClick={redesignPage} disabled={!!busy} className={pageBtn}>
                      ↻ {t("עיצוב מחדש")}
                    </button>
                  )}
                  {editable && spread.canBack && (
                    <button onClick={backPage} disabled={!!busy} className={pageBtn}>
                      ↶ {t("לעיצוב הקודם")}
                    </button>
                  )}
                  {/* Not after a swap with another page (owner, 2026-10-27): going back alone would show a
                      photo twice and lose another. "ביטול כל השינויים שלי" still returns everything. */}
                  {editable && spread.canOriginal && (
                    <button onClick={originalPage} disabled={!!busy} className={pageBtn}>
                      ⟲ {t("לעיצוב המקורי")}
                    </button>
                  )}
                </div>
                {editable && !selected && (
                  <p className="text-xs text-ink-soft mt-2 leading-snug phone-landscape:hidden">{t("רוצים להחליף בין תמונות? לוחצים על תמונה אחת ואז על השנייה, גם בעמוד אחר.")}</p>
                )}
              </div>
            )}
            {!approved &&
              (index === lastIndex ? (
                <>
                  <p className="text-sm font-semibold text-center mb-3">{t("זה העמוד האחרון. מה דעתכם על העיצוב?")}</p>
                  {approveFailed && <p className="text-sm text-rose text-center mb-2">{t("האישור לא נשמר. נסו שוב")}</p>}
                  {sendError && <p className="text-sm text-rose text-center mb-2">{sendError}</p>}
                  <div className="flex gap-2 phone-landscape:flex-col">
                    {/* After corrections the design waits for the photographer's update: approving it
                        now would send the old design to print (the approval sends it by itself). */}
                    {editable && (
                      <button onClick={() => setConfirmApproveOpen(true)} disabled={!!busy} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60">
                        {t("אישור העיצוב")}
                      </button>
                    )}
                    {markedPages > 0 ? (
                      <button onClick={submit} disabled={sending} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-ink text-ink disabled:opacity-60">
                        {sending ? t("שולח...") : t("שליחת התיקונים ({n})", { n: markedPages })}
                      </button>
                    ) : (
                      <button onClick={startMarking} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-ink text-ink">
                        {t("צריך תיקונים")}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-ink-soft mb-2">{t("עברו על כל העמודים. בסוף העיצוב אפשר לאשר אותו או לבקש תיקונים.")}</p>
                  <button onClick={() => goTo(lastIndex)} className="text-sm font-semibold underline text-ink">
                    {t("לעמוד האחרון")}
                  </button>
                </div>
              ))}
            {editable && editedPages > 0 && (
              <div className="text-center mt-3">
                <button onClick={() => setConfirmReset(true)} disabled={!!busy} className="text-xs font-semibold underline text-ink-soft disabled:opacity-50">
                  {t("ביטול כל השינויים שלי")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      </div>

      {guideOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }} onClick={() => setGuideOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl p-5 bg-white" role="dialog" aria-modal="true" aria-label={t("איך מסמנים תיקונים?")} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3 font-display">{t("איך מסמנים תיקונים?")}</h2>
            <ol className="space-y-2 mb-5">
              {CORRECTION_GUIDE_STEPS.map((step, i) => (
                <li key={step} className="flex gap-2.5 text-sm leading-snug">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-ink text-white text-xs font-bold flex items-center justify-center font-data">{i + 1}</span>
                  <span className="pt-0.5">{t(step)}</span>
                </li>
              ))}
            </ol>
            <button onClick={() => setGuideOpen(false)} className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white">
              {t("הבנתי, מתחילים")}
            </button>
          </div>
        </div>
      )}

      {confirmSwap && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmSwap(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-white" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {(() => {
              // Page 1 is the album's cover (owner, 2026-10-27).
              const nums = confirmSwap.pages.map(pageNumber).sort((x, y) => x - y);
              const cover = nums.includes(1);
              const others = nums.filter((n) => n !== 1);
              return (
                <>
                  <h2 className="text-lg font-bold mb-2 font-display">
                    {nums.length > 1 ? t("העיצוב של שני העמודים ישתנה") : cover ? t("העיצוב של הכריכה ישתנה") : t("העיצוב של העמוד ישתנה")}
                  </h2>
                  <p className="text-sm text-ink-soft mb-2">
                    {nums.length > 1
                      ? cover
                        ? t("התמונה לא מתאימה לצורה של המסגרת (לאורך במקום לרוחב, או להפך), ולכן הכריכה ועמוד {n} יעוצבו מחדש.", { n: others.join(", ") })
                        : t("התמונה לא מתאימה לצורה של המסגרת (לאורך במקום לרוחב, או להפך), ולכן עמודים {pages} יעוצבו מחדש.", { pages: nums.join(", ") })
                      : cover
                        ? t("התמונה לא מתאימה לצורה של המסגרת (לאורך במקום לרוחב, או להפך), ולכן הכריכה תעוצב מחדש.")
                        : t("התמונה לא מתאימה לצורה של המסגרת (לאורך במקום לרוחב, או להפך), ולכן העמוד יעוצב מחדש.")}
                  </p>
                </>
              );
            })()}
            <p className="text-sm text-ink-soft mb-5">{t("אחר כך אפשר ללחוץ \"עיצוב מחדש\" כדי לראות עיצוב אחר, ולחזור עד 3 עיצובים אחורה.")}</p>
            <div className="flex gap-2">
              <button onClick={() => void runSwap(confirmSwap.a, confirmSwap.b, true)} className="flex-1 rounded-lg py-3 text-sm font-semibold text-white" style={{ background: SWAP_PURPLE }}>
                {t("החלפה ועיצוב מחדש")}
              </button>
              <button onClick={() => setConfirmSwap(null)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReset && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmReset(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-white" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {/* What "reset" does exactly (owner, 2026-10-27): which pages, that swaps between pages are
                undone too, that it can't be undone (the "back" history goes with it), and that notes stay. */}
            <h2 className="text-lg font-bold mb-3 font-display">{t("לחזור לעיצוב שהצלם שלח?")}</h2>
            <ul className="list-disc ps-5 space-y-1.5 text-sm text-ink-soft mb-5">
              <li>{resetPagesLine(editedNumbers, t)}</li>
              <li>{t("כל ההחלפות והעיצובים שבחרתם יבוטלו, ותמונות שהעברתם בין עמודים יחזרו למקום שלהן.")}</li>
              <li className="font-semibold text-ink">{t("אי אפשר לשחזר את השינויים אחרי הביטול.")}</li>
              <li>{t("ההערות שכתבתם לעמודים נשארות.")}</li>
            </ul>
            <div className="flex gap-2">
              <button onClick={() => void resetAll()} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white">
                {t("כן, לבטל את השינויים")}
              </button>
              <button onClick={() => setConfirmReset(false)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                {t("השארת השינויים")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmApproveOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmApproveOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-white" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">{t("לאשר את עיצוב האלבום?")}</h2>
            <p className="text-sm text-ink-soft mb-2">{t("לאחר האישור העיצוב יעבור להדפסה, ואי אפשר יהיה לבטל את האישור.")}</p>
            {editedPages > 0 && <p className="text-sm text-ink-soft mb-2">{t("העמודים ששיניתם ({n}) יודפסו כמו שהם עכשיו.", { n: editedPages })}</p>}
            {markedPages > 0 && (
              <p className="text-sm font-semibold text-amber-deep mb-2">
                {markedPages === 1
                  ? t("יש לכם הערה בעמוד אחד שעוד לא נשלחה. אישור שולח את האלבום להדפסה בלי התיקון הזה.")
                  : t("יש לכם הערות ב-{n} עמודים שעוד לא נשלחו. אישור שולח את האלבום להדפסה בלי התיקונים האלה.", { n: markedPages })}
              </p>
            )}
            <div className="flex gap-2 mt-5 flex-wrap">
              {markedPages > 0 && (
                <button onClick={submit} disabled={sending || approving} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                  {sending ? t("שולח...") : t("שליחת ההערות לצלם במקום")}
                </button>
              )}
              <button onClick={approve} disabled={approving || sending} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60">
                {approving ? t("שולח...") : markedPages > 0 ? t("אישור בלי ההערות") : t("כן, מאשר/ת")}
              </button>
              <button onClick={() => setConfirmApproveOpen(false)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                {t("חזרה")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
