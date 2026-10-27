"use client";

import { textEffectsCss } from "@/lib/albumRender";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
      url: string;
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

type SpreadBackground = { url: string; blur: number; opacity: number } | null;

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
};

function BackgroundLayer({ background }: { background: SpreadBackground }) {
  if (!background) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={background.url}
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
      className="absolute font-bold flex items-center"
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
      className="absolute"
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
      className="absolute"
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

function pageAspectOf(spread: ClientAlbumSpread): number {
  const a = spread.widthCm / spread.heightCm;
  return Number.isFinite(a) && a > 0 ? a : 1.5;
}

// One album page, drawn inside its page box (the caller sizes the box in the page's proportions).
function ProofPage({
  spread,
  photoAspects,
  onPhotoAspect,
}: {
  spread: ClientAlbumSpread;
  photoAspects: Record<string, number>;
  onPhotoAspect: (url: string, aspect: number) => void;
}) {
  const pageAspect = pageAspectOf(spread);
  if (spread.layout === "custom") {
    return (
      <>
        <BackgroundLayer background={spread.background} />
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          {spread.elements
            .filter((el): el is Extract<ClientAlbumElement, { type: "photo" }> => el.type === "photo" && hasAdjustments(el))
            .map((el) => (
              <defs key={el.id} dangerouslySetInnerHTML={{ __html: adjustmentsSvgFilter(el.id, el) }} />
            ))}
          {spread.elements
            .filter((el): el is Extract<ClientAlbumElement, { type: "photo" }> => el.type === "photo" && !!el.sharpness)
            .map((el) => (
              <defs key={`sharpen-${el.id}`} dangerouslySetInnerHTML={{ __html: sharpenSvgFilter(el.id, el.sharpness) }} />
            ))}
        </svg>
        {spread.elements.map((el) =>
          el.type === "photo" ? (
            <div
              key={el.id}
              className="absolute overflow-hidden"
              style={{
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                width: `${el.widthPct}%`,
                height: `${el.heightPct}%`,
                // Drop shadow only — the border is a separate, later sibling below, so it paints
                // above the photo (a full-bleed <img> child hides a parent's inset box-shadow).
                boxShadow: boxShadowFor(el.shadow, el.shadowDistance, el.shadowBlur, el.shadowAngle),
                // Rotation lives on this box (not the <img>) so the outline/box-shadow rotate with the
                // clipped photo as one rigid tile — mirrors the builder.
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              }}
            >
              {(() => {
                // The frame's real proportions: its share of the page times the page's own
                // proportions (the album's size, or the cover's own), as in the exports.
                const frameAspect = (el.widthPct / el.heightPct) * pageAspect || 1;
                const imgAspect = photoAspects[el.url] ?? frameAspect;
                const framing = computePhotoFraming(imgAspect, frameAspect, el.zoom ?? 100, el.focalX, el.focalY);
                return (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={el.url}
                    alt=""
                    draggable={false}
                    className="absolute pointer-events-none"
                    onLoad={(e) => {
                      const w = e.currentTarget.naturalWidth;
                      const h = e.currentTarget.naturalHeight;
                      if (w && h) onPhotoAspect(el.url, w / h);
                    }}
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
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 ${el.borderWidth}px ${el.borderColor ?? "#fff"}` }} />
              )}
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
        <BackgroundLayer background={spread.background} />
        <div className={`absolute inset-0 flex gap-1.5 ${spread.layout === "stack" ? "flex-col" : "flex-row"}`}>
          <div className="relative overflow-hidden rounded-sm" style={{ flex: spread.layout === "feature" ? 1.6 : 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spread.photo1.url}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: `${spread.focalX1}% ${spread.focalY1}%` }}
            />
          </div>
          <div className="relative overflow-hidden rounded-sm" style={{ flex: 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spread.photo2.url}
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
      <BackgroundLayer background={spread.background} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={spread.photo1.url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
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
  "עוברים בחיצים לעמוד שצריך בו תיקון.",
  "בוחרים עיפרון או מלבן, ואת הצבע.",
  "מסמנים על העיצוב את מה שצריך לתקן.",
  "אפשר לכתוב הערה לעמוד, מתחת לעיצוב.",
  "טעיתם? \"ביטול הסימון\" מוחק את הסימון האחרון.",
  "בסוף לוחצים \"אישור ושליחת התיקונים\".",
] as const;

// The client's album view (/gallery/<token>): the pages in their printed proportions, and at the end
// of the album "אישור העיצוב" or "צריך תיקונים" (owner, 2026-10-27). Corrections mode draws on the
// pages — a pencil and an outline rectangle in 3 colours, a note per page — and sends them all at
// once to the photographer (api/gallery/[token]/album/corrections, lib/albumCorrections.ts).
export default function GalleryAlbumProofing({
  token,
  status,
  title,
  coverUrl,
  spreads,
  onClose,
}: {
  token: string;
  status: "sent" | "approved" | "changes_requested";
  title: string;
  coverUrl: string | null;
  spreads: ClientAlbumSpread[];
  onClose: () => void;
}) {
  const t = useT();
  const isRtl = dirOf(useLang()) === "rtl";
  const hasCover = !!coverUrl;
  const [index, setIndex] = useState(hasCover ? -1 : 0);
  // Natural aspect ratio per photo (the client doesn't get one from the DB), learned from each
  // <img>'s own onLoad.
  const [photoAspects, setPhotoAspects] = useState<Record<string, number>>({});
  const [currentStatus, setCurrentStatus] = useState(status);
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
  const [confirmDiscard, setConfirmDiscard] = useState<null | "close" | "exit">(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  const spread = index >= 0 ? (spreads[index] ?? null) : null;
  const pageAspect = spread ? pageAspectOf(spread) : 1.5;
  const { ref: stageRef, box } = useFitBox(pageAspect);

  if (spreads.length === 0) return null;
  const onCover = index === -1;
  const lastIndex = spreads.length - 1;
  const firstIndex = mode === "mark" || !hasCover ? 0 : -1;
  const approved = currentStatus === "approved";
  const marking = mode === "mark";
  const comments = spread?.comments ?? [];
  const pageMarks = spread ? (marks[spread.id] ?? []) : [];
  const markedPages = spreads.filter((s) => (marks[s.id]?.length ?? 0) > 0 || !!notes[s.id]?.trim()).length;

  const goTo = (i: number) => setIndex(Math.max(firstIndex, Math.min(lastIndex, i)));
  const onPhotoAspect = (url: string, aspect: number) => setPhotoAspects((prev) => (prev[url] ? prev : { ...prev, [url]: aspect }));

  const approve = async () => {
    setApproving(true);
    setApproveFailed(false);
    const res = await fetch(`/api/gallery/${token}/album/approve`, { method: "POST" }).catch(() => null);
    setApproving(false);
    setConfirmApproveOpen(false);
    if (res?.ok) setCurrentStatus("approved");
    else setApproveFailed(true);
  };

  const startMarking = () => {
    setMode("mark");
    setJustSent(false);
    setSendError(null);
    if (index < 0) setIndex(0);
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
  const exitMarking = () => (markedPages > 0 ? setConfirmDiscard("exit") : setMode("view"));
  const requestClose = () => (marking && markedPages > 0 ? setConfirmDiscard("close") : onClose());

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
    const pages = spreads
      .map((s) => ({ spreadId: s.id, note: notes[s.id]?.trim() || null, marks: marks[s.id] ?? [] }))
      .filter((p) => p.marks.length > 0 || p.note);
    if (pages.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/gallery/${token}/album/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      if (!res.ok) {
        setSendError(res.status === 429 ? t("יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.") : t("השליחה נכשלה. נסו שוב"));
        return;
      }
      discardMarks();
      setMode("view");
      setCurrentStatus("changes_requested");
      setJustSent(true);
    } catch {
      setSendError(t("השליחה נכשלה. נסו שוב"));
    } finally {
      setSending(false);
    }
  };

  const toolBtn = (active: boolean) =>
    `h-9 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 border ${active ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"}`;

  return (
    <div className={`fixed inset-0 z-[80] bg-black flex flex-col select-none ${ALBUM_FONT_CLASS_NAMES}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 shrink-0">
        <button onClick={requestClose} aria-label={t("סגירה")} className="h-10 w-10 shrink-0 rounded-full bg-white/10 text-white flex items-center justify-center text-lg">
          <IconClose className="h-5 w-5" />
        </button>
        {marking && <span className="min-w-0 truncate text-sm font-semibold text-white">{t("סימון תיקונים")}</span>}
        <div className="flex items-center gap-2 shrink-0">
          {marking && (
            <button onClick={() => setGuideOpen(true)} className="h-8 px-3 rounded-full bg-white/15 text-white text-xs font-semibold">
              {t("איך מסמנים?")}
            </button>
          )}
          <span dir="ltr" className="text-xs font-semibold text-white/70 font-data">
            {onCover ? t("שער") : `${index + 1} / ${spreads.length}`}
          </span>
        </div>
      </div>

      {approved && <div className="mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-center bg-sage-bg text-sage">✓ {t("האלבום אושר")}</div>}
      {!approved && !marking && currentStatus === "changes_requested" && (
        <div className="mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-center bg-amber-bg text-amber-deep">
          {justSent ? `✓ ${t("התיקונים נשלחו לצלם. העיצוב המעודכן יישלח אליכם שוב.")}` : t("שלחתם תיקונים לעיצוב. הצלם יעדכן אותו וישלח אליכם שוב.")}
        </div>
      )}

      <div className="flex-1 min-h-0 px-3 py-1">
        <div ref={stageRef} className="h-full w-full flex items-center justify-center">
          {onCover ? (
            <div className="relative h-full w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl ?? undefined} alt="" className="h-full w-full object-contain" />
              <div className="absolute bottom-6 inset-x-0 text-center px-6">
                <p className="text-white text-lg font-bold font-display" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
                  {title}
                </p>
              </div>
            </div>
          ) : spread ? (
            <div
              className="relative overflow-hidden shrink-0"
              style={{
                width: box ? `${box.w}px` : "100%",
                height: box ? `${box.h}px` : undefined,
                aspectRatio: box ? undefined : `${spread.widthCm} / ${spread.heightCm}`,
                containerType: "inline-size",
              }}
            >
              <ProofPage spread={spread} photoAspects={photoAspects} onPhotoAspect={onPhotoAspect} />
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
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 py-2 shrink-0">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === firstIndex}
          aria-label={t("העמוד הקודם")}
          className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl disabled:opacity-30"
        >
          {isRtl ? "›" : "‹"}
        </button>
        <button
          onClick={() => goTo(index + 1)}
          disabled={index === lastIndex}
          aria-label={t("העמוד הבא")}
          className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl disabled:opacity-30"
        >
          {isRtl ? "‹" : "›"}
        </button>
      </div>

      <div className="bg-white rounded-t-3xl p-4 pb-6 shrink-0 max-h-[42vh] overflow-y-auto">
        {marking ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={() => setTool("pen")} aria-pressed={tool === "pen"} className={toolBtn(tool === "pen")}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
                </svg>
                {t("עיפרון")}
              </button>
              <button onClick={() => setTool("rect")} aria-pressed={tool === "rect"} className={toolBtn(tool === "rect")}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <rect x="4" y="6" width="16" height="12" />
                </svg>
                {t("מלבן")}
              </button>
              <div className="flex items-center gap-1.5 px-1">
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
              <button onClick={undo} disabled={pageMarks.length === 0} className="h-9 px-3 rounded-full text-[13px] font-semibold border border-line bg-white text-ink disabled:opacity-40">
                ↶ {t("ביטול הסימון")}
              </button>
              <button onClick={clearPage} disabled={pageMarks.length === 0} className="h-9 px-3 rounded-full text-[13px] font-semibold border border-line bg-white text-ink-soft disabled:opacity-40">
                {t("ניקוי העמוד")}
              </button>
            </div>
            {spread && (
              <textarea
                value={notes[spread.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [spread.id]: e.target.value.slice(0, CORRECTION_LIMITS.note) }))}
                placeholder={t("הערה לעמוד הזה (לא חובה)")}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none mb-3"
              />
            )}
            <p className="text-xs font-semibold text-ink-soft mb-2">
              {markedPages > 0 ? t("עמודים עם תיקונים: {n}", { n: markedPages }) : t("עוד לא סימנתם תיקונים")}
            </p>
            {sendError && <p className="text-sm text-rose mb-2">{sendError}</p>}
            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={sending || markedPages === 0}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
              >
                {sending ? t("שולח...") : t("אישור ושליחת התיקונים")}
              </button>
              <button onClick={exitMarking} className="shrink-0 rounded-lg px-4 py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                {t("יציאה")}
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
            {!approved &&
              (index === lastIndex ? (
                <>
                  <p className="text-sm font-semibold text-center mb-3">{t("זה העמוד האחרון. מה דעתכם על העיצוב?")}</p>
                  {approveFailed && <p className="text-sm text-rose text-center mb-2">{t("האישור לא נשמר. נסו שוב")}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmApproveOpen(true)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white">
                      {t("אישור העיצוב")}
                    </button>
                    <button onClick={startMarking} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-ink text-ink">
                      {t("צריך תיקונים")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-ink-soft mb-2">{t("עברו על כל העמודים. בסוף העיצוב אפשר לאשר אותו או לבקש תיקונים.")}</p>
                  <button onClick={() => goTo(lastIndex)} className="text-sm font-semibold underline text-ink">
                    {t("מעבר לסוף העיצוב")}
                  </button>
                </div>
              ))}
          </>
        )}
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

      {confirmDiscard && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmDiscard(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-white" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">{t("לצאת בלי לשלוח את התיקונים?")}</h2>
            <p className="text-sm text-ink-soft mb-5">{t("הסימונים וההערות שלא נשלחו יימחקו.")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const closing = confirmDiscard === "close";
                  setConfirmDiscard(null);
                  discardMarks();
                  setMode("view");
                  if (closing) onClose();
                }}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white"
              >
                {t("יציאה בלי שליחה")}
              </button>
              <button onClick={() => setConfirmDiscard(null)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft">
                {t("חזרה לסימון")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmApproveOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setConfirmApproveOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-white" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">{t("לאשר את עיצוב האלבום?")}</h2>
            <p className="text-sm text-ink-soft mb-5">{t("לאחר האישור העיצוב יעבור להדפסה, ואי אפשר יהיה לבטל את האישור.")}</p>
            <div className="flex gap-2">
              <button onClick={approve} disabled={approving} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60">
                {approving ? t("שולח...") : t("כן, מאשר/ת")}
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
