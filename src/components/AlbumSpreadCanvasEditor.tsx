"use client";

import { useEffect, useRef, useState } from "react";
import type { AlbumElement, AlbumFrame, AlbumPhotoElement, AlbumPhotoFilter, AlbumTemplateRow, GalleryAlbumSpreadRow } from "@/lib/types";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";
import { TEXT_COLOR_PALETTE, isLightTextColor } from "@/lib/textColor";
import { TEMPLATE_TABS, TEMPLATE_BANK, type TemplateTabKey } from "@/lib/albumTemplateBank";

type PhotoWithUrl = { id: string; url: string; is_favorite?: boolean; folder_id?: string | null };

const BORDER_COLORS = ["#ffffff", "#000000", "#d4af37", "#e07a5f"];
// A shared cap so a given blur % looks (and exports) the same whether it's applied to a framed
// photo or the full-page background — also the sigma sharp/PDF baking uses server-side, since
// CSS blur(px) and sharp's Gaussian blur sigma are both "pixels of std-deviation" and line up
// closely enough in practice not to need a separate conversion factor.
export const ALBUM_BLUR_MAX_PX = 40;

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
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-semibold bg-chip text-ink-soft"
      >
        <span>{label}</span>
        <span dir="ltr" className="font-data">
          {value}
          {unit}
        </span>
      </button>
      {open && (
        <div className="absolute z-10 top-full inset-x-0 mt-1 rounded-lg border border-line bg-white p-2.5 shadow-sheet">
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
        </div>
      )}
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
function IconTrash() {
  return (
    <MenuIconBase>
      <path d="M4.5 7h15M9.5 7V4.8a1 1 0 011-1h3a1 1 0 011 1V7m-8 0l.8 12.2a1.5 1.5 0 001.5 1.4h5.4a1.5 1.5 0 001.5-1.4L18.5 7" />
      <path d="M10 11v6M14 11v6" />
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

function CircleButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: active ? "var(--color-amber-deep)" : "#fff",
        // Fixed dark icon color, not the theme-flipped --color-ink token — this button's own
        // background stays white in both themes, so the icon must too or it goes near-invisible
        // (light-on-white) once --color-ink flips light for dark mode's page text.
        color: active ? "#fff" : "#201f33",
        boxShadow: "0 2px 6px rgba(46,49,66,0.22), 0 0 0 1px var(--color-line)",
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

function MiniSlider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-semibold text-ink-soft mb-1">
        <span>{label}</span>
        <span dir="ltr" className="font-data">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

// A vertical strip of circular controls that floats beside the selected photo — deliberately
// rendered outside the canvas's own overflow-hidden ancestor (see the wrapping <div> around
// canvasRef in the main component) so it, and the flyout sliders it opens, can bleed past the
// photo's own frame instead of getting cropped by it.
function PhotoFloatingMenu({
  el,
  panning,
  onTogglePan,
  onUpdate,
  onTrueSize,
  onApplyShadowToAll,
  onDeleteSelected,
}: {
  el: AlbumPhotoElement;
  panning: boolean;
  onTogglePan: () => void;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  onTrueSize: () => void;
  onApplyShadowToAll: () => void;
  onDeleteSelected: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<null | "opacity" | "blur" | "rotation" | "shadow">(null);
  const onLeft = el.xPct + el.widthPct > 70;
  const side: "left" | "right" = onLeft ? "left" : "right";
  const rotationPct = Math.round((((el.rotation ?? 0) % 360) + 360) % 360 / 360 * 100);
  const toggle = (panel: typeof openPanel) => setOpenPanel((p) => (p === panel ? null : panel));

  return (
    <div
      className="absolute z-20 flex flex-col gap-1"
      style={{
        // Anchored to the frame's own top edge (not vertically centered) — a centered menu for a
        // photo near the canvas's top row pushes half its height above the canvas, past where the
        // dialog's own overflow-y-auto can scroll to (it can't scroll to a negative offset), which
        // makes the top buttons genuinely unclickable. Anchoring downward instead means the worst
        // case is needing to scroll the dialog down, which is always possible.
        top: `${el.yPct}%`,
        left: onLeft ? `calc(${el.xPct}% - 34px)` : `calc(${el.xPct + el.widthPct}% + 8px)`,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <CircleButton label="שחור-לבן" active={el.filter === "bw"} onClick={() => onUpdate({ filter: el.filter === "bw" ? "none" : "bw" })}>
        <IconBW />
      </CircleButton>
      <CircleButton label="גווני ספיה" active={el.filter === "sepia"} onClick={() => onUpdate({ filter: el.filter === "sepia" ? "none" : "sepia" })}>
        <IconSepia />
      </CircleButton>
      <div className="relative">
        <CircleButton label="מיקום התמונה במסגרת — גררו את התמונה כדי למקם אותה" active={panning} onClick={onTogglePan}>
          <IconFocal />
        </CircleButton>
        {panning && (
          <FlyoutPanel side={side} width={120}>
            <button
              onClick={() => onUpdate({ focalX: 50, focalY: 50 })}
              className="w-full rounded-lg py-1.5 text-[10px] font-semibold bg-chip text-ink-soft"
            >
              מרכז תמונה
            </button>
          </FlyoutPanel>
        )}
      </div>
      <CircleButton label="הצגה בגודל נכון — מתאים את המסגרת ליחס הרוחב/גובה האמיתי של התמונה" onClick={onTrueSize}>
        <IconTrueSize />
      </CircleButton>
      <CircleButton
        label="שמירת יחס גובה-רוחב בשינוי גודל מהפינות"
        active={!!el.lockAspect}
        onClick={() => onUpdate({ lockAspect: !el.lockAspect })}
      >
        <IconAspectLock />
      </CircleButton>
      <div className="relative">
        <CircleButton label="שקיפות" active={openPanel === "opacity" || (el.opacity ?? 100) < 100} onClick={() => toggle("opacity")}>
          <IconOpacity />
        </CircleButton>
        {openPanel === "opacity" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton label="טשטוש" active={openPanel === "blur" || !!el.blur} onClick={() => toggle("blur")}>
          <IconBlur />
        </CircleButton>
        {openPanel === "blur" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="טשטוש (Blur)" value={el.blur ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ blur: v })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton label="סיבוב" active={openPanel === "rotation" || !!el.rotation} onClick={() => toggle("rotation")}>
          <IconRotate />
        </CircleButton>
        {openPanel === "rotation" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="סיבוב" value={rotationPct} min={0} max={100} unit="%" onChange={(pct) => onUpdate({ rotation: (pct / 100) * 360 })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton label="צל וקו מתאר" active={openPanel === "shadow" || !!el.shadow || !!el.borderWidth} onClick={() => toggle("shadow")}>
          <IconShadow />
        </CircleButton>
        {openPanel === "shadow" && (
          <FlyoutPanel side={side} width={150}>
            <MiniSlider label="צל" value={el.shadow ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ shadow: v })} />
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
            <button
              onClick={onApplyShadowToAll}
              className="w-full rounded-lg py-1.5 text-[10px] font-semibold bg-chip text-ink-soft"
            >
              החל על כל התמונות בדף
            </button>
          </FlyoutPanel>
        )}
      </div>
      <CircleButton label="מחיקת התמונה/ות שנבחרו" onClick={onDeleteSelected}>
        <IconTrash />
      </CircleButton>
    </div>
  );
}


// The print-safe margin is a hard constraint for anything placed AUTOMATICALLY (templates, the
// multi-photo auto-layout) — every frame designed on a nominal 0-100 full-bleed canvas gets
// linearly rescaled into the album's actual safe-print box, so no automatically-generated layout
// can ever cross the green line regardless of which album size it's applied to. Manual dragging is
// deliberately NOT clamped by this — a photographer can always drag a photo past the margin on
// purpose; only automatic placement is constrained.
export function marginInsetPctFor(album: { width_cm: number; height_cm: number }): { x: number; y: number } | null {
  return album.width_cm > 0 && album.height_cm > 0 ? { x: (0.5 / album.width_cm) * 100, y: (0.5 / album.height_cm) * 100 } : null;
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

export function cssFilterFor(filter: AlbumPhotoFilter | undefined, blurPct: number | undefined): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  return parts.length ? parts.join(" ") : undefined;
}

// box-shadow (unlike filter: drop-shadow on a descendant) isn't clipped by the frame's own
// overflow-hidden, so it's the one that can actually bleed outside a cropped photo frame.
export function boxShadowFor(shadowPct: number | undefined): string | undefined {
  if (!shadowPct) return undefined;
  const blurPx = (shadowPct / 100) * 24;
  const offsetPx = (shadowPct / 100) * 10;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  return `${offsetPx}px ${offsetPx}px ${blurPx}px rgba(0,0,0,${alpha})`;
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
  lockAspect: boolean
): { xPct: number; yPct: number; widthPct: number; heightPct: number } {
  const MIN_W = 8;
  const MIN_H = 6;
  const h: "w" | "e" | "" = handle.includes("w") ? "w" : handle.includes("e") ? "e" : "";
  const v: "n" | "s" | "" = handle.includes("n") ? "n" : handle.includes("s") ? "s" : "";
  const isCorner = h !== "" && v !== "";

  let newWidth = start.widthPct;
  let newHeight = start.heightPct;
  if (h === "e") newWidth = start.widthPct + dxPct;
  else if (h === "w") newWidth = start.widthPct - dxPct;
  if (v === "s") newHeight = start.heightPct + dyPct;
  else if (v === "n") newHeight = start.heightPct - dyPct;

  if (lockAspect && isCorner && start.widthPct > 0 && start.heightPct > 0) {
    const ratio = start.widthPct / start.heightPct;
    const scaleW = Math.abs(newWidth / start.widthPct - 1);
    const scaleH = Math.abs(newHeight / start.heightPct - 1);
    if (scaleW >= scaleH) newHeight = newWidth / ratio;
    else newWidth = newHeight * ratio;
  }

  newWidth = Math.max(MIN_W, newWidth);
  newHeight = Math.max(MIN_H, newHeight);

  const newLeft = h === "w" ? start.xPct + start.widthPct - newWidth : start.xPct;
  const newTop = v === "n" ? start.yPct + start.heightPct - newHeight : start.yPct;

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
): { guides: { orientation: "horizontal" | "vertical"; x: number; y: number; length: number }[]; snapXPct?: number; snapYPct?: number } {
  const guides: { orientation: "horizontal" | "vertical"; x: number; y: number; length: number }[] = [];
  let snapXPct: number | undefined;
  let snapYPct: number | undefined;
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
  }

  return { guides, snapXPct, snapYPct };
}

// Lays out a set of photos into rows of UNIFORM height, with each photo's width inside its row
// proportional to its own aspect ratio — a portrait photo (aspect < 1) ends up narrower than its
// landscape row-mates (aspect > 1) for the same row height, i.e. a portrait-shaped frame, and vice
// versa, without needing true justified-gallery math (which allows variable row heights but can't
// guarantee the whole set fills an exact 100%x100% page). Returns exactly one frame per input item,
// in the same order, so the caller can zip photoId back in by index.
function generateOrientedFrames(items: { id: string; aspect: number }[]): AlbumFrame[] {
  const n = items.length;
  if (n === 0) return [];
  const gap = 2; // pct
  const rows = Math.max(1, Math.min(n, Math.round(Math.sqrt(n))));
  const perRow = Math.ceil(n / rows);
  const rowHeight = (100 - gap * (rows - 1)) / rows;
  const frames: AlbumFrame[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const rowItems = items.slice(idx, idx + perRow);
    if (rowItems.length === 0) break;
    const sumAspect = rowItems.reduce((s, it) => s + it.aspect, 0) || rowItems.length;
    const rowWidthAvail = 100 - gap * (rowItems.length - 1);
    let x = 0;
    for (const it of rowItems) {
      const w = (it.aspect / sumAspect) * rowWidthAvail;
      frames.push({ id: `auto-${idx}`, xPct: x, yPct: r * (rowHeight + gap), widthPct: w, heightPct: rowHeight });
      x += w + gap;
      idx++;
    }
  }
  return frames;
}

// Seeds a brand-new "custom" canvas from the spread's existing preset-layout photos (matching the
// same position math the split/feature/stack renderers use) so switching a page to free-form
// never silently loses the photos it already had.
function seedElementsFromPreset(spread: GalleryAlbumSpreadRow): AlbumElement[] {
  const hasPhotoElement = spread.elements.some((el) => el.type === "photo");
  if (hasPhotoElement || !spread.photo_id_1) return spread.elements;

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
}: {
  spread: GalleryAlbumSpreadRow;
  // Physical print dimensions — used only to size the print-safe margin guide (a 0.5cm inset
  // proportional to the page, same regardless of which album this is).
  album: { width_cm: number; height_cm: number };
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
  onSave: (elements: AlbumElement[], background: { photoId: string | null; blur: number; opacity: number }) => void;
  onSaveTemplate: (name: string, frames: AlbumFrame[]) => Promise<void>;
  onClose: () => void;
}) {
  const [elements, setElements] = useState<AlbumElement[]>(() => (mode === "custom" ? seedElementsFromPreset(spread) : spread.elements));
  // Multiple photo elements can be selected at once (shift-click or a rubber-band marquee drag)
  // so circular-menu actions and resize can apply to the whole group; text elements stay
  // single-select only (a Set of size 1 for those).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Live rectangle while dragging a selection marquee on empty canvas — null when not marqueeing.
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [frameTargetId, setFrameTargetId] = useState<string | null>(null);
  const [pickingBackground, setPickingBackground] = useState(false);
  const [backgroundPhotoId, setBackgroundPhotoId] = useState(spread.background_photo_id);
  const [backgroundBlur, setBackgroundBlur] = useState(spread.background_blur);
  const [backgroundOpacity, setBackgroundOpacity] = useState(spread.background_opacity);
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
  const [textDraftOpen, setTextDraftOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
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
  const [spacingGuides, setSpacingGuides] = useState<{ orientation: "horizontal" | "vertical"; x: number; y: number; length: number }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
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

  const selectedElements = elements.filter((e) => selectedIds.has(e.id));
  const selectedPhotos = selectedElements.filter((e): e is AlbumPhotoElement => e.type === "photo");
  const selectedText = selectedElements.length === 1 && selectedElements[0].type === "text" ? selectedElements[0] : null;
  // The photo the floating circular menu anchors to and reads toggle-state from — the first
  // selected element that actually has an image (an empty placeholder frame has nothing to
  // filter/blur/rotate, so it's skipped even if selected).
  const anchorPhoto = selectedPhotos.find((p) => p.photoId) ?? null;
  // Kept for the few call sites that only make sense for a single element (info hint, delete
  // button, side-panel text controls) — any non-empty selection, not just size 1.
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;
  const usedPhotoIds = new Set(elements.filter((e): e is AlbumPhotoElement => e.type === "photo" && !!e.photoId).map((e) => e.photoId as string));
  const favoritePhotos = photos.filter((p) => p.is_favorite);
  // Photos already placed on OTHER pages of the album are dropped entirely (not just badged) so a
  // photo used earlier in the book never shows up as an option on a later page — except when
  // picking a page BACKGROUND, which is a different, non-exclusive kind of "use".
  const pickerPhotosBase = showAllInPicker || favoritePhotos.length === 0 ? photos : favoritePhotos;
  const pickerPhotos = pickingBackground ? pickerPhotosBase : pickerPhotosBase.filter((p) => !usedElsewhere?.has(p.id));
  // Drag-to-frame panel: cross-page duplicates are always excluded; same-page duplicates are
  // excluded by default (so a placed photo disappears once dragged in) but "הצג הכל" reveals them
  // too, badged ✅, purely for review. Grouped by folder/tab when the gallery actually has any;
  // otherwise every favorite sits in one flat, unlabeled group.
  const dragPanelPool = favoritePhotos.filter((p) => !usedElsewhere?.has(p.id) && (showAllDragPanel || !usedPhotoIds.has(p.id)));
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

  // Leaving "position image" mode whenever the selection changes elsewhere keeps its green ring
  // tied to whatever's actually selected, rather than lingering on a no-longer-selected element.
  useEffect(() => {
    setPanModeId((prev) => (prev && !selectedIds.has(prev) ? null : prev));
  }, [selectedIds]);

  const updateElement = (id: string, patch: Partial<AlbumElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as AlbumElement) : e)));
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

  // "הצגה בגודל נכון" — resizes the frame to the photo's own true aspect ratio (no crop needed
  // once matched) instead of whatever ratio the frame happened to have. Keeps the frame's current
  // WIDTH fixed and solves for the height that ratio implies in real cm, re-centered on the
  // frame's previous vertical center — deliberately allowed to grow past other elements or the
  // green safe-print margin, since this is a manual per-photo action, not automatic placement.
  // Loops every id given so a multi-selection true-sizes each photo against its OWN aspect ratio,
  // not a single shared one.
  const showTrueSize = async (ids: string[]) => {
    for (const id of ids) {
      const el = elements.find((e) => e.id === id);
      if (!el || el.type !== "photo" || !el.photoId || album.width_cm <= 0 || album.height_cm <= 0) continue;
      const photo = photoById.get(el.photoId);
      if (!photo) continue;
      const aspect = await loadImageAspect(photo.url);
      const widthCm = (el.widthPct / 100) * album.width_cm;
      const heightCm = widthCm / aspect;
      const newHeightPct = (heightCm / album.height_cm) * 100;
      const centerY = el.yPct + el.heightPct / 2;
      updateElement(id, { heightPct: newHeightPct, yPct: centerY - newHeightPct / 2, focalX: 50, focalY: 50 });
    }
  };

  // "החל על כל התמונות בדף" — copies one photo's border/shadow styling onto every other photo
  // element on this page, so matching a whole spread's frames doesn't mean opening each one's own
  // flyout and re-entering the same shadow%/border-width/color by hand.
  const applyShadowToAllPhotos = (id: string) => {
    const source = elements.find((e) => e.id === id);
    if (!source || source.type !== "photo") return;
    const { shadow, borderWidth, borderColor } = source;
    setElements((prev) =>
      prev.map((e) => (e.type === "photo" ? { ...e, shadow, borderWidth, borderColor } : e))
    );
  };

  const confirmMultiPhotos = async () => {
    const ids = Array.from(multiPhotoIds);
    if (ids.length === 0) return;
    setLoadingMultiLayout(true);
    const items = await Promise.all(
      ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") }))
    );
    // Rescaled into the album's print-safe area (see fitFramesToSafeArea) so an auto-generated
    // multi-photo layout can never cross the green margin on its own.
    const frames = fitFramesToSafeArea(generateOrientedFrames(items), marginInsetPct); // same order/length as `items`
    const newPhotoElements: AlbumPhotoElement[] = frames.map((f, i) => ({
      id: f.id,
      type: "photo",
      photoId: items[i].id,
      xPct: f.xPct,
      yPct: f.yPct,
      widthPct: f.widthPct,
      heightPct: f.heightPct,
      focalX: 50,
      focalY: 50,
    }));
    setElements((prev) => [...newPhotoElements, ...prev.filter((e) => e.type === "text")]);
    setLoadingMultiLayout(false);
    setPhotoPickerOpen(false);
    setAddingMultiplePhotos(false);
    setMultiPhotoIds(new Set());
    setSelectedIds(new Set());
  };

  const removeBackground = () => setBackgroundPhotoId(null);

  const addText = () => {
    if (!textDraft.trim()) return;
    const id = `el-${Date.now()}`;
    setElements((prev) => [
      ...prev,
      { id, type: "text", text: textDraft.trim(), xPct: 10, yPct: 40, widthPct: 80, heightPct: 15, fontSize: 40, fontFamily: "heebo", color: "white", align: "center" },
    ]);
    setTextDraft("");
    setTextDraftOpen(false);
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
    const available = favoritePhotos.filter((p) => !usedPhotoIds.has(p.id));
    const newPhotoElements: AlbumPhotoElement[] = frames.map((f, i) => ({
      id: `frame-${Date.now()}-${i}`,
      type: "photo",
      photoId: available[i]?.id ?? null,
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
    setTemplatePickerOpen(false);
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
    e.stopPropagation();
    // Can throw in edge cases (pointer id no longer "active" by the time this runs, some
    // browsers on fast multi-touch sequences) — losing implicit capture just means a drag that
    // leaves the frame won't keep tracking, not a broken interaction, so it's not worth aborting
    // the whole gesture over.
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignored — see above
    }
    const groupIds =
      kind === "resize" ? (selectedPhotos.length > 1 && selectedIds.has(el.id) ? selectedPhotos.map((p) => p.id) : [el.id]) : moveGroupIds ?? [el.id];
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
      const hitIds = elements.filter((el) => el.type === "photo" && boxesIntersect(elementBox(el), marquee)).map((el) => el.id);
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
      const primaryResult = computeResize(drag.resizeHandle ?? "se", primaryStart, dxPct, dyPct, lockAspect);
      const scaleW = primaryStart.widthPct > 0 ? primaryResult.widthPct / primaryStart.widthPct : 1;
      const scaleH = primaryStart.heightPct > 0 ? primaryResult.heightPct / primaryStart.heightPct : 1;
      setElements((prev) =>
        prev.map((e2) => {
          const gs = drag.groupStart[e2.id];
          if (!gs) return e2;
          if (e2.id === drag.id) return { ...e2, ...primaryResult };
          // Every other selected photo scales by the same factor, anchored on its own center —
          // simpler and less surprising than trying to replicate the primary's exact handle
          // semantics (top-left-fixed etc) across frames that started at different positions.
          const newW = Math.max(8, Math.min(100, gs.widthPct * scaleW));
          const newH = Math.max(6, Math.min(100, gs.heightPct * scaleH));
          const cx = gs.xPct + gs.widthPct / 2;
          const cy = gs.yPct + gs.heightPct / 2;
          const nx = Math.max(0, Math.min(cx - newW / 2, 100 - newW));
          const ny = Math.max(0, Math.min(cy - newH / 2, 100 - newH));
          return { ...e2, xPct: nx, yPct: ny, widthPct: newW, heightPct: newH };
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
      // whole frame sweeps the full 0-100 focal range.
      const focalX = Math.max(0, Math.min(100, drag.startFocalX + (dxPct / Math.max(1, primaryStart.widthPct)) * 100));
      const focalY = Math.max(0, Math.min(100, drag.startFocalY + (dyPct / Math.max(1, primaryStart.heightPct)) * 100));
      updateElement(drag.id, { focalX, focalY });
      if (guides.length) setGuides([]);
      return;
    }

    const groupIds = Object.keys(drag.groupStart);
    if (groupIds.length > 1) {
      // Multiple selected elements move together by the same delta — no alignment/spacing guides
      // for a group drag, keeping the math (and the visual noise) simple.
      setElements((prev) =>
        prev.map((e2) => {
          const gs = drag.groupStart[e2.id];
          if (!gs) return e2;
          const nx = Math.max(0, Math.min(95, gs.xPct + dxPct));
          const ny = Math.max(0, Math.min(95, gs.yPct + dyPct));
          return { ...e2, xPct: nx, yPct: ny };
        })
      );
      return;
    }

    const candidateX = Math.max(0, Math.min(95, primaryStart.xPct + dxPct));
    const candidateY = Math.max(0, Math.min(95, primaryStart.yPct + dyPct));
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
    dragRef.current = null;
    if (marqueeRef.current) {
      justMarqueedRef.current = !!marqueeBox && (marqueeBox.w > 0.5 || marqueeBox.h > 0.5);
      marqueeRef.current = null;
      setMarqueeBox(null);
    }
    setGuides([]);
    setSpacingGuides([]);
  };

  const photoById = new Map(photos.map((p) => [p.id, p]));

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${ALBUM_FONT_CLASS_NAMES}`}
      style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
    >
      {/* Mobile keeps the original compact bottom-sheet-ish modal (single column, whole-panel
          scroll). From the lg: breakpoint up, the panel expands to fill nearly the whole window
          and splits into two flex columns — a large centered canvas on one side and a
          scrollable controls sidebar on the other — since the cramped max-w-sm modal was a real
          problem on desktop, where there's plenty of room to work more comfortably. */}
      <div className="w-full max-w-sm lg:max-w-none lg:w-[95vw] lg:h-[92vh] rounded-3xl p-4 lg:p-6 bg-paper shadow-sheet max-h-[92vh] overflow-y-auto lg:overflow-visible lg:flex lg:flex-row lg:gap-6">
        <div className="lg:flex-1 lg:flex lg:flex-col lg:min-w-0 lg:min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold font-display">{mode === "custom" ? "עיצוב חופשי" : "הוספת טקסט לעמוד"}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            <IconClose />
          </button>
        </div>

        <div className="lg:flex-1 lg:flex lg:items-center lg:justify-center lg:min-h-0">
        {/* Not overflow-hidden (unlike the canvas below) so the floating photo menu — and the
            flyout sliders it opens — can bleed past the canvas's own edge, not just the photo's. */}
        <div className="relative w-full lg:max-w-full">
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
          className="relative w-full lg:w-[min(100%,105.6vh)] lg:mx-auto aspect-[16/10] rounded-xl overflow-hidden bg-line select-none"
          style={{ containerType: "inline-size" }}
        >
          {backgroundPhoto && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={backgroundPhoto.url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ opacity: backgroundOpacity / 100, filter: backgroundBlur ? `blur(${(backgroundBlur / 100) * ALBUM_BLUR_MAX_PX}px)` : undefined }}
            />
          )}
          {mode === "overlay" && (
            <div className={`absolute inset-0 flex ${spread.layout === "stack" ? "flex-col" : "flex-row"} gap-0.5 pointer-events-none`}>
              {photo1 && (
                <div className="relative overflow-hidden" style={{ flex: photo2 && spread.layout === "feature" ? 1 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo1.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_1}% ${spread.focal_y_1}%` }} />
                </div>
              )}
              {photo2 && (
                <div className="relative overflow-hidden" style={{ flex: spread.layout === "feature" ? 1.6 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo2.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_2}% ${spread.focal_y_2}%` }} />
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
                      // Alt/Cmd+click centers the PHOTO inside its own fixed frame (resets its
                      // focal point) — it never moves the frame itself across the page.
                      if (photo && (e.altKey || e.metaKey)) {
                        e.stopPropagation();
                        setSelectedIds(new Set([el.id]));
                        updateElement(el.id, { focalX: 50, focalY: 50 });
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
                      // A double-click is a fast shortcut into "position image" mode — the same
                      // mode the floating menu's מיקום התמונה button opens — so a following drag
                      // pans the photo inside its own fixed frame instead of moving the frame.
                      if (!photo) return;
                      e.stopPropagation();
                      setSelectedIds(new Set([el.id]));
                      setPanModeId(el.id);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedId = e.dataTransfer.getData("text/plain");
                      if (droppedId) updateElement(el.id, { photoId: droppedId, focalX: 50, focalY: 50 });
                    }}
                    className={`absolute overflow-hidden ${photo ? (panModeId === el.id ? "cursor-crosshair" : "cursor-move") : "cursor-move flex items-center justify-center bg-chip"}`}
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      outline: el.borderWidth
                        ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}`
                        : panModeId === el.id
                        ? "2px solid var(--color-sage)"
                        : isSelected
                        ? "2px solid var(--color-amber-deep)"
                        : "1px dashed rgba(255,255,255,0.6)",
                      outlineOffset: el.borderWidth ? `-${el.borderWidth}px` : undefined,
                      // box-shadow (unlike a filter on the img) isn't clipped by this div's own
                      // overflow-hidden, so it's what lets the shadow actually bleed past the frame.
                      boxShadow: boxShadowFor(el.shadow),
                      // Rotation lives on THIS element (not the <img>) so the outline and
                      // box-shadow — both decorations of this same box — rotate along with the
                      // clipped photo as one rigid tile, instead of only the image content
                      // spinning inside a frame that stays visually fixed.
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    }}
                  >
                    {photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo.url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        style={{
                          objectPosition: `${el.focalX}% ${el.focalY}%`,
                          filter: cssFilterFor(el.filter, el.blur),
                          opacity: (el.opacity ?? 100) / 100,
                          // Zoom is a crop-level operation (how much of the image shows inside the
                          // already-fixed, already-rotated frame) so it stays on the image itself,
                          // separate from the frame's own rotation above.
                          transform: el.zoom && el.zoom !== 100 ? `scale(${el.zoom / 100})` : undefined,
                        }}
                      />
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
                    {isSelected && renderResizeHandles(el, startDrag)}
                  </div>
                );
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
                    textShadow: isLightTextColor(el.color) ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 4px rgba(255,255,255,0.7)",
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
              important gets designed too close to where a printer might trim it off. */}
          {marginInsetPct && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${marginInsetPct.x}%`,
                top: `${marginInsetPct.y}%`,
                right: `${marginInsetPct.x}%`,
                bottom: `${marginInsetPct.y}%`,
                border: "2px solid #2fae5c",
                opacity: 0.55,
              }}
            />
          )}

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
              two kinds of snap read as distinct: "lined up" vs "evenly spaced". */}
          {spacingGuides.map((g, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={
                g.orientation === "horizontal"
                  ? { left: `${g.x}%`, top: `${g.y}%`, width: `${g.length}%`, height: 0, borderTop: "2px dashed var(--color-sage)" }
                  : { left: `${g.x}%`, top: `${g.y}%`, width: 0, height: `${g.length}%`, borderLeft: "2px dashed var(--color-sage)" }
              }
            />
          ))}

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
        </div>
        {anchorPhoto && (
          <PhotoFloatingMenu
            el={anchorPhoto}
            panning={selectedIds.size === 1 && panModeId === anchorPhoto.id}
            onTogglePan={() => {
              if (selectedIds.size !== 1) return;
              setPanModeId((prev) => (prev === anchorPhoto.id ? null : anchorPhoto.id));
            }}
            onUpdate={(patch) => applyToSelectedPhotos(patch)}
            onTrueSize={() => showTrueSize(selectedPhotos.filter((p) => p.photoId).map((p) => p.id))}
            onApplyShadowToAll={() => applyShadowToAllPhotos(anchorPhoto.id)}
            onDeleteSelected={removeSelected}
          />
        )}
        </div>
        </div>
        </div>

        {/* Controls sidebar — stacks below the canvas on mobile same as before; becomes an
            independently-scrolling side column on desktop so a tall control list never forces
            the canvas itself to scroll out of view. */}
        <div className="lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:pr-1 lg:min-h-0">
        {selectedElements.length > 0 && (
          <div className="space-y-2 mt-2.5">
            {selectedText && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_COLOR_PALETTE.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateElement(selectedText.id, { color: value })}
                      title={label}
                      className="h-7 w-7 rounded-full"
                      style={{
                        background: value,
                        boxShadow: selectedText.color === value ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {(["right", "center", "left"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => updateElement(selectedText.id, { align: a })}
                      className="flex-1 rounded-full py-1.5 text-[10px] font-semibold"
                      style={{
                        background: selectedText.align === a ? "var(--color-amber-deep)" : "var(--color-chip)",
                        color: selectedText.align === a ? "#fff" : "var(--color-ink-soft)",
                      }}
                    >
                      {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <select
                    value={selectedText.fontFamily ?? "heebo"}
                    onChange={(e) => updateElement(selectedText.id, { fontFamily: e.target.value })}
                    className="w-full rounded-lg px-2.5 py-2 text-xs font-semibold bg-white border border-line"
                    style={{ fontFamily: albumFontFamilyCss(selectedText.fontFamily) }}
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
                </div>
                <SliderControl label="גודל טקסט" value={selectedText.fontSize} min={2} max={250} unit="pt" onChange={(v) => updateElement(selectedText.id, { fontSize: v })} />
              </>
            )}
            {selectedPhotos.length === 1 && anchorPhoto && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                לחצו על התמונה כדי לפתוח את תפריט העיצוב הצף (שחור-לבן, ספיה, שקיפות, טשטוש, סיבוב, צל וקו מתאר)
              </p>
            )}
            {selectedPhotos.length > 1 && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                נבחרו {selectedPhotos.length} תמונות — גרירה, שינוי גודל ופעולות מהתפריט הצף יחולו על כולן
              </p>
            )}
            <button onClick={removeSelected} className="w-full h-8 rounded-full bg-chip text-rose text-xs font-semibold">
              מחיקה
            </button>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-[11px] font-bold text-ink-soft mb-1.5">רקע לכל העמוד</p>
          {backgroundPhoto ? (
            <div className="space-y-2">
              <div className="relative h-16 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={backgroundPhoto.url} alt="" className="w-full h-full object-cover" style={{ opacity: backgroundOpacity / 100 }} />
                <button onClick={removeBackground} className="absolute top-1 left-1 h-6 w-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">
                  <IconClose size={13} />
                </button>
              </div>
              <SliderControl label="שקיפות רקע" value={backgroundOpacity} min={0} max={100} unit="%" onChange={setBackgroundOpacity} />
              <SliderControl label="טשטוש רקע (Blur)" value={backgroundBlur} min={0} max={100} unit="%" onChange={setBackgroundBlur} />
            </div>
          ) : (
            <button onClick={openPickerForBackground} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
              + בחירת תמונת רקע
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-3">
          {mode === "custom" && (
            <>
              <button onClick={openPickerForNewPhoto} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                + תמונה
              </button>
              <button onClick={addFrame} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                + מסגרת
              </button>
              <button onClick={() => setTemplatePickerOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5">
                <IconGrid size={14} />
                תבניות
              </button>
            </>
          )}
          <button onClick={() => setTextDraftOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
            + טקסט
          </button>
        </div>

        {mode === "custom" && (
          <button
            onClick={() => setSaveTemplateOpen(true)}
            disabled={!elements.some((e) => e.type === "photo")}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink mt-2 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <IconSave size={14} />
            שמירת הפריסה כתבנית
          </button>
        )}

        <button
          onClick={() => onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity })}
          className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white mt-2.5"
        >
          שמירה
        </button>

        {mode === "custom" && (
          <div className="mt-3 pt-3 border-t border-line">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-bold text-ink-soft">גררו תמונה מועדפת אל המסגרת הרצויה</p>
              {favoritePhotos.length > 0 && (
                <button onClick={() => setShowAllDragPanel((v) => !v)} className="text-[11px] font-semibold text-ink-soft underline shrink-0">
                  {showAllDragPanel ? "רק זמינות" : "הצג הכל"}
                </button>
              )}
            </div>
            {dragPanelGroups.length === 0 ? (
              <p className="text-[11px] text-ink-soft text-center py-3">
                {favoritePhotos.length === 0 ? "אין תמונות מועדפות בגלריה הזו עדיין." : "כל התמונות המועדפות כבר שובצו בעמוד."}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-0.5">
                {dragPanelGroups.map((group) => (
                  <div key={group.id}>
                    {group.name && <p className="text-[10px] font-semibold text-ink-soft mb-1">{group.name}</p>}
                    <div className="grid grid-cols-5 gap-1.5">
                      {group.items.map((p) => {
                        const alreadyUsed = usedPhotoIds.has(p.id);
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                            className="relative aspect-square rounded-md overflow-hidden cursor-grab active:cursor-grabbing"
                            style={{ boxShadow: "0 0 0 1px var(--color-line)", opacity: alreadyUsed ? 0.5 : 1 }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
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
            )}
          </div>
        )}
        </div>
      </div>

      {photoPickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setPhotoPickerOpen(false)}>
          <div className="w-full max-w-sm lg:max-w-2xl rounded-3xl p-4 lg:p-6 bg-paper max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
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

      {textDraftOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setTextDraftOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl p-5 bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold">טקסט חדש (עברית או אנגלית)</p>
              <button onClick={() => setTextDraftOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button onClick={addText} disabled={!textDraft.trim()} className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60">
              הוספה
            </button>
          </div>
        </div>
      )}

      {templatePickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-end lg:items-center justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setTemplatePickerOpen(false)}>
          <div className="w-full max-w-sm lg:max-w-4xl rounded-t-3xl lg:rounded-3xl p-5 lg:p-6 bg-paper max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">תבניות מובנות</p>
              <button onClick={() => setTemplatePickerOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
              {TEMPLATE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTemplateTab(tab.key)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                  style={{
                    background: templateTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: templateTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
              {TEMPLATE_BANK[templateTab].map((t) => (
                <button key={t.name} onClick={() => applyTemplate(t.frames)} className="rounded-xl border border-line p-2 text-center">
                  <div className="relative aspect-[16/10] rounded-md bg-chip mb-1.5">
                    {t.frames.map((f) => (
                      <div key={f.id} className="absolute rounded-sm bg-white border border-line" style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.widthPct}%`, height: `${f.heightPct}%` }} />
                    ))}
                  </div>
                  <span className="text-[11px] font-semibold">{t.name}</span>
                </button>
              ))}
            </div>
            {templates.length > 0 && (
              <>
                <p className="text-sm font-bold mb-3">התבניות שלי</p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t.frames)} className="rounded-xl border border-line p-2 text-center">
                      <div className="relative aspect-[16/10] rounded-md bg-chip mb-1.5">
                        {t.frames.map((f) => (
                          <div key={f.id} className="absolute rounded-sm bg-white border border-line" style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.widthPct}%`, height: `${f.heightPct}%` }} />
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold">{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
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
