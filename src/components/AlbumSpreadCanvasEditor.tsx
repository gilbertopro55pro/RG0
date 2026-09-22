"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AlbumElement, AlbumFrame, AlbumOrnamentElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement, AlbumTemplateRow, GalleryAlbumSpreadRow } from "@/lib/types";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";
import { TEXT_COLOR_PALETTE, isLightTextColor } from "@/lib/textColor";
import { TEMPLATE_TABS, TEMPLATE_BANK, type TemplateTabKey } from "@/lib/albumTemplateBank";
import { ALBUM_MASKS, maskCssUrl, findMask } from "@/lib/albumMasks";
import { ALBUM_ORNAMENTS, ORNAMENT_TABS, findOrnament, ornamentDataUrl } from "@/lib/albumOrnaments";
import { hasAdjustments, adjustmentsSvgFilter } from "@/lib/albumAdjustments";
import { sharpenSvgFilter } from "@/lib/albumSharpen";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import AlbumEditorGuideModal from "@/components/AlbumEditorGuideModal";
import AlbumSpreadThumbnail from "@/components/AlbumSpreadThumbnail";
import { ALBUM_BLUR_MAX_PX, computePhotoFraming, cssFilterFor, boxShadowFor, textShadowFor, type PhotoWithUrl } from "@/lib/albumRender";
import { textHeightPctForFontSize, MAX_TEXT_HEIGHT_OVERSIZE_RATIO } from "@/lib/albumTextSizing";

export type { PhotoWithUrl };

const BORDER_COLORS = ["#ffffff", "#000000", "#d4af37", "#e07a5f"];
// The circular menu's own button count (adjust/BW/sepia/focal/true-size/aspect-lock/lock-position/
// opacity/blur/rotation/shadow/to-front/to-back/delete) and the gap between them (matches
// PhotoFloatingMenu's own `gap-0.5` className) — used on phone/tablet to size buttons down until
// the whole stack fits its budget, instead of a fixed guessed scale. Keep in sync if a button is
// ever added/removed from PhotoFloatingMenu.
const CIRCLE_MENU_BUTTON_COUNT = 14;
const CIRCLE_MENU_GAP_PX = 2;

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold bg-chip text-ink-soft">
      <span className="shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="gf-slider-thumb flex-1 min-w-0"
      />
      <span dir="ltr" className="font-data shrink-0">
        {value}
        {unit}
      </span>
    </div>
  );
}

// Line-style icons matching the app's existing icon set (GalleryStyleIcons.tsx's Base pattern) —
// 24x24 viewBox, currentColor stroke, no fill — used in the floating menu below instead of emoji,
// which read as a mismatched, oversized, platform-dependent style next to everything else here.
function MenuIconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconBW() {
  return (
    <MenuIconBase>
      <circle cx={12} cy={12} r={8} />
      <path d="M12 4a8 8 0 000 16z" fill="currentColor" stroke="none" />
    </MenuIconBase>
  );
}
function IconSepia() {
  return (
    <MenuIconBase>
      <path d="M12 3.5c3 3.6 5.5 6.9 5.5 9.8a5.5 5.5 0 11-11 0c0-2.9 2.5-6.2 5.5-9.8z" />
    </MenuIconBase>
  );
}
function IconOpacity() {
  return (
    <MenuIconBase>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx={12} cy={12} r={2.6} />
    </MenuIconBase>
  );
}
function IconBlur() {
  return (
    <MenuIconBase>
      <path d="M3 8.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M3 13c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M3 17.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
    </MenuIconBase>
  );
}
function IconRotate() {
  return (
    <MenuIconBase>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M3 17.5v-4h4" />
    </MenuIconBase>
  );
}
function IconShadow() {
  return (
    <MenuIconBase>
      <rect x={8.5} y={8.5} width={12} height={12} rx={1.5} opacity={0.4} />
      <rect x={3.5} y={3.5} width={12} height={12} rx={1.5} />
    </MenuIconBase>
  );
}
// Classic 3-slider "equalizer" glyph — used for the button that opens the "עריכת תמונה" color/tone
// adjustments panel (exposure, contrast, white balance, etc.).
function IconAdjust() {
  return (
    <MenuIconBase>
      <path d="M5 4v7M5 15v5M12 4v3M12 11v9M19 4v11M19 19v1" />
      <circle cx={5} cy={13} r={1.8} />
      <circle cx={12} cy={9} r={1.8} />
      <circle cx={19} cy={17} r={1.8} />
    </MenuIconBase>
  );
}
function IconFocal() {
  return (
    <MenuIconBase>
      <circle cx={12} cy={12} r={7.5} />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
    </MenuIconBase>
  );
}
function IconTrueSize() {
  return (
    <MenuIconBase>
      <rect x={3.5} y={6.5} width={17} height={11} rx={1} />
      <path d="M3.5 3.5h4M3.5 3.5v4M20.5 3.5h-4M20.5 3.5v4M3.5 20.5h4M3.5 20.5v-4M20.5 20.5h-4M20.5 20.5v-4" />
    </MenuIconBase>
  );
}
function IconAspectLock() {
  return (
    <MenuIconBase>
      <rect x={5.5} y={10.5} width={13} height={9} rx={1.5} />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" />
    </MenuIconBase>
  );
}
// A padlock with a keyhole dot — deliberately distinct from IconAspectLock's plain shackle+rect
// (same menu can show both: this one freezes position/size, that one preserves resize ratio).
function IconLock() {
  return (
    <MenuIconBase>
      <rect x={5.5} y={10.5} width={13} height={9} rx={1.5} />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" />
      <circle cx={12} cy={14.5} r={1.3} fill="currentColor" stroke="none" />
    </MenuIconBase>
  );
}
function IconTrash() {
  return (
    <MenuIconBase>
      <path d="M4.5 7h15M9.5 7V4.8a1 1 0 011-1h3a1 1 0 011 1V7m-8 0l.8 12.2a1.5 1.5 0 001.5 1.4h5.4a1.5 1.5 0 001.5-1.4L18.5 7" />
      <path d="M10 11v6M14 11v6" />
    </MenuIconBase>
  );
}
function IconX() {
  return (
    <MenuIconBase>
      <path d="M6 6l12 12M18 6L6 18" />
    </MenuIconBase>
  );
}
function IconToFront() {
  return (
    <MenuIconBase>
      <rect x={3.5} y={3.5} width={11} height={11} rx={1.5} opacity={0.4} />
      <rect x={9.5} y={9.5} width={11} height={11} rx={1.5} />
      {/* Direction cue in the otherwise-empty top-left corner — an up arrow for "raise to the
          top layer", distinct from the plain stacked-squares glyph alone. */}
      <path d="M2.3 7V1.3M0.6 3.1L2.3 1.3L4 3.1" />
    </MenuIconBase>
  );
}
function IconToBack() {
  return (
    <MenuIconBase>
      <rect x={9.5} y={9.5} width={11} height={11} rx={1.5} opacity={0.4} />
      <rect x={3.5} y={3.5} width={11} height={11} rx={1.5} />
      <path d="M2.3 1.3V7M0.6 5.2L2.3 7L4 5.2" />
    </MenuIconBase>
  );
}

// Matches the app's canonical icon convention (NavIcons.tsx / GalleryStyleIcons.tsx: 24x24
// viewBox, currentColor stroke, no fill, strokeWidth 1.6) — used for the editor's own chrome
// buttons (close/save/templates/info/check), as opposed to MenuIconBase above which is scoped to
// the floating photo-controls menu.
function UiIconBase({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconClose({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M5 5l14 14M19 5L5 19" />
    </UiIconBase>
  );
}
function IconRotateDevice({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <rect x={7} y={2} width={10} height={16} rx={2} transform="rotate(-20 12 10)" />
      <path d="M19.5 15a7 7 0 0 1-10.6 5.2" />
      <path d="M9.5 17.5l-1 3 3-.6" />
    </UiIconBase>
  );
}
function IconGrid({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <rect x={3.5} y={3.5} width={7} height={7} rx={1} />
      <rect x={13.5} y={3.5} width={7} height={7} rx={1} />
      <rect x={3.5} y={13.5} width={7} height={7} rx={1} />
      <rect x={13.5} y={13.5} width={7} height={7} rx={1} />
    </UiIconBase>
  );
}
function IconMask({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <circle cx={9} cy={12} r={6.5} />
      <path d="M13.5 6.7A6.5 6.5 0 1113.5 17.3" />
    </UiIconBase>
  );
}
function IconOrnament({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M12 3c2.5 3 4.5 5.6 4.5 8a4.5 4.5 0 11-9 0c0-2.4 2-5 4.5-8z" />
      <path d="M6 15c-1.5 1-2.5 2.3-2.5 3.5M18 15c1.5 1 2.5 2.3 2.5 3.5" />
    </UiIconBase>
  );
}
function IconShape({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <circle cx={8} cy={8} r={4.5} />
      <rect x={13} y={13} width={8} height={8} rx={1.2} />
      <path d="M12 3.5L4.5 20.5h15L12 3.5z" />
    </UiIconBase>
  );
}
function IconPlusSmall({ size }: { size?: number }) {
  return (
    <UiIconBase size={size ?? 14}>
      <path d="M12 5v14M5 12h14" />
    </UiIconBase>
  );
}
function IconSave({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M5 3.5h11l4.5 4.5V19a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19V5A1.5 1.5 0 015 3.5z" />
      <path d="M7.5 3.5v6h8v-6M7 20.5v-6h10v6" />
    </UiIconBase>
  );
}
function IconInfo({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <circle cx={12} cy={12} r={8.5} />
      <path d="M12 11v5.5" />
      <circle cx={12} cy={7.8} r={0.9} fill="currentColor" stroke="none" />
    </UiIconBase>
  );
}
function IconCheck({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M4.5 12.5l5 5 10-11" />
    </UiIconBase>
  );
}

function CircleButton({
  label,
  active,
  onClick,
  children,
  scale = 1,
  danger = false,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  // Solved to fit the available canvas budget on every screen size (see menuButtonScale) — shrinks
  // below 1 when there isn't room for the whole button stack. This resizes the button's REAL width/height (not a `transform:
  // scale()`) — a transform only repaints the button larger while its actual layout/hit-test box
  // stays at the original size, and real iOS devices have been observed disagreeing with the
  // painted position for exactly this kind of transformed tap target. A real width/height change
  // has no such gap: the box IS whatever size it's drawn at.
  scale?: number;
  // Red outline + red icon variant, used for the trailing "delete" circle so it reads as a
  // distinct, harder-to-misclick destructive action rather than just another tool icon.
  danger?: boolean;
}) {
  const size = 28 * scale;
  return (
    <button
      onClick={onClick}
      title={label}
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: active ? "var(--color-amber-deep)" : "#fff",
        // Fixed dark icon color, not the theme-flipped --color-ink token — this button's own
        // background stays white in both themes, so the icon must too or it goes near-invisible
        // (light-on-white) once --color-ink flips light for dark mode's page text.
        color: danger ? "var(--color-rose)" : active ? "#fff" : "#201f33",
        boxShadow: danger
          ? "0 2px 6px rgba(46,49,66,0.22), 0 0 0 1.5px var(--color-rose)"
          : "0 2px 6px rgba(46,49,66,0.22), 0 0 0 1px var(--color-line)",
      }}
    >
      {children}
    </button>
  );
}

function FlyoutPanel({ side, width = 130, children }: { side: "left" | "right"; width?: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 rounded-xl border border-line bg-white p-2.5 space-y-2"
      style={{ [side]: "calc(100% + 8px)", width, boxShadow: "0 4px 16px rgba(46,49,66,0.3)" } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

// The handle/number track a local "live" value so dragging always feels instant, while the actual
// onChange to parent state — which can be expensive downstream (e.g. an SVG filter repaint on the
// photo-adjustments sliders) — is coalesced to at most once per animation frame. Without this, a
// slider that fires onChange on every pointer-move tick (dozens/sec) queues up a backlog of full
// re-renders faster than the browser can paint them, which is what made those sliders feel laggy.
function MiniSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  compact = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  // Label + value + range all on ONE row instead of label/value above the range on their own row —
  // used only by PhotoAdjustFloatingMenu on phone, where ~10 of these need to fit their external
  // box (kept at its current size — see that component's own comment) without a scrollbar. Cuts the
  // vertical footprint roughly in half versus the two-row layout every other caller still uses.
  compact?: boolean;
}) {
  const [liveValue, setLiveValue] = useState(value);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  useEffect(() => {
    setLiveValue(value);
  }, [value]);
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );
  const scheduleCommit = (v: number) => {
    pendingRef.current = v;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current != null) onChange(pendingRef.current);
      });
    }
  };
  const input = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={liveValue}
      onChange={(e) => {
        const v = Number(e.target.value);
        setLiveValue(v);
        // Compact (phone photo-adjust) applies straight through, no rAF coalescing — per explicit
        // request for the change to be immediate. Every other caller keeps the coalesced version
        // (see scheduleCommit's own comment for why: cheap to skip a frame there, not here where
        // "immediate" was the actual ask).
        if (compact) onChange(v);
        else scheduleCommit(v);
      }}
      // gf-compact-range-thumb shrinks the native slider handle itself (see the shared <style>
      // block) — the browser's default thumb doesn't scale down with the track's own height, so
      // without this it stays a large white circle even on this otherwise-tiny compact slider.
      className={compact ? "flex-1 min-w-0 h-2.5 gf-compact-range-thumb" : "w-full gf-slider-thumb"}
    />
  );
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <span title={label} className="text-[7px] font-semibold text-ink-soft shrink-0 w-7 truncate">{label}</span>
        {input}
        <span dir="ltr" className="text-[7px] font-data shrink-0 w-5 text-left">
          {liveValue}
          {unit}
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-semibold text-ink-soft mb-1">
        <span>{label}</span>
        <span dir="ltr" className="font-data">
          {liveValue}
          {unit}
        </span>
      </div>
      {input}
    </div>
  );
}

// Lets the photographer freely drag any floating editor panel (the circular photo menu, the
// bigger adjustments/ornament/shape/text panel) anywhere over the free-design page with a small
// grip handle — the computed "smart" position elsewhere in this file is still the panel's DEFAULT
// starting spot, this just layers a plain, unclamped pixel offset on top via `transform`, which
// composes with whatever positioning (top/bottom/left/right, %-based or px, plus any existing
// open/close transform) the panel already has, no matter how it's computed. The offset resets to
// (0,0) whenever `resetKey` changes (a different element gets selected) — via the documented React
// "adjust state during render when a prop changes" pattern, not an effect — so a panel dragged out
// of the way for one photo doesn't stay stuck there once a different element is selected. Per
// explicit request: "כל פאנל שנפתח... יוכל להזיז אותו בחופשיות... פשוט תמקם את הפאנלים בשכבה
// העליונה" (every panel that opens should be freely draggable, just keep them on the top layer).
// `controlled`, when passed, makes the offset a fully controlled value owned by the CALLER instead
// of this hook's own internal state — used for the "עריכת תמונה" panel specifically, whose drag
// position needs to survive this whole editor remounting on every page switch (see the parent's own
// comment near sidePanelDrag), something a plain useState here could never do since it resets on
// every fresh mount. The resetKey/trackedKey dance below is skipped entirely while controlled (the
// caller owns resets too); every other panel (uncontrolled) keeps its original behavior unchanged.
function useDraggablePanelOffset(
  resetKey: string | null,
  clampOffset?: (offset: { x: number; y: number }) => { x: number; y: number },
  controlled?: { offset: { x: number; y: number }; onChange: (offset: { x: number; y: number }) => void }
) {
  const [internalOffset, setInternalOffset] = useState({ x: 0, y: 0 });
  const [trackedKey, setTrackedKey] = useState(resetKey);
  if (!controlled && resetKey !== trackedKey) {
    setTrackedKey(resetKey);
    setInternalOffset({ x: 0, y: 0 });
  }
  const offset = controlled ? controlled.offset : internalOffset;
  const setOffset = controlled ? controlled.onChange : setInternalOffset;
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  // Exposed so the panel can turn OFF its own open/close CSS transition on the same `transform`
  // property while a real drag is in progress — without this, every pointermove during a drag was
  // fighting a 220ms eased transition on `transform`, so the panel visibly lagged/rubber-banded
  // behind the cursor instead of tracking it 1:1. Per explicit complaint: "שהתנועה תהיה חלקה" (the
  // movement should be smooth).
  const [isDragging, setIsDragging] = useState(false);

  // preventDefault on both down and move — without it, dragging the grip across the page still
  // kicks off the browser's own native text-selection-drag (since the grip sits outside the
  // canvas's `select-none`), highlighting whatever text the cursor passes over while the panel
  // moves. stopPropagation alone (the original code) doesn't suppress that; preventDefault does.
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: offset.x, startY: offset.y };
    setIsDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const raw = {
      x: dragRef.current.startX + (e.clientX - dragRef.current.startClientX),
      y: dragRef.current.startY + (e.clientY - dragRef.current.startClientY),
    };
    setOffset(clampOffset ? clampOffset(raw) : raw);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = null;
    setIsDragging(false);
  };

  return { offset, isDragging, gripHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}

// The small grabbable strip every draggable panel renders at its own top edge — a dedicated grip
// rather than making the whole panel draggable so it never steals a click/drag meant for one of
// the panel's own sliders or buttons. Deliberately loud (solid accent color, a real 4-way move
// icon, not just a subtle gray bar) per explicit request: "אפשרות התזוזה שתהיה בולטת עם צבע וסימן
// שימחיש שאפשר להזיז את הפאנל" (the move option should be prominent, with a color and a mark that
// conveys the panel can be moved) — a previous, more understated version read as pure decoration
// rather than an obviously-interactive control.
function PanelDragGrip({ handlers }: { handlers: ReturnType<typeof useDraggablePanelOffset>["gripHandlers"] }) {
  return (
    <div
      {...handlers}
      title="גררו כדי להזיז את הפאנל"
      className="flex items-center justify-center gap-1 h-5 -mt-0.5 -mx-0.5 mb-0.5 rounded-t-lg cursor-grab active:cursor-grabbing touch-none"
      style={{ background: "var(--color-amber-deep)", userSelect: "none", WebkitUserSelect: "none" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5 9 2 12 5 15" />
        <polyline points="9 5 12 2 15 5" />
        <polyline points="15 19 12 22 9 19" />
        <polyline points="19 9 22 12 19 15" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
      <span className="text-[8px] font-bold text-white">גררו להזזה</span>
    </div>
  );
}

// A user-resizable panel size, layered on top of a fixed default (widthPx/heightPx) via a
// bottom-right-corner handle — dragging it grows/shrinks the panel freely on both axes at once.
// Deliberately does NOT reset per element selection (unlike useDraggablePanelOffset's offset):
// per explicit request the panel should be "באותו הגודל" (the same size) every time, so once a
// photographer resizes it, that becomes the new standing default for every subsequent photo too,
// not just the one they were resizing for.
function useResizablePanelSize(defaultWidthPx: number, defaultHeightPx: number) {
  const [override, setOverride] = useState<{ width: number; height: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startWidth: number; startHeight: number } | null>(null);
  const MIN_SIZE_PX = 70;

  const width = override?.width ?? defaultWidthPx;
  const height = override?.height ?? defaultHeightPx;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startWidth: width, startHeight: height };
    setIsResizing(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setOverride({
      width: Math.max(MIN_SIZE_PX, dragRef.current.startWidth + (e.clientX - dragRef.current.startClientX)),
      height: Math.max(MIN_SIZE_PX, dragRef.current.startHeight + (e.clientY - dragRef.current.startClientY)),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = null;
    setIsResizing(false);
  };

  return { width, height, isResizing, resizeHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}

// The small corner handle that drives useResizablePanelSize — bottom-right, matching the panel's
// top-left anchor (its `top`/`left` position is fixed, see the caller) so growing the box always
// extends AWAY from the anchor (rightward + downward), never fighting the fixed position.
function PanelResizeHandle({ handlers }: { handlers: ReturnType<typeof useResizablePanelSize>["resizeHandlers"] }) {
  return (
    <div
      {...handlers}
      title="גררו כדי לשנות את גודל הפאנל"
      className="absolute -bottom-1 -right-1 h-4 w-4 flex items-end justify-end cursor-nwse-resize touch-none"
    >
      <svg width="12" height="12" viewBox="0 0 24 24">
        <circle cx="19" cy="19" r="2" fill="var(--color-amber-deep)" />
        <circle cx="19" cy="12" r="2" fill="var(--color-amber-deep)" />
        <circle cx="12" cy="19" r="2" fill="var(--color-amber-deep)" />
      </svg>
    </div>
  );
}

// A vertical strip of circular controls that floats beside the selected photo — deliberately
// rendered outside the canvas's own overflow-hidden ancestor (see the wrapping <div> around
// canvasRef in the main component) so it, and the flyout sliders it opens, can bleed past the
// photo's own frame instead of getting cropped by it.
function PhotoFloatingMenu({
  el,
  positionStyle,
  menuRef,
  panning,
  onTogglePan,
  onUpdate,
  onTrueSize,
  onApplyShadowToAll,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
  buttonScale = 1,
  dragOffset,
  dragGripHandlers,
  shadowPanelOpen,
  onToggleShadowPanel,
  photoAdjustPanelOpen,
  onTogglePhotoAdjustPanel,
}: {
  el: AlbumPhotoElement;
  // Computed by photoMenuPositionStyle() from the group's own topmost-selected photo, not
  // necessarily this same `el` — see that function's comment for the full anchor/flip/clamp logic.
  positionStyle: React.CSSProperties;
  // The parent measures this root div's real rendered height (phone only) to clamp the position
  // precisely against the green frame — see the parent's own menuHeightPct comment.
  menuRef?: React.Ref<HTMLDivElement>;
  panning: boolean;
  onTogglePan: () => void;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  onTrueSize: () => void;
  onApplyShadowToAll: () => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  // Passed through to every CircleButton below — see CircleButton's own comment (menuButtonScale
  // in the parent editor).
  buttonScale?: number;
  // Free drag-anywhere offset, layered on top of the computed positionStyle via `transform` — see
  // useDraggablePanelOffset's own comment.
  dragOffset: { x: number; y: number };
  dragGripHandlers: ReturnType<typeof useDraggablePanelOffset>["gripHandlers"];
  // Whether the shadow/border sliders are showing — lifted to the parent since, per explicit
  // request, that panel no longer renders as a small flyout attached to this button (see
  // PhotoShadowOverlayPanel's own comment) but as a layer positioned over the "עריכת תמונה" panel
  // instead, which the parent owns.
  shadowPanelOpen: boolean;
  onToggleShadowPanel: () => void;
  // Whether the "עריכת תמונה" color/tone adjustments panel is showing — per explicit request, that
  // panel no longer opens automatically the moment a photo is selected; this top circle button now
  // opens/closes it manually instead, same lifted-to-the-parent pattern as shadowPanelOpen above.
  photoAdjustPanelOpen: boolean;
  onTogglePhotoAdjustPanel: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<null | "opacity" | "blur" | "rotation">(null);
  // Always pinned to the photo's own right edge (screen-right — el.xPct/widthPct are plain
  // left-to-right canvas percentages regardless of the app's RTL text direction) and following it
  // as it's dragged, per explicit request — it used to flip to the photo's left edge once the
  // photo got close to the canvas's right edge, which felt inconsistent/unpredictable.
  const side: "left" | "right" = "right";
  const rotationDeg = Math.round((((el.rotation ?? 0) % 360) + 360) % 360);
  const toggle = (panel: typeof openPanel) => setOpenPanel((p) => (p === panel ? null : panel));

  return (
    <div
      ref={menuRef}
      className="absolute z-20 flex flex-col gap-0.5"
      style={{
        ...positionStyle,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <PanelDragGrip handlers={dragGripHandlers} />
      <CircleButton scale={buttonScale} label="עריכת תמונה — חשיפה, ניגודיות, איזון לבן ועוד" active={photoAdjustPanelOpen} onClick={onTogglePhotoAdjustPanel}>
        <IconAdjust />
      </CircleButton>
      <CircleButton scale={buttonScale} label="שחור-לבן" active={el.filter === "bw"} onClick={() => onUpdate({ filter: el.filter === "bw" ? "none" : "bw" })}>
        <IconBW />
      </CircleButton>
      <CircleButton scale={buttonScale} label="גווני ספיה" active={el.filter === "sepia"} onClick={() => onUpdate({ filter: el.filter === "sepia" ? "none" : "sepia" })}>
        <IconSepia />
      </CircleButton>
      {/* The old flyout here had one button, "מרכז תמונה" (center the photo) — dropped per explicit
          request: a double-click on the photo now centers it directly (see the canvas's own
          onDoubleClick), so this button was pure redundancy. The circle's own active state (below)
          is enough of a marker that pan mode is on — no extra label/panel needed. */}
      <CircleButton scale={buttonScale} label="מיקום התמונה במסגרת — גררו את התמונה כדי למקם אותה, או לחצו פעמיים על התמונה כדי למרכז" active={panning} onClick={onTogglePan}>
        <IconFocal />
      </CircleButton>
      <CircleButton scale={buttonScale} label="הצגה בגודל נכון — מתאים את המסגרת ליחס הרוחב/גובה האמיתי של התמונה" onClick={onTrueSize}>
        <IconTrueSize />
      </CircleButton>
      <CircleButton scale={buttonScale}
        label="שמירת יחס גובה-רוחב בשינוי גודל מהפינות"
        active={!!el.lockAspect}
        onClick={() => onUpdate({ lockAspect: !el.lockAspect })}
      >
        <IconAspectLock />
      </CircleButton>
      <CircleButton
        scale={buttonScale}
        label={el.locked ? "נעולה — לחצו לשחרור המיקום והגודל" : "נעילת מיקום וגודל"}
        active={!!el.locked}
        onClick={() => onUpdate({ locked: !el.locked })}
      >
        <IconLock />
      </CircleButton>
      <div className="relative">
        <CircleButton scale={buttonScale} label="שקיפות" active={openPanel === "opacity" || (el.opacity ?? 100) < 100} onClick={() => toggle("opacity")}>
          <IconOpacity />
        </CircleButton>
        {openPanel === "opacity" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton scale={buttonScale} label="טשטוש" active={openPanel === "blur" || !!el.blur} onClick={() => toggle("blur")}>
          <IconBlur />
        </CircleButton>
        {openPanel === "blur" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="טשטוש (Blur)" value={el.blur ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ blur: v })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton scale={buttonScale} label="סיבוב" active={openPanel === "rotation" || !!el.rotation} onClick={() => toggle("rotation")}>
          <IconRotate />
        </CircleButton>
        {openPanel === "rotation" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="סיבוב" value={rotationDeg} min={0} max={360} unit="°" onChange={(deg) => onUpdate({ rotation: deg })} />
          </FlyoutPanel>
        )}
      </div>
      <CircleButton scale={buttonScale} label="צל וקו מתאר" active={shadowPanelOpen || !!el.shadow || !!el.borderWidth} onClick={onToggleShadowPanel}>
        <IconShadow />
      </CircleButton>
      <CircleButton scale={buttonScale} label="קדימה — לשכבה העליונה" onClick={onBringToFront}>
        <IconToFront />
      </CircleButton>
      <CircleButton scale={buttonScale} label="אחורה — לשכבה התחתונה" onClick={onSendToBack}>
        <IconToBack />
      </CircleButton>
      <CircleButton scale={buttonScale} label="מחיקת התמונה/ות שנבחרו" danger onClick={onDeleteSelected}>
        <IconX />
      </CircleButton>
    </div>
  );
}

// The shadow/border-outline controls used to be a small flyout attached directly to the circle
// menu's own "צל" button (like opacity/blur/rotation still are) — per explicit request, moved out
// to render as its own layer positioned exactly over the "עריכת תמונה" panel instead (see the
// parent's own photoShadowPanelOpen), since that flyout's 4-5 controls were the single biggest
// contributor to the circle menu needing to scroll or shrink. This panel disappears the moment the
// photo is deselected (the parent resets photoShadowPanelOpen whenever the anchor photo changes),
// and reopens fresh — not still open — the next time the shadow button is clicked.
function PhotoShadowOverlayPanel({
  el,
  onUpdate,
  onApplyShadowToAll,
  widthPx,
}: {
  el: AlbumPhotoElement;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  onApplyShadowToAll: () => void;
  widthPx: number;
}) {
  // The מרחק/טשטוש (distance/blur) sliders' displayed value falls back to `el.shadow` (the עוצמה
  // slider) while unset — needed so an existing shadow that predates these two fields still shows
  // a sensible starting point instead of 0. But left purely reactive, that fallback also made
  // dragging עוצמה visually drag distance/blur's thumbs right along with it (their displayed value
  // is literally `el.shadow` until touched) — read as "the sliders don't move independently," per
  // explicit correction. Fixed by materializing both into real, independent stored values the
  // MOMENT a shadow first becomes active (0 → positive) for this photo, so from that single tick
  // onward all three are backed by separate fields and cannot move each other again; further
  // increases/decreases of עוצמה alone (without a 0→positive transition) never re-trigger this.
  const shadowActiveTrackRef = useRef<{ id: string; wasActive: boolean } | null>(null);
  useEffect(() => {
    const isActive = !!el.shadow;
    const prev = shadowActiveTrackRef.current;
    const justActivated = !prev || prev.id !== el.id ? isActive : isActive && !prev.wasActive;
    if (justActivated && (el.shadowDistance === undefined || el.shadowBlur === undefined)) {
      onUpdate({ shadowDistance: el.shadowDistance ?? el.shadow, shadowBlur: el.shadowBlur ?? el.shadow });
    }
    shadowActiveTrackRef.current = { id: el.id, wasActive: isActive };
  }, [el.id, el.shadow, el.shadowDistance, el.shadowBlur, onUpdate]);

  return (
    <div
      className="rounded-xl border border-line bg-white shadow-sheet p-3 space-y-2.5"
      style={{ width: widthPx, boxShadow: "0 4px 16px rgba(46,49,66,0.3)" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-bold">צל וקו מתאר</p>
      <MiniSlider label="עוצמת צל" value={el.shadow ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ shadow: v })} />
      {!!el.shadow && (
        <>
          <MiniSlider
            label="מרחק צל"
            value={el.shadowDistance ?? el.shadow ?? 0}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onUpdate({ shadowDistance: v })}
          />
          <MiniSlider
            label="טשטוש צל"
            value={el.shadowBlur ?? el.shadow ?? 0}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onUpdate({ shadowBlur: v })}
          />
          <MiniSlider
            label="זווית צל"
            value={el.shadowAngle ?? 45}
            min={0}
            max={360}
            unit="°"
            onChange={(v) => onUpdate({ shadowAngle: v })}
          />
        </>
      )}
      <MiniSlider label="קו מתאר" value={el.borderWidth ?? 0} min={0} max={50} unit="px" onChange={(v) => onUpdate({ borderWidth: v })} />
      {!!el.borderWidth && (
        <div className="flex items-center gap-1.5">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ borderColor: c })}
              className="h-5 w-5 rounded-full"
              style={{ background: c, boxShadow: (el.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      )}
      <button onClick={onApplyShadowToAll} className="w-full rounded-lg py-1.5 text-[10px] font-semibold bg-chip text-ink-soft">
        החל על כל התמונות בדף
      </button>
    </div>
  );
}

// Color + opacity + rotation are ALWAYS visible here (not behind a per-control toggle click like
// the photo menu's flyouts) — an ornament has far fewer controls than a photo, and hiding them
// behind an extra click read as "nothing happened" the first time someone selected one.
function OrnamentFloatingMenu({
  el,
  onUpdate,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
}: {
  el: AlbumOrnamentElement;
  onUpdate: (patch: Partial<AlbumOrnamentElement>) => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}) {
  const rotationDeg = Math.round((((el.rotation ?? 0) % 360) + 360) % 360);
  return (
    <div
      className="w-[150px] rounded-xl border border-line bg-white p-2.5 shadow-sheet space-y-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {el.customOrnamentId && (
          <button
            onClick={() => onUpdate({ color: undefined })}
            title="צבע מקורי"
            className="h-6 w-6 rounded-full bg-[linear-gradient(45deg,#ddd_25%,transparent_25%,transparent_75%,#ddd_75%),linear-gradient(45deg,#ddd_25%,transparent_25%,transparent_75%,#ddd_75%)] bg-white"
            style={{
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
              boxShadow: !el.color ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        )}
        {TEXT_COLOR_PALETTE.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdate({ color: value })}
            title={label}
            className="h-6 w-6 rounded-full"
            style={{
              background: value,
              boxShadow: (el.customOrnamentId ? el.color : el.color ?? "#2e3142") === value ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        ))}
      </div>
      <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
      {/* el.shadow already flows all the way through every renderer (live canvas, thumbnail, JPG/
          PSD/PDF raster) exactly like a photo's/shape's shadow does — these sliders were simply
          missing, so there was no way to actually set it from the UI despite full render support
          existing. */}
      <MiniSlider label="עוצמת צל" value={el.shadow ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ shadow: v })} />
      {!!el.shadow && (
        <MiniSlider label="זווית צל" value={el.shadowAngle ?? 45} min={0} max={360} unit="°" onChange={(v) => onUpdate({ shadowAngle: v })} />
      )}
      <MiniSlider label="קו מתאר" value={el.borderWidth ?? 0} min={0} max={50} unit="px" onChange={(v) => onUpdate({ borderWidth: v })} />
      {!!el.borderWidth && (
        <div className="flex items-center gap-1.5">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ borderColor: c })}
              className="h-5 w-5 rounded-full"
              style={{ background: c, boxShadow: (el.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button onClick={onBringToFront} title="קדימה — לשכבה העליונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToFront />
        </button>
        <button onClick={onSendToBack} title="אחורה — לשכבה התחתונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToBack />
        </button>
        <button
          onClick={() => onUpdate({ locked: !el.locked })}
          title={el.locked ? "נעול — לחצו לשחרור" : "נעילת מיקום וגודל"}
          className="flex-1 h-7 rounded-lg flex items-center justify-center"
          style={{ background: el.locked ? "var(--color-amber-deep)" : "var(--color-chip)", color: el.locked ? "#fff" : "var(--color-ink-soft)" }}
        >
          <IconLock />
        </button>
        <button onClick={onDeleteSelected} title="מחיקה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-rose">
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

// Same always-visible pattern as OrnamentFloatingMenu above, plus a "מסכה" button — a shape can
// have any of the same 50 masks a photo can, applied via the masks picker panel (opened here,
// anchored to this button, sharing that same panel/state with the photo/sidebar entry points).
// 96dpi's standard px-per-cm — used only to give the line-thickness slider a friendly "px" unit;
// the underlying stored value is still heightPct like every other shape, so it exports/prints at
// whatever the real page resolution is, same as everything else in this editor.
const PX_PER_CM = 96 / 2.54;

function ShapeFloatingMenu({
  el,
  albumHeightCm,
  onUpdate,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
}: {
  el: AlbumShapeElement;
  albumHeightCm: number;
  onUpdate: (patch: Partial<AlbumShapeElement>) => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}) {
  const isLine = el.shapeStyle === "line";
  const linePx = Math.max(1, Math.min(100, Math.round((el.heightPct / 100) * albumHeightCm * PX_PER_CM)));
  return (
    <div
      className="w-[150px] rounded-xl border border-line bg-white p-2.5 shadow-sheet space-y-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {TEXT_COLOR_PALETTE.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdate({ color: value })}
            title={label}
            className="h-6 w-6 rounded-full"
            style={{
              background: value,
              boxShadow: el.color === value ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        ))}
      </div>
      {/* No per-shape "change mask" trigger here anymore — the main מסכות sidebar button already
          opens the exact same picker for whatever shape/photo is currently selected, so this was a
          redundant second entry point into the identical panel. */}
      {isLine && (
        <MiniSlider
          label="עובי הקו"
          value={linePx}
          min={1}
          max={100}
          unit="px"
          onChange={(px) => {
            // Keeps the line's vertical center fixed while its thickness (heightPct) changes —
            // same recentering the resize handles already do — so nudging this slider doesn't
            // also silently drift the line's position.
            const newHeightPct = albumHeightCm > 0 ? (px / PX_PER_CM / albumHeightCm) * 100 : el.heightPct;
            const centerY = el.yPct + el.heightPct / 2;
            onUpdate({ heightPct: newHeightPct, yPct: centerY - newHeightPct / 2 });
          }}
        />
      )}
      <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
      {/* el.shadow already flows all the way through every renderer (live canvas, thumbnail, JPG/
          PSD/PDF raster) exactly like a photo's shadow does — this slider was simply missing, so
          there was no way to actually set it from the UI despite full render support existing. */}
      <MiniSlider label="עוצמת צל" value={el.shadow ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ shadow: v })} />
      {!!el.shadow && (
        <MiniSlider label="זווית צל" value={el.shadowAngle ?? 45} min={0} max={360} unit="°" onChange={(v) => onUpdate({ shadowAngle: v })} />
      )}
      <MiniSlider label="קו מתאר" value={el.borderWidth ?? 0} min={0} max={50} unit="px" onChange={(v) => onUpdate({ borderWidth: v })} />
      {!!el.borderWidth && (
        <div className="flex items-center gap-1.5">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ borderColor: c })}
              className="h-5 w-5 rounded-full"
              style={{ background: c, boxShadow: (el.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button onClick={onBringToFront} title="קדימה — לשכבה העליונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToFront />
        </button>
        <button onClick={onSendToBack} title="אחורה — לשכבה התחתונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToBack />
        </button>
        <button
          onClick={() => onUpdate({ locked: !el.locked })}
          title={el.locked ? "נעול — לחצו לשחרור" : "נעילת מיקום וגודל"}
          className="flex-1 h-7 rounded-lg flex items-center justify-center"
          style={{ background: el.locked ? "var(--color-amber-deep)" : "var(--color-chip)", color: el.locked ? "#fff" : "var(--color-ink-soft)" }}
        >
          <IconLock />
        </button>
        <button onClick={onDeleteSelected} title="מחיקה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-rose">
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

// A text element's box height used to stay fixed (15%) no matter what fontSize was set to — fine
// for the original default (40pt) but several real albums use much bigger display text (147pt,
// 227pt for a name spanning a whole page), where a 15%-tall box is nowhere near enough: the actual
// rendered glyphs overflow straight past the box's own bottom edge and into whatever sits below it
// on the page (often the NEXT text element, which is exactly what read as "text on top of text" —
// not a z-index/layering bug, a box that never grew with its own content). Mirrors the live CSS
// that actually sizes the rendered text (`calc(fontSize / 1600 * 100cqw)`, see the canvas render
// below) so the box this returns is derived from the exact same ratio the text is actually drawn
// at, not a separate guess. Lives in src/lib/albumTextSizing.ts (imported above), shared with every
// export renderer — see that file's own comment for why this can't be a second local copy.

// Text controls — floating side panel (same pattern as Ornament/Shape/PhotoAdjust), toggled by its
// own circle-menu "T" button now on both phone and desktop (see textPanelOpen near the top of the
// parent component for the full history — this used to be phone-only, with desktop keeping a
// separate cramped inline sidebar block that's since been removed).
function TextFloatingMenu({
  el,
  album,
  onUpdate,
  onDeleteSelected,
}: {
  el: AlbumTextElement;
  album: { width_cm: number; height_cm: number };
  onUpdate: (patch: Partial<AlbumTextElement>) => void;
  onDeleteSelected: () => void;
}) {
  return (
    <div
      className="w-[150px] rounded-xl border border-line bg-white p-2.5 shadow-sheet space-y-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {TEXT_COLOR_PALETTE.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdate({ color: value })}
            title={label}
            className="h-6 w-6 rounded-full"
            style={{
              background: value,
              boxShadow: el.color === value ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        ))}
      </div>
      <div className="flex gap-1">
        {(["right", "center", "left"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onUpdate({ align: a })}
            className="flex-1 rounded-full py-1 text-[9px] font-semibold"
            style={{
              background: el.align === a ? "var(--color-amber-deep)" : "var(--color-chip)",
              color: el.align === a ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
          </button>
        ))}
      </div>
      <select
        value={el.fontFamily ?? "heebo"}
        onChange={(e) => onUpdate({ fontFamily: e.target.value })}
        className="w-full rounded-lg px-2 py-1.5 text-[10px] font-semibold bg-white border border-line"
        style={{ fontFamily: albumFontFamilyCss(el.fontFamily) }}
      >
        <optgroup label="פונטים בעברית">
          {ALBUM_FONTS.filter((f) => f.category === "hebrew").map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
              {f.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="פונטים באנגלית">
          {ALBUM_FONTS.filter((f) => f.category === "latin").map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
              {f.label}
            </option>
          ))}
        </optgroup>
      </select>
      <MiniSlider
        label="גודל טקסט"
        value={el.fontSize}
        min={2}
        max={250}
        unit="pt"
        // heightPct grows with fontSize (see textHeightPctForFontSize's own comment) so enlarging
        // the text never pushes it past its own box into whatever sits below — never below the
        // current box either, so shrinking the text doesn't yank a manually-enlarged box back
        // down underneath it. It IS capped at MAX_TEXT_HEIGHT_OVERSIZE_RATIO× the new font size's
        // own natural height, though: a real production bug traced back to exactly the case this
        // guards against — a box saved at a much bigger font, whose font was later shrunk a lot
        // through this same slider, left a box many times taller than the now-much-smaller text
        // actually needs. Both this editor and every exporter vertically CENTER text within
        // whatever height is stored, so an oversized-enough box visibly sinks the text deep into
        // it, away from wherever it was placed — this keeps that drift bounded to something
        // unnoticeable while still leaving real, moderate manual enlargement alone.
        onChange={(v) => {
          const natural = textHeightPctForFontSize(v, album);
          onUpdate({ fontSize: v, heightPct: Math.min(Math.max(el.heightPct ?? 0, natural), natural * MAX_TEXT_HEIGHT_OVERSIZE_RATIO) });
        }}
      />
      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdate({ locked: !el.locked })}
          className="flex-1 h-7 rounded-lg text-[10px] font-semibold"
          style={{ background: el.locked ? "var(--color-amber-deep)" : "var(--color-chip)", color: el.locked ? "#fff" : "var(--color-ink-soft)" }}
        >
          {el.locked ? "נעול" : "נעילה"}
        </button>
        <button onClick={onDeleteSelected} className="flex-1 h-7 rounded-lg bg-chip text-rose text-[10px] font-semibold">
          מחיקה
        </button>
      </div>
    </div>
  );
}

// A small section label for the adjustments panel below — purely visual grouping (WB/Tone/Presence),
// matching how every serious photo editor groups these same controls, not a functional divider.
function AdjustSectionLabel({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <p className={`font-bold text-ink-soft uppercase tracking-wide first:pt-0 ${compact ? "text-[7px] pt-0.5" : "text-[10px] pt-1"}`}>
      {children}
    </p>
  );
}

// Opens for one or more selected photos (broadcasts to the whole selection, same as the circular
// menu's own opacity/rotation/etc controls) — a plain object of small numeric sliders in the same
// visual language as OrnamentFloatingMenu/ShapeFloatingMenu above, just a bit wider since there are
// more controls to fit per row. See albumAdjustments.ts for what each slider actually does to the
// pixels, and why Texture/Clarity/Dehaze aren't here.
function PhotoAdjustFloatingMenu({
  el,
  onUpdate,
  compact = false,
  maxHeightPx,
  widthPx,
}: {
  el: AlbumPhotoElement;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  // Phone only — at least half the desktop width, per explicit request. Real smaller dimensions
  // (not a `zoom`/`transform: scale()` shrink) on purpose: these sliders are actively dragged, not
  // just tapped, and this session already found that a live-scaled interactive control is exactly
  // the class of element that can end up with its touch position wrong on a real device.
  compact?: boolean;
  // Phone only — caps the panel to (green frame height − 3cm), i.e. ~1.5cm of clearance above and
  // below the frame's own top/bottom, per explicit request. `overflow-y: auto` is a pure safety net
  // so a very tall menu still stays fully reachable rather than silently clipping controls.
  maxHeightPx?: number;
  // A physical width (converted to px by the caller, matching the selected photo's own frame
  // width) that overrides the w-[105px]/w-[280px] Tailwind default below, so the panel's real-world
  // size always matches the photo it's editing.
  widthPx?: number;
}) {
  const hasAny = hasAdjustments(el);
  return (
    <div
      // Widened from 210 to 280 (non-compact) per explicit request — a maxHeight cap alone can be
      // invisible when the content already fits inside it without scrolling, so this widens the
      // panel itself, a change that's visible unconditionally regardless of content height.
      className={`rounded-xl border border-line bg-white shadow-sheet ${widthPx != null ? "" : compact ? "w-[105px]" : "w-[280px]"} ${compact ? "p-1.5 space-y-0.5" : "p-3 space-y-2.5"}`}
      style={{ ...(widthPx != null ? { width: `${widthPx}px` } : null), ...(maxHeightPx != null ? { maxHeight: `${maxHeightPx}px`, overflowY: "auto" as const } : null) }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className={compact ? "text-[9px] font-bold" : "text-xs font-bold"}>עריכת תמונה</p>
        {hasAny && (
          <button
            onClick={() =>
              onUpdate({
                exposure: 0,
                contrast: 0,
                highlights: 0,
                shadows2: 0,
                whites: 0,
                blacks: 0,
                temp: 0,
                tint: 0,
                vibrance: 0,
                saturation2: 0,
                sharpness: 0,
              })
            }
            className={`font-semibold text-ink-soft underline ${compact ? "text-[8px]" : "text-[10px]"}`}
          >
            איפוס
          </button>
        )}
      </div>
      <AdjustSectionLabel compact={compact}>איזון לבן</AdjustSectionLabel>
      <MiniSlider compact={compact} label="חום" value={el.temp ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ temp: v })} />
      <MiniSlider compact={compact} label="גוון" value={el.tint ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ tint: v })} />
      <AdjustSectionLabel compact={compact}>גוונים</AdjustSectionLabel>
      <MiniSlider compact={compact} label="חשיפה" value={el.exposure ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ exposure: v })} />
      <MiniSlider compact={compact} label="ניגודיות" value={el.contrast ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ contrast: v })} />
      <MiniSlider compact={compact} label="אורות גבוהים" value={el.highlights ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ highlights: v })} />
      <MiniSlider compact={compact} label="צללים" value={el.shadows2 ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ shadows2: v })} />
      <MiniSlider compact={compact} label="לבנים" value={el.whites ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ whites: v })} />
      <MiniSlider compact={compact} label="שחורים" value={el.blacks ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ blacks: v })} />
      <AdjustSectionLabel compact={compact}>עוצמת צבע</AdjustSectionLabel>
      <MiniSlider compact={compact} label="עוצמה" value={el.vibrance ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ vibrance: v })} />
      <MiniSlider compact={compact} label="רוויה" value={el.saturation2 ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ saturation2: v })} />
      <AdjustSectionLabel compact={compact}>פירוט</AdjustSectionLabel>
      <MiniSlider compact={compact} label="חידוד" value={el.sharpness ?? 0} min={0} max={100} onChange={(v) => onUpdate({ sharpness: v })} />
    </div>
  );
}

// The print-safe margin is a hard constraint for anything placed AUTOMATICALLY (templates, the
// multi-photo auto-layout) — every frame designed on a nominal 0-100 full-bleed canvas gets
// linearly rescaled into the album's actual safe-print box, so no automatically-generated layout
// can ever cross the green line regardless of which album size it's applied to. Manual dragging is
// deliberately NOT clamped by this — a photographer can always drag a photo past the margin on
// purpose; only automatic placement is constrained.
export function marginInsetPctFor(album: { width_cm: number; height_cm: number; safe_margin_cm?: number }): { x: number; y: number } | null {
  const marginCm = album.safe_margin_cm ?? 0.5;
  return album.width_cm > 0 && album.height_cm > 0 ? { x: (marginCm / album.width_cm) * 100, y: (marginCm / album.height_cm) * 100 } : null;
}

export function fitFramesToSafeArea(frames: AlbumFrame[], marginInsetPct: { x: number; y: number } | null): AlbumFrame[] {
  if (!marginInsetPct) return frames;
  const { x: mx, y: my } = marginInsetPct;
  const safeWidth = 100 - 2 * mx;
  const safeHeight = 100 - 2 * my;
  if (safeWidth <= 0 || safeHeight <= 0) return frames;
  return frames.map((f) => ({
    ...f,
    xPct: mx + (f.xPct / 100) * safeWidth,
    yPct: my + (f.yPct / 100) * safeHeight,
    widthPct: (f.widthPct / 100) * safeWidth,
    heightPct: (f.heightPct / 100) * safeHeight,
  }));
}

// The photo the circular floating menu's vertical position is measured against: the topmost
// selected photo, so the menu never drifts down to wherever the LAST-clicked photo happens to sit.
// "Topmost" ties (multiple photos landing within a hair of the same top edge) break toward whichever
// sits furthest right, matching how a photographer's eye reads the group left-to-right in this
// right-to-left tool.
const MENU_ANCHOR_TIE_EPS_PCT = 1;
function pickMenuAnchorPhoto(photos: AlbumPhotoElement[]): AlbumPhotoElement | null {
  if (photos.length === 0) return null;
  const minY = Math.min(...photos.map((p) => p.yPct));
  const topCandidates = photos.filter((p) => p.yPct <= minY + MENU_ANCHOR_TIE_EPS_PCT);
  return topCandidates.reduce((best, p) => (p.xPct + p.widthPct > best.xPct + best.widthPct ? p : best), topCandidates[0]);
}

// Normally the menu hangs from the anchor photo's own top edge, bounded below by the green
// print-safe frame's bottom edge. But a photo sitting on or near that bottom edge leaves no room to
// hang the menu down from — so once any selected photo's own bottom edge comes within
// FLIP_TRIGGER_CM of the frame's bottom, the menu flips: it hangs UP from the anchor's own bottom
// edge instead, with the frame's top edge as its ceiling.
//
// The menu's FAR edge is first clamped to the SELECTED PHOTO's own top/bottom edge (not the green
// frame) — with PHOTO_BOUND_SLACK_CM of allowed overflow past that edge, per explicit request.
// menuHeightPct is the menu's own actually-rendered height (measured via a ref, not guessed), so
// this clamp is exact regardless of how many buttons happen to be in it. The flip TRIGGER itself
// (below) is intentionally still measured against the frame's bottom — that decision is about
// whether there's room in the frame to hang the menu down at all, a separate question from how big
// the menu's own box is once a direction is picked.
// On TOP of that photo-relative clamp, a hard CANVAS-relative clamp always applies too (on every
// viewport, not just phone/tablet) — per explicit request, the menu's own top and bottom edges must
// never cross the canvas's own top (0%) / bottom (100%) boundary, no matter where the anchor photo
// itself sits (a photo near the very top/bottom edge could otherwise still let the photo-relative
// clamp above push the menu off the canvas entirely).
const FLIP_TRIGGER_CM = 3;
const PHOTO_BOUND_SLACK_CM = 1;
function photoMenuPositionStyle(
  selectedPhotos: AlbumPhotoElement[],
  anchor: AlbumPhotoElement,
  album: { height_cm: number },
  marginInsetPct: { x: number; y: number } | null,
  menuHeightPct: number | null
): React.CSSProperties {
  const heightCm = album.height_cm > 0 ? album.height_cm : 1;
  const frameTopPct = marginInsetPct?.y ?? 0;
  const frameBottomPct = 100 - frameTopPct;
  const slackPct = (PHOTO_BOUND_SLACK_CM / heightCm) * 100;
  const photoTopPct = anchor.yPct;
  const photoBottomPct = anchor.yPct + anchor.heightPct;

  const bottomDistancesCm = selectedPhotos.map((p) => ((frameBottomPct - (p.yPct + p.heightPct)) / 100) * heightCm);
  const shouldFlip = bottomDistancesCm.length > 0 && Math.min(...bottomDistancesCm) < FLIP_TRIGGER_CM;

  if (shouldFlip) {
    let bottomPct = 100 - photoBottomPct;
    if (menuHeightPct != null) {
      // The menu's far (top) edge, once flipped, sits at (100 - bottomPct - menuHeightPct) from the
      // page top — clamp bottomPct so it never rises above the anchor photo's own top edge (plus slack).
      const maxBottomPct = 100 - (photoTopPct - slackPct) - menuHeightPct;
      bottomPct = Math.min(bottomPct, maxBottomPct);
      // Hard canvas-bound safety clamp (see this function's own comment above) — keeps both of the
      // menu's edges within [0, 100] regardless of where the photo-relative clamp above landed it.
      bottomPct = Math.max(0, Math.min(bottomPct, 100 - menuHeightPct));
    }
    return { top: "auto", bottom: `${bottomPct}%` };
  }

  let topPct = photoTopPct;
  if (menuHeightPct != null) {
    const maxTopPct = photoBottomPct + slackPct - menuHeightPct;
    topPct = Math.min(topPct, maxTopPct);
    // Hard canvas-bound safety clamp — see this function's own comment above.
    topPct = Math.max(0, Math.min(topPct, 100 - menuHeightPct));
  }
  return { top: `${topPct}%`, bottom: "auto" };
}

// Anchored flyout panels (masks/ornaments/shapes) open below their trigger button, which can sit
// anywhere down a tall, independently-scrollable sidebar — a fixed `max-h-[65vh]` from the panel's
// OWN top clips its bottom items whenever the trigger itself is already low on screen (65vh past a
// low top easily exceeds the viewport). This computes the max height from actual remaining space
// below the anchor instead, so the panel's own scrollbar — not the viewport edge — is what limits
// how much of it you can reach.
function panelMaxHeight(anchorTopPx: number): number {
  return Math.max(160, window.innerHeight - anchorTopPx - 20);
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

// Resizes a frame from any of its 8 handles, anchored at the OPPOSITE edge/corner (dragging the
// top-left corner keeps the bottom-right fixed, dragging the right edge keeps the left edge
// fixed, etc). widthPct/heightPct are both percentages of the same canvas box, so keeping their
// ratio constant while aspect-locked also keeps the true on-screen aspect ratio constant — no
// canvas-aspect correction needed since both axes scale by the same "% to px" factor.
function computeResize(
  handle: ResizeHandle,
  start: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  dxPct: number,
  dyPct: number,
  lockAspect: boolean,
  // Outline-only shapes (rect-outline/circle-outline/line) are explicitly allowed to be dragged
  // past the page's own edges — they're stroke/line decorations that photographers sometimes want
  // to bleed off the page on purpose, unlike a photo or a filled shape where that would just be a
  // mistake. Skips the 0..100 clamp entirely for these; MIN_W/MIN_H still apply either way.
  allowOverflow = false,
  // Alt-held resize — per explicit request, grows/shrinks symmetrically from the element's own
  // ORIGINAL center on whichever axis is actually being dragged, instead of the normal "opposite
  // edge stays fixed" behavior: dragging the top edge with Alt held moves the bottom edge outward
  // by the same amount at the same time (and mirrors for every other handle/axis), rather than only
  // moving the one edge the cursor is on. Doubling the delta on that axis while re-centering on the
  // start box's own center achieves exactly that — both edges move by the raw cursor delta each,
  // simultaneously.
  symmetric = false
): { xPct: number; yPct: number; widthPct: number; heightPct: number } {
  const MIN_W = 8;
  const MIN_H = 6;
  const h: "w" | "e" | "" = handle.includes("w") ? "w" : handle.includes("e") ? "e" : "";
  const v: "n" | "s" | "" = handle.includes("n") ? "n" : handle.includes("s") ? "s" : "";
  const isCorner = h !== "" && v !== "";
  const symMult = symmetric ? 2 : 1;

  let newWidth = start.widthPct;
  let newHeight = start.heightPct;
  if (h === "e") newWidth = start.widthPct + dxPct * symMult;
  else if (h === "w") newWidth = start.widthPct - dxPct * symMult;
  if (v === "s") newHeight = start.heightPct + dyPct * symMult;
  else if (v === "n") newHeight = start.heightPct - dyPct * symMult;

  if (lockAspect && isCorner && start.widthPct > 0 && start.heightPct > 0) {
    const ratio = start.widthPct / start.heightPct;
    const scaleW = Math.abs(newWidth / start.widthPct - 1);
    const scaleH = Math.abs(newHeight / start.heightPct - 1);
    if (scaleW >= scaleH) newHeight = newWidth / ratio;
    else newWidth = newHeight * ratio;
  }

  newWidth = Math.max(MIN_W, newWidth);
  newHeight = Math.max(MIN_H, newHeight);

  let newLeft: number;
  let newTop: number;
  if (symmetric) {
    const startCenterX = start.xPct + start.widthPct / 2;
    const startCenterY = start.yPct + start.heightPct / 2;
    newLeft = h !== "" ? startCenterX - newWidth / 2 : start.xPct;
    newTop = v !== "" ? startCenterY - newHeight / 2 : start.yPct;
  } else {
    newLeft = h === "w" ? start.xPct + start.widthPct - newWidth : start.xPct;
    newTop = v === "n" ? start.yPct + start.heightPct - newHeight : start.yPct;
  }

  if (allowOverflow) {
    return { xPct: newLeft, yPct: newTop, widthPct: newWidth, heightPct: newHeight };
  }

  const clampedLeft = Math.max(0, Math.min(newLeft, 100 - newWidth));
  const clampedTop = Math.max(0, Math.min(newTop, 100 - newHeight));
  const clampedWidth = Math.min(newWidth, 100 - clampedLeft);
  const clampedHeight = Math.min(newHeight, 100 - clampedTop);

  return { xPct: clampedLeft, yPct: clampedTop, widthPct: clampedWidth, heightPct: clampedHeight };
}

const RESIZE_HANDLE_CURSORS: Record<ResizeHandle, string> = {
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
};

// One handle per edge/corner so the whole frame boundary is grabbable, not just one corner —
// every handle stays fully inside the box (never straddling its edge) since the parent's
// overflow-hidden (needed to crop the photo) would clip, and make unclickable, anything bleeding
// past it. Corner handles are small visible squares; edge handles are thin invisible hit-strips
// along the middle of each side so hovering the frame's border itself shows the resize cursor.
function renderResizeHandles(el: AlbumElement, startDrag: (e: React.PointerEvent, el: AlbumElement, kind: "move" | "resize", handle?: ResizeHandle) => void) {
  const corner = (handle: ResizeHandle, style: React.CSSProperties) => (
    <span
      key={handle}
      onPointerDown={(e) => startDrag(e, el, "resize", handle)}
      className={`absolute h-3 w-3 bg-amber-deep rounded-sm z-10 ${RESIZE_HANDLE_CURSORS[handle]}`}
      style={style}
    />
  );
  const edge = (handle: ResizeHandle, style: React.CSSProperties) => (
    <span
      key={handle}
      onPointerDown={(e) => startDrag(e, el, "resize", handle)}
      className={`absolute ${RESIZE_HANDLE_CURSORS[handle]}`}
      style={style}
    />
  );
  return (
    <>
      {corner("nw", { top: 2, left: 2 })}
      {corner("ne", { top: 2, right: 2 })}
      {corner("sw", { bottom: 2, left: 2 })}
      {corner("se", { bottom: 2, right: 2 })}
      {edge("n", { top: 0, left: "20%", right: "20%", height: 8 })}
      {edge("s", { bottom: 0, left: "20%", right: "20%", height: 8 })}
      {edge("w", { left: 0, top: "20%", bottom: "20%", width: 8 })}
      {edge("e", { right: 0, top: "20%", bottom: "20%", width: 8 })}
    </>
  );
}

const SNAP_THRESHOLD = 1.2; // % of canvas

function elementBox(el: AlbumElement): { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number } {
  const height = el.type === "photo" ? el.heightPct : (el.heightPct ?? 15);
  return {
    left: el.xPct,
    top: el.yPct,
    right: el.xPct + el.widthPct,
    bottom: el.yPct + height,
    centerX: el.xPct + el.widthPct / 2,
    centerY: el.yPct + height / 2,
  };
}

// While dragging an element, checks its candidate position against the page center and every
// other element's edges/center on the same page — returns guide lines to draw plus a snapped
// position when within SNAP_THRESHOLD, so aligning two frames (or centering one on the page)
// is something the photographer can see and feel, not just eyeball.
function computeAlignment(
  dragging: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  others: AlbumElement[]
): { guides: { axis: "v" | "h"; pos: number }[]; snapXPct?: number; snapYPct?: number } {
  const guides: { axis: "v" | "h"; pos: number }[] = [];
  let snapXPct: number | undefined;
  let snapYPct: number | undefined;
  const left = dragging.xPct;
  const right = dragging.xPct + dragging.widthPct;
  const centerX = dragging.xPct + dragging.widthPct / 2;
  const top = dragging.yPct;
  const bottom = dragging.yPct + dragging.heightPct;
  const centerY = dragging.yPct + dragging.heightPct / 2;

  if (Math.abs(centerX - 50) < SNAP_THRESHOLD) {
    guides.push({ axis: "v", pos: 50 });
    snapXPct = 50 - dragging.widthPct / 2;
  }
  if (Math.abs(centerY - 50) < SNAP_THRESHOLD) {
    guides.push({ axis: "h", pos: 50 });
    snapYPct = 50 - dragging.heightPct / 2;
  }

  for (const other of others) {
    const box = elementBox(other);
    const xChecks: [number, number, number][] = [
      [left, box.left, box.left],
      [right, box.right, box.right - dragging.widthPct],
      [centerX, box.centerX, box.centerX - dragging.widthPct / 2],
    ];
    for (const [dragVal, otherVal, snapTo] of xChecks) {
      if (Math.abs(dragVal - otherVal) < SNAP_THRESHOLD) {
        guides.push({ axis: "v", pos: otherVal });
        if (snapXPct === undefined) snapXPct = snapTo;
      }
    }
    const yChecks: [number, number, number][] = [
      [top, box.top, box.top],
      [bottom, box.bottom, box.bottom - dragging.heightPct],
      [centerY, box.centerY, box.centerY - dragging.heightPct / 2],
    ];
    for (const [dragVal, otherVal, snapTo] of yChecks) {
      if (Math.abs(dragVal - otherVal) < SNAP_THRESHOLD) {
        guides.push({ axis: "h", pos: otherVal });
        if (snapYPct === undefined) snapYPct = snapTo;
      }
    }
  }
  return { guides, snapXPct, snapYPct };
}

function boxesIntersect(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Detects the classic "sandwiched between two neighbors" equal-spacing case on each axis
// independently: the nearest same-row (or same-column) neighbor on either side of the dragged
// element. When both gaps are already close to equal, snaps the drag so they become EXACTLY
// equal and returns a pair of guide segments (one per gap) so the photographer can see which two
// gaps just matched, mirroring Figma-style spacing indicators.
function computeSpacingGuides(
  dragging: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  others: AlbumElement[]
): {
  guides: { orientation: "horizontal" | "vertical"; x: number; y: number; length: number; kind?: "centerline" }[];
  snapXPct?: number;
  snapYPct?: number;
} {
  const guides: { orientation: "horizontal" | "vertical"; x: number; y: number; length: number; kind?: "centerline" }[] = [];
  let snapXPct: number | undefined;
  let snapYPct: number | undefined;
  // The page's own length/width centerline (50%), treated as a second "wall" alongside a single
  // real photo neighbor — per explicit request: a single selected photo with a real photo on one
  // side and the page's centerline on the other should snap+highlight (in blue, a third color
  // distinct from the rose alignment lines and the sage neighbor-to-neighbor guides) once its gap
  // to the photo equals its gap to the centerline. Only tried as a fallback when there's no second
  // real neighbor to establish rhythm against instead (the existing leftLeftN/rightRightN cases
  // below keep priority, since matching a REAL established rhythm is more specific/intentional
  // than matching the page's abstract center).
  const CENTERLINE = 50;
  const boxes = others.map(elementBox);
  const dLeft = dragging.xPct;
  const dRight = dragging.xPct + dragging.widthPct;
  const dTop = dragging.yPct;
  const dBottom = dragging.yPct + dragging.heightPct;
  const dCenterY = dragging.yPct + dragging.heightPct / 2;
  const dCenterX = dragging.xPct + dragging.widthPct / 2;

  const rowMates = boxes.filter((b) => b.top < dBottom && b.bottom > dTop);
  const leftN = rowMates.filter((b) => b.right <= dLeft + 0.5).sort((a, b) => b.right - a.right)[0];
  const rightN = rowMates.filter((b) => b.left >= dRight - 0.5).sort((a, b) => a.left - b.left)[0];
  if (leftN && rightN) {
    const gapLeft = dLeft - leftN.right;
    const gapRight = rightN.left - dRight;
    if (gapLeft > 0.3 && gapRight > 0.3 && Math.abs(gapLeft - gapRight) < SNAP_THRESHOLD) {
      const avgGap = (gapLeft + gapRight) / 2;
      snapXPct = leftN.right + avgGap;
      guides.push({ orientation: "horizontal", x: leftN.right, y: dCenterY, length: avgGap });
      guides.push({ orientation: "horizontal", x: snapXPct + dragging.widthPct, y: dCenterY, length: avgGap });
    }
  } else if (leftN && !rightN) {
    // Dragged element is the LAST (rightmost) in its row, with nothing to snap against on its own
    // far side — instead of sandwiching, match the RHYTHM already established by the two elements
    // just before it (leftN and leftN's own left neighbor), so dragging the last photo in a row
    // into equal spacing with the rest of the row snaps it too, not just a photo caught between
    // two others. Per explicit request: "if it's the last one in the row/column, once it reaches
    // an equal distance from the row's photos, snap it like a magnet."
    const leftLeftN = rowMates.filter((b) => b !== leftN && b.right <= leftN.left + 0.5).sort((a, b) => b.right - a.right)[0];
    let matchedRhythm = false;
    if (leftLeftN) {
      const refGap = leftN.left - leftLeftN.right;
      const gap = dLeft - leftN.right;
      if (refGap > 0.3 && Math.abs(gap - refGap) < SNAP_THRESHOLD) {
        snapXPct = leftN.right + refGap;
        guides.push({ orientation: "horizontal", x: leftLeftN.right, y: dCenterY, length: refGap });
        guides.push({ orientation: "horizontal", x: leftN.right, y: dCenterY, length: refGap });
        matchedRhythm = true;
      }
    }
    if (!matchedRhythm && dRight < CENTERLINE) {
      const gapLeft = dLeft - leftN.right;
      const gapRight = CENTERLINE - dRight;
      if (gapLeft > 0.3 && gapRight > 0.3 && Math.abs(gapLeft - gapRight) < SNAP_THRESHOLD) {
        const snapX = (CENTERLINE - dragging.widthPct + leftN.right) / 2;
        const finalGap = snapX - leftN.right;
        snapXPct = snapX;
        guides.push({ orientation: "horizontal", x: leftN.right, y: dCenterY, length: finalGap, kind: "centerline" });
        guides.push({ orientation: "horizontal", x: snapX + dragging.widthPct, y: dCenterY, length: finalGap, kind: "centerline" });
      }
    }
  } else if (rightN && !leftN) {
    // Mirror of the above for the FIRST (leftmost) element in its row.
    const rightRightN = rowMates.filter((b) => b !== rightN && b.left >= rightN.right - 0.5).sort((a, b) => a.left - b.left)[0];
    let matchedRhythm = false;
    if (rightRightN) {
      const refGap = rightRightN.left - rightN.right;
      const gap = rightN.left - dRight;
      if (refGap > 0.3 && Math.abs(gap - refGap) < SNAP_THRESHOLD) {
        snapXPct = rightN.left - refGap - dragging.widthPct;
        guides.push({ orientation: "horizontal", x: rightN.right, y: dCenterY, length: refGap });
        guides.push({ orientation: "horizontal", x: rightN.left - refGap, y: dCenterY, length: refGap });
        matchedRhythm = true;
      }
    }
    if (!matchedRhythm && dLeft > CENTERLINE) {
      const gapRight = rightN.left - dRight;
      const gapLeft = dLeft - CENTERLINE;
      if (gapLeft > 0.3 && gapRight > 0.3 && Math.abs(gapLeft - gapRight) < SNAP_THRESHOLD) {
        const snapX = (rightN.left - dragging.widthPct + CENTERLINE) / 2;
        const finalGap = rightN.left - (snapX + dragging.widthPct);
        snapXPct = snapX;
        guides.push({ orientation: "horizontal", x: CENTERLINE, y: dCenterY, length: finalGap, kind: "centerline" });
        guides.push({ orientation: "horizontal", x: rightN.left - finalGap, y: dCenterY, length: finalGap, kind: "centerline" });
      }
    }
  }

  const colMates = boxes.filter((b) => b.left < dRight && b.right > dLeft);
  const topN = colMates.filter((b) => b.bottom <= dTop + 0.5).sort((a, b) => b.bottom - a.bottom)[0];
  const bottomN = colMates.filter((b) => b.top >= dBottom - 0.5).sort((a, b) => a.top - b.top)[0];
  if (topN && bottomN) {
    const gapTop = dTop - topN.bottom;
    const gapBottom = bottomN.top - dBottom;
    if (gapTop > 0.3 && gapBottom > 0.3 && Math.abs(gapTop - gapBottom) < SNAP_THRESHOLD) {
      const avgGap = (gapTop + gapBottom) / 2;
      snapYPct = topN.bottom + avgGap;
      guides.push({ orientation: "vertical", x: dCenterX, y: topN.bottom, length: avgGap });
      guides.push({ orientation: "vertical", x: dCenterX, y: snapYPct + dragging.heightPct, length: avgGap });
    }
  } else if (topN && !bottomN) {
    // Dragged element is the LAST (bottommost) in its column — mirrors the row case above, matching
    // the gap already established between topN and topN's own top neighbor.
    const topTopN = colMates.filter((b) => b !== topN && b.bottom <= topN.top + 0.5).sort((a, b) => b.bottom - a.bottom)[0];
    let matchedRhythmY = false;
    if (topTopN) {
      const refGap = topN.top - topTopN.bottom;
      const gap = dTop - topN.bottom;
      if (refGap > 0.3 && Math.abs(gap - refGap) < SNAP_THRESHOLD) {
        snapYPct = topN.bottom + refGap;
        guides.push({ orientation: "vertical", x: dCenterX, y: topTopN.bottom, length: refGap });
        guides.push({ orientation: "vertical", x: dCenterX, y: topN.bottom, length: refGap });
        matchedRhythmY = true;
      }
    }
    if (!matchedRhythmY && dBottom < CENTERLINE) {
      const gapTop = dTop - topN.bottom;
      const gapBottom = CENTERLINE - dBottom;
      if (gapTop > 0.3 && gapBottom > 0.3 && Math.abs(gapTop - gapBottom) < SNAP_THRESHOLD) {
        const snapY = (CENTERLINE - dragging.heightPct + topN.bottom) / 2;
        const finalGap = snapY - topN.bottom;
        snapYPct = snapY;
        guides.push({ orientation: "vertical", x: dCenterX, y: topN.bottom, length: finalGap, kind: "centerline" });
        guides.push({ orientation: "vertical", x: dCenterX, y: snapY + dragging.heightPct, length: finalGap, kind: "centerline" });
      }
    }
  } else if (bottomN && !topN) {
    // Mirror of the above for the FIRST (topmost) element in its column.
    const bottomBottomN = colMates.filter((b) => b !== bottomN && b.top >= bottomN.bottom - 0.5).sort((a, b) => a.top - b.top)[0];
    let matchedRhythmY = false;
    if (bottomBottomN) {
      const refGap = bottomBottomN.top - bottomN.bottom;
      const gap = bottomN.top - dBottom;
      if (refGap > 0.3 && Math.abs(gap - refGap) < SNAP_THRESHOLD) {
        snapYPct = bottomN.top - refGap - dragging.heightPct;
        guides.push({ orientation: "vertical", x: dCenterX, y: bottomN.bottom, length: refGap });
        guides.push({ orientation: "vertical", x: dCenterX, y: bottomN.top - refGap, length: refGap });
        matchedRhythmY = true;
      }
    }
    if (!matchedRhythmY && dTop > CENTERLINE) {
      const gapBottom = bottomN.top - dBottom;
      const gapTop = dTop - CENTERLINE;
      if (gapTop > 0.3 && gapBottom > 0.3 && Math.abs(gapTop - gapBottom) < SNAP_THRESHOLD) {
        const snapY = (bottomN.top - dragging.heightPct + CENTERLINE) / 2;
        const finalGap = bottomN.top - (snapY + dragging.heightPct);
        snapYPct = snapY;
        guides.push({ orientation: "vertical", x: dCenterX, y: CENTERLINE, length: finalGap, kind: "centerline" });
        guides.push({ orientation: "vertical", x: dCenterX, y: bottomN.top - finalGap, length: finalGap, kind: "centerline" });
      }
    }
  }

  return { guides, snapXPct, snapYPct };
}

// Guide lines while RESIZING — checks only the edge(s) actually moving (per the active handle)
// against every other element's matching edge, the page's own edges, the page center, and the
// green print-safe margin frame, so growing/shrinking a frame shows the same kind of "you've
// reached another photo's border" line that dragging already shows, on both the width and the
// height axis independently — plus a distinct signal when it's specifically the margin that was
// hit, so the caller can flash that line instead of a generic rose guide.
function computeResizeGuides(
  handle: ResizeHandle,
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  others: AlbumElement[],
  marginInsetPct: { x: number; y: number } | null
): {
  guides: { axis: "v" | "h"; pos: number }[];
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  marginSnapX: boolean;
  marginSnapY: boolean;
} {
  const guides: { axis: "v" | "h"; pos: number }[] = [];
  const result = { ...box };
  const marginX = marginInsetPct ? [marginInsetPct.x, 100 - marginInsetPct.x] : [];
  const marginY = marginInsetPct ? [marginInsetPct.y, 100 - marginInsetPct.y] : [];
  const targetsX = [0, 50, 100, ...marginX, ...others.map((o) => elementBox(o).left), ...others.map((o) => elementBox(o).right)];
  const targetsY = [0, 50, 100, ...marginY, ...others.map((o) => elementBox(o).top), ...others.map((o) => elementBox(o).bottom)];
  let marginSnapX = false;
  let marginSnapY = false;

  if (handle.includes("e")) {
    const right = box.xPct + box.widthPct;
    const hit = targetsX.find((t) => Math.abs(right - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "v", pos: hit });
      result.widthPct = Math.max(8, hit - box.xPct);
      if (marginX.includes(hit)) marginSnapX = true;
    }
  } else if (handle.includes("w")) {
    const hit = targetsX.find((t) => Math.abs(box.xPct - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "v", pos: hit });
      const right = box.xPct + box.widthPct;
      result.xPct = hit;
      result.widthPct = Math.max(8, right - hit);
      if (marginX.includes(hit)) marginSnapX = true;
    }
  }

  if (handle.includes("s")) {
    const bottom = box.yPct + box.heightPct;
    const hit = targetsY.find((t) => Math.abs(bottom - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "h", pos: hit });
      result.heightPct = Math.max(6, hit - box.yPct);
      if (marginY.includes(hit)) marginSnapY = true;
    }
  } else if (handle.includes("n")) {
    const hit = targetsY.find((t) => Math.abs(box.yPct - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "h", pos: hit });
      const bottom = box.yPct + box.heightPct;
      result.yPct = hit;
      result.heightPct = Math.max(6, bottom - hit);
      if (marginY.includes(hit)) marginSnapY = true;
    }
  }

  return { guides, box: result, marginSnapX, marginSnapY };
}

// Seeds a brand-new "custom" canvas from the spread's existing preset-layout photos (matching the
// same position math the split/feature/stack renderers use) so switching a page to free-form
// never silently loses the photos it already had. Only applies when the spread's stored layout is
// actually one of those legacy presets — a spread whose layout is ALREADY "custom" (every blank
// page created today, via buildStyledAlbum/createBlankSpread) always carries a `photo_id_1` too
// (a NOT NULL anchor column left over from before custom layouts existed, see the comment near its
// inserts), but that photo was never meant to be shown — seeding it here would silently cover a
// genuinely blank page with one full-bleed photo the photographer never placed.
function seedElementsFromPreset(spread: GalleryAlbumSpreadRow): AlbumElement[] {
  const hasPhotoElement = spread.elements.some((el) => el.type === "photo");
  if (hasPhotoElement || !spread.photo_id_1 || spread.layout === "custom") return spread.elements;

  const seeded: AlbumElement[] = [];
  if (!spread.photo_id_2) {
    seeded.push({
      id: "seed-1",
      type: "photo",
      photoId: spread.photo_id_1,
      xPct: 0,
      yPct: 0,
      widthPct: 100,
      heightPct: 100,
      focalX: spread.focal_x_1,
      focalY: spread.focal_y_1,
    });
  } else if (spread.layout === "stack") {
    seeded.push(
      { id: "seed-1", type: "photo", photoId: spread.photo_id_1, xPct: 0, yPct: 0, widthPct: 100, heightPct: 49, focalX: spread.focal_x_1, focalY: spread.focal_y_1 },
      { id: "seed-2", type: "photo", photoId: spread.photo_id_2, xPct: 0, yPct: 51, widthPct: 100, heightPct: 49, focalX: spread.focal_x_2, focalY: spread.focal_y_2 }
    );
  } else {
    const width1 = spread.layout === "feature" ? 64 : 49;
    const width2 = spread.layout === "feature" ? 34 : 49;
    // photo1 renders on the right in the app's RTL UI — same mirroring as the PDF export.
    seeded.push(
      { id: "seed-2", type: "photo", photoId: spread.photo_id_2, xPct: 0, yPct: 0, widthPct: width2, heightPct: 100, focalX: spread.focal_x_2, focalY: spread.focal_y_2 },
      { id: "seed-1", type: "photo", photoId: spread.photo_id_1, xPct: 100 - width1, yPct: 0, widthPct: width1, heightPct: 100, focalX: spread.focal_x_1, focalY: spread.focal_y_1 }
    );
  }
  return [...seeded, ...spread.elements];
}

// A free-form drag/resize canvas — used two ways:
// - "overlay" mode: the spread's existing preset photo layout (split/feature/stack) renders as a
//   static, non-interactive backdrop, and only text elements are draggable on top of it. Text
//   works on every spread this way, not just custom-layout ones.
// - "custom" mode: nothing is fixed — photo and text elements live in the same array and are all
//   draggable/resizable, giving a genuinely free-form page instead of the three presets.
export default function AlbumSpreadCanvasEditor({
  spread,
  album,
  photos,
  folders,
  photo1,
  photo2,
  mode,
  templates,
  usedElsewhere,
  onSave,
  onSaveTemplate,
  onClose,
  customOrnamentTabs,
  customOrnaments,
  onCreateCustomOrnamentTab,
  onUploadCustomOrnament,
  onDeleteCustomOrnament,
  spreads,
  onSwitchSpread,
  onAddPage,
  sidePanelOffset,
  onSidePanelOffsetChange,
}: {
  spread: GalleryAlbumSpreadRow;
  // Physical print dimensions plus the album's own configured safe-margin (cm) — used to size the
  // print-safe margin guide; safe_margin_cm defaults to 0.5 if omitted.
  album: { width_cm: number; height_cm: number; safe_margin_cm?: number };
  photos: PhotoWithUrl[];
  // Gallery tabs/folders, used only to group the draggable favorites panel below the save button
  // — an empty/omitted list just renders that panel as one flat, ungrouped area.
  folders?: { id: string; name: string }[];
  photo1: PhotoWithUrl | undefined;
  photo2: PhotoWithUrl | undefined | null;
  mode: "overlay" | "custom";
  templates: AlbumTemplateRow[];
  // Photo ids already placed elsewhere in the album (other pages) — badged with ✅ in every
  // picker below so the photographer doesn't accidentally place the same photo twice.
  usedElsewhere?: Set<string>;
  onSave: (elements: AlbumElement[], background: { photoId: string | null; blur: number; opacity: number; zoom: number }) => void | Promise<void>;
  onSaveTemplate: (name: string, frames: AlbumFrame[]) => Promise<void>;
  onClose: () => void;
  // Photographer-uploaded ornament tabs — all optional, all omitted-safe (the picker just skips
  // the custom-tabs section entirely when these aren't supplied).
  customOrnamentTabs?: { id: string; name: string }[];
  customOrnaments?: { id: string; tab_id: string; url: string }[];
  onCreateCustomOrnamentTab?: (name: string) => Promise<void>;
  onUploadCustomOrnament?: (tabId: string, name: string, bytes: ArrayBuffer, contentType: string) => Promise<void>;
  onDeleteCustomOrnament?: (ornamentId: string) => Promise<void>;
  // Every other page in the same album (including this one), for the bottom quick-switch strip —
  // omitted-safe: no strip renders without it, same as the other optional props above.
  spreads?: GalleryAlbumSpreadRow[];
  onSwitchSpread?: (spreadId: string) => void;
  // Creates a fresh blank page and jumps straight into it — lets the photographer add a page
  // without leaving this editor first. Gated behind the same unsaved-changes check as closing or
  // switching pages (see requestLeave below), omitted-safe: no button renders without it.
  onAddPage?: () => void | Promise<void>;
  // The "עריכת תמונה" panel's drag offset, owned by the PARENT page (not this component) so it
  // survives this editor's own full remount on every page switch — see sidePanelDrag's own comment
  // for why that remount would otherwise reset a locally-owned offset back to (0,0) every time.
  sidePanelOffset: { x: number; y: number };
  onSidePanelOffsetChange: (offset: { x: number; y: number }) => void;
}) {
  // This editor's whole layout below (two columns, canvas sizing, sidebar, page switcher) is the
  // SAME desktop design on a phone/tablet, not a second maintained-separately layout — same tool,
  // same features, just resized for the real screen. Real desktop (≥1024px) is untouched.
  //
  // Two different techniques were tried and abandoned for the resize itself before landing on the
  // current one (see the <style> block below): first a JS-computed value applied via inline
  // style={} (read window.innerWidth/innerHeight, useState) — that worked in Safari as a regular
  // browser tab but broke again once added to the iOS home screen (standalone PWA), where after
  // rotating the device taps landed several rows below the visible button, because standalone iOS
  // PWAs are known to report window.innerWidth/innerHeight with a lag relative to the actual
  // rotation. Switching that same computation to pure CSS (`zoom` inside a media query, so there's
  // no JS read to lag) removed that specific staleness risk, but a real device in standalone mode
  // still mistapped even on a completely fresh landscape-only mount — meaning `zoom` (and, before
  // it, `transform: scale()`) themselves can leave the painted position and the touch hit-test
  // position disagreeing on that device, independent of any JS timing at all. The <style> block
  // below now sizes the card with real vw/vh dimensions instead — nothing is painted at one size
  // and hit-tested at another, because there's only one (real) size to begin with.
  const [viewportSize, setViewportSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const update = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  // Only used for the button-size nudge below (cosmetic, not hit-testing-critical) — a brief stale
  // read here just means a button is very slightly under/over-sized for a moment, never a mis-click.
  const isPhone = viewportSize.w < 1024 && Math.min(viewportSize.w, viewportSize.h) <= 500;
  // Broader than isPhone (any width under the desktop breakpoint, tablet included, e.g. an iPad
  // running this as a standalone PWA) — drives the "never grow taller than the photo area" clamp on
  // the photo-edit panels below. That clamp used to be gated to isPhone specifically, which meant a
  // tablet-class screen got none of it: the panels could grow past the canvas's own top/bottom edge
  // with no cap and no scrollbar. Real desktop (≥1024px) still gets no clamp, per this file's own
  // "Real desktop is untouched" rule above.
  const isCompact = viewportSize.w < 1024;

  // A real phone always opens this modal in portrait (that's how it's normally held) but the canvas
  // is only designed for landscape — this shows a rotate-prompt instead of mounting the canvas at
  // all until the device already reports landscape, both for that UX reason and so the canvas never
  // has to also carry a portrait layout of its own. matchMedia's own "change" event is used instead
  // of resize/orientationchange because it's tied to the same native media-query evaluation the CSS
  // below relies on, not a JS-buffered dimension read.
  //
  // Three phases, not just a boolean: "portrait" (rotate-prompt), "settling" (a brief, deliberately
  // visible loading screen), "ready" (the real canvas). Opening the tool directly into landscape —
  // confirmed working — skips straight to "ready", no settling needed. But going portrait→landscape
  // gets the settling step: on a real device the rotate-prompt disappearing and the canvas appearing
  // with no visible loading in between looked, to a real report, indistinguishable from "the canvas
  // was already mounted underneath the prompt the whole time" — i.e. exactly the original bug,
  // whether or not that's literally what's happening. The settling delay makes the two cases
  // impossible to confuse: the canvas's first-ever mount now always happens visibly after rotation
  // completes, on its own frame, never smuggled in behind the prompt.
  const [phase, setPhase] = useState<"portrait" | "settling" | "ready">(() =>
    typeof window === "undefined"
      ? "ready"
      : window.matchMedia("(max-width: 1023.98px) and (orientation: portrait)").matches
        ? "portrait"
        : "ready"
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023.98px) and (orientation: portrait)");
    const update = () => {
      if (mql.matches) {
        setPhase("portrait");
        return;
      }
      setPhase((prev) => (prev === "portrait" ? "settling" : prev === "settling" ? prev : "ready"));
    };
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (phase !== "settling") return;
    const t = setTimeout(() => setPhase("ready"), 500);
    return () => clearTimeout(t);
  }, [phase]);
  const needsRotate = phase === "portrait";

  const [elements, setElementsRaw] = useState<AlbumElement[]>(() => (mode === "custom" ? seedElementsFromPreset(spread) : spread.elements));
  // Multiple photo elements can be selected at once (shift-click or a rubber-band marquee drag)
  // so circular-menu actions and resize can apply to the whole group; text elements stay
  // single-select only (a Set of size 1 for those).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Live rectangle while dragging a selection marquee on empty canvas — null when not marqueeing.
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [frameTargetId, setFrameTargetId] = useState<string | null>(null);
  // Alt/Option+drag one photo frame onto another to swap their photos (content only — each
  // frame keeps its own position/size/border/rotation). altSwapSourceId is set on pointerdown;
  // altSwapTargetId tracks whichever OTHER photo frame the pointer is currently over, updated on
  // every move via a plain point-in-box hit test (same idea as the marquee's own hit test).
  // Releasing over a valid target swaps; releasing over nothing falls back to the older
  // Alt+click behavior (recenter the source photo's focal point) so a plain Alt+click still works.
  const [altSwapSourceId, setAltSwapSourceId] = useState<string | null>(null);
  const [altSwapTargetId, setAltSwapTargetId] = useState<string | null>(null);
  // Natural width/height ratio per photo, learned from the <img>'s own onLoad (the app doesn't
  // store this in the DB) and fed into computePhotoFraming for correct zoom+pan cropping. Falls
  // back to matching the frame's own aspect until loaded, which just means a zoomed/panned photo
  // renders as a plain centered fill for one frame before its real ratio is known.
  const [photoAspects, setPhotoAspects] = useState<Record<string, number>>({});
  const [pickingBackground, setPickingBackground] = useState(false);
  const [backgroundPhotoId, setBackgroundPhotoId] = useState(spread.background_photo_id);
  const [backgroundBlur, setBackgroundBlur] = useState(spread.background_blur);
  const [backgroundOpacity, setBackgroundOpacity] = useState(spread.background_opacity);
  const [backgroundZoom, setBackgroundZoom] = useState(spread.background_zoom ?? 100);
  // Snapshot of the page's saved state, captured once from the actual initial state values (not
  // recomputed from spread/seedElementsFromPreset separately, which could disagree on seeded
  // element ids and falsely read as "dirty" from the very first render). Used only to detect
  // unsaved changes when the photographer clicks the X — compared via JSON.stringify since the
  // element list's shape varies too much for a cheap field-by-field diff.
  const initialSnapshotRef = useRef<string | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = JSON.stringify([elements, backgroundPhotoId, backgroundBlur, backgroundOpacity, backgroundZoom]);
  }
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  // What to actually do once the exit-confirm dialog resolves — closing back to the main screen,
  // or switching to a different album page picked from the bottom strip while this one was dirty.
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const [skipExitConfirm, setSkipExitConfirm] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("albumEditorSkipExitConfirm") === "1"
  );
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  // "+ תמונה" opens the picker in multi-select mode — pick any number of photos, and the system
  // builds a fresh orientation-aware layout for all of them at once (replacing the page's current
  // photo elements, same as applying a template) instead of adding one photo at a fixed spot.
  const [addingMultiplePhotos, setAddingMultiplePhotos] = useState(false);
  const [multiPhotoIds, setMultiPhotoIds] = useState<Set<string>>(new Set());
  const [loadingMultiLayout, setLoadingMultiLayout] = useState(false);
  const [showAllInPicker, setShowAllInPicker] = useState(false);
  // Separate toggle for the drag-to-frame favorites panel below the save button — independent of
  // the "+ תמונה" picker modal's own "show all" toggle above.
  const [showAllDragPanel, setShowAllDragPanel] = useState(false);
  // Which folder tab the drag panel is filtered to — "__all__" (the default) shows every group,
  // still divided by its own folder heading, same as before this feature existed; picking a
  // specific folder's tab narrows the panel down to just that folder's favorites.
  const [dragPanelTab, setDragPanelTab] = useState<string>("__all__");
  // "default" keeps whatever order `photos` itself arrived in (upload order, per its own query) —
  // per explicit request to add sorting to the photo list. "date" sorts by created_at (upload
  // date — this app doesn't extract/store real EXIF capture-date metadata, so this is the closest
  // available proxy, not the photo's actual shoot date) and "name" by original_filename.
  const [dragPanelSort, setDragPanelSort] = useState<"default" | "name" | "date">("default");
  // Off by default on every page open (this component fully remounts per page — see the "key"
  // comment on its own props type above — so this plain default is enough, no extra reset logic
  // needed) — per explicit request, rather than always-on.
  const [dragPanelHoverZoomEnabled, setDragPanelHoverZoomEnabled] = useState(false);
  // Fixed-position (viewport-relative, computed from the icon's own live rect) instead of a plain
  // CSS absolute+group-hover popup — the info icon lives inside the controls sidebar, which has its
  // own overflow-y-auto scroll region; a plain absolute popup that pops out sideways gets its edges
  // silently clipped by that ancestor's overflow box. position:fixed escapes it since overflow-y
  // alone (no transform on any ancestor here) doesn't create a containing block for fixed elements.
  const [hoverZoomTooltipPos, setHoverZoomTooltipPos] = useState<{ top: number; right: number } | null>(null);
  // Click a favorites-panel thumbnail to toggle it in/out of this set without starting a drag —
  // dragging any thumbnail that's part of a 2+ selection then carries the whole group together,
  // dragging one that ISN'T selected still drags just that one (selection is left untouched).
  const [dragPanelSelectedIds, setDragPanelSelectedIds] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(false);
  const [dragPanelHoverPreview, setDragPanelHoverPreview] = useState<{ url: string; top: number; left: number; width: number; height: number } | null>(null);
  // Token bumped on every hover so a slow-loading preview from a PREVIOUS hover can't land after
  // the pointer has already moved to a different (or no) thumbnail.
  const hoverPreviewTokenRef = useRef(0);
  const [textDraftOpen, setTextDraftOpen] = useState(false);
  const [textDraftClosing, setTextDraftClosing] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  // Design choices made up front in the text-creation panel (anchored below the טקסט button, same
  // as masks/ornaments/shapes) instead of only being editable after the fact via the sidebar —
  // defaults match what addText used to hardcode.
  const [textDraftFontSize, setTextDraftFontSize] = useState(40);
  const [textDraftFontFamily, setTextDraftFontFamily] = useState("heebo");
  const [textDraftColor, setTextDraftColor] = useState("white");
  const [textPanelRect, setTextPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const textButtonRef = useRef<HTMLButtonElement>(null);
  // The desktop button bar's own "תמונת רקע" button is a plain toggle when no background is set
  // (tap to pick one), but once one IS set, tapping it again opens this small flyout — preview,
  // remove, opacity/blur — instead of silently dropping the ability to fine-tune a background once
  // it's already sitting on the page.
  const [backgroundPanelOpen, setBackgroundPanelOpen] = useState(false);
  const [backgroundPanelRect, setBackgroundPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const backgroundButtonRef = useRef<HTMLButtonElement>(null);
  // The small circle at the canvas's own bottom-left corner that opens the background opacity/
  // blur sliders — replaces the old "click תמונת רקע again" trigger (see backgroundButtonRef's own
  // comment above), reachable regardless of phone/desktop since it's anchored to the canvas itself
  // rather than a sidebar button that only exists on one layout.
  const bgSlidersButtonRef = useRef<HTMLButtonElement>(null);
  // Right-click menu on a favorite-panel thumbnail — "קביעה כרקע" sets that exact photo as this
  // page's background directly (no need to reopen the picker and find it again), "הסרה" only
  // shows once it already IS the background, to unset that role.
  const [photoContextMenu, setPhotoContextMenu] = useState<{ photoId: string; top: number; left: number } | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templatePickerClosing, setTemplatePickerClosing] = useState(false);
  const [templatePanelRect, setTemplatePanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const templateButtonRef = useRef<HTMLButtonElement>(null);
  const [masksPickerOpen, setMasksPickerOpen] = useState(false);
  const [masksPickerClosing, setMasksPickerClosing] = useState(false);
  // Anchors the masks dropdown directly below the מסכות button, at that button's own width —
  // computed from the real DOM rect (not CSS alone) and rendered `position: fixed` so it can't get
  // clipped by the side panel's own `overflow-y-auto`, and stays correctly placed regardless of
  // where in that scrollable panel the button currently sits.
  const [masksPanelRect, setMasksPanelRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const masksButtonRef = useRef<HTMLButtonElement>(null);
  // Ornaments dropdown — same anchored-below-the-button pattern as the masks picker above.
  const [ornamentsPickerOpen, setOrnamentsPickerOpen] = useState(false);
  const [ornamentsPickerClosing, setOrnamentsPickerClosing] = useState(false);
  const [ornamentsPanelRect, setOrnamentsPanelRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const ornamentsButtonRef = useRef<HTMLButtonElement>(null);
  // "floral"/"geometric"/"vintage" for a built-in tab, or a custom tab's own id.
  const [ornamentTab, setOrnamentTab] = useState<string>("floral");
  const [customTabModalOpen, setCustomTabModalOpen] = useState(false);
  const [customTabNameDraft, setCustomTabNameDraft] = useState("");
  const [creatingCustomTab, setCreatingCustomTab] = useState(false);
  const [uploadingOrnament, setUploadingOrnament] = useState(false);
  const [ornamentDropActive, setOrnamentDropActive] = useState(false);
  const [shapesPickerOpen, setShapesPickerOpen] = useState(false);
  const [shapesPickerClosing, setShapesPickerClosing] = useState(false);
  const [shapesPanelRect, setShapesPanelRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const shapesButtonRef = useRef<HTMLButtonElement>(null);
  // "+ תמונה" size-choice popover — lets the photographer pick a fixed real-world frame size/shape
  // (instead of the usual aspect-ratio-matched auto size) before the photo picker opens.
  const [photoSizePickerOpen, setPhotoSizePickerOpen] = useState(false);
  const [photoSizePanelRect, setPhotoSizePanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const photoSizeButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingPhotoSize, setPendingPhotoSize] = useState<"auto" | "rect" | "circle" | "square">("auto");
  const [templateTab, setTemplateTab] = useState<TemplateTabKey>("2");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  // "Position image" mode — while active for an element, dragging its photo pans the image's
  // focal point inside the fixed frame instead of moving the frame itself.
  const [panModeId, setPanModeId] = useState<string | null>(null);
  // Smart guide lines shown (and lightly snapped to) while dragging a photo/text frame — page
  // center and edges/centers of other elements on the same page, matching common design-tool
  // "alignment guide" behavior so the photographer can see when things line up.
  const [guides, setGuides] = useState<{ axis: "v" | "h"; pos: number }[]>([]);
  // Equal-spacing guides — a distinct indicator (sage, not rose) shown when the dragged element
  // sits between two same-axis neighbors with a matching gap on both sides.
  const [spacingGuides, setSpacingGuides] = useState<{ orientation: "horizontal" | "vertical"; x: number; y: number; length: number; kind?: "centerline" }[]>([]);
  // Whether a resize just snapped its moving edge onto the green print-safe margin frame, per
  // axis — flashes that specific line brighter so reaching it reads as a real "you're there" snap
  // rather than just eyeballing proximity to the always-visible static frame.
  const [marginSnap, setMarginSnap] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    kind: "move" | "resize";
    resizeHandle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    startFocalX: number;
    startFocalY: number;
    startZoom: number;
    // Starting box for every element in the active group — every selected element for a group
    // move (all translate by the same delta), every selected photo for a group resize (the
    // dragged one resizes via computeResize, the rest scale proportionally around their own
    // center) — a plain single-element drag is just a group of one.
    groupStart: Record<string, { xPct: number; yPct: number; widthPct: number; heightPct: number }>;
  } | null>(null);
  // Rubber-band marquee drag state — `base` is the selection to preserve (shift-drag) or empty
  // (plain drag), so shrinking the marquee mid-drag correctly drops elements no longer inside it
  // without ever discarding a selection that existed before the marquee started.
  const marqueeRef = useRef<{ startXPct: number; startYPct: number; base: Set<string> } | null>(null);
  // Suppresses the canvas's own deselect-on-click right after a real marquee drag — a click event
  // still fires on pointerup even after a multi-pixel drag, which would otherwise immediately wipe
  // out the selection the marquee just made.
  const justMarqueedRef = useRef(false);

  // Undo history — up to 20 past snapshots of `elements`. A snapshot is recorded on every
  // mutation EXCEPT while a move/resize drag is actively in progress (dragRef.current set): a
  // continuous drag fires this on every pointermove tick, and recording each tick would make one
  // Cmd/Ctrl+Z barely move anything back. startDrag instead records a single snapshot up front,
  // before the drag's own ticks begin, so one undo reverts the whole gesture at once. Every other
  // mutation in this file (button clicks, template/mask/photo applies, delete, etc.) is already a
  // single setElements call per user action, so it naturally gets exactly one snapshot each.
  const MAX_UNDO_HISTORY = 20;
  const undoHistoryRef = useRef<AlbumElement[][]>([]);
  const setElements = useCallback((update: React.SetStateAction<AlbumElement[]>) => {
    setElementsRaw((prev) => {
      if (!dragRef.current) {
        undoHistoryRef.current = [...undoHistoryRef.current, prev].slice(-MAX_UNDO_HISTORY);
      }
      return typeof update === "function" ? (update as (p: AlbumElement[]) => AlbumElement[])(prev) : update;
    });
  }, []);
  const undo = useCallback(() => {
    setElementsRaw((prev) => {
      const hist = undoHistoryRef.current;
      if (hist.length === 0) return prev;
      undoHistoryRef.current = hist.slice(0, -1);
      return hist[hist.length - 1];
    });
  }, []);

  const selectedElements = elements.filter((e) => selectedIds.has(e.id));
  const selectedPhotos = selectedElements.filter((e): e is AlbumPhotoElement => e.type === "photo");
  const selectedText = selectedElements.length === 1 && selectedElements[0].type === "text" ? selectedElements[0] : null;
  // The photo the floating circular menu anchors to and reads toggle-state from — the first
  // selected element that actually has an image (an empty placeholder frame has nothing to
  // filter/blur/rotate, so it's skipped even if selected).
  const anchorPhoto = selectedPhotos.find((p) => p.photoId) ?? null;
  const selectedOrnament = selectedElements.length === 1 && selectedElements[0].type === "ornament" ? selectedElements[0] : null;
  const selectedShape = selectedElements.length === 1 && selectedElements[0].type === "shape" ? selectedElements[0] : null;
  // The "עריכת תמונה" color/tone panel — per explicit request, no longer opens automatically the
  // moment a photo is selected; it opens only via its own circle-menu button (top button, see
  // PhotoFloatingMenu's photoAdjustPanelOpen prop) instead. The shadow/border overlay (see
  // PhotoShadowOverlayPanel) is the same kind of manual toggle. Both reset back to closed whenever
  // the selection moves to a different photo (or away from a photo entirely), so neither panel
  // carries over onto a photo the photographer never opened it for.
  const [photoAdjustPanelOpen, setPhotoAdjustPanelOpen] = useState(false);
  const [photoShadowPanelOpen, setPhotoShadowPanelOpen] = useState(false);
  useEffect(() => {
    setPhotoAdjustPanelOpen(false);
    setPhotoShadowPanelOpen(false);
  }, [anchorPhoto?.id]);
  // The text styling panel (font/color/alignment/size/shadow/glow) — used to be a cramped inline
  // block in the desktop sidebar (squeezed in below the action-button bar) while phone alone got
  // the same floating side-panel treatment as ornament/shape. Per explicit request, text now gets
  // that floating panel on BOTH phone and desktop, toggled by its own circle-menu "T" button next
  // to the selected text (TextCircleButton below) — same manual-toggle pattern as
  // photoAdjustPanelOpen, not ornament/shape's always-open one, so a stray click on the canvas
  // doesn't repeatedly pop the panel open every time a text box is merely selected.
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  useEffect(() => {
    setTextPanelOpen(false);
  }, [selectedText?.id]);
  const sidePanelOpen = !!selectedOrnament || !!selectedShape || (!!anchorPhoto && photoAdjustPanelOpen) || (!!selectedText && textPanelOpen);
  // Keeps the side panel's last content around through its own fade-out — without this,
  // deselecting would unmount the panel instantly (React removes it from the DOM the same render,
  // giving a CSS transition nothing to animate), so the panel would just vanish instead of fading.
  // Only ever written while something IS selected; while closing (sidePanelOpen false) it
  // deliberately keeps showing the last real selection.
  const [lastSideSelection, setLastSideSelection] = useState<
    | { type: "ornament"; el: AlbumOrnamentElement }
    | { type: "shape"; el: AlbumShapeElement }
    | { type: "photo"; el: AlbumPhotoElement }
    | { type: "text"; el: AlbumTextElement }
    | null
  >(null);
  useEffect(() => {
    if (selectedOrnament) setLastSideSelection({ type: "ornament", el: selectedOrnament });
    else if (selectedShape) setLastSideSelection({ type: "shape", el: selectedShape });
    else if (anchorPhoto) setLastSideSelection({ type: "photo", el: anchorPhoto });
    else if (selectedText) setLastSideSelection({ type: "text", el: selectedText });
  }, [selectedOrnament, selectedShape, anchorPhoto, selectedText]);
  // The ornament/shape side panel is anchored to the canvas's own live position (not a hardcoded
  // viewport offset — an earlier attempt at that broke at real screen widths wider than this
  // environment's own dev-server viewport, since the canvas's actual right edge moves with the
  // window). Measured at REST (no slide applied) and re-measured only on window resize — never
  // while `sidePanelOpen` is changing, since reading getBoundingClientRect() mid-CSS-transition
  // would race the animation and could capture an in-between position.
  // Declared BEFORE sidePanelDrag (below) so its drag-clamp callback can close over the latest
  // canvasRestRect/photoPanelSize without needing a separate ref — hook call order just needs to
  // stay the same across renders, not match the position these were declared at before.
  const [canvasRestRect, setCanvasRestRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (r) setCanvasRestRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Fixed DEFAULT size for the photo-adjustments panel — was 16cm long (tall) × 7cm wide, per
  // explicit request ("מידות ברירת המחדל של הפאנל אורך 16 ס״מ רוחב 7 ס״מ"), superseding every
  // earlier attempt at deriving the panel's size from the selected photo's own dimensions — the
  // photographer explicitly wants ONE consistent size regardless of which photo is open. Bumped up
  // again (20×9cm) per a later explicit follow-up asking for a bigger initial size, with no exact
  // target given that time — picked a proportionally similar increase (+25% each axis) rather than
  // guessing a wildly different ratio. Bumped again to 27×14cm (length +7cm, width +5cm) per a
  // further explicit request with exact deltas this time. Freely resizable on top of that default
  // via useResizablePanelSize's own corner-handle — see its comment for why the override persists
  // across photo selections instead of resetting.
  const PHOTO_PANEL_DEFAULT_HEIGHT_CM = 27;
  const PHOTO_PANEL_DEFAULT_WIDTH_CM = 14;
  const photoPanelDefaultHeightPx =
    album.height_cm > 0 && canvasRestRect ? Math.max(80, PHOTO_PANEL_DEFAULT_HEIGHT_CM * (canvasRestRect.height / album.height_cm)) : 300;
  const photoPanelDefaultWidthPx =
    album.width_cm > 0 && canvasRestRect ? Math.max(80, PHOTO_PANEL_DEFAULT_WIDTH_CM * (canvasRestRect.width / album.width_cm)) : 150;
  const photoPanelSize = useResizablePanelSize(photoPanelDefaultWidthPx, photoPanelDefaultHeightPx);
  // The "עריכת תמונה" panel's default screen position is shifted 5cm further left than its plain
  // canvas-edge anchor, per explicit request — computed here (not inline where it's used) so both
  // that panel's own position AND the shadow overlay's (see photoShadowPanelOpen below, which shares
  // this same left anchor) apply the identical shift.
  const PHOTO_PANEL_LEFT_SHIFT_CM = 5;
  const panelLeftShiftPx = album.width_cm > 0 && canvasRestRect ? (PHOTO_PANEL_LEFT_SHIFT_CM / album.width_cm) * canvasRestRect.width : 0;
  // Free drag-anywhere offset for the ornament/shape/photo-adjust/text side panel — see
  // useDraggablePanelOffset's own comment. One shared instance covers all four panel kinds since
  // only one of them is ever mounted at a time (whichever lastSideSelection currently is).
  // CONTROLLED by the parent page (GalleryManageView, via sidePanelOffset/onSidePanelOffsetChange)
  // rather than owning its own state — per explicit request, once the photographer drags this panel
  // somewhere on ANY page of the album, that position stays the new default on every OTHER page too,
  // until dragged again. A plain internal useState here could never survive that: this whole editor
  // fully remounts on every page switch (key={spread.id} in GalleryManageView, so each page starts
  // with fresh elements/undo-state), which would silently reset any local offset back to (0,0).
  // Lifting the value one level up, to a component that does NOT remount on page switches, is what
  // makes it durable across them. (Position only — size is NOT lifted; photoPanelSize below keeps
  // its own original sticky-within-this-mount behavior, matching the more precise, size-excluding
  // wording of this specific request.) The circular PhotoFloatingMenu's own photoMenuDrag is
  // untouched (still local, still resets per photo) since this request was specifically about
  // "עריכת התמונה" — the bigger adjustments panel, not the circular icon strip.
  // The vertical drag range is clamped to the canvas's own top/bottom edges — per explicit
  // request/correction: the panel's default position sits right at the canvas's own top edge
  // (see panelTopPx below), and dragging it must never be able to push it up past that edge (where
  // it would land on top of — or, since its z-index is lower, hidden BEHIND — the button bar
  // above the canvas) nor down past the canvas's own bottom edge. Only clamps the Y axis; X is
  // still free to drag anywhere, unchanged. Scoped to the PHOTO panel specifically (matching the
  // request, "2. עריכת תמונה") via lastSideSelection — the ornament/shape/text panels use a
  // different (centered, content-sized) default position this same offset math doesn't apply to,
  // so they're left free/unclamped, same as before.
  const sidePanelDrag = useDraggablePanelOffset(
    "sidePanel",
    (offset) => {
      if (!canvasRestRect || lastSideSelection?.type !== "photo") return offset;
      const maxOffsetY = Math.max(0, canvasRestRect.height - photoPanelSize.height);
      return { x: offset.x, y: Math.max(0, Math.min(offset.y, maxOffsetY)) };
    },
    { offset: sidePanelOffset, onChange: onSidePanelOffsetChange }
  );
  // The canvas's real height ceiling — how much vertical room its row actually has, not a fixed
  // vh-based guess. Needed because a genuinely reliable CSS-only version of "cap height at
  // whichever is smaller: 100% of the row, or a vh-based floor" turned out not to exist here:
  // `max-height: min(100%, calc(Xvh - Ycm))` on a flex item sized via aspect-ratio (this canvas)
  // was verified live to be silently ignored by the renderer — NOT because the 100% term fails to
  // resolve (it does resolve, to a real pixel value), but because `min()` itself doesn't get
  // applied as a clamp in this specific aspect-ratio-on-a-flex-cross-axis context, even though a
  // plain `calc()` value (no min/max function) applies correctly. A square (or any near-square)
  // cover page is exactly the case this mattered for: capped only by a conservative flat vh
  // constant, it rendered far smaller than the row it was sitting in actually had room for. This
  // measures the wrap's real rendered height and feeds it in as a plain custom-property pixel
  // value instead — no min() involved, so it's not subject to the same failure — falling back to
  // the safe vh-based constant (see the stylesheet below) until the first real measurement lands.
  const [canvasWrapHeightPx, setCanvasWrapHeightPx] = useState<number | null>(null);
  // Real desktop (≥1024px) had the exact same failure mode as the max-height case above, just on
  // the WIDTH side: `width: min(100%, var(--canvas-w-cap))` (with --canvas-w-cap itself a calc()
  // off a vh-based budget) silently stopped clamping to the vh-based alternative in this
  // environment — width tracked 100% of the row unconditionally, so a genuinely square page grew
  // exactly as wide as its row (which grows with window width) while aspect-ratio still forced a
  // matching height, and that oversized height then got externally squashed back down by the flex
  // row's own available vertical space, destroying the ratio. This only became visible once the
  // window was wide enough that 100% of the row actually exceeded the vh-based budget — narrower
  // windows (or the separate <1024px stylesheet path below, which never used min() to begin with)
  // never crossed that threshold, so the bug looked like a "full screen only" issue. Fixed the same
  // way as the height case: measure the row's real available width too, and compute the box's
  // actual pixel width/height in JS — plain arithmetic, no CSS min()/aspect-ratio involved, so
  // there's nothing left for this engine quirk to silently skip.
  const [canvasWrapWidthPx, setCanvasWrapWidthPx] = useState<number | null>(null);
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const update = () => {
      setCanvasWrapHeightPx(el.clientHeight);
      setCanvasWrapWidthPx(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Real desktop (≥1024px) canvas box, computed once in JS from both real measured dimensions —
  // see the comment on canvasWrapWidthPx above for why this replaced the old CSS min()/aspect-ratio
  // combo. null until the first ResizeObserver measurement lands; the className below has a static
  // fallback for that first paint.
  const canvasRatio = album.width_cm > 0 && album.height_cm > 0 ? album.width_cm / album.height_cm : 1.6;
  const canvasSizePx =
    canvasWrapWidthPx && canvasWrapHeightPx
      ? (() => {
          // -24 on both axes: the wrap's own 12px padding (added so the always-white page has a
          // visible gray margin around it, not just below/beside it) on each side.
          const availW = Math.max(0, canvasWrapWidthPx - 24);
          const availH = Math.max(0, canvasWrapHeightPx - 24);
          return availW / canvasRatio <= availH
            ? { width: availW, height: availW / canvasRatio }
            : { width: availH * canvasRatio, height: availH };
        })()
      : null;
  // Kept for the few call sites that only make sense for a single element (info hint, delete
  // button, side-panel text controls) — any non-empty selection, not just size 1.
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;
  const usedPhotoIds = new Set(elements.filter((e): e is AlbumPhotoElement => e.type === "photo" && !!e.photoId).map((e) => e.photoId as string));
  const sortedFavorites = (() => {
    const base = photos.filter((p) => p.is_favorite);
    if (dragPanelSort === "name") {
      return [...base].sort((a, b) => (a.original_filename ?? "").localeCompare(b.original_filename ?? "", "he"));
    }
    if (dragPanelSort === "date") {
      return [...base].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    }
    return base;
  })();
  const favoritePhotos = sortedFavorites;
  // The cover (always sort_order 0 — see createCoverSpread in GalleryManageView.tsx) is exempt
  // from the "already used on another page" exclusion below: every favorite should be pickable for
  // the cover regardless of what's already placed inside the book, since the cover is a distinct
  // piece from the interior pages, not competing with them for the same finite pool of photos.
  const isCoverPage = spread.sort_order === 0;
  // Photos already placed on OTHER pages of the album are dropped entirely (not just badged) so a
  // photo used earlier in the book never shows up as an option on a later page — except when
  // picking a page BACKGROUND (a different, non-exclusive kind of "use") or when this page IS the
  // cover.
  const pickerPhotosBase = showAllInPicker || favoritePhotos.length === 0 ? photos : favoritePhotos;
  const pickerPhotos = pickingBackground || isCoverPage ? pickerPhotosBase : pickerPhotosBase.filter((p) => !usedElsewhere?.has(p.id));
  // Drag-to-frame panel: by default, both cross-page duplicates (except on the cover, see above)
  // and same-page duplicates are excluded (so a placed photo disappears once dragged in, and a
  // photo already framed on an earlier page doesn't show up as an option here) — but "הצג הכל" per
  // explicit request overrides BOTH exclusions at once, letting the photographer deliberately reuse
  // an already-placed photo (badged ✅ everywhere it's already used, purely for review) instead of
  // it being unreachable here. Off by default, matching the request exactly. Grouped by folder/tab
  // when the gallery actually has any; otherwise every favorite sits in one flat, unlabeled group.
  const dragPanelPool = favoritePhotos.filter((p) => showAllDragPanel || ((isCoverPage || !usedElsewhere?.has(p.id)) && !usedPhotoIds.has(p.id)));
  const dragPanelGroups: { id: string; name: string | null; items: PhotoWithUrl[] }[] =
    folders && folders.length > 0
      ? [
          ...folders.map((f) => ({ id: f.id, name: f.name, items: dragPanelPool.filter((p) => p.folder_id === f.id) })),
          { id: "__none__", name: "ללא לשונית", items: dragPanelPool.filter((p) => !p.folder_id) },
        ].filter((g) => g.items.length > 0)
      : dragPanelPool.length > 0
      ? [{ id: "__all__", name: null, items: dragPanelPool }]
      : [];
  const backgroundPhoto = backgroundPhotoId ? photos.find((p) => p.id === backgroundPhotoId) : null;
  // A 0.5cm trim-safe inset expressed as a % of each axis — proportional, so it looks right on a
  // 20x30 album and a 60x40 one alike.
  const marginInsetPct = marginInsetPctFor(album);
  // Drives the circular floating menu's position — see photoMenuPositionStyle's own comment for the
  // full anchor/flip/clamp logic. Deliberately a SEPARATE reference photo from `anchorPhoto` above:
  // anchorPhoto is "whichever selected photo receives single-target actions" (unchanged), this is
  // "whichever selected photo the menu visually hangs from" — usually the same photo, but not
  // guaranteed to be when several photos are selected.
  const menuAnchorPhoto = pickMenuAnchorPhoto(selectedPhotos);
  // Free drag-anywhere offset for the circular photo menu — see useDraggablePanelOffset's own
  // comment. Reset key is the anchor photo's id, so the offset clears when a different photo
  // becomes the menu's anchor.
  const photoMenuDrag = useDraggablePanelOffset(menuAnchorPhoto?.id ?? null);
  // The hard "never cross the green frame" clamp (in photoMenuPositionStyle) needs the menu's own
  // actually-rendered height, not a guess, since it varies with however many buttons happen to be
  // visible — and per explicit request it now applies on every viewport (see that function's own
  // comment for the canvas-bound clamp this feeds), so this measurement itself stays un-gated.
  // Measured after every paint where it's mounted (rather than gated to a narrower dep list) — this
  // is a single cheap offsetHeight read, not worth the bug surface of an incomplete dependency array.
  const photoMenuRef = useRef<HTMLDivElement>(null);
  const [photoMenuHeightPx, setPhotoMenuHeightPx] = useState(0);
  useLayoutEffect(() => {
    setPhotoMenuHeightPx(photoMenuRef.current?.offsetHeight ?? 0);
  });
  const menuHeightPct = canvasRestRect && photoMenuHeightPx > 0 ? (photoMenuHeightPx / canvasRestRect.height) * 100 : null;
  const menuPositionStyle = menuAnchorPhoto ? photoMenuPositionStyle(selectedPhotos, menuAnchorPhoto, album, marginInsetPct, menuHeightPct) : null;
  // Phone/tablet-only (isCompact) button-shrink budget — reverted to how this was before a brief
  // desktop-wide generalization, per explicit request to bring the circle menu back to how it
  // behaved before that change. Desktop no longer shrinks its buttons at all; it relies solely on
  // the canvas-bound position clamp above (photoMenuPositionStyle) to stay on-page instead. Hard-
  // capped at the canvas's own full height — a single anchor photo that's itself very tall would
  // otherwise give a budget bigger than the canvas has room for at all.
  const circleMenuScaleBudgetPx =
    isCompact && canvasRestRect && menuAnchorPhoto && album.height_cm > 0
      ? Math.min(
          canvasRestRect.height,
          (menuAnchorPhoto.heightPct / 100) * canvasRestRect.height + 2 * PHOTO_BOUND_SLACK_CM * (canvasRestRect.height / album.height_cm)
        )
      : undefined;
  // Solves for the button scale that makes the WHOLE stack fit circleMenuScaleBudgetPx exactly —
  // phone/tablet only (isCompact), same fixed 0.42–0.68 range this always used before the brief
  // desktop generalization. No scroll fallback any more (per explicit "no scrolling at all"
  // request) — this scale plus the canvas-bound position clamp are what keep the menu on-page now.
  const menuButtonScale = (() => {
    if (!isCompact) return 1;
    const MIN_SCALE = 0.42;
    const MAX_SCALE = 0.68;
    if (circleMenuScaleBudgetPx == null) return MAX_SCALE;
    const totalGap = (CIRCLE_MENU_BUTTON_COUNT - 1) * CIRCLE_MENU_GAP_PX;
    const perButton = (circleMenuScaleBudgetPx - totalGap) / CIRCLE_MENU_BUTTON_COUNT;
    const solved = perButton / 28;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, solved));
  })();

  // Leaving "position image" mode whenever the selection changes elsewhere keeps its green ring
  // tied to whatever's actually selected, rather than lingering on a no-longer-selected element.
  useEffect(() => {
    setPanModeId((prev) => (prev && !selectedIds.has(prev) ? null : prev));
  }, [selectedIds]);

  // Arrow keys nudge every currently-selected element together — a fixed 2 SCREEN pixels per
  // press, per explicit request with an exact pixel value (superseding an earlier 15px/40px-Shift
  // version). xPct/yPct are percentages of the canvas's own current rendered size, not raw pixels,
  // so the same 2px has to be converted to a (generally different) %-of-width and %-of-height each
  // time using the
  // canvas's live getBoundingClientRect() — keeps the nudge feeling like a constant, predictable
  // screen distance regardless of the album's page size or the canvas's current zoom/scale, rather
  // than a step that's bigger or smaller depending on those. Skipped while focus is inside a form
  // field so normal keyboard navigation there (e.g. arrowing through a <select>) isn't hijacked.
  // xPct/yPct are plain LTR canvas coordinates regardless of the app's RTL UI (see the
  // AlbumSpreadLayout type comment), so ArrowLeft/ArrowRight map to decreasing/increasing x exactly
  // like every other drag on this canvas already does — no RTL flip needed.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if (selectedIds.size === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const stepPx = 2;
      const stepXPct = rect.width > 0 ? (stepPx / rect.width) * 100 : 0;
      const stepYPct = rect.height > 0 ? (stepPx / rect.height) * 100 : 0;
      const dx = e.key === "ArrowLeft" ? -stepXPct : e.key === "ArrowRight" ? stepXPct : 0;
      const dy = e.key === "ArrowUp" ? -stepYPct : e.key === "ArrowDown" ? stepYPct : 0;
      setElements((prev) =>
        prev.map((el) =>
          selectedIds.has(el.id) && !el.locked
            ? { ...el, xPct: Math.max(0, Math.min(95, el.xPct + dx)), yPct: Math.max(0, Math.min(95, el.yPct + dy)) }
            : el
        )
      );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds]);

  // Deletes whatever's currently selected on Delete/Backspace — skipped while focus is inside a
  // form field, same guard as the arrow-key nudge above.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      setElements((prev) => prev.filter((el) => !selectedIds.has(el.id)));
      setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds]);

  // Cmd/Ctrl+Z undoes the last action; Cmd/Ctrl+A selects every photo/ornament/shape on the page
  // (text stays single-select only, see selectedText's own comment); a bare T opens the add-text
  // panel via the same button the sidebar's own "+ טקסט" click already uses, so both paths stay in
  // sync with zero duplicated positioning logic. All skipped while focus is inside a form field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const typing = active && (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) || (active as HTMLElement).isContentEditable);
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(elements.filter((el) => el.type === "photo" || el.type === "ornament" || el.type === "shape").map((el) => el.id)));
        return;
      }
      if (!meta && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        textButtonRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [elements, undo]);

  const updateElement = (id: string, patch: Partial<AlbumElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as AlbumElement) : e)));
  };

  // Moves one element to the very end/start of the elements array — later elements paint on top
  // in a plain DOM z-order, so "front" is push-to-end and "back" is push-to-start.
  const bringToFront = (id: string) => {
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [...prev.filter((e) => e.id !== id), el];
    });
  };
  const sendToBack = (id: string) => {
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [el, ...prev.filter((e) => e.id !== id)];
    });
  };

  // Applies the same patch to every currently-selected PHOTO element — an empty toggle-value
  // (bw/sepia/lockAspect) is decided by the caller from the anchor photo's own current state
  // before calling this, so every selected photo lands on the SAME final value rather than each
  // toggling independently.
  const applyToSelectedPhotos = (patch: Partial<AlbumPhotoElement>) => {
    setElements((prev) => prev.map((e) => (e.type === "photo" && selectedIds.has(e.id) ? { ...e, ...patch } : e)));
  };

  const removeSelected = () => {
    setElements((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
  };

  // "+ מסגרת" — inserts one empty, freely movable/resizable frame into the current layout without
  // touching any existing element, for a photographer who wants to hand-extend a template/auto
  // layout with one more spot instead of regenerating the whole page.
  const addFrame = () => {
    const id = `frame-${Date.now()}`;
    setElements((prev) => [...prev, { id, type: "photo", photoId: null, xPct: 32, yPct: 32, widthPct: 36, heightPct: 36, focalX: 50, focalY: 50 }]);
    setSelectedIds(new Set([id]));
  };

  // Plays the slide-up close animation before actually unmounting the masks panel — mirrors the
  // CLOSE_ANIMATION_MS pattern used for other animated panels in this app.
  const closeTextPanel = () => {
    setTextDraftClosing(true);
    setTimeout(() => {
      setTextDraftOpen(false);
      setTextDraftClosing(false);
    }, 200);
  };

  const closeTemplatePanel = () => {
    setTemplatePickerClosing(true);
    setTimeout(() => {
      setTemplatePickerOpen(false);
      setTemplatePickerClosing(false);
    }, 200);
  };

  const closeMasksPicker = () => {
    setMasksPickerClosing(true);
    setTimeout(() => {
      setMasksPickerOpen(false);
      setMasksPickerClosing(false);
    }, 200);
  };

  const closeOrnamentsPicker = () => {
    setOrnamentsPickerClosing(true);
    setTimeout(() => {
      setOrnamentsPickerOpen(false);
      setOrnamentsPickerClosing(false);
    }, 200);
  };

  // Adds a new, freely movable/resizable ornament element — ornaments aren't tied to a photo
  // (unlike masks), so picking one just drops a fresh instance the photographer can then
  // drag/resize into place. `at` centers it on a drag-and-drop's actual drop point; omitted (a
  // plain click in the picker) falls back to a default spot near the top-left.
  const addOrnament = (ornamentId: string, at?: { xPct: number; yPct: number }) => {
    const id = `ornament-${Date.now()}`;
    const widthPct = 30;
    const heightPct = 30;
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 35;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 35;
    setElements((prev) => [...prev, { id, type: "ornament", ornamentId, xPct, yPct, widthPct, heightPct, color: "#2e3142", rotation: 0, opacity: 100 }]);
    setSelectedIds(new Set([id]));
    closeOrnamentsPicker();
  };

  // Same as addOrnament above but for a photographer-uploaded image — no `color` (an arbitrary
  // raster/vector file has its own colors already) and `customOrnamentId` instead of `ornamentId`.
  const addCustomOrnament = (customOrnamentId: string, at?: { xPct: number; yPct: number }) => {
    const id = `ornament-${Date.now()}`;
    const widthPct = 30;
    const heightPct = 30;
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 35;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 35;
    setElements((prev) => [...prev, { id, type: "ornament", customOrnamentId, xPct, yPct, widthPct, heightPct, rotation: 0, opacity: 100 }]);
    setSelectedIds(new Set([id]));
    closeOrnamentsPicker();
  };

  const closeShapesPicker = () => {
    setShapesPickerClosing(true);
    setTimeout(() => {
      setShapesPickerOpen(false);
      setShapesPickerClosing(false);
    }, 200);
  };

  // Adds a new, freely movable/resizable solid-color shape — `maskId` picks one of the same
  // ALBUM_MASKS "shape-*" outlines (undefined = a plain rectangle). Same drop-point-or-default
  // placement as addOrnament above.
  const addShape = (maskId: string | undefined, at?: { xPct: number; yPct: number }) => {
    const id = `shape-${Date.now()}`;
    const widthPct = 25;
    const heightPct = 25;
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 37.5;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 37.5;
    setElements((prev) => [...prev, { id, type: "shape", maskId, xPct, yPct, widthPct, heightPct, color: "#2e3142", rotation: 0, opacity: 100 }]);
    setSelectedIds(new Set([id]));
    closeShapesPicker();
  };

  // Outline-only presets — square/rectangle share the same rect-stroke rendering and differ only
  // in their default aspect ratio; "line" stays a plain solid fill (just very thin) but still
  // gets its own shapeStyle tag so the floating menu can show it a dedicated thickness slider and
  // the resize handles can let it (like the two true outline kinds) extend past the page edge.
  const addOutlineShape = (kind: "square" | "rectangle" | "circle" | "line", at?: { xPct: number; yPct: number }) => {
    const id = `shape-${Date.now()}`;
    let widthPct = 24;
    let heightPct = 24;
    let shapeStyle: AlbumShapeElement["shapeStyle"];
    let borderWidth: number | undefined;
    if (kind === "square") {
      shapeStyle = "rect-outline";
      borderWidth = 5;
    } else if (kind === "rectangle") {
      widthPct = 32;
      heightPct = 20;
      shapeStyle = "rect-outline";
      borderWidth = 5;
    } else if (kind === "circle") {
      shapeStyle = "circle-outline";
      borderWidth = 5;
    } else {
      widthPct = 35;
      heightPct = 1.2;
      shapeStyle = "line";
    }
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 37.5;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 37.5;
    setElements((prev) => [
      ...prev,
      { id, type: "shape", shapeStyle, xPct, yPct, widthPct, heightPct, color: "#2e3142", rotation: 0, opacity: 100, borderWidth },
    ]);
    setSelectedIds(new Set([id]));
    closeShapesPicker();
  };

  const openPickerForNewPhoto = () => {
    setFrameTargetId(null);
    setPickingBackground(false);
    setAddingMultiplePhotos(true);
    setMultiPhotoIds(new Set());
    setPhotoPickerOpen(true);
  };

  const openPickerForBackground = () => {
    setFrameTargetId(null);
    setPickingBackground(true);
    setAddingMultiplePhotos(false);
    setPhotoPickerOpen(true);
  };

  const openPickerForFrame = (id: string) => {
    setFrameTargetId(id);
    setAddingMultiplePhotos(false);
    setPhotoPickerOpen(true);
  };

  const choosePhoto = (photoId: string) => {
    if (pickingBackground) {
      setBackgroundPhotoId(photoId);
    } else if (frameTargetId) {
      updateElement(frameTargetId, { photoId, focalX: 50, focalY: 50 });
    } else {
      const id = `el-${Date.now()}`;
      setElements((prev) => [...prev, { id, type: "photo", photoId, xPct: 20, yPct: 20, widthPct: 40, heightPct: 40, focalX: 50, focalY: 50 }]);
      setSelectedIds(new Set([id]));
    }
    setPhotoPickerOpen(false);
    setFrameTargetId(null);
    setPickingBackground(false);
  };

  const toggleMultiPhoto = (photoId: string) => {
    setMultiPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  // Detects each selected photo's real orientation (client-side, via its actual pixel dimensions
  // — the app doesn't store width/height for gallery photos) so the generated layout can give
  // portrait photos a portrait-shaped frame and landscape photos a landscape-shaped one, instead
  // of an orientation-blind uniform grid.
  const loadImageAspect = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
      img.onerror = () => resolve(1);
      img.src = url;
    });

  // widthPct/heightPct are percentages of the CANVAS'S OWN width/height respectively, not of a
  // shared square unit — so "36% wide, 36%/aspect tall" only comes out looking like the photo's
  // real aspect ratio when the album's page happens to be square. For any real (non-square) album
  // size, that math silently squishes/stretches every auto-placed photo toward the page's own
  // proportions instead of the photo's. Fixed the same way `showTrueSize` above already does it:
  // work in real cm first (where an aspect ratio is honest), then convert each axis back to a
  // percentage using ITS OWN canvas dimension.
  const orientedFrameSizePct = (aspect: number, basePct: number): { widthPct: number; heightPct: number } => {
    const canvasW = album.width_cm || 1;
    const canvasH = album.height_cm || 1;
    let widthCm: number, heightCm: number;
    if (aspect >= 1) {
      widthCm = (basePct / 100) * canvasW;
      heightCm = widthCm / aspect;
    } else {
      heightCm = (basePct / 100) * canvasH;
      widthCm = heightCm * aspect;
    }
    return { widthPct: (widthCm / canvasW) * 100, heightPct: (heightCm / canvasH) * 100 };
  };

  // "הצגה בגודל נכון" — resizes the frame to the photo's own true aspect ratio (no crop needed
  // once matched) instead of whatever ratio the frame happened to have. Keeps the frame's current
  // WIDTH fixed and solves for the height that ratio implies in real cm — deliberately allowed to
  // grow past other elements or the green safe-print margin for a SINGLE photo, since that's a
  // manual per-photo action, not automatic placement, and the photographer can reposition it
  // afterward.
  // For a MULTI-photo selection, growing every photo symmetrically around its own previous center
  // (the single-photo rule above) made adjacent photos collide into each other and eat the gaps
  // between them — two photos in the same stack can grow toward each other from opposite sides at
  // once. Per explicit bug report, each photo in a multi-selection instead grows AWAY from the
  // whole selection's own shared vertical center (its far edge from center stays fixed, the near
  // edge extends outward) — for a typical row/grid selection this keeps growth pointed away from
  // the photo's own selected neighbors, preserving the gaps between them.
  // Per a further explicit bug report (with "make sure this is actually correct" — see this
  // function's own stress-tested verification, and the resize-handle drag's, in the deploy notes),
  // the GROUP case is ALSO clamped to the canvas's own 0-100% bounds on the Y axis — unlike the
  // single-photo case above, which keeps its documented "deliberately allowed to overflow" design
  // (a single manual action the photographer can immediately see and fix by hand), a multi-photo
  // batch operation silently pushing some of the selection off the page is a much easier mistake to
  // miss, so it's bounded here instead.
  const showTrueSize = async (ids: string[]) => {
    const isGroup = ids.length > 1;
    let groupCenterY = 0;
    if (isGroup) {
      const boxes = ids.map((id) => elements.find((e) => e.id === id)).filter((e): e is AlbumPhotoElement => !!e && e.type === "photo");
      if (boxes.length > 0) {
        const top = Math.min(...boxes.map((b) => b.yPct));
        const bottom = Math.max(...boxes.map((b) => b.yPct + b.heightPct));
        groupCenterY = (top + bottom) / 2;
      }
    }
    for (const id of ids) {
      const el = elements.find((e) => e.id === id);
      if (!el || el.type !== "photo" || !el.photoId || album.width_cm <= 0 || album.height_cm <= 0) continue;
      const photo = photoById.get(el.photoId);
      if (!photo) continue;
      const aspect = await loadImageAspect(photo.url);
      const widthCm = (el.widthPct / 100) * album.width_cm;
      const heightCm = widthCm / aspect;
      const newHeightPct = (heightCm / album.height_cm) * 100;
      let newY: number;
      let finalHeightPct = newHeightPct;
      if (isGroup) {
        const ownCenterY = el.yPct + el.heightPct / 2;
        const rawY = ownCenterY < groupCenterY ? el.yPct + el.heightPct - newHeightPct : el.yPct;
        finalHeightPct = Math.min(newHeightPct, 100);
        newY = Math.max(0, Math.min(rawY, 100 - finalHeightPct));
      } else {
        const centerY = el.yPct + el.heightPct / 2;
        newY = centerY - newHeightPct / 2;
      }
      updateElement(id, { heightPct: finalHeightPct, yPct: newY, focalX: 50, focalY: 50 });
    }
  };

  // "החל על כל התמונות בדף" — copies one photo's border/shadow styling onto every other photo
  // element on this page (briefly changed to "selected photos only" and then explicitly reverted
  // back to "every photo on the page" — the original scope), so matching a whole spread's frames
  // doesn't mean opening each one's own flyout and re-entering the same
  // shadow%/distance/blur/border-width/color by hand.
  const applyShadowToAllPhotos = (id: string) => {
    const source = elements.find((e) => e.id === id);
    if (!source || source.type !== "photo") return;
    const { shadow, shadowDistance, shadowBlur, shadowAngle, borderWidth, borderColor } = source;
    setElements((prev) =>
      prev.map((e) => (e.type === "photo" ? { ...e, shadow, shadowDistance, shadowBlur, shadowAngle, borderWidth, borderColor } : e))
    );
  };

  // Adds each newly-picked photo as its own medium-sized, orientation-aware frame ALONGSIDE
  // whatever's already on the page — this used to regenerate a fresh full-page layout for just
  // the new selection, silently wiping every existing photo element in the process. Sizing
  // mirrors addFrame's own default scale (a photo-shaped frame, not a full-bleed one); multiple
  // photos added in the same batch cascade diagonally so they land visibly apart instead of
  // stacked exactly on top of each other.
  const confirmMultiPhotos = async () => {
    const ids = Array.from(multiPhotoIds);
    if (ids.length === 0) return;
    setLoadingMultiLayout(true);
    const items = await Promise.all(
      ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") }))
    );
    const baseSize = 36;
    // A chosen fixed real-world size (rect 10x7.5cm / circle Ø5cm / square 5x5cm) overrides the
    // usual aspect-ratio-matched auto sizing — converted from cm using the album's own print
    // dimensions, same as every other cm-based measurement in this editor.
    const fixedCm =
      pendingPhotoSize === "rect"
        ? { w: 10, h: 7.5 }
        : pendingPhotoSize === "circle"
        ? { w: 5, h: 5 }
        : pendingPhotoSize === "square"
        ? { w: 5, h: 5 }
        : null;
    const fixedWidthPct = fixedCm && album.width_cm > 0 ? (fixedCm.w / album.width_cm) * 100 : null;
    const fixedHeightPct = fixedCm && album.height_cm > 0 ? (fixedCm.h / album.height_cm) * 100 : null;
    const newPhotoElements: AlbumPhotoElement[] = items.map((item, i) => {
      const auto = orientedFrameSizePct(item.aspect, baseSize);
      const widthPct = fixedWidthPct ?? auto.widthPct;
      const heightPct = fixedHeightPct ?? auto.heightPct;
      const cascade = i * 4;
      return {
        id: `el-${Date.now()}-${i}`,
        type: "photo",
        photoId: item.id,
        xPct: Math.min(100 - widthPct, 20 + cascade),
        yPct: Math.min(100 - heightPct, 20 + cascade),
        widthPct,
        heightPct,
        focalX: 50,
        focalY: 50,
        maskId: pendingPhotoSize === "circle" ? "shape-circle" : undefined,
      };
    });
    setElements((prev) => [...prev, ...newPhotoElements]);
    setLoadingMultiLayout(false);
    setPhotoPickerOpen(false);
    setAddingMultiplePhotos(false);
    setMultiPhotoIds(new Set());
    setSelectedIds(new Set(newPhotoElements.map((e) => e.id)));
    setPendingPhotoSize("auto");
  };

  // Same orientation-aware sizing as confirmMultiPhotos above, but anchored at an actual drop
  // point on the canvas instead of a fixed corner — used when one or several favorite photos are
  // dragged straight onto the page (from the drag panel) instead of picked in the "+ תמונה" modal.
  const buildOrientedPhotoFrames = async (ids: string[], centerXPct: number, centerYPct: number): Promise<AlbumPhotoElement[]> => {
    const items = await Promise.all(ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") })));
    const baseSize = 36;
    return items.map((item, i) => {
      const { widthPct, heightPct } = orientedFrameSizePct(item.aspect, baseSize);
      const cascade = i * 4;
      return {
        id: `el-${Date.now()}-${i}`,
        type: "photo",
        photoId: item.id,
        xPct: Math.max(0, Math.min(100 - widthPct, centerXPct - widthPct / 2 + cascade)),
        yPct: Math.max(0, Math.min(100 - heightPct, centerYPct - heightPct / 2 + cascade)),
        widthPct,
        heightPct,
        focalX: 50,
        focalY: 50,
      };
    });
  };

  // Dragging 2+ favorite photos onto an otherwise-empty page (no pre-existing empty frames to
  // fill — see the "multi:" drop handler below) auto-arranges them into a grid collage instead of
  // the single-photo cascade above: a roughly-square grid of cells covering 85% of the page, each
  // photo sized to fit its own cell via contain (not cover) so it's never cropped — its frame
  // exactly matches its own aspect ratio, same as buildOrientedPhotoFrames, just fit inside a grid
  // cell instead of a fixed base size. The photographer can still swap this for a different layout
  // afterward via the existing "תבניות" button, which already reuses whatever photos are placed.
  const buildCollageLayout = async (ids: string[]): Promise<AlbumPhotoElement[]> => {
    const items = await Promise.all(ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") })));
    const n = items.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const GAP_PCT = 2;
    const USABLE_PCT = 85;
    const outerOffset = (100 - USABLE_PCT) / 2;
    const cellW = (USABLE_PCT - GAP_PCT * (cols - 1)) / cols;
    const cellH = (USABLE_PCT - GAP_PCT * (rows - 1)) / rows;
    const canvasW = album.width_cm || 1;
    const canvasH = album.height_cm || 1;
    const itemsInLastRow = n - cols * (rows - 1);
    return items.map((item, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // Centers a short last row within the full grid width instead of leaving it flush left,
      // e.g. 5 photos → a 3-wide grid whose 2-photo last row sits centered under the row above.
      const rowItemCount = row === rows - 1 ? itemsInLastRow : cols;
      const rowStartOffset = outerOffset + ((cols - rowItemCount) * (cellW + GAP_PCT)) / 2;
      const cellLeft = rowStartOffset + col * (cellW + GAP_PCT);
      const cellTop = outerOffset + row * (cellH + GAP_PCT);

      // Contain-fit (not cover) within the cell, in real cm so the aspect ratio is honest — same
      // math as orientedFrameSizePct, just constrained to the cell's own box instead of a fixed
      // base size, and clamped down (never up) so the photo never overflows its cell.
      const cellWCm = (cellW / 100) * canvasW;
      const cellHCm = (cellH / 100) * canvasH;
      const cellAspect = cellWCm / cellHCm;
      let widthCm: number;
      let heightCm: number;
      if (item.aspect > cellAspect) {
        widthCm = cellWCm;
        heightCm = widthCm / item.aspect;
      } else {
        heightCm = cellHCm;
        widthCm = heightCm * item.aspect;
      }
      const widthPct = (widthCm / canvasW) * 100;
      const heightPct = (heightCm / canvasH) * 100;

      return {
        id: `el-${Date.now()}-${i}`,
        type: "photo",
        photoId: item.id,
        xPct: cellLeft + (cellW - widthPct) / 2,
        yPct: cellTop + (cellH - heightPct) / 2,
        widthPct,
        heightPct,
        focalX: 50,
        focalY: 50,
      };
    });
  };

  const removeBackground = () => setBackgroundPhotoId(null);

  const addText = () => {
    if (!textDraft.trim()) return;
    const id = `el-${Date.now()}`;
    // Was a flat 80% every time regardless of font size — reasonable-looking for the 40pt default,
    // wildly oversized for a short word and, in the other direction, nowhere near tall enough for
    // a big display font (several real albums use 150-230pt for a name) — see
    // textHeightPctForFontSize's own comment for why that specifically caused text to visibly
    // overflow into whatever sat below it. 60% width is a more modest default; height now tracks
    // the actual font size from the moment the box is created, not just on later edits.
    const widthPct = 60;
    const heightPct = textHeightPctForFontSize(textDraftFontSize, album);
    // Successive additions cascade like every other "add a new element" flow in this editor
    // (confirmMultiPhotos/buildOrientedPhotoFrames above use the identical i*4 step) — a flat
    // xPct:10/yPct:40 every time meant a second text box landed exactly on top of the first one,
    // pixel for pixel, which is what actually read as "text isn't layered/stacked correctly" — it
    // wasn't a paint-order bug, every new box was simply created at the identical position.
    const existingTextCount = elements.filter((e) => e.type === "text").length;
    const cascade = (existingTextCount % 8) * 4;
    setElements((prev) => [
      ...prev,
      {
        id,
        type: "text",
        text: textDraft.trim(),
        xPct: Math.min(100 - widthPct, 10 + cascade),
        yPct: Math.min(100 - heightPct, 40 + cascade),
        widthPct,
        heightPct,
        fontSize: textDraftFontSize,
        fontFamily: textDraftFontFamily,
        color: textDraftColor,
        align: "center",
      },
    ]);
    setTextDraft("");
    closeTextPanel();
    setSelectedIds(new Set([id]));
  };

  // Replaces the photo layout with the template's empty frames, best-effort auto-filling them in
  // order from favorited photos not already placed elsewhere on this page — text elements (which
  // aren't part of any template) are kept as-is. Frames are rescaled into the album's print-safe
  // area every time a template is applied — this re-fit happens regardless of the template's
  // source (built-in or the photographer's own saved one), so a template built for one album size
  // never crosses the green margin when applied to a differently-sized one.
  const applyTemplate = (rawFrames: AlbumFrame[]) => {
    const frames = fitFramesToSafeArea(rawFrames, marginInsetPct);
    // Which photos to fill the new layout with, in priority order: photos explicitly checked in
    // the favorites panel first, then whatever's already placed on the page — a photographer who
    // already dragged specific photos onto the canvas expects a template to redesign the LAYOUT
    // around those same photos, not silently swap in different ones. Only a still-empty page with
    // nothing checked falls back to the favorites pool in library order. A template with more
    // frames than photos leaves the extra frames empty (photoId: null) for the photographer to
    // fill; one with fewer frames than photos simply drops the extras, which reappear in the
    // favorites panel automatically since `usedPhotoIds` is derived straight from `elements`.
    const placedPhotoIds = elements.filter((e): e is AlbumPhotoElement => e.type === "photo" && !!e.photoId).map((e) => e.photoId as string);
    const fillIds =
      dragPanelSelectedIds.size > 0
        ? Array.from(dragPanelSelectedIds)
        : placedPhotoIds.length > 0
        ? placedPhotoIds
        : favoritePhotos.filter((p) => !usedPhotoIds.has(p.id)).map((p) => p.id);
    const newPhotoElements: AlbumPhotoElement[] = frames.map((f, i) => ({
      id: `frame-${Date.now()}-${i}`,
      type: "photo",
      photoId: fillIds[i] ?? null,
      xPct: f.xPct,
      yPct: f.yPct,
      widthPct: f.widthPct,
      heightPct: f.heightPct,
      focalX: 50,
      focalY: 50,
      rotation: f.rotation,
      borderWidth: f.borderWidth,
      borderColor: f.borderColor,
      shadow: f.shadow,
    }));
    setElements((prev) => [...newPhotoElements, ...prev.filter((e) => e.type === "text")]);
    setDragPanelSelectedIds(new Set());
    closeTemplatePanel();
    setSelectedIds(new Set());
  };

  const saveCurrentAsTemplate = async () => {
    if (!templateNameDraft.trim()) return;
    const frames: AlbumFrame[] = elements
      .filter((e): e is AlbumPhotoElement => e.type === "photo")
      .map((e) => ({
        id: e.id,
        xPct: e.xPct,
        yPct: e.yPct,
        widthPct: e.widthPct,
        heightPct: e.heightPct,
        rotation: e.rotation,
        borderWidth: e.borderWidth,
        borderColor: e.borderColor,
        shadow: e.shadow,
      }));
    if (frames.length === 0) return;
    setSavingTemplate(true);
    await onSaveTemplate(templateNameDraft.trim(), frames);
    setSavingTemplate(false);
    setTemplateNameDraft("");
    setSaveTemplateOpen(false);
  };

  // `moveGroupIds`, when given, is the exact set of elements a MOVE drag should translate together
  // (a multi-selection being dragged as one); omitted for everything else, where the group is
  // just the one dragged element. A resize's group is always every currently-selected photo (so
  // grabbing one handle scales the whole selection), computed here rather than passed in since
  // resize handles don't know about selection state themselves.
  const startDrag = (e: React.PointerEvent, el: AlbumElement, kind: "move" | "resize", resizeHandle?: ResizeHandle, moveGroupIds?: string[]) => {
    // Never drag FROM a locked element — see AlbumPhotoElement.locked's own comment in types.ts.
    // Still lets it be clicked/selected (that's handled elsewhere, before this is ever called), so
    // the photographer can still reach its own menu to unlock it.
    if (el.locked) return;
    e.stopPropagation();
    // One undo snapshot for the whole upcoming gesture, taken before dragRef.current is set below
    // — the wrapped setElements skips recording while dragRef.current is set, so without this the
    // drag's own pointermove ticks would never get captured at all.
    undoHistoryRef.current = [...undoHistoryRef.current, elements].slice(-MAX_UNDO_HISTORY);
    // Can throw in edge cases (pointer id no longer "active" by the time this runs, some
    // browsers on fast multi-touch sequences) — losing implicit capture just means a drag that
    // leaves the frame won't keep tracking, not a broken interaction, so it's not worth aborting
    // the whole gesture over.
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignored — see above
    }
    const rawGroupIds =
      kind === "resize" ? (selectedPhotos.length > 1 && selectedIds.has(el.id) ? selectedPhotos.map((p) => p.id) : [el.id]) : moveGroupIds ?? [el.id];
    // Locked elements are excluded from the group entirely, even when part of the current
    // multi-selection — a locked element must never move as a side effect of dragging/resizing the
    // REST of the group from a different (unlocked) element's own handle. `el` itself already
    // passed the guard above, so it's always kept.
    const groupIds = rawGroupIds.filter((id) => id === el.id || !elements.find((x) => x.id === id)?.locked);
    const groupStart: Record<string, { xPct: number; yPct: number; widthPct: number; heightPct: number }> = {};
    for (const id of groupIds) {
      const ge = elements.find((x) => x.id === id);
      if (!ge) continue;
      groupStart[id] = { xPct: ge.xPct, yPct: ge.yPct, widthPct: ge.widthPct, heightPct: ge.type === "photo" ? ge.heightPct : ge.heightPct ?? 15 };
    }
    dragRef.current = {
      id: el.id,
      kind,
      resizeHandle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startFocalX: el.type === "photo" ? el.focalX : 50,
      startFocalY: el.type === "photo" ? el.focalY : 50,
      startZoom: el.type === "photo" ? (el.zoom ?? 100) : 100,
      groupStart,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (altSwapSourceId) {
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      const hit = elements.find(
        (x) => x.type === "photo" && x.id !== altSwapSourceId && xPct >= x.xPct && xPct <= x.xPct + x.widthPct && yPct >= x.yPct && yPct <= x.yPct + x.heightPct
      );
      setAltSwapTargetId(hit?.id ?? null);
      return;
    }

    if (marqueeRef.current) {
      const curX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const curY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      const { startXPct, startYPct, base } = marqueeRef.current;
      const x = Math.min(startXPct, curX);
      const y = Math.min(startYPct, curY);
      const w = Math.abs(curX - startXPct);
      const h = Math.abs(curY - startYPct);
      setMarqueeBox({ x, y, w, h });
      const marquee = { left: x, top: y, right: x + w, bottom: y + h };
      const hitIds = elements
        .filter((el) => (el.type === "photo" || el.type === "shape") && boxesIntersect(elementBox(el), marquee))
        .map((el) => el.id);
      setSelectedIds(new Set([...base, ...hitIds]));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    const el = elements.find((x) => x.id === drag.id);
    const primaryStart = drag.groupStart[drag.id];
    if (!primaryStart) return;

    if (drag.kind === "resize") {
      const lockAspect = el?.type === "photo" && !!el.lockAspect;
      const allowOverflow =
        el?.type === "shape" && (el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline" || el.shapeStyle === "line");
      const handle = drag.resizeHandle ?? "se";
      const isSingleResize = Object.keys(drag.groupStart).length === 1;

      if (isSingleResize) {
        let primaryResult = computeResize(handle, primaryStart, dxPct, dyPct, lockAspect, allowOverflow, e.altKey);
        const others = elements.filter((x) => x.id !== drag.id);
        const { guides: resizeGuides, box: snappedBox, marginSnapX, marginSnapY } = computeResizeGuides(handle, primaryResult, others, marginInsetPct);
        setGuides(resizeGuides);
        setMarginSnap({ x: marginSnapX, y: marginSnapY });
        primaryResult = snappedBox;
        setElements((prev) => prev.map((e2) => (e2.id === drag.id ? { ...e2, ...primaryResult } : e2)));
        return;
      }

      // Group resize (2+ selected): treated as one rigid frame, like a real "group" — per explicit
      // request/bug report. The PREVIOUS approach computed the resize on the dragged photo's own
      // box alone and derived every other photo's scale from THAT photo's before/after size
      // (scale = draggedNewWidth / draggedOldWidth). Since computeResize adds the raw mouse-delta
      // pixels to whichever box it's given regardless of that box's own size, the same mouse
      // movement produced a WILDLY different scale factor depending on how big the specific photo
      // you happened to grab was — a small dragged photo barely looked like it changed while
      // everyone else swung disproportionately, reading exactly as "every photo resizes except the
      // one I'm dragging from." Fixed by running computeResize on the GROUP's own shared bounding
      // box instead of any individual photo's box, so the scale factor reflects how much the whole
      // selection grew/shrank — identical regardless of which photo's handle was actually grabbed —
      // then mapping every selected photo (the dragged one included, no more special-casing it)
      // by its own fractional position/size WITHIN that shared box into the new one. See
      // test_group_resize_v2.mjs (this same turn) for the empirical verification.
      setGuides([]);
      setMarginSnap({ x: false, y: false });
      const starts = Object.values(drag.groupStart);
      const groupStartBox = {
        xPct: Math.min(...starts.map((s) => s.xPct)),
        yPct: Math.min(...starts.map((s) => s.yPct)),
        widthPct: Math.max(...starts.map((s) => s.xPct + s.widthPct)) - Math.min(...starts.map((s) => s.xPct)),
        heightPct: Math.max(...starts.map((s) => s.yPct + s.heightPct)) - Math.min(...starts.map((s) => s.yPct)),
      };
      const groupResult = computeResize(handle, groupStartBox, dxPct, dyPct, lockAspect, allowOverflow, e.altKey);
      const scaleW = groupStartBox.widthPct > 0 ? groupResult.widthPct / groupStartBox.widthPct : 1;
      const scaleH = groupStartBox.heightPct > 0 ? groupResult.heightPct / groupStartBox.heightPct : 1;
      setElements((prev) =>
        prev.map((e2) => {
          const gs = drag.groupStart[e2.id];
          if (!gs) return e2;
          const relX = groupStartBox.widthPct > 0 ? (gs.xPct - groupStartBox.xPct) / groupStartBox.widthPct : 0;
          const relY = groupStartBox.heightPct > 0 ? (gs.yPct - groupStartBox.yPct) / groupStartBox.heightPct : 0;
          const newW = Math.max(8, Math.min(100, gs.widthPct * scaleW));
          const newH = Math.max(6, Math.min(100, gs.heightPct * scaleH));
          const nx = groupResult.xPct + relX * groupResult.widthPct;
          const ny = groupResult.yPct + relY * groupResult.heightPct;
          const clampedX = Math.max(0, Math.min(nx, 100 - newW));
          const clampedY = Math.max(0, Math.min(ny, 100 - newH));
          return { ...e2, xPct: clampedX, yPct: clampedY, widthPct: newW, heightPct: newH };
        })
      );
      return;
    }

    if (el?.type === "photo" && e.ctrlKey) {
      // Ctrl + horizontal drag = zoom — moving the mouse left zooms in, right zooms out, using raw
      // pixel delta (not %) so the feel stays consistent regardless of canvas size.
      const dxPx = e.clientX - drag.startClientX;
      updateElement(drag.id, { zoom: Math.max(100, Math.min(400, drag.startZoom - dxPx * 0.5)) });
      if (guides.length) setGuides([]);
      return;
    }

    if (el?.type === "photo" && panModeId === el.id) {
      // "Position image" mode — drag pans the focal point inside the fixed frame instead of
      // moving the frame; distance is normalized to the frame's own size so a drag across the
      // whole frame sweeps the full 0-100 focal range. Subtracting (not adding) the raw delta is
      // deliberate: focalX/focalY is "which part of the source image shows," which moves OPPOSITE
      // the photo's own apparent on-screen motion — dragging the mouse right should make the photo
      // itself appear to slide right, which means revealing more of its left side, i.e. a LOWER
      // focalX. Flipping the sign here (rather than in the render math) keeps every already-saved
      // photo's stored focalX/focalY meaning — and therefore its rendered/exported crop — unchanged.
      const focalX = Math.max(0, Math.min(100, drag.startFocalX - (dxPct / Math.max(1, primaryStart.widthPct)) * 100));
      const focalY = Math.max(0, Math.min(100, drag.startFocalY - (dyPct / Math.max(1, primaryStart.heightPct)) * 100));
      updateElement(drag.id, { focalX, focalY });
      if (guides.length) setGuides([]);
      return;
    }

    const groupIds = Object.keys(drag.groupStart);
    if (groupIds.length > 1) {
      // Multiple selected elements move together by the same delta. Guides/snapping are computed
      // from the PRIMARY (dragged) element against everything NOT in the group, exactly like a
      // single-element move — the resulting correction is then applied to every group member so
      // the whole selection snaps together instead of just the one frame under the cursor.
      // Clamped against the PRIMARY element's own width/height, not a flat 95 — a flat cap only
      // bounds the anchor CORNER, so anything wider/taller than 5% of the page could still be
      // dragged clean off the right/bottom edge with zero resistance. Per explicit request: no
      // element may cross the page boundary on any side, including while dragging a group.
      const groupCandidateX = Math.max(0, Math.min(100 - primaryStart.widthPct, primaryStart.xPct + dxPct));
      const groupCandidateY = Math.max(0, Math.min(100 - primaryStart.heightPct, primaryStart.yPct + dyPct));
      const groupOthers = elements.filter((x) => !drag.groupStart[x.id]);
      const groupCandidateBox = { xPct: groupCandidateX, yPct: groupCandidateY, widthPct: primaryStart.widthPct, heightPct: primaryStart.heightPct };
      const { guides: gAlignGuides, snapXPct: gaSnapX, snapYPct: gaSnapY } = computeAlignment(groupCandidateBox, groupOthers);
      const { guides: gSpacingGuides, snapXPct: gsSnapX, snapYPct: gsSnapY } = computeSpacingGuides(groupCandidateBox, groupOthers);
      setGuides(gAlignGuides);
      setSpacingGuides(gSpacingGuides);
      const correctionX = (gaSnapX ?? gsSnapX ?? groupCandidateX) - groupCandidateX;
      const correctionY = (gaSnapY ?? gsSnapY ?? groupCandidateY) - groupCandidateY;
      setElements((prev) =>
        prev.map((e2) => {
          const gs = drag.groupStart[e2.id];
          if (!gs) return e2;
          // Each group member clamped against its OWN width/height too — the shared delta keeps
          // the group moving together in the common case, but no individual member is ever let
          // through the page edge even if it's larger than the primary dragged element.
          const nx = Math.max(0, Math.min(100 - gs.widthPct, gs.xPct + dxPct + correctionX));
          const ny = Math.max(0, Math.min(100 - gs.heightPct, gs.yPct + dyPct + correctionY));
          return { ...e2, xPct: nx, yPct: ny };
        })
      );
      return;
    }

    // See the group-drag branch above for why this is clamped against the element's own
    // width/height rather than a flat 95 — same "never cross the page edge" fix.
    const candidateX = Math.max(0, Math.min(100 - primaryStart.widthPct, primaryStart.xPct + dxPct));
    const candidateY = Math.max(0, Math.min(100 - primaryStart.heightPct, primaryStart.yPct + dyPct));
    const others = elements.filter((x) => x.id !== drag.id);
    const candidateBox = { xPct: candidateX, yPct: candidateY, widthPct: primaryStart.widthPct, heightPct: primaryStart.heightPct };
    const { guides: nextGuides, snapXPct: aSnapX, snapYPct: aSnapY } = computeAlignment(candidateBox, others);
    const { guides: nextSpacingGuides, snapXPct: sSnapX, snapYPct: sSnapY } = computeSpacingGuides(candidateBox, others);
    setGuides(nextGuides);
    setSpacingGuides(nextSpacingGuides);
    updateElement(drag.id, {
      xPct: aSnapX ?? sSnapX ?? candidateX,
      yPct: aSnapY ?? sSnapY ?? candidateY,
    });
  };

  const endDrag = () => {
    if (altSwapSourceId) {
      const sourceId = altSwapSourceId;
      const targetId = altSwapTargetId;
      setAltSwapSourceId(null);
      setAltSwapTargetId(null);
      if (targetId) {
        setElements((prev) => {
          const source = prev.find((x) => x.id === sourceId);
          const target = prev.find((x) => x.id === targetId);
          if (!source || !target || source.type !== "photo" || target.type !== "photo") return prev;
          return prev.map((el) => {
            if (el.id === sourceId) return { ...el, photoId: target.photoId, focalX: target.focalX, focalY: target.focalY, zoom: target.zoom };
            if (el.id === targetId) return { ...el, photoId: source.photoId, focalX: source.focalX, focalY: source.focalY, zoom: source.zoom };
            return el;
          });
        });
      } else {
        // Released without ever hovering another frame — same fallback as the original
        // Alt+click behavior: just recenter this photo's focal point.
        updateElement(sourceId, { focalX: 50, focalY: 50 });
      }
      return;
    }
    dragRef.current = null;
    if (marqueeRef.current) {
      justMarqueedRef.current = !!marqueeBox && (marqueeBox.w > 0.5 || marqueeBox.h > 0.5);
      marqueeRef.current = null;
      setMarqueeBox(null);
    }
    setGuides([]);
    setSpacingGuides([]);
    setMarginSnap({ x: false, y: false });
  };

  const photoById = new Map(photos.map((p) => [p.id, p]));

  // Outline-only shapes (rect-outline/circle-outline, plus the thin-bar "line" preset) are the one
  // element kind allowed to be dragged/resized past the page's own edges — a deliberate bleed
  // line/frame is a real print use case, unlike a photo or filled shape overflowing by mistake. See
  // allowOverflow below for the resize-clamp side of this; rendering itself is the same in-place,
  // in-array-order pass every other element uses, so קדימה/אחורה actually reorders them against
  // photos too instead of only ever painting on top.
  const renderShapeEl = (el: AlbumShapeElement, isSelected: boolean) => {
    const mask = el.maskId ? findMask(el.maskId) : undefined;
    const isOutline = el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline";
    return (
      <div
        key={el.id}
        onPointerDown={(e) => {
          setSelectedIds(new Set([el.id]));
          startDrag(e, el, "move");
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIds(new Set([el.id]));
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.getData("text/plain");
          if (!dropped?.startsWith("mask:")) return;
          const maskId = dropped.slice(5);
          updateElement(el.id, { maskId: maskId === "__none__" ? undefined : maskId });
        }}
        className="absolute cursor-move"
        style={{
          left: `${el.xPct}%`,
          top: `${el.yPct}%`,
          width: `${el.widthPct}%`,
          height: `${el.heightPct}%`,
          opacity: (el.opacity ?? 100) / 100,
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          borderRadius: el.shapeStyle === "circle-outline" ? "50%" : undefined,
          border: isOutline ? `${el.borderWidth ?? 5}px solid ${el.borderColor ?? el.color}` : undefined,
          outline: isOutline
            ? isSelected
              ? "2px dashed var(--color-amber-deep)"
              : "none"
            : el.borderWidth
            ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}`
            : isSelected
            ? "2px dashed var(--color-amber-deep)"
            : "none",
          outlineOffset: isOutline ? "2px" : el.borderWidth ? `-${el.borderWidth}px` : undefined,
          boxShadow: boxShadowFor(el.shadow, undefined, undefined, el.shadowAngle),
        }}
      >
        {!isOutline && (
          <div
            className="w-full h-full pointer-events-none"
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
        {isSelected && !el.locked && renderResizeHandles(el, startDrag)}
      </div>
    );
  };

  const isDirty = () => JSON.stringify([elements, backgroundPhotoId, backgroundBlur, backgroundOpacity, backgroundZoom]) !== initialSnapshotRef.current;

  // Keeps a real server-rendered JPEG of THIS spread in sync via the same raster pipeline the
  // actual JPG/PSD/PDF exports use — not the editor's own live CSS preview (canvas +
  // AlbumSpreadThumbnail), which is already always in sync since it's driven straight from
  // `elements`, but is a browser CSS approximation rather than the true render. Fire-and-forget —
  // per explicit request that this fires on BOTH entering and leaving the edit page, and it must
  // never block either on a render that's slow or fails.
  const renderPreviewNow = () => {
    fetch(`/api/album-spreads/${spread.id}/render-preview`, { method: "POST" }).catch(() => {});
  };
  useEffect(() => {
    renderPreviewNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.id]);

  // Gates BOTH ways of leaving this page behind the same unsaved-changes check: closing back to
  // the main screen (onClose) and switching to a different album page via the bottom strip
  // (onSwitchSpread) — the photographer explicitly asked for page-switching to require the same
  // save-or-discard guard as exiting, since both abandon this page's in-progress edits the same way.
  // Also the single choke point every leave path funnels through BEFORE branching (immediate,
  // skip-confirm, or the exit-confirm dialog) — firing renderPreviewNow() once here, right as
  // leaving is requested, covers all of them instead of needing it at each dialog button too.
  const requestLeave = async (action: () => void) => {
    renderPreviewNow();
    if (!isDirty()) {
      action();
      return;
    }
    if (skipExitConfirm) {
      // onSave (saveSpreadElements) ends by nulling the editor's own target state once its
      // save request resolves — awaiting it here ensures that null-out lands BEFORE action()
      // runs, so a page-switch action isn't clobbered by the save's own trailing state reset.
      await onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom });
      action();
      return;
    }
    setPendingLeaveAction(() => action);
    setExitConfirmOpen(true);
  };

  const handleCloseAttempt = () => requestLeave(onClose);

  // Shown instead of the whole tool below — see the needsRotate comment above for why this isn't
  // just a one-time dismissible tip: it reappears every time the modal is opened (or left) in
  // portrait, and the real canvas never mounts until the device is already in landscape.
  if (needsRotate) {
    return (
      <div
        className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 p-6 text-center ${ALBUM_FONT_CLASS_NAMES}`}
        style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      >
        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sheet" style={{ color: "var(--color-amber-deep)" }}>
          <IconRotateDevice size={28} />
        </div>
        <div className="text-white">
          <p className="text-lg font-bold font-display mb-1">סובבו את המכשיר למצב אופקי</p>
          <p className="text-sm opacity-80">כלי עיצוב האלבום פועל רק במצב אופקי — סובבו את הטלפון כדי להמשיך</p>
        </div>
        <button onClick={handleCloseAttempt} className="mt-1 h-9 px-4 rounded-full bg-white text-ink text-sm font-semibold">
          סגירה
        </button>
      </div>
    );
  }

  // The brief, deliberately visible step between the rotate-prompt above and the real canvas below
  // — see the phase state's own comment for why this exists as its own render instead of jumping
  // straight from the prompt to the canvas.
  if (phase === "settling") {
    return (
      <div
        className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 ${ALBUM_FONT_CLASS_NAMES}`}
        style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      >
        <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        <p className="text-sm text-white opacity-80">טוען את הכלי...</p>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 overflow-hidden ${ALBUM_FONT_CLASS_NAMES}`}
      style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      // Right-click (and the page's own custom menu, if it ever grows one) does nothing here —
      // there's no editor context menu to show. Shift+right-click specifically forces the
      // browser/OS's OWN native menu open regardless of this handler — that's a deliberate
      // browser-level user override with no JS hook to intercept, not something this can block.
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Real desktop (≥1024px) is completely untouched by this — every rule below is scoped
          inside `@media (max-width: 1023.98px)`. Below that width the card is sized with real
          vw/vh dimensions (not `zoom`, not `transform: scale()`) — both of those were tried and
          both left real iOS devices tapping several rows below the visible button, worst on a
          standalone home-screen PWA: the box those properties PAINT and the box the OS resolves a
          finger tap against can disagree there in a way this environment's own tools never
          reproduced. A real width/height has no such gap — there's only one box, so there's
          nothing for painting and hit-testing to disagree about.

          This only ever needs a LANDSCAPE layout: the component returns the rotate-prompt screen
          above instead of this whole tree whenever the device is under 1024px and portrait, so by
          the time this renders on a phone/tablet, it's already landscape — no portrait variant of
          these rules exists, and none is needed. */}
      <style>{`
        .gf-album-editor-card {
          --canvas-h-budget: 66vh;
        }
        /* Phone's compact photo-adjust sliders — the native range thumb doesn't shrink along with
           the track's own reduced height, so it stays a comparatively huge white circle even on
           this tiny slider. -webkit/-moz here since there's no unprefixed standard way to size a
           native range thumb. Only ever applied via the compact MiniSlider variant, so this has no
           effect on desktop's own (non-compact) sliders elsewhere in this file. */
        .gf-compact-range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--color-amber-deep);
          cursor: pointer;
        }
        .gf-compact-range-thumb::-moz-range-thumb {
          width: 9px;
          height: 9px;
          border: none;
          border-radius: 50%;
          background: var(--color-amber-deep);
          cursor: pointer;
        }
        /* Every regular (non-compact) slider in this tool — SliderControl and MiniSlider alike —
           used to fall through to each browser's own default thumb, whatever size/shape that
           happens to be. Now that most of these live inside the narrower floating overlay panels
           (.gf-album-selection-info and its siblings) instead of a full-width sidebar, an
           oversized default thumb reads as visibly out of proportion with the track around it.
           One explicit, consistent thumb size/style for all of them, matching (roughly doubled
           from) the compact phone variant above. */
        .gf-slider-thumb {
          height: 4px;
          border-radius: 2px;
          background: var(--color-line);
          -webkit-appearance: none;
          appearance: none;
        }
        .gf-slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--color-amber-deep);
          box-shadow: 0 1px 3px rgba(30, 27, 46, 0.35);
          cursor: pointer;
          margin-top: -6px;
        }
        .gf-slider-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border: none;
          border-radius: 50%;
          background: var(--color-amber-deep);
          box-shadow: 0 1px 3px rgba(30, 27, 46, 0.35);
          cursor: pointer;
        }
        .gf-slider-thumb::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: var(--color-line);
        }
        /* Shared by phone and desktop — keeps the drag-to-frame panel's own label, hover-zoom
           toggle + its (?) explanation, and the folder tabs pinned in view while the photo grid
           below scrolls, per explicit request that these not disappear on scroll. Sticks to the
           top of .gf-album-dragpanel itself (the nearest scrolling ancestor), not the viewport. */
        .gf-album-dragpanel-sticky-header {
          position: sticky;
          top: 0;
          z-index: 5;
          background: var(--color-paper);
          padding-bottom: 6px;
        }
        /* The page itself (.gf-album-canvas) is now always literal white — a genuine gray backdrop
           behind it (not just the app's own --color-paper, which is near-white in light mode and
           near-black in dark mode) is what actually keeps a white page from visually disappearing
           into its surroundings in either theme. Shared by phone and desktop — not scoped inside
           either breakpoint's own block below. */
        .gf-album-canvas-wrap {
          background: #d7d5df;
          border-radius: 20px;
          padding: 12px;
        }
        :root[data-theme="dark"] .gf-album-canvas-wrap {
          background: #37333f;
        }
        @media (max-width: 1023.98px) {
          .gf-album-editor-card {
            width: 96vw !important;
            height: 94vh !important;
            max-width: none !important;
            max-height: none !important;
            display: flex !important;
            flex-direction: ${isPhone ? "column" : "row"} !important;
            gap: ${isPhone ? "8px" : "14px"} !important;
            padding: 8px 14px !important;
            overflow: visible !important;
            --canvas-h-budget: ${isPhone ? "38vh" : "60vh"};
          }
          ${
            isPhone
              ? `
          /* Phone only. A real CSS grid, not flex + order — the earlier flex version centered the
             canvas vertically across its WHOLE flex column, which on a real device let a canvas
             taller than the leftover space bleed upward and paint over the header row above it
             (confirmed on-device, not just a theoretical risk). Grid gives the header its own
             permanently-reserved row that nothing else can paint over.
             Layout: two columns (left ~40% / right 60vw), three rows (header spans both columns;
             canvas + page-switcher stack in the right column; the favorites drag panel fills the
             whole left column beside them, instead of the full-width strip it used to render as
             below everything — that's the second explicit fix here, not just the overlap). */
          .gf-album-editor-main {
            order: 2;
            min-width: 0;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 54vw;
            grid-template-rows: auto minmax(0, 1fr) auto;
            column-gap: 10px;
            row-gap: 6px;
          }
          .gf-album-editor-sidebar {
            order: 1;
            width: 100% !important;
            max-width: none !important;
            max-height: 15vh !important;
            flex-shrink: 0;
          }
          .gf-album-header {
            grid-column: 1 / -1;
            grid-row: 1;
            /* The circular menu / photo-adjust panel float via position:fixed/absolute with no
               clipping ancestor (deliberately, so they can bleed past the canvas edge — see their
               own comments) and read their geometry off measured rects, not exact math against this
               grid — so on a real device their edge can end up a few px into the header's own screen
               region. Instead of chasing that measurement gap further, this makes the header itself
               unconditionally win the paint order: a real background + a z-index above both floating
               panels (z-20) guarantees "עיצוב חופשי" / מדריך למשתמש / the close button are never
               visually covered, regardless of any floating panel's exact computed position. */
            position: relative;
            z-index: 30;
            background: var(--color-paper);
          }
          .gf-album-canvas-wrap {
            grid-column: 2;
            grid-row: 2;
            min-height: 0;
            /* Was center-aligned — centering means any residual overflow (the exact row height
               coming out a few px short on a real device) bleeds equally up AND down, and bleeding
               UP is what let the canvas's own top edge get clipped by the outer modal's
               overflow-hidden backdrop above the header. Top-aligned means any such overflow can
               only ever bleed downward, into the page-switcher's own row below — recoverable, and
               a real cut top edge is now structurally impossible regardless of exact sizing math.
            padding-top moved it down ~1cm per an explicit follow-up request, approved via a
            reference mockup. */
            align-items: flex-start !important;
            padding-top: 1cm;
          }
          /* Sized purely from its own aspect-ratio (already set inline below) capped by BOTH
             dimensions of its grid cell — width: auto + max-width/max-height (no explicit width) is
             what makes the browser shrink whichever dimension actually needs it, instead of always
             trusting a computed width and letting height overflow into the row above. */
          .gf-album-canvas {
            /* var(--canvas-computed-w/h, auto) — see that inline style's own comment for why a
               plain (non-custom-property) JS-computed width/height silently lost to these
               !important rules despite looking like it should win. */
            width: var(--canvas-computed-w, auto) !important;
            max-width: 100% !important;
            height: var(--canvas-computed-h, auto) !important;
            /* A pure vh ceiling — NOT wrapped in min(100%, ...) as it used to be. Confirmed live (a
               square 20x20 cover spread) that the 100% term breaks max-height entirely for a flex
               item whose height comes from aspect-ratio-on-auto-width rather than a stretched cross
               axis: the item's containing block has no definite height for that percentage to
               resolve against here, which makes the whole max-height value invalid and therefore
               ignored (not "capped at 100%" — no cap at all), so a square page rendered at its full
               768px content width also rendered at 768px tall, blowing straight through this row and
               getting clipped by the card's overflow:hidden. A non-square page happened to stay
               small enough not to visibly break, which is why this only ever surfaced on a square
               cover. The vh-only value has no such ambiguity (viewport units are always definite) and
               was verified to correctly clamp the box in devtools before landing this fix. */
            max-height: var(--canvas-h-cap, calc(32vh - 1.5cm)) !important;
            margin: 0 !important;
          }
          /* Dropped entirely on phone too now, per explicit request — matches the same change
             already made for desktop (it wasn't visible in practice and added clutter). */
          .gf-album-pageswitcher {
            display: none !important;
          }
          .gf-album-dragpanel {
            grid-column: 1;
            /* Still spans what used to be the canvas+page-switcher rows, even though the
               page-switcher row is empty now (display:none above) — the empty row-3 track just
               contributes nothing to the span's total height. */
            grid-row: 2 / 4;
            min-height: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
            margin-top: 0 !important;
            padding-top: 0 !important;
            border-top: none !important;
          }
          `
              : ""
          }
        }
        /* Real desktop only (>=1024px) -- the phone/tablet block above (max-width: 1023.98px) is
           completely untouched by anything below. Mirrors the phone's own idea (a dedicated
           action-button strip + the favorites panel given its own real estate) but laid out for a
           wide screen: a 2-row button bar spanning the full width, the canvas + page-switcher on
           the right, and the favorites panel promoted to where the button column used to live --
           not squeezed into a narrow strip like the old single-column desktop sidebar was.
           .gf-album-editor-main/-sidebar switch to display:contents so their own children (the
           header, the button bar, the canvas, the page-switcher, the drag panel -- previously two
           separate DOM subtrees) become direct items of ONE grid on .gf-album-editor-card, each
           positioned independently instead of inheriting whichever subtree they happened to be
           nested in. Every floating panel/menu in this tool (circular menu, side panels, flyouts)
           is position:fixed/absolute already, so this re-parenting doesn't affect any of them. */
        @media (min-width: 1024px) {
          .gf-album-editor-card {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 380px;
            grid-template-rows: auto auto auto minmax(0, 1fr) auto;
            gap: 14px 20px !important;
            /* Needed so .gf-album-selection-info's position:absolute (below) resolves against
               this card instead of falling through to the fixed full-viewport backdrop several
               ancestors up — an abspos grid item's grid-row/grid-column alone turned out NOT to be
               enough to pin its containing block to that specific grid area in this environment. */
            position: relative;
          }
          .gf-album-editor-main {
            display: contents !important;
          }
          .gf-album-editor-sidebar {
            display: contents !important;
          }
          .gf-album-header {
            grid-column: 1 / -1;
            grid-row: 1;
          }
          /* Was a normal grid row (row 2, between the header and the button bar) — sizing to fit
             its own content meant the canvas's row (row 4, a fixed 5-row grid) visibly shifted
             down every time a text/photo selection appeared or grew, per an explicit report that
             this made the canvas feel like it was "jumping". Taken out of flow with
             position:absolute so it no longer reserves real track height — floats as a card over
             the canvas's own column instead. Its grid-row/grid-column are dropped (an abspos grid
             item's placement alone did NOT resolve its containing block to that specific grid area
             in this environment — see .gf-album-editor-card's own position:relative comment above),
             so "left" is pinned past the 380px sidebar column + its 20px gap by hand instead —
             matching this same stylesheet's own hardcoded grid-template-columns value above. */
          .gf-album-selection-info {
            position: absolute;
            top: 40px;
            left: 400px;
            right: 0;
            z-index: 30;
            background: var(--color-paper);
            border-radius: 16px;
            box-shadow: 0 10px 28px rgba(30, 27, 46, 0.2);
            padding: 10px 14px;
            max-height: 100%;
            overflow-y: auto;
          }
          .gf-album-desktop-buttons {
            grid-column: 1 / -1;
            grid-row: 3;
            /* The action buttons were getting covered by the canvas below them — same fix as the
               header/selection-info rows: a real background + a z-index above the canvas/floating
               panels, so this row unconditionally wins the paint order no matter what — including
               above .gf-album-selection-info itself (z-index 30), which is taller than its own
               reserved space for a tall selection (e.g. the full text-element controls) and used to
               visually cover these buttons when both landed on the same screen position. */
            position: relative;
            z-index: 35;
            background: var(--color-paper);
          }
          .gf-album-canvas-wrap {
            grid-column: 1;
            grid-row: 4;
            min-height: 0;
            min-width: 0;
            /* Top-aligned (was centered) — approved via a reference mockup. padding-top removed
               (was 1cm) per explicit follow-up "move the canvas up 1cm" — it now sits flush at the
               top of its own row, right below the button bar's own gap. */
            display: flex;
            align-items: flex-start !important;
          }
          /* Width still fills the column edge-to-edge (max-width:100%) per the earlier approved
             mockup — only the height shrank here. max-height combines the grid-relative cap with a
             real physical cm-based one: the net of two follow-up size requests (-2cm top+bottom,
             then +1cm back on the bottom) landed on "about 1cm shorter than the original 40vh" as
             confirmed by the final approved image. */
          .gf-album-canvas {
            /* var(--canvas-computed-w/h, auto) — see the mobile block's own comment above (and the
               inline style that sets these) for why a plain JS-computed width/height silently lost
               to these !important rules despite looking like it should win. */
            width: var(--canvas-computed-w, auto) !important;
            max-width: 100% !important;
            height: var(--canvas-computed-h, auto) !important;
            /* Pure vh ceiling, not min(100%, ...) — see the mobile block's comment above for why the
               100% term silently invalidated this whole property for a square (or any near-square)
               page, letting it render at full uncapped content size and get clipped. */
            max-height: var(--canvas-h-cap, calc(40vh - 1cm)) !important;
            margin: 0 auto !important;
          }
          /* Dropped entirely on desktop, per explicit request — it wasn't even visible in practice
             and was adding clutter/vertical pressure the layout doesn't need. Phone keeps it
             unchanged; this only removes it from the real-desktop grid painted above. */
          .gf-album-pageswitcher {
            display: none !important;
          }
          .gf-album-dragpanel {
            grid-column: 2;
            /* Still spans what used to be the canvas+page-switcher rows, even though the
               page-switcher row is empty now (display:none above) — grid-row:4/6 just means "align
               with the canvas row's own height", since the empty row-5 track contributes nothing. */
            grid-row: 4 / 6;
            height: 90%;
            align-self: start;
            min-height: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
            margin-top: 0 !important;
            padding-top: 0 !important;
            border-top: none !important;
          }
        }
      `}</style>
      <div className="gf-album-editor-card w-full max-w-sm lg:max-w-none lg:w-[95vw] lg:h-[92vh] rounded-3xl p-4 lg:px-6 lg:pt-2 lg:pb-4 bg-paper shadow-sheet max-h-[92vh] overflow-y-auto overscroll-contain lg:overflow-visible lg:flex lg:flex-row lg:gap-6">
        <div className="gf-album-editor-main flex-1 flex flex-col min-w-0 min-h-0">
        <div className="gf-album-header flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-display">{mode === "custom" ? "עיצוב חופשי" : "הוספת טקסט לעמוד"}</h2>
          </div>
          <div className="flex items-center gap-2">
            {mode === "custom" && onAddPage && (
              <button
                onClick={() => requestLeave(() => onAddPage())}
                className="h-8 pr-3 pl-2.5 rounded-full flex items-center gap-1 bg-white border border-line text-xs font-bold whitespace-nowrap text-ink"
              >
                <IconPlusSmall size={13} />
                עמוד חדש
              </button>
            )}
            {mode === "custom" && (
              <button
                onClick={() => setGuideOpen(true)}
                // Was a flat bg-chip pill, same as static text elsewhere on this bar — nothing
                // signaled it was actually clickable. A visible border + accent color + icon reads
                // as an actual button instead of a label.
                className="h-8 pr-3 pl-2.5 rounded-full flex items-center gap-1 bg-white border border-line text-xs font-bold whitespace-nowrap"
                style={{ color: "var(--color-amber-deep)" }}
              >
                <IconInfo size={13} />
                מדריך למשתמש
              </button>
            )}
            <button onClick={handleCloseAttempt} className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center bg-white border border-line">
              <IconClose />
            </button>
          </div>
        </div>
        {guideOpen && <AlbumEditorGuideModal onClose={() => setGuideOpen(false)} />}
        {exitConfirmOpen && (
          <div
            className="fixed inset-0 z-[96] flex items-center justify-center p-4"
            style={{ background: "rgba(46,49,66,0.55)" }}
            onClick={() => {
              setExitConfirmOpen(false);
              setPendingLeaveAction(null);
            }}
          >
            <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold font-display mb-2">השינויים בעמוד לא נשמרו</h2>
              <p className="text-sm text-ink-soft leading-relaxed mb-4">לשמור אותם עכשיו, או לצאת בלי לשמור?</p>

              <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip mb-4">
                <span className="text-xs text-ink-soft leading-relaxed flex-1">
                  אל תציג לי את החלון הזה שוב — תמיד שמור אוטומטית ביציאה
                </span>
                <button
                  onClick={() => {
                    const next = !skipExitConfirm;
                    setSkipExitConfirm(next);
                    localStorage.setItem("albumEditorSkipExitConfirm", next ? "1" : "0");
                  }}
                  role="switch"
                  aria-checked={skipExitConfirm}
                  className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                  style={{
                    background: skipExitConfirm ? "var(--color-amber-deep)" : "var(--color-line)",
                    justifyContent: skipExitConfirm ? "flex-start" : "flex-end",
                  }}
                >
                  <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    // Same ordering fix as requestLeave's skip-confirm path: onSave nulls the
                    // editor's own target state once it resolves, so it must finish before the
                    // pending switch/close action runs, or the save's trailing reset wins the race.
                    await onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom });
                    setExitConfirmOpen(false);
                    pendingLeaveAction?.();
                    setPendingLeaveAction(null);
                  }}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white"
                >
                  שמירה ויציאה
                </button>
                <button
                  onClick={() => {
                    setExitConfirmOpen(false);
                    pendingLeaveAction?.();
                    setPendingLeaveAction(null);
                  }}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose"
                >
                  יציאה בלי שמירה
                </button>
                <button
                  onClick={() => {
                    setExitConfirmOpen(false);
                    setPendingLeaveAction(null);
                  }}
                  className="w-full rounded-lg py-2 text-xs font-semibold text-ink-soft"
                >
                  ביטול, המשך לעריכה
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={canvasWrapRef} className="gf-album-canvas-wrap flex-1 flex items-center justify-center min-h-0">
        {/* Not overflow-hidden (unlike the canvas below) so the floating photo menu — and the
            flyout sliders it opens — can bleed past the canvas's own edge, not just the photo's. */}
        <div className="relative w-full max-w-full">
        <div
          ref={canvasRef}
          onPointerDown={(e) => {
            // A press directly on the empty canvas (not bubbled from an element, which all
            // stopPropagation their own pointerdown) starts a rubber-band marquee — held Shift
            // adds newly-enclosed photos to whatever's already selected instead of replacing it.
            if (e.target !== e.currentTarget) return;
            const rect = canvasRef.current!.getBoundingClientRect();
            const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            marqueeRef.current = { startXPct: xPct, startYPct: yPct, base: e.shiftKey ? new Set(selectedIds) : new Set() };
            setMarqueeBox({ x: xPct, y: yPct, w: 0, h: 0 });
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const dropped = e.dataTransfer.getData("text/plain");
            if (!dropped) return;
            const rect = canvasRef.current!.getBoundingClientRect();
            const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            if (dropped.startsWith("multi:")) {
              // A bundle of favorite photos dragged together from the panel. If a template was
              // already applied (or frames added manually) leaving empty photo frames on the
              // page, fill those first — each photo goes into whichever empty frame's own aspect
              // ratio is closest to its own (portrait photos into portrait-shaped frames, etc,
              // a simple greedy best-fit rather than a full optimal assignment). Only once every
              // empty frame is used does this fall back to the original behavior: fresh frames,
              // sized per photo's own orientation and cascaded from the actual drop point.
              e.preventDefault();
              const ids = dropped.slice(6).split(",").filter(Boolean);
              const emptyFrames = elements.filter((el): el is AlbumPhotoElement => el.type === "photo" && !el.photoId);
              Promise.all(ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") }))).then(async (items) => {
                if (emptyFrames.length === 0) {
                  // 2+ photos with nothing to fill get auto-arranged into a grid collage instead
                  // of the single-photo cascade (see buildCollageLayout's own comment) — a lone
                  // photo still just drops at the cursor like before.
                  const frames = ids.length >= 2 ? await buildCollageLayout(ids) : await buildOrientedPhotoFrames(ids, xPct, yPct);
                  setElements((prev) => [...prev, ...frames]);
                  setSelectedIds(new Set(frames.map((f) => f.id)));
                  return;
                }
                const canvasW = album.width_cm || 1;
                const canvasH = album.height_cm || 1;
                const frameAspect = (f: AlbumPhotoElement) => ((f.widthPct / 100) * canvasW) / ((f.heightPct / 100) * canvasH);
                const remainingItems = [...items];
                const assignments: { frameId: string; photoId: string }[] = [];
                for (const frame of emptyFrames) {
                  if (remainingItems.length === 0) break;
                  const fa = frameAspect(frame);
                  let bestIdx = 0;
                  let bestDiff = Infinity;
                  remainingItems.forEach((item, idx) => {
                    const diff = Math.abs(item.aspect - fa);
                    if (diff < bestDiff) {
                      bestDiff = diff;
                      bestIdx = idx;
                    }
                  });
                  assignments.push({ frameId: frame.id, photoId: remainingItems.splice(bestIdx, 1)[0].id });
                }
                const leftoverIds = remainingItems.map((it) => it.id);
                const leftoverFrames = leftoverIds.length > 0 ? await buildOrientedPhotoFrames(leftoverIds, xPct, yPct) : [];
                setElements((prev) => [
                  ...prev.map((el) => {
                    const a = assignments.find((x) => x.frameId === el.id);
                    if (!a || el.type !== "photo") return el;
                    // Contain-fit the assigned photo's own aspect ratio within the frame's
                    // PRE-EXISTING box (shrink-only, centered) instead of leaving the frame's size
                    // untouched — same technique buildCollageLayout already uses for its own grid
                    // cells, applied here so a photo assigned into an existing (e.g. template)
                    // frame is never cropped. Shrink-only + centered-in-place means the frame can
                    // only get smaller within its own original footprint, never grow outward into
                    // a neighboring frame's gap.
                    const matchedItem = items.find((it) => it.id === a.photoId);
                    if (!matchedItem) return { ...el, photoId: a.photoId, focalX: 50, focalY: 50 };
                    const boxWCm = (el.widthPct / 100) * canvasW;
                    const boxHCm = (el.heightPct / 100) * canvasH;
                    const boxAspect = boxWCm / boxHCm;
                    let widthCm: number;
                    let heightCm: number;
                    if (matchedItem.aspect > boxAspect) {
                      widthCm = boxWCm;
                      heightCm = widthCm / matchedItem.aspect;
                    } else {
                      heightCm = boxHCm;
                      widthCm = heightCm * matchedItem.aspect;
                    }
                    const widthPct = (widthCm / canvasW) * 100;
                    const heightPct = (heightCm / canvasH) * 100;
                    const centerX = el.xPct + el.widthPct / 2;
                    const centerY = el.yPct + el.heightPct / 2;
                    return {
                      ...el,
                      photoId: a.photoId,
                      focalX: 50,
                      focalY: 50,
                      widthPct,
                      heightPct,
                      xPct: centerX - widthPct / 2,
                      yPct: centerY - heightPct / 2,
                    };
                  }),
                  ...leftoverFrames,
                ]);
                setSelectedIds(new Set([...assignments.map((a) => a.frameId), ...leftoverFrames.map((f) => f.id)]));
              });
              setDragPanelSelectedIds(new Set());
              return;
            }
            if (
              !dropped.startsWith("ornament:") &&
              !dropped.startsWith("customOrnament:") &&
              !dropped.startsWith("shape:") &&
              !dropped.startsWith("shapeOutline:") &&
              !dropped.startsWith("mask:")
            ) {
              // A single favorite photo dropped on empty canvas (not consumed by any frame's own
              // onDrop, which stops propagation when it lands on an existing frame) — create a new
              // frame sized to match the photo's real orientation instead of silently doing nothing.
              e.preventDefault();
              buildOrientedPhotoFrames([dropped], xPct, yPct).then((frames) => {
                setElements((prev) => [...prev, ...frames]);
                setSelectedIds(new Set(frames.map((f) => f.id)));
              });
              return;
            }
            if (dropped.startsWith("mask:")) return;
            e.preventDefault();
            if (dropped.startsWith("customOrnament:")) addCustomOrnament(dropped.slice(15), { xPct, yPct });
            else if (dropped.startsWith("shapeOutline:")) addOutlineShape(dropped.slice(13) as "square" | "rectangle" | "circle" | "line", { xPct, yPct });
            else if (dropped.startsWith("shape:")) addShape(dropped.slice(6) === "__plain__" ? undefined : dropped.slice(6), { xPct, yPct });
            else addOrnament(dropped.slice(9), { xPct, yPct });
          }}
          onClick={(e) => {
            // Deselect only when the canvas background itself was clicked — a click on an
            // element bubbles up here too (pointerdown selecting it happens first, but a plain
            // stopPropagation on that pointerdown doesn't stop the separate click event that
            // follows on pointerup), so without this check every selection immediately
            // undid itself before the resize handle even had a chance to render. A click that
            // follows a real marquee drag is suppressed once so finishing the marquee doesn't
            // immediately wipe out the selection it just made.
            if (e.target !== e.currentTarget) return;
            if (justMarqueedRef.current) {
              justMarqueedRef.current = false;
              return;
            }
            setSelectedIds(new Set());
          }}
          // Not overflow-hidden — outline-only shapes (rect-outline/circle-outline/line) are
          // deliberately allowed to bleed past the page edge (see renderShapeEl and allowOverflow
          // below), and clipping here would silently cut them off again despite computeResize's own
          // allowOverflow letting their xPct/widthPct actually go past 0..100. Every other element
          // stays clamped to the page by computeResize as before, so this has no visible effect on
          // them; a zoomed-in photo is still self-clipped by its own frame div's overflow-hidden,
          // independent of this one. The one cosmetic side effect: a background photo's own sharp
          // corners can now peek very slightly past this box's rounded corners.
          // Aspect ratio used to be a flat aspect-[16/10] — wrong for any album whose real
          // width_cm/height_cm isn't 16:10 (most of the size presets aren't), which silently
          // stretched/squished every percentage-positioned photo frame to fit the wrong-shaped box.
          // It's now driven by the album's own real proportions via the aspectRatio style below, so
          // the on-screen canvas is actually shaped like the printed page. The width cap budgets a
          // share of the card's own real height to the canvas (the rest goes to the header/
          // margins), via the --canvas-h-budget custom property — 66vh on real desktop, 60vh on
          // phone/tablet landscape (both real viewport-relative values, set by the <style> block
          // above; there's no separate reference-box size to convert between anymore).
          className="gf-album-canvas relative w-[min(100%,var(--canvas-w-cap))] mx-auto rounded-xl select-none"
          style={{
            containerType: "inline-size",
            // Always literal white — this represents the physical printed page, not an app
            // surface, so it must NOT follow the app's own light/dark theme (bg-white or bg-line
            // would: both get retargeted by :root[data-theme="dark"] overrides in globals.css).
            // The surrounding .gf-album-canvas-wrap now carries a themed gray backdrop instead, so
            // this white page always has real contrast against it in either theme.
            background: "#ffffff",
            aspectRatio: `${album.width_cm || 16} / ${album.height_cm || 10}`,
            // JS-computed explicit pixel width/height (canvasSizePx) is meant to win over the
            // width-cap class/aspect-ratio combo above at real desktop (≥1024px) — see canvasSizePx's
            // own comment for why that combo can't be trusted to hold the true ratio at large window
            // widths. A PLAIN inline style here never actually did that, though: both the mobile and
            // desktop `.gf-album-canvas` stylesheet rules below set `width: auto !important` /
            // `height: auto !important`, and `!important` always beats an inline style regardless of
            // specificity — so this object's width/height were silently dead code the whole time,
            // still showing the exact "square cover renders as a rectangle at wide window widths" bug
            // this was meant to fix. Confirmed empirically 2026-09-16 after the text-bidi bug turned
            // out to be a real, un-shipped fix too — checked this one in devtools instead of assuming
            // the comment above (which claimed this already worked) was right. Fixed by routing
            // through CSS custom properties instead of fighting the !important rules head-on — same
            // indirection --canvas-h-cap/--canvas-w-cap already use two lines down.
            ["--canvas-computed-w" as string]: canvasSizePx ? `${canvasSizePx.width}px` : "auto",
            ["--canvas-computed-h" as string]: canvasSizePx ? `${canvasSizePx.height}px` : "auto",
            ["--canvas-w-cap" as string]: `calc(var(--canvas-h-budget) * ${(album.width_cm > 0 && album.height_cm > 0 ? album.width_cm / album.height_cm : 1.6)})`,
            // The row's real measured height (see canvasWrapHeightPx above), minus a small safety
            // margin for sub-pixel/font-metric slop — lets a square or near-square page grow to
            // fill however much vertical room its row actually has, instead of always being capped
            // at the same flat vh-based guess every other ratio uses too (fine for a wide page,
            // wastefully small for a square one). Left unset (falling through to the stylesheet's
            // own vh-based default) until the first real measurement lands.
            ...(canvasWrapHeightPx ? { ["--canvas-h-cap" as string]: `${Math.max(0, canvasWrapHeightPx - 24)}px` } : {}),
          } as React.CSSProperties}
        >
          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
            {/* One <defs> per photo, keyed by id — so dragging one photo's adjustment sliders only
                touches that photo's own filter DOM node (React skips unchanged siblings), instead of
                re-parsing every adjusted photo's filter on every tick. */}
            {elements
              .filter((el): el is AlbumPhotoElement => el.type === "photo" && hasAdjustments(el))
              .map((el) => (
                <defs key={el.id} dangerouslySetInnerHTML={{ __html: adjustmentsSvgFilter(el.id, el) }} />
              ))}
            {elements
              .filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.sharpness)
              .map((el) => (
                <defs key={`sharpen-${el.id}`} dangerouslySetInnerHTML={{ __html: sharpenSvgFilter(el.id, el.sharpness) }} />
              ))}
          </svg>
          {backgroundPhoto && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={backgroundPhoto.previewUrl ?? backgroundPhoto.url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{
                opacity: backgroundOpacity / 100,
                filter: backgroundBlur ? `blur(${(backgroundBlur / 100) * ALBUM_BLUR_MAX_PX}px)` : undefined,
                // Same 100-400 "extra scale on top of the object-fit:cover baseline" convention as
                // a regular photo element's own zoom — see AlbumPhotoElement.zoom's own comment.
                transform: backgroundZoom !== 100 ? `scale(${backgroundZoom / 100})` : undefined,
              }}
            />
          )}
          {mode === "overlay" && (
            <div className={`absolute inset-0 flex ${spread.layout === "stack" ? "flex-col" : "flex-row"} gap-0.5 pointer-events-none`}>
              {photo1 && (
                <div className="relative overflow-hidden" style={{ flex: photo2 && spread.layout === "feature" ? 1 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo1.previewUrl ?? photo1.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_1}% ${spread.focal_y_1}%` }} />
                </div>
              )}
              {photo2 && (
                <div className="relative overflow-hidden" style={{ flex: spread.layout === "feature" ? 1.6 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo2.previewUrl ?? photo2.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_2}% ${spread.focal_y_2}%` }} />
                </div>
              )}
            </div>
          )}

          {elements
            .filter((el) => mode === "custom" || el.type === "text")
            .map((el) => {
              const isSelected = selectedIds.has(el.id);
              if (el.type === "photo") {
                const photo = el.photoId ? photoById.get(el.photoId) : null;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      // Alt/Cmd held: start a swap gesture instead of the normal move-drag. A
                      // plain Alt+click (released without ever hovering another frame) still
                      // falls back to the original behavior — recenter this photo's focal point
                      // inside its own fixed frame — handled in endDrag below.
                      if (photo && (e.altKey || e.metaKey)) {
                        e.stopPropagation();
                        try {
                          (e.target as Element).setPointerCapture(e.pointerId);
                        } catch {
                          // ignored — losing capture just means a drag leaving the frame stops tracking
                        }
                        setSelectedIds(new Set([el.id]));
                        setAltSwapSourceId(el.id);
                        return;
                      }
                      if (e.shiftKey) {
                        // Shift-click toggles this frame in/out of the selection instead of
                        // starting a drag — mixing in a text element (which isn't part of this
                        // multi-select model) just drops it and starts a fresh photo-only set.
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const photoOnly = [...prev].every((id) => elements.find((x) => x.id === id)?.type === "photo");
                          const next = new Set(photoOnly ? prev : []);
                          if (next.has(el.id)) next.delete(el.id);
                          else next.add(el.id);
                          return next;
                        });
                        return;
                      }
                      // A plain click on a frame already part of a multi-selection keeps the whole
                      // group selected (so the drag that follows moves all of them); otherwise it
                      // collapses selection down to just this one, matching every other design tool.
                      const group = selectedIds.has(el.id) && selectedIds.size > 1 ? Array.from(selectedIds) : [el.id];
                      setSelectedIds(new Set(group));
                      startDrag(e, el, "move", undefined, group);
                    }}
                    onDoubleClick={(e) => {
                      // A double-click centers the photo within its frame directly (no extra click
                      // on a "מרכז תמונה" button needed — that flyout button was removed) and also
                      // drops straight into "position image" mode, the same mode the floating
                      // menu's מיקום התמונה button opens, so a following drag pans the now-centered
                      // photo inside its own fixed frame instead of moving the frame.
                      if (!photo) return;
                      e.stopPropagation();
                      updateElement(el.id, { focalX: 50, focalY: 50 });
                      setSelectedIds(new Set([el.id]));
                      setPanModeId(el.id);
                    }}
                    onContextMenu={(e) => {
                      // Right-click still never shows an OS/browser context menu (see the modal
                      // root's own onContextMenu), but now selects the frame first, which is what
                      // actually makes the floating design menu appear — previously this was a
                      // dead click that needed a left-click first regardless.
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds(new Set([el.id]));
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dropped = e.dataTransfer.getData("text/plain");
                      if (!dropped) return;
                      if (dropped.startsWith("mask:")) {
                        e.stopPropagation();
                        const maskId = dropped.slice(5);
                        updateElement(el.id, { maskId: maskId === "__none__" ? undefined : maskId });
                      } else if (
                        dropped.startsWith("multi:") ||
                        dropped.startsWith("ornament:") ||
                        dropped.startsWith("customOrnament:") ||
                        dropped.startsWith("shape:")
                      ) {
                        // Not a single-photo drop — leave it to bubble up to the canvas's own
                        // onDrop: a multi-photo bundle always creates fresh frames of its own
                        // (rather than overwriting whatever it happened to land on), and
                        // ornaments/shapes are placed at the actual drop point on the page.
                      } else {
                        e.stopPropagation();
                        updateElement(el.id, { photoId: dropped, focalX: 50, focalY: 50 });
                      }
                    }}
                    className={`absolute overflow-hidden ${photo ? (panModeId === el.id ? "cursor-crosshair" : "cursor-move") : "cursor-move flex items-center justify-center bg-chip"}`}
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      outline: altSwapTargetId === el.id
                        ? "3px solid var(--color-amber-deep)"
                        : panModeId === el.id
                        ? "2px solid var(--color-sage)"
                        : isSelected
                        ? "2px solid var(--color-amber-deep)"
                        : "1px dashed rgba(255,255,255,0.6)",
                      outlineOffset: altSwapTargetId === el.id ? "-3px" : undefined,
                      // Drop shadow only — stays on this element (not clipped by its own
                      // overflow-hidden, so it can bleed past the cropped frame). The border used to
                      // live here too (as a second, inset box-shadow segment) but a full-bleed
                      // opaque <img> child paints ON TOP of a parent's own box-shadow in normal paint
                      // order, so the inset border segment was silently invisible behind the photo —
                      // only became visible once opacity/blur made the photo partially see-through.
                      // Fixed the same way as the desktop app's SpreadPreview.tsx: border now lives
                      // on a separate, later sibling div below (guaranteed to paint above the img).
                      boxShadow: boxShadowFor(el.shadow, el.shadowDistance, el.shadowBlur, el.shadowAngle),
                      // Rotation lives on THIS element (not the <img>) so the outline and
                      // box-shadow — both decorations of this same box — rotate along with the
                      // clipped photo as one rigid tile, instead of only the image content
                      // spinning inside a frame that stays visually fixed.
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      // Dim the frame currently being dragged as an alt-swap source, so it's
                      // visually clear which photo is "picked up" while hovering for a target.
                      opacity: altSwapSourceId === el.id ? 0.45 : 1,
                    }}
                  >
                    {photo ? (
                      (() => {
                        const frameAspect = ((el.widthPct * album.width_cm) / (el.heightPct * album.height_cm)) || 1;
                        const imgAspect = photoAspects[photo.id] ?? frameAspect;
                        const framing = computePhotoFraming(imgAspect, frameAspect, el.zoom ?? 100, el.focalX, el.focalY);
                        return (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={photo.previewUrl ?? photo.url}
                            alt=""
                            className="absolute pointer-events-none"
                            onLoad={(e) => {
                              const w = e.currentTarget.naturalWidth;
                              const h = e.currentTarget.naturalHeight;
                              if (!w || !h) return;
                              setPhotoAspects((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: w / h }));
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
                      })()
                    ) : (
                      <span
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPickerForFrame(el.id);
                        }}
                        className="text-ink-soft text-2xl cursor-pointer"
                      >
                        +
                      </span>
                    )}
                    {!!el.borderWidth && (
                      // A later sibling than the <img> above, not the parent's own box-shadow —
                      // guarantees the border paints ON TOP of the photo regardless of stacking-
                      // context edge cases. See the parent's boxShadow comment for the full story.
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ boxShadow: `inset 0 0 0 ${el.borderWidth}px ${el.borderColor ?? "#fff"}` }}
                      />
                    )}
                    {isSelected && !el.locked && renderResizeHandles(el, startDrag)}
                  </div>
                );
              }
              if (el.type === "ornament") {
                const ornament = el.customOrnamentId ? null : findOrnament(el.ornamentId);
                const customUrl = el.customOrnamentId ? customOrnaments?.find((o) => o.id === el.customOrnamentId)?.url : undefined;
                const imgSrc = customUrl ?? (ornament ? ornamentDataUrl(ornament, el.color ?? "#2e3142") : undefined);
                const customTint = el.customOrnamentId && el.color ? el.color : undefined;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      setSelectedIds(new Set([el.id]));
                      startDrag(e, el, "move");
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds(new Set([el.id]));
                    }}
                    className="absolute cursor-move"
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      opacity: (el.opacity ?? 100) / 100,
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      outline: el.borderWidth
                        ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}`
                        : isSelected
                        ? "2px dashed var(--color-amber-deep)"
                        : "none",
                      outlineOffset: el.borderWidth ? `-${el.borderWidth}px` : undefined,
                      boxShadow: boxShadowFor(el.shadow, undefined, undefined, el.shadowAngle),
                    }}
                  >
                    {imgSrc &&
                      (customTint ? (
                        <div
                          className="w-full h-full pointer-events-none"
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
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgSrc} draggable={false} className="w-full h-full pointer-events-none" style={{ objectFit: "contain" }} />
                      ))}
                    {isSelected && !el.locked && renderResizeHandles(el, startDrag)}
                  </div>
                );
              }
              if (el.type === "shape") {
                // Rendered in-place, in the same array order as every other element — including
                // outline shapes (rect-outline/circle-outline/line), so "קדימה"/"אחורה" actually
                // moves them in front of or behind a photo/ornament, not just among themselves.
                // Safe to bleed past the page edge here since this canvas has no overflow-hidden.
                return renderShapeEl(el, isSelected);
              }
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => {
                    setSelectedIds(new Set([el.id]));
                    startDrag(e, el, "move");
                  }}
                  className="absolute cursor-move px-1 flex items-center overflow-visible"
                  style={{
                    left: `${el.xPct}%`,
                    top: `${el.yPct}%`,
                    width: `${el.widthPct}%`,
                    height: `${el.heightPct ?? 15}%`,
                    justifyContent: el.align === "right" ? "flex-end" : el.align === "left" ? "flex-start" : "center",
                    textAlign: el.align,
                    color: el.color,
                    // fontSize is stored in points on the album's fixed 1600pt PDF reference canvas
                    // (matches PAGE_WIDTH in albumPdf.ts) — cqw here is "% of this canvas's own
                    // rendered width," so the same ratio keeps the same visual size everywhere.
                    fontSize: `calc(${el.fontSize} / 1600 * 100cqw)`,
                    fontFamily: albumFontFamilyCss(el.fontFamily),
                    fontWeight: 700,
                    // A plain, always-on contrast shadow by default — the moment the photographer
                    // sets a real shadow/glow value via the sliders, that takes over completely
                    // instead of stacking on top of it (two shadow systems fighting on the same
                    // text would just look muddy).
                    textShadow:
                      el.shadow || el.glow
                        ? textShadowFor(el.shadow, el.glow)
                        : isLightTextColor(el.color)
                          ? "0 1px 4px rgba(0,0,0,0.7)"
                          : "0 1px 4px rgba(255,255,255,0.7)",
                    outline: isSelected ? "2px dashed var(--color-amber-deep)" : "none",
                  }}
                >
                  <span>{el.text}</span>
                  {isSelected && (
                    <span
                      onPointerDown={(e) => startDrag(e, el, "resize")}
                      className="absolute bottom-0.5 left-0.5 h-4 w-4 bg-amber-deep cursor-nwse-resize rounded-sm"
                    />
                  )}
                </div>
              );
            })}

          {/* Print-safe margin guide — visual-only (never exported), shows where a 0.5cm trim
              margin falls on every edge regardless of the album's physical size, so nothing
              important gets designed too close to where a printer might trim it off. Split into
              4 independent edge lines (rather than one bordered box) so resizing a frame right up
              to the margin can flash just the edge that was actually reached — full opacity and a
              thicker line — instead of a static frame the photographer can only eyeball. */}
          {marginInsetPct && (
            <>
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${marginInsetPct.x}%`,
                  top: `${marginInsetPct.y}%`,
                  bottom: `${marginInsetPct.y}%`,
                  width: 0,
                  borderRight: `${marginSnap.x ? 3 : 2}px solid #2fae5c`,
                  opacity: marginSnap.x ? 1 : 0.55,
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  right: `${marginInsetPct.x}%`,
                  top: `${marginInsetPct.y}%`,
                  bottom: `${marginInsetPct.y}%`,
                  width: 0,
                  borderLeft: `${marginSnap.x ? 3 : 2}px solid #2fae5c`,
                  opacity: marginSnap.x ? 1 : 0.55,
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  top: `${marginInsetPct.y}%`,
                  left: `${marginInsetPct.x}%`,
                  right: `${marginInsetPct.x}%`,
                  height: 0,
                  borderBottom: `${marginSnap.y ? 3 : 2}px solid #2fae5c`,
                  opacity: marginSnap.y ? 1 : 0.55,
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  bottom: `${marginInsetPct.y}%`,
                  left: `${marginInsetPct.x}%`,
                  right: `${marginInsetPct.x}%`,
                  height: 0,
                  borderTop: `${marginSnap.y ? 3 : 2}px solid #2fae5c`,
                  opacity: marginSnap.y ? 1 : 0.55,
                }}
              />
            </>
          )}

          {/* Page-center guide — always visible (not just while dragging), same green as the
              print-safe margin frame above, so the page's own center is a fixed visual reference
              alongside it rather than something that only appears mid-drag. */}
          <div className="absolute pointer-events-none" style={{ left: "50%", top: 0, bottom: 0, width: 0, borderRight: "2px solid #2fae5c", opacity: 0.55 }} />
          <div className="absolute pointer-events-none" style={{ top: "50%", left: 0, right: 0, height: 0, borderBottom: "2px solid #2fae5c", opacity: 0.55 }} />

          {/* Smart alignment guides — page-center and edge/center lines against other elements,
              shown only while actively dragging a frame. */}
          {guides.map((g, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={
                g.axis === "v"
                  ? { left: `${g.pos}%`, top: 0, bottom: 0, width: 0, borderRight: "1px solid var(--color-rose)" }
                  : { top: `${g.pos}%`, left: 0, right: 0, height: 0, borderBottom: "1px solid var(--color-rose)" }
              }
            />
          ))}

          {/* Equal-spacing guides — a different color (sage) from the rose alignment lines so the
              two kinds of snap read as distinct: "lined up" vs "evenly spaced". A third color
              (blue) marks the specific case of matching a real photo's gap against the page's own
              centerline rather than another real photo — per explicit request, so a photographer
              can tell at a glance which kind of "equal" just happened. */}
          {spacingGuides.map((g, i) => {
            const color = g.kind === "centerline" ? "#2f6fed" : "var(--color-sage)";
            return (
              <div
                key={i}
                className="absolute pointer-events-none"
                style={
                  g.orientation === "horizontal"
                    ? { left: `${g.x}%`, top: `${g.y}%`, width: `${g.length}%`, height: 0, borderTop: `2px dashed ${color}` }
                    : { left: `${g.x}%`, top: `${g.y}%`, width: 0, height: `${g.length}%`, borderLeft: `2px dashed ${color}` }
                }
              />
            );
          })}

          {/* A dashed rectangle around the WHOLE selection's own bounding box, shown whenever 2+
              photos are selected — a visible cue that the group is being treated as one unit
              (matching the resize-together/shared-anchor behavior in the resize branch above),
              not just each photo's own individual outline. */}
          {selectedPhotos.length > 1 && (() => {
            const left = Math.min(...selectedPhotos.map((p) => p.xPct));
            const top = Math.min(...selectedPhotos.map((p) => p.yPct));
            const right = Math.max(...selectedPhotos.map((p) => p.xPct + p.widthPct));
            const bottom = Math.max(...selectedPhotos.map((p) => p.yPct + p.heightPct));
            return (
              <div
                className="absolute pointer-events-none rounded-sm"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${right - left}%`,
                  height: `${bottom - top}%`,
                  outline: "1.5px dashed var(--color-amber-deep)",
                  outlineOffset: "4px",
                }}
              />
            );
          })()}

          {/* Rubber-band marquee selection box — live while dragging on empty canvas. */}
          {marqueeBox && (
            <div
              className="absolute pointer-events-none border-2"
              style={{
                left: `${marqueeBox.x}%`,
                top: `${marqueeBox.y}%`,
                width: `${marqueeBox.w}%`,
                height: `${marqueeBox.h}%`,
                borderColor: "var(--color-amber-deep)",
                background: "rgba(74,95,217,0.08)",
              }}
            />
          )}

          {/* Opens the background photo's opacity/blur sliders (see the flyout panel further down)
              — placed at the canvas's own bottom-left corner rather than behind a second click on
              the "תמונת רקע" button, so it's reachable on phone too and doesn't disappear once
              that button becomes a plain set/remove toggle. */}
          {mode === "custom" && backgroundPhoto && (
            <button
              ref={bgSlidersButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                const r = bgSlidersButtonRef.current?.getBoundingClientRect();
                if (r) setBackgroundPanelRect({ top: Math.max(8, r.top - 210), left: r.left, width: 220 });
                setBackgroundPanelOpen((v) => !v);
              }}
              title="שקיפות וטשטוש רקע"
              aria-label="שקיפות וטשטוש רקע"
              className="absolute bottom-2 left-2 z-10 h-8 w-8 rounded-full flex items-center justify-center shadow"
              style={{
                background: backgroundPanelOpen ? "var(--color-amber-deep)" : "#fff",
                color: backgroundPanelOpen ? "#fff" : "#201f33",
                boxShadow: "0 2px 6px rgba(46,49,66,0.22), 0 0 0 1px var(--color-line)",
              }}
            >
              <IconOpacity />
            </button>
          )}
        </div>
        {anchorPhoto && menuAnchorPhoto && menuPositionStyle && (() => {
          // Used to track the selected photo's own x position (and flip left/right depending on
          // which canvas half it sat in) — per explicit request, dropped entirely: the menu now
          // opens at one fixed spot on the canvas's own right edge no matter where the photo is,
          // exactly like .gf-album-selection-info's own fixed position above no longer tracks the
          // selection either.
          const sidePosition: React.CSSProperties = { right: "8px", left: "auto" };
          return (
          <PhotoFloatingMenu
            el={anchorPhoto}
            positionStyle={{ ...menuPositionStyle, ...sidePosition }}
            menuRef={photoMenuRef}
            panning={selectedIds.size === 1 && panModeId === anchorPhoto.id}
            onTogglePan={() => {
              if (selectedIds.size !== 1) return;
              setPanModeId((prev) => (prev === anchorPhoto.id ? null : anchorPhoto.id));
            }}
            onUpdate={(patch) => applyToSelectedPhotos(patch)}
            onTrueSize={() => showTrueSize(selectedPhotos.filter((p) => p.photoId).map((p) => p.id))}
            onApplyShadowToAll={() => applyShadowToAllPhotos(anchorPhoto.id)}
            onDeleteSelected={removeSelected}
            onBringToFront={() => bringToFront(anchorPhoto.id)}
            onSendToBack={() => sendToBack(anchorPhoto.id)}
            buttonScale={menuButtonScale}
            dragOffset={photoMenuDrag.offset}
            dragGripHandlers={photoMenuDrag.gripHandlers}
            shadowPanelOpen={photoShadowPanelOpen}
            onToggleShadowPanel={() => setPhotoShadowPanelOpen((v) => !v)}
            photoAdjustPanelOpen={photoAdjustPanelOpen}
            onTogglePhotoAdjustPanel={() => setPhotoAdjustPanelOpen((v) => !v)}
          />
          );
        })()}
        {/* The text panel's own toggle — a single circular "T" button, same visual language as
            PhotoFloatingMenu's circle-menu (CircleButton), at a fixed spot on the canvas's own top
            edge rather than tracking the selected text box's position (same "stop making panels
            jump around when the selection changes" reasoning already applied to the big side panel
            below — see its own comment). Text has no multi-button circular strip of its own the
            way photos do; one button is enough since everything else (color/font/align/size/
            shadow/glow/lock/delete) lives inside the panel this opens, not scattered across more
            circle buttons. */}
        {selectedText && canvasRestRect && (
          <div className="fixed z-20" style={{ top: canvasRestRect.top + 8, right: "8px" }}>
            <CircleButton label="עריכת טקסט — גופן, צבע, יישור ועוד" active={textPanelOpen} onClick={() => setTextPanelOpen((v) => !v)}>
              <span className="font-display font-bold" style={{ fontSize: 15 }}>T</span>
            </CircleButton>
          </div>
        )}
        {lastSideSelection && canvasRestRect && (() => {
          // Used to flip left/right depending on which half of the canvas the selected PHOTO sat
          // in — dropped per explicit request: it made the panel jump to a different spot every
          // time a different photo was selected, which read as the panel "moving around" rather
          // than staying put. Now always the same fixed side — never tracks the photo. Was the
          // canvas's right edge (matching PhotoFloatingMenu's own right-edge anchor); moved to the
          // LEFT edge per explicit request with a marked-up screenshot showing exactly where this
          // panel should sit — the circular PhotoFloatingMenu (opacity/blur/rotation/shadow icons)
          // stays on the right, unaffected, this is only the bigger adjustments panel below it.
          const openOnLeft = true;
          // The photo-adjustments panel's size is now a FIXED default (16cm long × 7cm wide —
          // see photoPanelSize/photoPanelDefault*Px near canvasRestRect's own declaration),
          // identical for every photo regardless of that photo's own dimensions — superseding
          // every earlier attempt at matching/adding-to the selected photo's own size. Freely
          // resizable from there via the corner handle (PanelResizeHandle below); the override
          // persists across selections per useResizablePanelSize's own comment.
          const panelWidth = lastSideSelection.type === "photo" ? photoPanelSize.width : 150;
          const photoAdjustMaxHeightPx = lastSideSelection.type === "photo" ? photoPanelSize.height : undefined;
          // A single FIXED default screen position — used for every photo alike, never computed
          // from the selected element's own position. Per explicit, repeated correction: "לא משנה
          // איזה תמונה מסומנת... הפאנל יופיע [במקום קבוע]" (no matter which photo is selected, the
          // panel appears in the SAME fixed spot). Sits right at the canvas's OWN top edge — "ממש
          // מעל איפה שהתמונות מוצגות" (right above where the photos are shown) — per a correction to
          // an earlier attempt that placed it entirely above the canvas instead, which then
          // overlapped the button bar above it (and, being a lower z-index, rendered hidden BEHIND
          // those buttons). sidePanelDrag's own clamp (see its declaration) keeps it from being
          // dragged past the canvas's own top/bottom edges from here. Ornament/shape/text
          // selections keep the older canvas-centered fallback.
          const centerY = canvasRestRect.top + canvasRestRect.height / 2;
          const panelTopPx = lastSideSelection.type === "photo" ? canvasRestRect.top : centerY;
          // Suspends the open/close transition during EITHER a live drag OR a live resize — both
          // change this element's own size/position every pointermove, and a CSS transition on
          // those same properties would otherwise fight the real-time updates the exact same way
          // the drag-vs-transition bug did (see sidePanelDrag.isDragging's own history above).
          const suspendTransition = sidePanelDrag.isDragging || photoPanelSize.isResizing;
          return (
          <div
            className="fixed z-20"
            style={{
              // Anchored to the canvas's OWN live rect (measured at rest, see canvasRestRect above)
              // — not a hardcoded viewport offset. For the photo panel specifically, sidePanelDrag's
              // own clamp (see its declaration) keeps this from ever being dragged high enough to
              // reach the button bar above the canvas — see that clamp's own comment for why (it
              // used to land there, and since this z-20 layer is BELOW that row's z-35, rendered
              // hidden behind it rather than on top). Ornament/shape/text panels stay unclamped.
              top: panelTopPx,
              left: openOnLeft
                ? Math.max(8, canvasRestRect.left + 8 - (lastSideSelection.type === "photo" ? panelLeftShiftPx : 0))
                : Math.max(canvasRestRect.left + 8, Math.min(canvasRestRect.left + canvasRestRect.width - panelWidth - 8, window.innerWidth - panelWidth - 16)),
              // The open/close slide-in transform composes with the free drag offset (see
              // useDraggablePanelOffset) by appending a second translate() — CSS applies multiple
              // translate()s additively, so the panel still opens/closes with its usual animation
              // AND stays wherever the photographer last dragged it to.
              transform: `${
                photoAdjustMaxHeightPx != null
                  ? sidePanelOpen ? "translateX(0)" : "translateX(10px)"
                  : sidePanelOpen ? "translateY(-50%) translateX(0)" : "translateY(-50%) translateX(10px)"
              } translate(${sidePanelDrag.offset.x}px, ${sidePanelDrag.offset.y}px)`,
              opacity: sidePanelOpen ? 1 : 0,
              pointerEvents: sidePanelOpen ? "auto" : "none",
              transition: suspendTransition ? "none" : "opacity 220ms ease, transform 220ms ease",
            }}
          >
            <PanelDragGrip handlers={sidePanelDrag.gripHandlers} />
            {lastSideSelection.type === "photo" && <PanelResizeHandle handlers={photoPanelSize.resizeHandlers} />}
            {lastSideSelection.type === "ornament" ? (
              <OrnamentFloatingMenu
                el={lastSideSelection.el}
                onUpdate={(patch) => updateElement(lastSideSelection.el.id, patch)}
                onDeleteSelected={removeSelected}
                onBringToFront={() => bringToFront(lastSideSelection.el.id)}
                onSendToBack={() => sendToBack(lastSideSelection.el.id)}
              />
            ) : lastSideSelection.type === "shape" ? (
              <ShapeFloatingMenu
                el={lastSideSelection.el}
                albumHeightCm={album.height_cm}
                onUpdate={(patch) => updateElement(lastSideSelection.el.id, patch)}
                onDeleteSelected={removeSelected}
                onBringToFront={() => bringToFront(lastSideSelection.el.id)}
                onSendToBack={() => sendToBack(lastSideSelection.el.id)}
              />
            ) : lastSideSelection.type === "text" ? (
              <TextFloatingMenu el={lastSideSelection.el} album={album} onUpdate={(patch) => updateElement(lastSideSelection.el.id, patch)} onDeleteSelected={removeSelected} />
            ) : (
              <PhotoAdjustFloatingMenu
                el={lastSideSelection.el}
                onUpdate={(patch) => applyToSelectedPhotos(patch)}
                compact={isPhone}
                maxHeightPx={photoAdjustMaxHeightPx}
                widthPx={panelWidth}
              />
            )}
          </div>
          );
        })()}
        {/* The shadow/border overlay — per explicit request, appears as a layer ON TOP of the
            "עריכת תמונה" panel (same position/left-shift/drag-offset, higher z-index) rather than
            as a small flyout attached to the circle menu's own "צל" button. Only mounted while
            open (no fade animation, matching how the circle menu's own opacity/blur/rotation
            flyouts already show/hide) — it disappears the instant the photo is deselected, since
            photoShadowPanelOpen itself resets to false whenever anchorPhoto changes (see that
            state's own comment), and the next click on "צל" reopens it fresh. */}
        {photoShadowPanelOpen && anchorPhoto && canvasRestRect && (
          <div
            className="fixed z-[25]"
            style={{
              top: canvasRestRect.top,
              left: Math.max(8, canvasRestRect.left + 8 - panelLeftShiftPx),
              transform: `translate(${sidePanelDrag.offset.x}px, ${sidePanelDrag.offset.y}px)`,
            }}
          >
            <PhotoShadowOverlayPanel
              el={anchorPhoto}
              onUpdate={(patch) => applyToSelectedPhotos(patch)}
              onApplyShadowToAll={() => applyShadowToAllPhotos(anchorPhoto.id)}
              widthPx={photoPanelSize.width}
            />
          </div>
        )}
        </div>
        </div>

        {/* Quick page switcher — every page in this album (the current one included, just marked
            and inert), at the same live-preview shape as the main album grid, so a photographer can
            jump between pages without leaving to the main screen and losing their place. Switching
            pages goes through the exact same unsaved-changes gate as the X button (requestLeave),
            since abandoning this page's edits to look at another one is the same kind of "leaving"
            as closing the whole tool. Desktop-only, matching the rest of this hidden lg:flex layout.

            The current page used to be filtered OUT of this list — which meant every page switch
            removed a different item from the strip, so the whole row visibly reflowed/shifted even
            though the underlying page order (spreads' own sort_order) never actually changed. Always
            rendering every page keeps the row's order and positions stable across switches; the
            current one is just visually marked instead of vanishing. A card background (not just a
            thin border-t) gives this its own clearly separated region instead of blending into the
            controls sidebar above it. */}
        {mode === "custom" && spreads && spreads.length > 1 && onSwitchSpread && (
          <div
            className={`gf-album-pageswitcher block shrink-0 mt-3 rounded-2xl ${isPhone ? "p-2" : "p-3"}`}
            // Pinned to the canvas's own actually-rendered width (not just its grid cell's, which
            // can be wider than the canvas itself once aspect-ratio makes height the binding
            // dimension — see .gf-album-canvas's own comment) via canvasRestRect, on both phone and
            // desktop now, per explicit request that this strip stay strictly within the canvas's
            // own width bounds on both.
            style={{ background: "var(--color-chip)", width: canvasRestRect ? canvasRestRect.width : undefined }}
          >
            <p className="text-[11px] font-bold text-ink-soft mb-2">שאר העמודים באלבום</p>
            {/* Always horizontal-scroll, never wraps — sized so exactly 4 thumbnails fit across the
                strip's own width before the rest need a sideways scroll to reach, on both phone and
                desktop now (desktop used to be a fixed w-24 regardless of the strip's real width). */}
            <div className={`flex items-center overflow-x-auto overscroll-contain pb-1 ${isPhone ? "gap-1.5" : "gap-2"}`}>
              {spreads.map((s, i) => {
                const isCurrent = s.id === spread.id;
                return (
                  <div
                    key={s.id}
                    className="relative shrink-0 rounded-lg overflow-hidden w-[calc(25%-5px)]"
                    style={{
                      outline: isCurrent ? "2px solid var(--color-amber-deep)" : "1px solid var(--color-line)",
                      outlineOffset: isCurrent ? "-2px" : undefined,
                      opacity: isCurrent ? 0.7 : 1,
                    }}
                  >
                    <AlbumSpreadThumbnail
                      spread={s}
                      album={album}
                      photos={photos}
                      customOrnaments={customOrnaments}
                      onClick={isCurrent ? undefined : () => requestLeave(() => onSwitchSpread(s.id))}
                    />
                    <span
                      className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: isCurrent ? "var(--color-amber-deep)" : "rgba(46,49,66,0.65)" }}
                    >
                      {i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Moved here (from the sidebar) so this favorites drag panel is an actual grid child
            of gf-album-editor-main and can be positioned into the left grid column on phone via
            .gf-album-dragpanel's grid-column/grid-row rules above — those rules are no-ops on any
            element that isn't a direct child of this grid container, which the sidebar isn't. */}
        {mode === "custom" && (
          <div className="gf-album-dragpanel mt-3 pt-3 border-t border-line">
          <div className="gf-album-dragpanel-sticky-header">
            {/* flex-wrap unconditionally now (used to be phone-only) — the desktop column is a
                fixed 380px now too (previously it had the full main-content width to work with),
                so the label + toggle + buttons need the same wrapping room there. */}
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <p className={`font-bold text-ink-soft ${isPhone ? "text-[9px]" : "text-[11px]"}`}>גררו תמונה מועדפת אל המסגרת הרצויה</p>
              <div className="flex items-center gap-2 shrink-0">
                {/* The switch itself has no visible label text (just a bare pill), so its native
                    title tooltip is easy to miss entirely — this adds an always-discoverable (?)
                    icon with a custom tooltip that explains what the toggle does, instead of relying
                    on the slow/inconsistent browser-native title hover. Positioned via fixed + a
                    measured rect (see hoverZoomTooltipPos above) instead of plain CSS
                    absolute-positioning, so it isn't clipped by the sidebar's own scroll region. */}
                <span
                  className="text-ink-soft/70 cursor-help flex items-center shrink-0"
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setHoverZoomTooltipPos({ top: r.top, right: window.innerWidth - r.right });
                  }}
                  onMouseLeave={() => setHoverZoomTooltipPos(null)}
                >
                  <IconInfo size={13} />
                </span>
                {hoverZoomTooltipPos && (
                  <div
                    className="pointer-events-none fixed w-40 rounded-lg bg-ink text-white text-[10px] leading-snug p-2 z-[95] text-right"
                    style={{ top: hoverZoomTooltipPos.top, right: hoverZoomTooltipPos.right, transform: "translateY(calc(-100% - 6px))" }}
                  >
                    כשהמתג פעיל, ריחוף עם העכבר מעל תמונה בפאנל מציג תצוגה מקדימה מוגדלת שלה
                  </div>
                )}
                <button
                  onClick={() => setDragPanelHoverZoomEnabled((v) => !v)}
                  role="switch"
                  aria-checked={dragPanelHoverZoomEnabled}
                  title="תצוגה מוגדלת בריחוף עכבר"
                  className={`relative shrink-0 rounded-full flex items-center px-0.5 ${isPhone ? "h-3.5 w-6" : "h-4.5 w-8"}`}
                  style={{
                    background: dragPanelHoverZoomEnabled ? "var(--color-amber-deep)" : "var(--color-line)",
                    justifyContent: dragPanelHoverZoomEnabled ? "flex-start" : "flex-end",
                  }}
                >
                  <span className={`rounded-full shadow ${isPhone ? "h-2.5 w-2.5" : "h-3.5 w-3.5"}`} style={{ background: "#fff" }} />
                </button>
                {dragPanelSelectedIds.size > 0 && (
                  <button
                    onClick={() => setDragPanelSelectedIds(new Set())}
                    className={`font-semibold shrink-0 ${isPhone ? "text-[9px]" : "text-[11px]"}`}
                    style={{ color: "var(--color-amber-deep)" }}
                  >
                    {dragPanelSelectedIds.size} נבחרו — ניקוי
                  </button>
                )}
                {favoritePhotos.length > 0 && (
                  <button
                    onClick={() => setShowAllDragPanel((v) => !v)}
                    className={`font-semibold text-ink-soft underline shrink-0 ${isPhone ? "text-[9px]" : "text-[11px]"}`}
                  >
                    {showAllDragPanel ? "רק זמינות" : "הצג הכל"}
                  </button>
                )}
                {favoritePhotos.length > 1 && (
                  <select
                    value={dragPanelSort}
                    onChange={(e) => setDragPanelSort(e.target.value as "default" | "name" | "date")}
                    title="סדר הצגת התמונות ברשימה"
                    className={`font-semibold text-ink-soft bg-transparent underline shrink-0 ${isPhone ? "text-[9px]" : "text-[11px]"}`}
                  >
                    <option value="default">מיון: ברירת מחדל</option>
                    <option value="name">מיון: שם</option>
                    <option value="date">מיון: תאריך</option>
                  </select>
                )}
              </div>
            </div>
            {dragPanelGroups.length > 0 && !isPhone && (
              <p className="text-[10px] text-ink-soft mb-1.5">
                לחיצה בוחרת כמה תמונות יחד — גוררים כל אחת מהן כדי לשבץ את כולן בעמוד, לפי הכיוון של כל תמונה
              </p>
            )}
            {/* Folder tabs — same pattern as ORNAMENT_TABS/TEMPLATE_TABS above. "הכל" (the default)
                keeps the original always-shown-grouped-by-folder view; picking one of the real
                folder tabs narrows the panel down to just that folder. Only shown once there's an
                actual choice to make (2+ real folders) — a single-folder gallery has nothing to
                switch between. */}
            {dragPanelGroups.length > 1 && (
              <div className={`flex gap-1.5 overflow-x-auto pb-1 ${isPhone ? "mb-1" : "mb-1.5"}`}>
                {[{ id: "__all__", name: "הכל" }, ...dragPanelGroups].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDragPanelTab(tab.id)}
                    className={`shrink-0 rounded-full font-semibold whitespace-nowrap ${isPhone ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[10px]"}`}
                    style={{
                      background: dragPanelTab === tab.id ? "var(--color-amber-deep)" : "var(--color-chip)",
                      color: dragPanelTab === tab.id ? "#fff" : "var(--color-ink-soft)",
                    }}
                  >
                    {tab.name ?? "ללא לשונית"}
                  </button>
                ))}
              </div>
            )}
          </div>
            {(() => {
              // Falls back to "הכל" if the previously-selected tab's group disappeared (its last
              // available favorite got placed/removed) rather than silently showing an empty panel.
              const effectiveTab = dragPanelTab === "__all__" || dragPanelGroups.some((g) => g.id === dragPanelTab) ? dragPanelTab : "__all__";
              const visibleGroups = effectiveTab === "__all__" ? dragPanelGroups : dragPanelGroups.filter((g) => g.id === effectiveTab);
              return dragPanelGroups.length === 0 ? (
              <p className="text-[11px] text-ink-soft text-center py-3">
                {favoritePhotos.length === 0 ? "אין תמונות מועדפות בגלריה הזו עדיין." : "כל התמונות המועדפות כבר שובצו בעמוד."}
              </p>
            ) : (
              // Own inner scroll dropped below — .gf-album-dragpanel (the actual outer scroller
              // now, on both phone and desktop) already scrolls the whole panel, so a second
              // nested scroll region here just meant two scrollbars fighting over the same
              // content.
              <div className="space-y-2.5 pr-0.5" onMouseLeave={() => { hoverPreviewTokenRef.current++; setDragPanelHoverPreview(null); }}>
                {visibleGroups.map((group) => (
                  <div key={group.id}>
                    {group.name && <p className="text-[10px] font-semibold text-ink-soft mb-1">{group.name}</p>}
                    <div className={`grid gap-1.5 ${isPhone ? "grid-cols-3" : "grid-cols-4"}`}>
                      {group.items.map((p) => {
                        // Same-page OR cross-page use — both are only ever visible here at all once
                        // showAllDragPanel reveals them (see dragPanelPool's own comment), so both
                        // need the same ✅ "already used" badge, not just the same-page case.
                        const alreadyUsed = usedPhotoIds.has(p.id) || (!isCoverPage && !!usedElsewhere?.has(p.id));
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => {
                              hoverPreviewTokenRef.current++;
                              setDragPanelHoverPreview(null);
                              // Dragging a thumbnail that's part of a 2+ selection carries the
                              // whole group; dragging one that isn't selected drags just that one,
                              // leaving whatever else is selected untouched.
                              const bundle = dragPanelSelectedIds.has(p.id) && dragPanelSelectedIds.size > 1 ? Array.from(dragPanelSelectedIds) : [p.id];
                              e.dataTransfer.setData("text/plain", bundle.length > 1 ? `multi:${bundle.join(",")}` : bundle[0]);
                            }}
                            onClick={() => {
                              setDragPanelSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              });
                            }}
                            onMouseEnter={(e) => {
                              if (!dragPanelHoverZoomEnabled) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const url = p.previewUrl ?? optimizedImageUrl(p.url, 480);
                              const token = ++hoverPreviewTokenRef.current;
                              // Loads the real image first so the floating preview box is sized to
                              // match its actual orientation (portrait vs. landscape) instead of a
                              // fixed square that crops one dimension — the box is only shown once
                              // the true aspect ratio is known, so it never has to reflow/jump.
                              const img = new Image();
                              img.onload = () => {
                                if (hoverPreviewTokenRef.current !== token) return;
                                const maxDim = 260;
                                const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
                                const width = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
                                const height = ratio >= 1 ? Math.round(maxDim / ratio) : maxDim;
                                const showOnLeftSide = rect.left >= width + 12;
                                setDragPanelHoverPreview({
                                  url,
                                  width,
                                  height,
                                  top: Math.min(Math.max(rect.top + rect.height / 2 - height / 2, 8), window.innerHeight - height - 8),
                                  left: showOnLeftSide ? rect.left - width - 12 : rect.right + 12,
                                });
                              };
                              img.src = url;
                            }}
                            onMouseLeave={() => { hoverPreviewTokenRef.current++; setDragPanelHoverPreview(null); }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              hoverPreviewTokenRef.current++;
                              setDragPanelHoverPreview(null);
                              setPhotoContextMenu({ photoId: p.id, top: e.clientY, left: e.clientX });
                            }}
                            className="relative aspect-square rounded-md overflow-hidden cursor-grab active:cursor-grabbing"
                            style={{
                              boxShadow: dragPanelSelectedIds.has(p.id) ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
                              opacity: alreadyUsed ? 0.5 : 1,
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.previewUrl ?? optimizedImageUrl(p.url, 320)} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
                            {dragPanelSelectedIds.has(p.id) && (
                              <span
                                className="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center"
                                style={{ background: "var(--color-amber-deep)", color: "#fff" }}
                              >
                                <IconCheck size={9} />
                              </span>
                            )}
                            {alreadyUsed && (
                              <span
                                className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center"
                                style={{ background: "var(--color-sage)", color: "#fff" }}
                                title="כבר שובצה בעמוד הזה"
                              >
                                <IconCheck size={9} />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
            })()}
          </div>
        )}

        </div>

        {/* Controls sidebar — stacks below the canvas on mobile portrait same as before (moot in
            practice, see the rotate prompt above); becomes an independently-scrolling side column
            on desktop AND on a phone/tablet actually turned to landscape, so a tall control list
            never forces the canvas itself to scroll out of view. Narrower on landscape-mobile than
            on real desktop (240px vs 380px) — a phone in landscape is only ~700-900px wide total,
            and the full 380px desktop sidebar would leave too little room for the canvas itself. */}
        <div className="gf-album-editor-sidebar w-[240px] lg:w-[380px] shrink-0 overflow-y-auto overscroll-contain pr-1 min-h-0">
        {/* Phone: this whole block moved OUT of the button-bar sidebar entirely — element controls
            now live in the same side-floating panel (ornament/shape/text/photo-adjust all share
            it), and photo/ornament/shape/text's hint text + delete button are dropped outright
            since each of those already has a full floating menu of its own (photo: the circular
            menu, which already has its own delete button; ornament/shape/text: this exact side
            panel, which already has delete built in) — this was pure redundant clutter competing
            with the action buttons for the sidebar's now-strictly-15vh budget. Text used to be
            desktop's one exception (its own cramped inline block, right here, below the action
            buttons — exactly the layout complained about) until it got the same floating "T"-button
            + side-panel treatment as everything else (see textPanelOpen/TextCircleButton above);
            now this whole block is genuinely phone-vs-desktop-identical in what it drops. */}
        {selectedElements.length > 0 && !isPhone && (
          <div className="gf-album-selection-info space-y-2 mt-2.5">
            {selectedPhotos.length === 1 && anchorPhoto && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                לחצו על התמונה כדי לפתוח את תפריט העיצוב הצף (שחור-לבן, ספיה, שקיפות, טשטוש, סיבוב, צל וקו מתאר)
              </p>
            )}
            {selectedOrnament && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                צבע, שקיפות, סיבוב, סדר שכבות ומחיקה נמצאים בתפריט הצף ליד העיטור
              </p>
            )}
            {selectedShape && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                צבע, מסכה, שקיפות, סדר שכבות ומחיקה נמצאים בתפריט הצף ליד הצורה
              </p>
            )}
            {selectedPhotos.length > 1 && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                נבחרו {selectedPhotos.length} תמונות — גרירה, שינוי גודל ופעולות מהתפריט הצף יחולו על כולן
              </p>
            )}
          </div>
        )}

        {/* Real desktop only — a 2-row action-button bar spanning the full card width (see
            .gf-album-desktop-buttons in the <style> block above), replacing the old single-column
            stack that used to live in the narrow 380px sidebar. The favorites panel now takes that
            sidebar's old spot instead (see .gf-album-dragpanel below), so this bar needed a new,
            wider home — comfortable desktop sizing throughout (real icons, text-sm labels), not the
            phone bar's cramped truncated style, per explicit "not cramped" request. The background-
            photo control is simplified to a plain toggle here (matching the phone bar) rather than
            the old always-visible opacity/blur sliders — a genuine feature reduction, but the same
            trade-off already made for phone, now applied consistently on desktop too. */}
        {!isPhone && (
        <div className="gf-album-desktop-buttons space-y-2">
          <div className="flex gap-2">
            {mode === "custom" && (
              <button
                ref={photoSizeButtonRef}
                onClick={() => {
                  const rect = photoSizeButtonRef.current?.getBoundingClientRect();
                  if (rect) setPhotoSizePanelRect({ top: rect.bottom, left: rect.left, width: Math.max(rect.width, 190) });
                  setPhotoSizePickerOpen(true);
                }}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
              >
                + תמונה
              </button>
            )}
            {mode === "custom" && (
              <button
                ref={backgroundButtonRef}
                // Set/unset only — the opacity/blur fine-tune sliders now live in their own circle
                // at the canvas's bottom-left corner (see bgSlidersButtonRef below) instead of
                // behind a second click on this same button, matching how phone's simpler
                // set/remove-only toggle already worked.
                onClick={backgroundPhoto ? removeBackground : openPickerForBackground}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold border"
                style={{
                  background: backgroundPhoto ? "var(--color-amber-deep)" : "#fff",
                  // Fixed dark text, not the theme-flipped --color-ink token — the unset state's
                  // background stays literal white in both themes (an inline style, so the global
                  // dark-mode .bg-white class override doesn't reach it), so the label must stay
                  // dark too or it goes white-on-white once --color-ink flips light for dark mode.
                  color: backgroundPhoto ? "#fff" : "#201f33",
                  borderColor: "var(--color-line)",
                }}
              >
                תמונת רקע
              </button>
            )}
            {mode === "custom" && (
              <button onClick={addFrame} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                + מסגרת
              </button>
            )}
            {mode === "custom" && (
              <button
                ref={templateButtonRef}
                onClick={() => {
                  const r = templateButtonRef.current?.getBoundingClientRect();
                  if (r) {
                    const w = Math.max(r.width, 320);
                    setTemplatePanelRect({ top: r.bottom, left: r.right - w, width: w });
                  }
                  setTemplatePickerOpen(true);
                }}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5"
              >
                <IconGrid size={15} />
                תבניות
              </button>
            )}
            <button
              ref={textButtonRef}
              onClick={() => {
                const r = textButtonRef.current?.getBoundingClientRect();
                if (r) {
                  const w = Math.max(r.width, 320);
                  setTextPanelRect({ top: r.bottom, left: r.right - w, width: w });
                }
                setTextDraftOpen(true);
              }}
              title="הוספת טקסט"
              className="flex-1 rounded-full py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5"
            >
              <span className="flex items-center justify-center h-5 w-5 rounded-full font-display font-bold text-[11px]" style={{ background: "var(--color-chip)" }}>
                T
              </span>
              הוספת טקסט
            </button>
          </div>
          {mode === "custom" && (
            <div className="flex gap-2">
              <button
                ref={masksButtonRef}
                onClick={() => {
                  const r = masksButtonRef.current?.getBoundingClientRect();
                  if (r) {
                    const w = Math.max(r.width, 320);
                    setMasksPanelRect({ top: r.bottom, left: r.right - w, width: w, maxHeight: panelMaxHeight(r.bottom + 4) });
                  }
                  setMasksPickerOpen(true);
                }}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5"
              >
                <IconMask size={15} />
                מסכות
              </button>
              <button
                ref={ornamentsButtonRef}
                onClick={() => {
                  const r = ornamentsButtonRef.current?.getBoundingClientRect();
                  if (r) {
                    const w = Math.max(r.width, 320);
                    setOrnamentsPanelRect({ top: r.bottom, left: r.right - w, width: w, maxHeight: panelMaxHeight(r.bottom + 4) });
                  }
                  setOrnamentsPickerOpen(true);
                }}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5"
              >
                <IconOrnament size={15} />
                עיטורים
              </button>
              <button
                ref={shapesButtonRef}
                onClick={() => {
                  const r = shapesButtonRef.current?.getBoundingClientRect();
                  if (r) {
                    const w = Math.max(r.width, 320);
                    setShapesPanelRect({ top: r.bottom, left: r.right - w, width: w, maxHeight: panelMaxHeight(r.bottom + 4) });
                  }
                  setShapesPickerOpen(true);
                }}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5"
              >
                <IconShape size={15} />
                צורות
              </button>
              <button
                onClick={() => setSaveTemplateOpen(true)}
                disabled={!elements.some((e) => e.type === "photo")}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <IconSave size={15} />
                שמירה כתבנית
              </button>
              <button
                onClick={() => onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom })}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white border-2 border-[var(--color-sage)]"
              >
                שמירה
              </button>
            </div>
          )}
          {mode !== "custom" && (
            <button
              onClick={() => onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom })}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white border-2 border-[var(--color-sage)]"
            >
              שמירה
            </button>
          )}
        </div>
        )}

        {/* Phone only: the same actions, but as two dense rows with no icons and shorter
            labels — "ייכנס בדיוק גם אם צריך להקטין" per the explicit request. + מסגרת is dropped
            here specifically (not on tablet/desktop) — nine buttons already need every bit of
            width these two rows have; a photographer who needs an empty frame on phone can still
            get one from a template. The background button has no room for the opacity/blur
            sliders desktop gets when a background is already set — tapping it again removes the
            background outright instead; fine-tuning it still works normally on tablet/desktop. */}
        {isPhone && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1">
              {mode === "custom" && (
                <button
                  ref={photoSizeButtonRef}
                  onClick={() => {
                    const rect = photoSizeButtonRef.current?.getBoundingClientRect();
                    if (rect) setPhotoSizePanelRect({ top: rect.bottom, left: rect.left, width: Math.max(rect.width, 190) });
                    setPhotoSizePickerOpen(true);
                  }}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-white border border-line text-ink truncate"
                >
                  תמונה
                </button>
              )}
              {mode === "custom" && (
                <button
                  onClick={backgroundPhoto ? removeBackground : openPickerForBackground}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold border truncate"
                  style={{
                    background: backgroundPhoto ? "var(--color-amber-deep)" : "#fff",
                    color: backgroundPhoto ? "#fff" : "var(--color-ink)",
                    borderColor: "var(--color-line)",
                  }}
                >
                  תמונת רקע
                </button>
              )}
              {mode === "custom" && (
                <button
                  ref={templateButtonRef}
                  onClick={() => {
                    const triggerRect = templateButtonRef.current?.getBoundingClientRect();
                    const widthRect = masksButtonRef.current?.getBoundingClientRect();
                    // Opens at 2 action-buttons' width (not 1) so nothing inside the panel gets
                    // cut off — anchored to the מסכות button's own RIGHT edge and grown leftward
                    // (not its left edge grown rightward), since מסכות sits at the right end of
                    // its row in this RTL layout; growing right would run off into empty margin
                    // instead of visually spanning two real buttons.
                    if (triggerRect && widthRect) {
                      const w = widthRect.width * 2 + 4;
                      setTemplatePanelRect({ top: triggerRect.bottom, left: widthRect.right - w, width: w });
                    }
                    setTemplatePickerOpen(true);
                  }}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-white border border-line text-ink truncate"
                >
                  תבניות
                </button>
              )}
              <button
                ref={textButtonRef}
                onClick={() => {
                  const triggerRect = textButtonRef.current?.getBoundingClientRect();
                  const widthRect = masksButtonRef.current?.getBoundingClientRect() ?? triggerRect;
                  // Same "2 action-buttons' width, grown leftward from the trigger's own right
                  // edge" as מסכות/עיטורים/תבניות/צורות above.
                  if (triggerRect && widthRect) {
                    const w = widthRect.width * 2 + 4;
                    setTextPanelRect({ top: triggerRect.bottom, left: widthRect.right - w, width: w });
                  }
                  setTextDraftOpen(true);
                }}
                title="הוספת טקסט"
                className="flex-1 min-w-0 rounded-full py-1 text-[9px] font-semibold bg-white border border-line text-ink truncate flex items-center justify-center gap-1"
              >
                <span className="flex items-center justify-center h-4 w-4 rounded-full font-display font-bold text-[8px]" style={{ background: "var(--color-chip)" }}>
                  T
                </span>
                טקסט
              </button>
            </div>
            {mode === "custom" && (
              <div className="flex gap-1">
                <button
                  ref={masksButtonRef}
                  onClick={() => {
                    const r = masksButtonRef.current?.getBoundingClientRect();
                    // Same "2 action-buttons' width, grown leftward from the trigger's own right
                    // edge" as the תבניות button above — see that comment for why leftward.
                    if (r) {
                      const w = r.width * 2 + 4;
                      setMasksPanelRect({ top: r.bottom, left: r.right - w, width: w, maxHeight: panelMaxHeight(r.bottom + 4) });
                    }
                    setMasksPickerOpen(true);
                  }}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-white border border-line text-ink truncate"
                >
                  מסכות
                </button>
                <button
                  ref={ornamentsButtonRef}
                  onClick={() => {
                    const r = ornamentsButtonRef.current?.getBoundingClientRect();
                    if (r) {
                      const w = r.width * 2 + 4;
                      setOrnamentsPanelRect({ top: r.bottom, left: r.right - w, width: w, maxHeight: panelMaxHeight(r.bottom + 4) });
                    }
                    setOrnamentsPickerOpen(true);
                  }}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-white border border-line text-ink truncate"
                >
                  עיטורים
                </button>
                <button
                  ref={shapesButtonRef}
                  onClick={() => {
                    const r = shapesButtonRef.current?.getBoundingClientRect();
                    // Same "2 action-buttons' width, grown leftward from the trigger's own right
                    // edge" as מסכות/עיטורים/תבניות above.
                    if (r) {
                      const w = r.width * 2 + 4;
                      setShapesPanelRect({ top: r.bottom, left: r.right - w, width: w, maxHeight: panelMaxHeight(r.bottom + 4) });
                    }
                    setShapesPickerOpen(true);
                  }}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-white border border-line text-ink truncate"
                >
                  צורות
                </button>
                <button
                  onClick={() => setSaveTemplateOpen(true)}
                  disabled={!elements.some((e) => e.type === "photo")}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-white border border-line text-ink disabled:opacity-50 truncate"
                >
                  שמירה כתבנית
                </button>
                <button
                  onClick={() => onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom })}
                  className="flex-1 min-w-0 rounded-lg py-1 text-[9px] font-semibold bg-ink text-white border-2 border-[var(--color-sage)] truncate"
                >
                  שמירה
                </button>
              </div>
            )}
            {mode !== "custom" && (
              <button
                onClick={() => onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom })}
                className="w-full rounded-lg py-1.5 text-[10px] font-semibold bg-ink text-white border-2 border-[var(--color-sage)]"
              >
                שמירה
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {dragPanelHoverPreview && (
        <div
          className="fixed z-[90] rounded-xl overflow-hidden pointer-events-none"
          style={{
            top: dragPanelHoverPreview.top,
            left: dragPanelHoverPreview.left,
            width: dragPanelHoverPreview.width,
            height: dragPanelHoverPreview.height,
            boxShadow: "0 12px 32px rgba(32,31,51,0.35), 0 0 0 3px var(--color-paper)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dragPanelHoverPreview.url} alt="" className="w-full h-full object-contain" />
        </div>
      )}

      {photoPickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setPhotoPickerOpen(false)}>
          <div className="w-full max-w-sm lg:max-w-2xl rounded-3xl p-4 lg:p-6 bg-paper max-h-[70vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="text-sm font-bold">
                {pickingBackground ? "בחירת תמונת רקע — " : ""}
                {addingMultiplePhotos ? "בחירת תמונות להוספה — " : ""}
                {showAllInPicker || favoritePhotos.length === 0 ? "כל התמונות" : "תמונות מועדפות"}
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                {favoritePhotos.length > 0 && (
                  <button onClick={() => setShowAllInPicker((v) => !v)} className="text-xs font-semibold text-ink-soft underline">
                    {showAllInPicker ? "רק מועדפות" : "כל התמונות"}
                  </button>
                )}
                <button onClick={() => setPhotoPickerOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                  <IconClose />
                </button>
              </div>
            </div>
            {addingMultiplePhotos && (
              <p className="text-[11px] text-ink-soft mb-2.5">
                אפשר לבחור כמה תמונות שרוצים — המערכת תסדר אותן בעמוד בפריסה אוטומטית, כשתמונות לאורך מקבלות מסגרת לאורך ותמונות לרוחב מקבלות מסגרת לרוחב.
              </p>
            )}
            {pickerPhotos.length === 0 ? (
              <p className="text-xs text-ink-soft text-center py-6">אין תמונות מועדפות בגלריה הזו עדיין.</p>
            ) : (
              <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 mb-2.5">
                {pickerPhotos.map((p) => {
                  const multiIdx = addingMultiplePhotos ? Array.from(multiPhotoIds).indexOf(p.id) : -1;
                  return (
                    <button
                      key={p.id}
                      onClick={() => (addingMultiplePhotos ? toggleMultiPhoto(p.id) : choosePhoto(p.id))}
                      className="relative aspect-square rounded-lg overflow-hidden"
                      style={{ boxShadow: multiIdx !== -1 ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.previewUrl ?? optimizedImageUrl(p.url, 320)} alt="" className="w-full h-full object-cover" />
                      {multiIdx !== -1 && (
                        <span
                          className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-data"
                          style={{ background: "var(--color-amber-deep)", color: "#fff" }}
                        >
                          {multiIdx + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {addingMultiplePhotos && (
              <button
                onClick={confirmMultiPhotos}
                disabled={multiPhotoIds.size === 0 || loadingMultiLayout}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {loadingMultiLayout ? "בונה פריסה..." : `הוספת ${multiPhotoIds.size || ""} תמונות`}
              </button>
            )}
          </div>
        </div>
      )}

      {(textDraftOpen || textDraftClosing) && textPanelRect && (
        <>
          <style>{`
            @keyframes maskPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes maskPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .mask-panel-opening { animation: maskPanelSlideDown 160ms ease forwards; }
            .mask-panel-closing { animation: maskPanelSlideUp 160ms ease forwards; }
          `}</style>
          <div className="fixed inset-0 z-[84]" onClick={closeTextPanel} />
          <div
            className={`fixed z-[85] rounded-xl bg-paper shadow-sheet max-h-[65vh] overflow-y-auto overscroll-contain ${isPhone ? "p-2.5" : "p-4"} ${
              textDraftClosing ? "mask-panel-closing" : "mask-panel-opening"
            }`}
            style={{ top: textPanelRect.top + 4, left: textPanelRect.left, width: textPanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`font-bold ${isPhone ? "text-[10px]" : "text-sm"}`}>טקסט חדש (עברית או אנגלית)</p>
              <button onClick={closeTextPanel} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              autoFocus
              className={`w-full rounded-lg border border-line bg-white mb-3 ${isPhone ? "px-2 py-1.5 text-[11px]" : "px-3 py-2.5 text-sm"}`}
            />
            <div className={`flex flex-wrap mb-3 ${isPhone ? "gap-1" : "gap-1.5"}`}>
              {TEXT_COLOR_PALETTE.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTextDraftColor(value)}
                  title={label}
                  className={`rounded-full ${isPhone ? "h-5 w-5" : "h-7 w-7"}`}
                  style={{
                    background: value,
                    boxShadow: textDraftColor === value ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
                  }}
                />
              ))}
            </div>
            <select
              value={textDraftFontFamily}
              onChange={(e) => setTextDraftFontFamily(e.target.value)}
              className={`w-full rounded-lg font-semibold bg-white border border-line mb-3 ${isPhone ? "px-1.5 py-1 text-[9px]" : "px-2.5 py-2 text-xs"}`}
              style={{ fontFamily: albumFontFamilyCss(textDraftFontFamily) }}
            >
              <optgroup label="פונטים בעברית">
                {ALBUM_FONTS.filter((f) => f.category === "hebrew").map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="פונטים באנגלית">
                {ALBUM_FONTS.filter((f) => f.category === "latin").map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="mb-3">
              <SliderControl label="גודל טקסט" value={textDraftFontSize} min={8} max={250} unit="pt" onChange={setTextDraftFontSize} />
            </div>
            <button
              onClick={addText}
              disabled={!textDraft.trim()}
              className={`w-full rounded-lg font-semibold bg-amber-deep text-white disabled:opacity-60 ${isPhone ? "py-2 text-[11px]" : "py-3 text-sm"}`}
            >
              הוספה
            </button>
          </div>
        </>
      )}

      {/* Desktop only — the "תמונת רקע" button's own fine-tune flyout, once a background is
          already set (see backgroundButtonRef's onClick above). Keeps the opacity/blur controls
          reachable without needing a whole always-visible sidebar section for them. */}
      {backgroundPanelOpen && backgroundPanelRect && backgroundPhoto && (
        <>
          <div className="fixed inset-0 z-[84]" onClick={() => setBackgroundPanelOpen(false)} />
          <div
            className="fixed z-[85] rounded-xl p-3 bg-paper shadow-sheet space-y-2.5"
            style={{ top: backgroundPanelRect.top + 4, left: backgroundPanelRect.left, width: backgroundPanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-20 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={backgroundPhoto.url} alt="" className="w-full h-full object-cover" style={{ opacity: backgroundOpacity / 100 }} />
              {/* Just closes the flyout — deliberately does NOT call removeBackground() (that used
                  to happen here too, making this look like a plain close button while secretly
                  deleting the whole background photo). Removing the background entirely already has
                  its own dedicated controls: the main "תמונת רקע" toolbar button once one is set,
                  and "הסרה" in the photo right-click menu — this X should only dismiss the panel and
                  keep whatever opacity/blur was already set, same as clicking the backdrop does. */}
              <button
                onClick={() => setBackgroundPanelOpen(false)}
                className="absolute top-1 left-1 h-6 w-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
              >
                <IconClose size={13} />
              </button>
            </div>
            <SliderControl label="שקיפות רקע" value={backgroundOpacity} min={0} max={100} unit="%" onChange={setBackgroundOpacity} />
            <SliderControl label="טשטוש רקע (Blur)" value={backgroundBlur} min={0} max={100} unit="%" onChange={setBackgroundBlur} />
            <SliderControl label="זום רקע" value={backgroundZoom} min={100} max={400} unit="%" onChange={setBackgroundZoom} />
          </div>
        </>
      )}

      {/* Right-click menu on a favorite-panel thumbnail (see onContextMenu above) — replaces the
          OS's own context menu so the same right-click gesture is available for the actions that
          matter here instead of a generic browser menu with nothing relevant on it. */}
      {photoContextMenu && (
        <>
          <div className="fixed inset-0 z-[84]" onClick={() => setPhotoContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setPhotoContextMenu(null); }} />
          <div
            className="fixed z-[85] rounded-xl bg-paper shadow-sheet p-1.5 w-40"
            style={{
              top: Math.min(photoContextMenu.top, window.innerHeight - 100),
              left: Math.min(photoContextMenu.left, window.innerWidth - 170),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setBackgroundPhotoId(photoContextMenu.photoId);
                setPhotoContextMenu(null);
              }}
              className="w-full text-right rounded-lg px-3 py-2 text-xs font-semibold hover:bg-chip"
            >
              קביעה כרקע
            </button>
            {backgroundPhotoId === photoContextMenu.photoId && (
              <button
                onClick={() => {
                  removeBackground();
                  setPhotoContextMenu(null);
                }}
                className="w-full text-right rounded-lg px-3 py-2 text-xs font-semibold text-rose hover:bg-chip"
              >
                הסרה
              </button>
            )}
          </div>
        </>
      )}

      {(templatePickerOpen || templatePickerClosing) && templatePanelRect && (
        <>
          <style>{`
            @keyframes maskPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes maskPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .mask-panel-opening { animation: maskPanelSlideDown 160ms ease forwards; }
            .mask-panel-closing { animation: maskPanelSlideUp 160ms ease forwards; }
          `}</style>
          <div className="fixed inset-0 z-[84]" onClick={closeTemplatePanel} />
          <div
            className={`fixed z-[85] rounded-xl bg-paper shadow-sheet max-h-[65vh] overflow-y-auto overscroll-contain ${isPhone ? "p-2.5" : "p-4"} ${
              templatePickerClosing ? "mask-panel-closing" : "mask-panel-opening"
            }`}
            style={{ top: templatePanelRect.top + 4, left: templatePanelRect.left, width: templatePanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`font-bold ${isPhone ? "text-[11px]" : "text-sm"}`}>תבניות מובנות</p>
              <button onClick={closeTemplatePanel} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
              {TEMPLATE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTemplateTab(tab.key)}
                  className={`shrink-0 rounded-full font-semibold whitespace-nowrap ${isPhone ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]"}`}
                  style={{
                    background: templateTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: templateTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className={`grid mb-4 ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
              {TEMPLATE_BANK[templateTab].map((t) => (
                <button key={t.name} onClick={() => applyTemplate(t.frames)} className={`rounded-xl border border-line text-center ${isPhone ? "p-1" : "p-2"}`}>
                  <div className="relative aspect-[16/10] rounded-md bg-chip mb-1.5">
                    {t.frames.map((f) => (
                      <div key={f.id} className="absolute rounded-sm bg-white border border-line" style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.widthPct}%`, height: `${f.heightPct}%` }} />
                    ))}
                  </div>
                  <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[11px]"}`}>{t.name}</span>
                </button>
              ))}
            </div>
            {templates.length > 0 && (
              <>
                <p className={`font-bold mb-3 ${isPhone ? "text-[11px]" : "text-sm"}`}>התבניות שלי</p>
                <div className={`grid ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t.frames)} className={`rounded-xl border border-line text-center ${isPhone ? "p-1" : "p-2"}`}>
                      <div className="relative aspect-[16/10] rounded-md bg-chip mb-1.5">
                        {t.frames.map((f) => (
                          <div key={f.id} className="absolute rounded-sm bg-white border border-line" style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.widthPct}%`, height: `${f.heightPct}%` }} />
                        ))}
                      </div>
                      <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[11px]"}`}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {(masksPickerOpen || masksPickerClosing) && masksPanelRect && (
        <>
          <style>{`
            @keyframes maskPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes maskPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .mask-panel-opening { animation: maskPanelSlideDown 160ms ease forwards; }
            .mask-panel-closing { animation: maskPanelSlideUp 160ms ease forwards; }
          `}</style>
          {/* A transparent click-catcher for closing on outside click — the panel itself is
              anchored directly below the מסכות button (see masksPanelRect), not a full-screen
              overlay, so this stays invisible rather than dimming the canvas. */}
          <div className="fixed inset-0 z-[84]" onClick={closeMasksPicker} />
          <div
            className={`fixed z-[85] rounded-xl bg-paper shadow-sheet overflow-y-auto overscroll-contain ${isPhone ? "p-2.5" : "p-4"} ${
              masksPickerClosing ? "mask-panel-closing" : "mask-panel-opening"
            }`}
            style={{ top: masksPanelRect.top + 4, left: masksPanelRect.left, width: masksPanelRect.width, maxHeight: masksPanelRect.maxHeight }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`font-bold ${isPhone ? "text-[10px]" : "text-sm"}`}>מסכות — גררו מסכה אל תמונה/צורה, או לחצו כשתמונה/צורה נבחרת</p>
              <button onClick={closeMasksPicker} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className={`grid ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", "mask:__none__")}
                onClick={() => {
                  if (selected?.type === "photo" || selected?.type === "shape") updateElement(selected.id, { maskId: undefined });
                }}
                className={`rounded-xl border border-line text-center cursor-grab active:cursor-grabbing ${isPhone ? "p-1" : "p-2"}`}
              >
                <div className="aspect-square rounded-md bg-chip mb-1.5 flex items-center justify-center text-ink-soft text-[10px] font-semibold">
                  ללא
                </div>
                <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[10px]"}`}>הסרת מסכה</span>
              </button>
              {ALBUM_MASKS.map((mask) => (
                <div
                  key={mask.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `mask:${mask.id}`)}
                  onClick={() => {
                    if (selected?.type === "photo" && selected.photoId) updateElement(selected.id, { maskId: mask.id });
                    else if (selected?.type === "shape") updateElement(selected.id, { maskId: mask.id });
                  }}
                  className={`rounded-xl border border-line text-center cursor-grab active:cursor-grabbing ${isPhone ? "p-1" : "p-2"}`}
                >
                  <div
                    className="aspect-square rounded-md mb-1.5"
                    style={{
                      background: "linear-gradient(135deg, var(--color-amber-deep), var(--color-sage))",
                      WebkitMaskImage: maskCssUrl(mask.svg),
                      maskImage: maskCssUrl(mask.svg),
                      WebkitMaskSize: "100% 100%",
                      maskSize: "100% 100%",
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                    }}
                  />
                  <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[10px]"}`}>{mask.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {(ornamentsPickerOpen || ornamentsPickerClosing) && ornamentsPanelRect && (
        <>
          <style>{`
            @keyframes ornamentPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes ornamentPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .ornament-panel-opening { animation: ornamentPanelSlideDown 160ms ease forwards; }
            .ornament-panel-closing { animation: ornamentPanelSlideUp 160ms ease forwards; }
          `}</style>
          <div className="fixed inset-0 z-[84]" onClick={closeOrnamentsPicker} />
          <div
            className={`fixed z-[85] rounded-xl bg-paper shadow-sheet overflow-y-auto overscroll-contain ${isPhone ? "p-2.5" : "p-4"} ${
              ornamentsPickerClosing ? "ornament-panel-closing" : "ornament-panel-opening"
            }`}
            style={{ top: ornamentsPanelRect.top + 4, left: ornamentsPanelRect.left, width: ornamentsPanelRect.width, maxHeight: ornamentsPanelRect.maxHeight }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`font-bold ${isPhone ? "text-[11px]" : "text-sm"}`}>עיטורים — לחצו כדי להוסיף לעמוד</p>
              <button onClick={closeOrnamentsPicker} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5">
              {ORNAMENT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setOrnamentTab(tab.key)}
                  className={`shrink-0 rounded-full font-semibold whitespace-nowrap ${isPhone ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]"}`}
                  style={{
                    background: ornamentTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: ornamentTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {(customOrnamentTabs ?? []).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOrnamentTab(tab.id)}
                  className={`shrink-0 rounded-full font-semibold whitespace-nowrap ${isPhone ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]"}`}
                  style={{
                    background: ornamentTab === tab.id ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: ornamentTab === tab.id ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.name}
                </button>
              ))}
              {onCreateCustomOrnamentTab && (
                <button
                  onClick={() => setCustomTabModalOpen(true)}
                  title="לשונית עיטורים חדשה"
                  className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-chip text-ink-soft"
                >
                  <IconPlusSmall />
                </button>
              )}
            </div>
            {ORNAMENT_TABS.some((t) => t.key === ornamentTab) ? (
              <div className={`grid ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
                {ALBUM_ORNAMENTS.filter((o) => o.category === ornamentTab).map((ornament) => (
                  <button
                    key={ornament.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", `ornament:${ornament.id}`)}
                    onClick={() => addOrnament(ornament.id)}
                    className={`rounded-xl border border-line text-center bg-white cursor-grab active:cursor-grabbing ${isPhone ? "p-1" : "p-2"}`}
                  >
                    <div className={`aspect-square rounded-md bg-chip mb-1.5 flex items-center justify-center ${isPhone ? "p-1" : "p-2"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ornamentDataUrl(ornament, "#2e3142")} className="w-full h-full" style={{ objectFit: "contain" }} />
                    </div>
                    <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[10px]"}`}>{ornament.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  if (Array.from(e.dataTransfer.types).includes("Files")) {
                    e.preventDefault();
                    setOrnamentDropActive(true);
                  }
                }}
                onDragLeave={() => setOrnamentDropActive(false)}
                onDrop={async (e) => {
                  if (e.dataTransfer.files.length === 0) return;
                  e.preventDefault();
                  setOrnamentDropActive(false);
                  if (!onUploadCustomOrnament) return;
                  setUploadingOrnament(true);
                  try {
                    for (const file of Array.from(e.dataTransfer.files)) {
                      const bytes = await file.arrayBuffer();
                      await onUploadCustomOrnament(ornamentTab, file.name, bytes, file.type || "application/octet-stream");
                    }
                  } finally {
                    setUploadingOrnament(false);
                  }
                }}
                className="rounded-xl p-2 min-h-[140px]"
                style={{ background: ornamentDropActive ? "var(--color-amber-bg)" : "transparent", outline: ornamentDropActive ? "2px dashed var(--color-amber-deep)" : "none" }}
              >
                <div className={`grid ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
                  {onUploadCustomOrnament && (
                    <label className="rounded-xl border border-dashed border-line p-2 text-center bg-white flex flex-col items-center justify-center aspect-square cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={uploadingOrnament}
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (files.length === 0) return;
                          setUploadingOrnament(true);
                          try {
                            for (const file of files) {
                              const bytes = await file.arrayBuffer();
                              await onUploadCustomOrnament(ornamentTab, file.name, bytes, file.type || "application/octet-stream");
                            }
                          } finally {
                            setUploadingOrnament(false);
                          }
                        }}
                      />
                      <IconPlusSmall />
                      <span className="text-[10px] font-semibold mt-1 text-ink-soft">{uploadingOrnament ? "מעלה..." : "העלאה"}</span>
                    </label>
                  )}
                  {(customOrnaments ?? [])
                    .filter((o) => o.tab_id === ornamentTab)
                    .map((o) => (
                      <div key={o.id} className="relative">
                        <button
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", `customOrnament:${o.id}`)}
                          onClick={() => addCustomOrnament(o.id)}
                          className="w-full rounded-xl border border-line p-2 text-center bg-white cursor-grab active:cursor-grabbing"
                        >
                          <div className="aspect-square rounded-md bg-chip mb-1.5 flex items-center justify-center p-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={o.url} className="w-full h-full" style={{ objectFit: "contain" }} />
                          </div>
                        </button>
                        {onDeleteCustomOrnament && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCustomOrnament(o.id);
                            }}
                            title="מחיקת העיטור"
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full flex items-center justify-center bg-white text-rose"
                            style={{ boxShadow: "0 0 0 1px var(--color-line)" }}
                          >
                            <IconClose size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                {(customOrnaments ?? []).filter((o) => o.tab_id === ornamentTab).length === 0 && (
                  <p className="text-[11px] text-ink-soft text-center py-4">גררו קבצי תמונה לכאן, או השתמשו בכפתור ההעלאה</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {(shapesPickerOpen || shapesPickerClosing) && shapesPanelRect && (
        <>
          <style>{`
            @keyframes shapePanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes shapePanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .shape-panel-opening { animation: shapePanelSlideDown 160ms ease forwards; }
            .shape-panel-closing { animation: shapePanelSlideUp 160ms ease forwards; }
          `}</style>
          <div className="fixed inset-0 z-[84]" onClick={closeShapesPicker} />
          <div
            className={`fixed z-[85] rounded-xl bg-paper shadow-sheet overflow-y-auto overscroll-contain ${isPhone ? "p-2.5" : "p-4"} ${
              shapesPickerClosing ? "shape-panel-closing" : "shape-panel-opening"
            }`}
            style={{ top: shapesPanelRect.top + 4, left: shapesPanelRect.left, width: shapesPanelRect.width, maxHeight: shapesPanelRect.maxHeight }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`font-bold ${isPhone ? "text-[11px]" : "text-sm"}`}>צורות — לחצו כדי להוסיף לעמוד</p>
              <button onClick={closeShapesPicker} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className={`grid ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", "shape:__plain__")}
                onClick={() => addShape(undefined)}
                className={`rounded-xl border border-line text-center bg-white cursor-grab active:cursor-grabbing ${isPhone ? "p-1" : "p-2"}`}
              >
                <div className="aspect-square rounded-md mb-1.5" style={{ background: "linear-gradient(135deg, var(--color-amber-deep), var(--color-sage))" }} />
                <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[10px]"}`}>מלבן</span>
              </button>
              {ALBUM_MASKS.filter((mask) => mask.id.startsWith("shape-")).map((mask) => (
                <button
                  key={mask.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `shape:${mask.id}`)}
                  onClick={() => addShape(mask.id)}
                  className={`rounded-xl border border-line text-center bg-white cursor-grab active:cursor-grabbing ${isPhone ? "p-1" : "p-2"}`}
                >
                  <div
                    className="aspect-square rounded-md mb-1.5"
                    style={{
                      background: "linear-gradient(135deg, var(--color-amber-deep), var(--color-sage))",
                      WebkitMaskImage: maskCssUrl(mask.svg),
                      maskImage: maskCssUrl(mask.svg),
                      WebkitMaskSize: "100% 100%",
                      maskSize: "100% 100%",
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                    }}
                  />
                  <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[10px]"}`}>{mask.label}</span>
                </button>
              ))}
            </div>
            <p className={`font-semibold text-ink-soft mt-3 mb-2 ${isPhone ? "text-[9px]" : "text-[10px]"}`}>קו מתאר בלבד, ללא רקע</p>
            <div className={`grid ${isPhone ? "grid-cols-2 gap-1.5" : "grid-cols-3 gap-2.5"}`}>
              {(
                [
                  { kind: "square", label: "ריבוע" },
                  { kind: "rectangle", label: "מלבן" },
                  { kind: "circle", label: "עיגול" },
                  { kind: "line", label: "קו" },
                ] as const
              ).map(({ kind, label }) => (
                <button
                  key={kind}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `shapeOutline:${kind}`)}
                  onClick={() => addOutlineShape(kind)}
                  className={`rounded-xl border border-line text-center bg-white cursor-grab active:cursor-grabbing ${isPhone ? "p-1" : "p-2"}`}
                >
                  <div className="aspect-square rounded-md mb-1.5 flex items-center justify-center">
                    {kind === "line" ? (
                      <div className="w-4/5 h-[3px] rounded-full" style={{ background: "var(--color-ink)" }} />
                    ) : (
                      <div
                        className={kind === "square" ? "w-3/5 h-3/5" : kind === "rectangle" ? "w-4/5 h-1/2" : "w-3/5 h-3/5 rounded-full"}
                        style={{ border: "3px solid var(--color-ink)" }}
                      />
                    )}
                  </div>
                  <span className={`font-semibold ${isPhone ? "text-[9px]" : "text-[10px]"}`}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {photoSizePickerOpen && photoSizePanelRect && (
        <>
          <div className="fixed inset-0 z-[84]" onClick={() => setPhotoSizePickerOpen(false)} />
          <div
            className="fixed z-[85] rounded-xl p-2 bg-paper shadow-sheet"
            style={{ top: photoSizePanelRect.top + 4, left: photoSizePanelRect.left, width: photoSizePanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            {(
              [
                { size: "auto", label: "אוטומטי — לפי צורת התמונה" },
                { size: "rect", label: "מלבן 10x7.5 ס״מ" },
                { size: "circle", label: "עיגול Ø5 ס״מ" },
                { size: "square", label: "ריבוע 5x5 ס״מ" },
              ] as const
            ).map(({ size, label }) => (
              <button
                key={size}
                onClick={() => {
                  setPendingPhotoSize(size);
                  setPhotoSizePickerOpen(false);
                  openPickerForNewPhoto();
                }}
                className="w-full text-right rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-chip"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {customTabModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.55)" }} onClick={() => setCustomTabModalOpen(false)}>
          <div className="w-full max-w-xs rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">לשונית עיטורים חדשה</p>
              <button onClick={() => setCustomTabModalOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={customTabNameDraft}
              onChange={(e) => setCustomTabNameDraft(e.target.value)}
              placeholder="שם הלשונית"
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button
              onClick={async () => {
                if (!customTabNameDraft.trim() || !onCreateCustomOrnamentTab) return;
                setCreatingCustomTab(true);
                try {
                  await onCreateCustomOrnamentTab(customTabNameDraft.trim());
                  setCustomTabNameDraft("");
                  setCustomTabModalOpen(false);
                } finally {
                  setCreatingCustomTab(false);
                }
              }}
              disabled={!customTabNameDraft.trim() || creatingCustomTab}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {creatingCustomTab ? "יוצר..." : "אישור"}
            </button>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setSaveTemplateOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl p-5 bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold">שם התבנית</p>
              <button onClick={() => setSaveTemplateOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={templateNameDraft}
              onChange={(e) => setTemplateNameDraft(e.target.value)}
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button
              onClick={saveCurrentAsTemplate}
              disabled={!templateNameDraft.trim() || savingTemplate}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {savingTemplate ? "שומר..." : "שמירה בספריית התבניות"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
