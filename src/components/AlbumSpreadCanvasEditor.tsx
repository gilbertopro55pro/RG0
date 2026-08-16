"use client";

import { useEffect, useRef, useState } from "react";
import type { AlbumElement, AlbumFrame, AlbumPhotoElement, AlbumPhotoFilter, AlbumTemplateRow, GalleryAlbumSpreadRow } from "@/lib/types";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";

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

function CircleButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: active ? "var(--color-amber-deep)" : "#fff",
        color: active ? "#fff" : "var(--color-ink)",
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
}: {
  el: AlbumPhotoElement;
  panning: boolean;
  onTogglePan: () => void;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
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
          </FlyoutPanel>
        )}
      </div>
    </div>
  );
}

export const BUILT_IN_TEMPLATES: { name: string; frames: AlbumFrame[] }[] = [
  {
    name: "שתי תמונות שוות",
    frames: [
      { id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 100 },
      { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 100 },
    ],
  },
  {
    name: "שלוש בשורה",
    frames: [
      { id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 100 },
      { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 100 },
      { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 100 },
    ],
  },
  {
    name: "רשת 2×2",
    frames: [
      { id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 49 },
      { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 49 },
      { id: "f3", xPct: 0, yPct: 51, widthPct: 49, heightPct: 49 },
      { id: "f4", xPct: 51, yPct: 51, widthPct: 49, heightPct: 49 },
    ],
  },
  {
    name: "גדולה ושתי קטנות",
    frames: [
      { id: "f1", xPct: 0, yPct: 0, widthPct: 64, heightPct: 100 },
      { id: "f2", xPct: 66, yPct: 0, widthPct: 34, heightPct: 49 },
      { id: "f3", xPct: 66, yPct: 51, widthPct: 34, heightPct: 49 },
    ],
  },
  { name: "תמונה בודדת", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 }] },
  // 50 more starters: 10 with 5 photos, 10 with 8, 10 with 10, and 20 free-form creative layouts
  // with varied photo counts (2–20) — generated programmatically from row/column/feature-grid
  // recipes so every frame set is gap-consistent and non-overlapping by construction.
  { name: "5 בשורה עליונה גדולה", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 100, heightPct: 58.8 }, { id: "f2", xPct: 0, yPct: 60.8, widthPct: 23.5, heightPct: 39.2 }, { id: "f3", xPct: 25.5, yPct: 60.8, widthPct: 23.5, heightPct: 39.2 }, { id: "f4", xPct: 51, yPct: 60.8, widthPct: 23.5, heightPct: 39.2 }, { id: "f5", xPct: 76.5, yPct: 60.8, widthPct: 23.5, heightPct: 39.2 }] },
  { name: "5 בשורה תחתונה גדולה", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 39.2 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 39.2 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 39.2 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 39.2 }, { id: "f5", xPct: 0, yPct: 41.2, widthPct: 100, heightPct: 58.8 }] },
  { name: "5 שתיים ושלוש", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 49 }, { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 49 }, { id: "f3", xPct: 0, yPct: 51, widthPct: 32, heightPct: 49 }, { id: "f4", xPct: 34, yPct: 51, widthPct: 32, heightPct: 49 }, { id: "f5", xPct: 68, yPct: 51, widthPct: 32, heightPct: 49 }] },
  { name: "5 שלוש ושתיים", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f4", xPct: 0, yPct: 51, widthPct: 49, heightPct: 49 }, { id: "f5", xPct: 51, yPct: 51, widthPct: 49, heightPct: 49 }] },
  { name: "5 בולטת וקטנות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 65.33, heightPct: 49 }, { id: "f2", xPct: 67.33, yPct: 0, widthPct: 32.67, heightPct: 49 }, { id: "f3", xPct: 0, yPct: 51, widthPct: 32, heightPct: 49 }, { id: "f4", xPct: 34, yPct: 51, widthPct: 32, heightPct: 49 }, { id: "f5", xPct: 68, yPct: 51, widthPct: 32, heightPct: 49 }] },
  { name: "5 קטנות ובולטת", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f4", xPct: 0, yPct: 51, widthPct: 65.33, heightPct: 49 }, { id: "f5", xPct: 67.33, yPct: 51, widthPct: 32.67, heightPct: 49 }] },
  { name: "5 שלוש שורות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 100, heightPct: 32 }, { id: "f2", xPct: 0, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f3", xPct: 51, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 68, widthPct: 49, heightPct: 32 }, { id: "f5", xPct: 51, yPct: 68, widthPct: 49, heightPct: 32 }] },
  { name: "5 שלוש שורות הפוך", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f4", xPct: 51, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f5", xPct: 0, yPct: 68, widthPct: 100, heightPct: 32 }] },
  { name: "5 עמודות משתנות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f2", xPct: 0, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 68, widthPct: 49, heightPct: 32 }, { id: "f4", xPct: 51, yPct: 0, widthPct: 49, heightPct: 49 }, { id: "f5", xPct: 51, yPct: 51, widthPct: 49, heightPct: 49 }] },
  { name: "5 תמונה ראשית וטור", frames: [{ id: "f0", xPct: 45, yPct: 0, widthPct: 55, heightPct: 100 }, { id: "f1", xPct: 0, yPct: 0, widthPct: 43, heightPct: 23.5 }, { id: "f2", xPct: 0, yPct: 25.5, widthPct: 43, heightPct: 23.5 }, { id: "f3", xPct: 0, yPct: 51, widthPct: 43, heightPct: 23.5 }, { id: "f4", xPct: 0, yPct: 76.5, widthPct: 43, heightPct: 23.5 }] },
  { name: "8 רשת 4×2", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 49 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 49 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 49 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 49 }, { id: "f5", xPct: 0, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f6", xPct: 25.5, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f7", xPct: 51, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f8", xPct: 76.5, yPct: 51, widthPct: 23.5, heightPct: 49 }] },
  { name: "8 רשת 2×4", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 23.5 }, { id: "f2", xPct: 0, yPct: 25.5, widthPct: 49, heightPct: 23.5 }, { id: "f3", xPct: 0, yPct: 51, widthPct: 49, heightPct: 23.5 }, { id: "f4", xPct: 0, yPct: 76.5, widthPct: 49, heightPct: 23.5 }, { id: "f5", xPct: 51, yPct: 0, widthPct: 49, heightPct: 23.5 }, { id: "f6", xPct: 51, yPct: 25.5, widthPct: 49, heightPct: 23.5 }, { id: "f7", xPct: 51, yPct: 51, widthPct: 49, heightPct: 23.5 }, { id: "f8", xPct: 51, yPct: 76.5, widthPct: 49, heightPct: 23.5 }] },
  { name: "8 שלוש שורות 3-3-2", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f5", xPct: 34, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f6", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 0, yPct: 68, widthPct: 49, heightPct: 32 }, { id: "f8", xPct: 51, yPct: 68, widthPct: 49, heightPct: 32 }] },
  { name: "8 שלוש שורות 2-3-3", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 34, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f5", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f6", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 34, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f8", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "8 שלוש שורות 3-2-3", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f5", xPct: 51, yPct: 34, widthPct: 49, heightPct: 32 }, { id: "f6", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 34, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f8", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "8 פס עליון ורשת", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 100, heightPct: 24.77 }, { id: "f2", xPct: 0, yPct: 26.77, widthPct: 23.5, heightPct: 40.26 }, { id: "f3", xPct: 25.5, yPct: 26.77, widthPct: 23.5, heightPct: 40.26 }, { id: "f4", xPct: 51, yPct: 26.77, widthPct: 23.5, heightPct: 40.26 }, { id: "f5", xPct: 76.5, yPct: 26.77, widthPct: 23.5, heightPct: 40.26 }, { id: "f6", xPct: 0, yPct: 69.03, widthPct: 32, heightPct: 30.97 }, { id: "f7", xPct: 34, yPct: 69.03, widthPct: 32, heightPct: 30.97 }, { id: "f8", xPct: 68, yPct: 69.03, widthPct: 32, heightPct: 30.97 }] },
  { name: "8 רשת ופס תחתון", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 30.97 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 30.97 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 30.97 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 30.97 }, { id: "f5", xPct: 0, yPct: 32.97, widthPct: 32, heightPct: 40.26 }, { id: "f6", xPct: 34, yPct: 32.97, widthPct: 32, heightPct: 40.26 }, { id: "f7", xPct: 68, yPct: 32.97, widthPct: 32, heightPct: 40.26 }, { id: "f8", xPct: 0, yPct: 75.23, widthPct: 100, heightPct: 24.77 }] },
  { name: "8 שורה בולטת ורשת", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 37.6, heightPct: 49 }, { id: "f2", xPct: 39.6, yPct: 0, widthPct: 18.8, heightPct: 49 }, { id: "f3", xPct: 60.4, yPct: 0, widthPct: 18.8, heightPct: 49 }, { id: "f4", xPct: 81.2, yPct: 0, widthPct: 18.8, heightPct: 49 }, { id: "f5", xPct: 0, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f6", xPct: 25.5, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f7", xPct: 51, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f8", xPct: 76.5, yPct: 51, widthPct: 23.5, heightPct: 49 }] },
  { name: "8 עמודות משתנות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f2", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 34, yPct: 0, widthPct: 32, heightPct: 49 }, { id: "f5", xPct: 34, yPct: 51, widthPct: 32, heightPct: 49 }, { id: "f6", xPct: 68, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f8", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "8 תמונה ראשית ורשת", frames: [{ id: "f0", xPct: 0, yPct: 0, widthPct: 42, heightPct: 100 }, { id: "f1", xPct: 44, yPct: 0, widthPct: 17.33, heightPct: 49 }, { id: "f2", xPct: 63.33, yPct: 0, widthPct: 17.33, heightPct: 49 }, { id: "f3", xPct: 82.67, yPct: 0, widthPct: 17.33, heightPct: 49 }, { id: "f4", xPct: 44, yPct: 51, widthPct: 12.5, heightPct: 49 }, { id: "f5", xPct: 58.5, yPct: 51, widthPct: 12.5, heightPct: 49 }, { id: "f6", xPct: 73, yPct: 51, widthPct: 12.5, heightPct: 49 }, { id: "f7", xPct: 87.5, yPct: 51, widthPct: 12.5, heightPct: 49 }] },
  { name: "10 רשת 5×2", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 18.4, heightPct: 49 }, { id: "f2", xPct: 20.4, yPct: 0, widthPct: 18.4, heightPct: 49 }, { id: "f3", xPct: 40.8, yPct: 0, widthPct: 18.4, heightPct: 49 }, { id: "f4", xPct: 61.2, yPct: 0, widthPct: 18.4, heightPct: 49 }, { id: "f5", xPct: 81.6, yPct: 0, widthPct: 18.4, heightPct: 49 }, { id: "f6", xPct: 0, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f7", xPct: 20.4, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f8", xPct: 40.8, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f9", xPct: 61.2, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f10", xPct: 81.6, yPct: 51, widthPct: 18.4, heightPct: 49 }] },
  { name: "10 רשת 2×5", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 18.4 }, { id: "f2", xPct: 0, yPct: 20.4, widthPct: 49, heightPct: 18.4 }, { id: "f3", xPct: 0, yPct: 40.8, widthPct: 49, heightPct: 18.4 }, { id: "f4", xPct: 0, yPct: 61.2, widthPct: 49, heightPct: 18.4 }, { id: "f5", xPct: 0, yPct: 81.6, widthPct: 49, heightPct: 18.4 }, { id: "f6", xPct: 51, yPct: 0, widthPct: 49, heightPct: 18.4 }, { id: "f7", xPct: 51, yPct: 20.4, widthPct: 49, heightPct: 18.4 }, { id: "f8", xPct: 51, yPct: 40.8, widthPct: 49, heightPct: 18.4 }, { id: "f9", xPct: 51, yPct: 61.2, widthPct: 49, heightPct: 18.4 }, { id: "f10", xPct: 51, yPct: 81.6, widthPct: 49, heightPct: 18.4 }] },
  { name: "10 שלוש שורות 3-3-4", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f5", xPct: 34, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f6", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 0, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 25.5, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 51, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f10", xPct: 76.5, yPct: 68, widthPct: 23.5, heightPct: 32 }] },
  { name: "10 שלוש שורות 4-3-3", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f5", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f6", xPct: 34, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f8", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f9", xPct: 34, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f10", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "10 שלוש שורות 2-4-4", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f4", xPct: 25.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f5", xPct: 51, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f6", xPct: 76.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f7", xPct: 0, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 25.5, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 51, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f10", xPct: 76.5, yPct: 68, widthPct: 23.5, heightPct: 32 }] },
  { name: "10 עמודות משתנות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f2", xPct: 0, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f4", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 49 }, { id: "f5", xPct: 25.5, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f6", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f7", xPct: 51, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 51, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 49 }, { id: "f10", xPct: 76.5, yPct: 51, widthPct: 23.5, heightPct: 49 }] },
  { name: "10 תמונה ראשית ורשת שמאל", frames: [{ id: "f0", xPct: 0, yPct: 0, widthPct: 40, heightPct: 100 }, { id: "f1", xPct: 42, yPct: 0, widthPct: 18, heightPct: 32 }, { id: "f2", xPct: 62, yPct: 0, widthPct: 18, heightPct: 32 }, { id: "f3", xPct: 82, yPct: 0, widthPct: 18, heightPct: 32 }, { id: "f4", xPct: 42, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f5", xPct: 57, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f6", xPct: 72, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f7", xPct: 87, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f8", xPct: 42, yPct: 68, widthPct: 28, heightPct: 32 }, { id: "f9", xPct: 72, yPct: 68, widthPct: 28, heightPct: 32 }] },
  { name: "10 תמונה ראשית ורשת ימין", frames: [{ id: "f0", xPct: 60, yPct: 0, widthPct: 40, heightPct: 100 }, { id: "f1", xPct: 0, yPct: 0, widthPct: 18, heightPct: 32 }, { id: "f2", xPct: 20, yPct: 0, widthPct: 18, heightPct: 32 }, { id: "f3", xPct: 40, yPct: 0, widthPct: 18, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f5", xPct: 15, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f6", xPct: 30, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f7", xPct: 45, yPct: 34, widthPct: 13, heightPct: 32 }, { id: "f8", xPct: 0, yPct: 68, widthPct: 28, heightPct: 32 }, { id: "f9", xPct: 30, yPct: 68, widthPct: 28, heightPct: 32 }] },
  { name: "10 שלוש עמודות 3-4-3", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f2", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f3", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 34, yPct: 0, widthPct: 32, heightPct: 23.5 }, { id: "f5", xPct: 34, yPct: 25.5, widthPct: 32, heightPct: 23.5 }, { id: "f6", xPct: 34, yPct: 51, widthPct: 32, heightPct: 23.5 }, { id: "f7", xPct: 34, yPct: 76.5, widthPct: 32, heightPct: 23.5 }, { id: "f8", xPct: 68, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f9", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f10", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "10 מוזאיקה בולטת", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 48, heightPct: 32 }, { id: "f2", xPct: 50, yPct: 0, widthPct: 24, heightPct: 32 }, { id: "f3", xPct: 76, yPct: 0, widthPct: 24, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f5", xPct: 25.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f6", xPct: 51, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f7", xPct: 76.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f9", xPct: 34, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f10", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "שתי תמונות א-סימטריות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 65.33, heightPct: 100 }, { id: "f2", xPct: 67.33, yPct: 0, widthPct: 32.67, heightPct: 100 }] },
  { name: "גיבור מרכזי", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 24, heightPct: 100 }, { id: "f2", xPct: 26, yPct: 0, widthPct: 48, heightPct: 100 }, { id: "f3", xPct: 76, yPct: 0, widthPct: 24, heightPct: 100 }] },
  { name: "ענק למעלה ושתיים למטה", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 100, heightPct: 60.31 }, { id: "f2", xPct: 0, yPct: 62.31, widthPct: 49, heightPct: 37.69 }, { id: "f3", xPct: 51, yPct: 62.31, widthPct: 49, heightPct: 37.69 }] },
  { name: "תמונה ראשית ומסגרות", frames: [{ id: "f0", xPct: 0, yPct: 0, widthPct: 50, heightPct: 100 }, { id: "f1", xPct: 52, yPct: 0, widthPct: 48, heightPct: 49 }, { id: "f2", xPct: 52, yPct: 51, widthPct: 23, heightPct: 49 }, { id: "f3", xPct: 77, yPct: 51, widthPct: 23, heightPct: 49 }] },
  { name: "שש עמודות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 15, heightPct: 100 }, { id: "f2", xPct: 17, yPct: 0, widthPct: 15, heightPct: 100 }, { id: "f3", xPct: 34, yPct: 0, widthPct: 15, heightPct: 100 }, { id: "f4", xPct: 51, yPct: 0, widthPct: 15, heightPct: 100 }, { id: "f5", xPct: 68, yPct: 0, widthPct: 15, heightPct: 100 }, { id: "f6", xPct: 85, yPct: 0, widthPct: 15, heightPct: 100 }] },
  { name: "שני גיבורים", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 49, heightPct: 49 }, { id: "f2", xPct: 51, yPct: 0, widthPct: 49, heightPct: 49 }, { id: "f3", xPct: 0, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f4", xPct: 25.5, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f5", xPct: 51, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f6", xPct: 76.5, yPct: 51, widthPct: 23.5, heightPct: 49 }] },
  { name: "שבע מוזאיקה", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 48, heightPct: 49 }, { id: "f2", xPct: 50, yPct: 0, widthPct: 24, heightPct: 49 }, { id: "f3", xPct: 76, yPct: 0, widthPct: 24, heightPct: 49 }, { id: "f4", xPct: 0, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f5", xPct: 25.5, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f6", xPct: 51, yPct: 51, widthPct: 23.5, heightPct: 49 }, { id: "f7", xPct: 76.5, yPct: 51, widthPct: 23.5, heightPct: 49 }] },
  { name: "תמונה ראשית ושישה מסביב", frames: [{ id: "f0", xPct: 0, yPct: 0, widthPct: 100, heightPct: 50 }, { id: "f1", xPct: 0, yPct: 52, widthPct: 49, heightPct: 14.67 }, { id: "f2", xPct: 0, yPct: 68.67, widthPct: 49, heightPct: 14.67 }, { id: "f3", xPct: 0, yPct: 85.33, widthPct: 49, heightPct: 14.67 }, { id: "f4", xPct: 51, yPct: 52, widthPct: 49, heightPct: 14.67 }, { id: "f5", xPct: 51, yPct: 68.67, widthPct: 49, heightPct: 14.67 }, { id: "f6", xPct: 51, yPct: 85.33, widthPct: 49, heightPct: 14.67 }] },
  { name: "שמונה פינות בולטות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 57.6, heightPct: 49 }, { id: "f2", xPct: 59.6, yPct: 0, widthPct: 19.2, heightPct: 49 }, { id: "f3", xPct: 80.8, yPct: 0, widthPct: 19.2, heightPct: 49 }, { id: "f4", xPct: 0, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f5", xPct: 20.4, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f6", xPct: 40.8, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f7", xPct: 61.2, yPct: 51, widthPct: 18.4, heightPct: 49 }, { id: "f8", xPct: 81.6, yPct: 51, widthPct: 18.4, heightPct: 49 }] },
  { name: "תשע רשת מרובעת", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 32 }, { id: "f4", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f5", xPct: 34, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f6", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 0, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f8", xPct: 34, yPct: 68, widthPct: 32, heightPct: 32 }, { id: "f9", xPct: 68, yPct: 68, widthPct: 32, heightPct: 32 }] },
  { name: "אחת עשרה מוזאיקה עשירה", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 37.6, heightPct: 32 }, { id: "f2", xPct: 39.6, yPct: 0, widthPct: 18.8, heightPct: 32 }, { id: "f3", xPct: 60.4, yPct: 0, widthPct: 18.8, heightPct: 32 }, { id: "f4", xPct: 81.2, yPct: 0, widthPct: 18.8, heightPct: 32 }, { id: "f5", xPct: 0, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f6", xPct: 34, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f7", xPct: 68, yPct: 34, widthPct: 32, heightPct: 32 }, { id: "f8", xPct: 0, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 25.5, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f10", xPct: 51, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f11", xPct: 76.5, yPct: 68, widthPct: 23.5, heightPct: 32 }] },
  { name: "שתים עשרה רשת 4×3", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f5", xPct: 0, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f6", xPct: 25.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f7", xPct: 51, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 76.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 0, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f10", xPct: 25.5, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f11", xPct: 51, yPct: 68, widthPct: 23.5, heightPct: 32 }, { id: "f12", xPct: 76.5, yPct: 68, widthPct: 23.5, heightPct: 32 }] },
  { name: "שתים עשרה רשת 3×4", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 23.5 }, { id: "f2", xPct: 0, yPct: 25.5, widthPct: 32, heightPct: 23.5 }, { id: "f3", xPct: 0, yPct: 51, widthPct: 32, heightPct: 23.5 }, { id: "f4", xPct: 0, yPct: 76.5, widthPct: 32, heightPct: 23.5 }, { id: "f5", xPct: 34, yPct: 0, widthPct: 32, heightPct: 23.5 }, { id: "f6", xPct: 34, yPct: 25.5, widthPct: 32, heightPct: 23.5 }, { id: "f7", xPct: 34, yPct: 51, widthPct: 32, heightPct: 23.5 }, { id: "f8", xPct: 34, yPct: 76.5, widthPct: 32, heightPct: 23.5 }, { id: "f9", xPct: 68, yPct: 0, widthPct: 32, heightPct: 23.5 }, { id: "f10", xPct: 68, yPct: 25.5, widthPct: 32, heightPct: 23.5 }, { id: "f11", xPct: 68, yPct: 51, widthPct: 32, heightPct: 23.5 }, { id: "f12", xPct: 68, yPct: 76.5, widthPct: 32, heightPct: 23.5 }] },
  { name: "שלוש עשרה קולאז'", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f5", xPct: 0, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f6", xPct: 25.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f7", xPct: 51, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 76.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 0, yPct: 68, widthPct: 18.4, heightPct: 32 }, { id: "f10", xPct: 20.4, yPct: 68, widthPct: 18.4, heightPct: 32 }, { id: "f11", xPct: 40.8, yPct: 68, widthPct: 18.4, heightPct: 32 }, { id: "f12", xPct: 61.2, yPct: 68, widthPct: 18.4, heightPct: 32 }, { id: "f13", xPct: 81.6, yPct: 68, widthPct: 18.4, heightPct: 32 }] },
  { name: "ארבע עשרה תמונות קולאז'", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 32 }, { id: "f5", xPct: 0, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f6", xPct: 25.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f7", xPct: 51, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f8", xPct: 76.5, yPct: 34, widthPct: 23.5, heightPct: 32 }, { id: "f9", xPct: 0, yPct: 68, widthPct: 15, heightPct: 32 }, { id: "f10", xPct: 17, yPct: 68, widthPct: 15, heightPct: 32 }, { id: "f11", xPct: 34, yPct: 68, widthPct: 15, heightPct: 32 }, { id: "f12", xPct: 51, yPct: 68, widthPct: 15, heightPct: 32 }, { id: "f13", xPct: 68, yPct: 68, widthPct: 15, heightPct: 32 }, { id: "f14", xPct: 85, yPct: 68, widthPct: 15, heightPct: 32 }] },
  { name: "חמש עשרה בשלוש עמודות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 18.4 }, { id: "f2", xPct: 0, yPct: 20.4, widthPct: 32, heightPct: 18.4 }, { id: "f3", xPct: 0, yPct: 40.8, widthPct: 32, heightPct: 18.4 }, { id: "f4", xPct: 0, yPct: 61.2, widthPct: 32, heightPct: 18.4 }, { id: "f5", xPct: 0, yPct: 81.6, widthPct: 32, heightPct: 18.4 }, { id: "f6", xPct: 34, yPct: 0, widthPct: 32, heightPct: 18.4 }, { id: "f7", xPct: 34, yPct: 20.4, widthPct: 32, heightPct: 18.4 }, { id: "f8", xPct: 34, yPct: 40.8, widthPct: 32, heightPct: 18.4 }, { id: "f9", xPct: 34, yPct: 61.2, widthPct: 32, heightPct: 18.4 }, { id: "f10", xPct: 34, yPct: 81.6, widthPct: 32, heightPct: 18.4 }, { id: "f11", xPct: 68, yPct: 0, widthPct: 32, heightPct: 18.4 }, { id: "f12", xPct: 68, yPct: 20.4, widthPct: 32, heightPct: 18.4 }, { id: "f13", xPct: 68, yPct: 40.8, widthPct: 32, heightPct: 18.4 }, { id: "f14", xPct: 68, yPct: 61.2, widthPct: 32, heightPct: 18.4 }, { id: "f15", xPct: 68, yPct: 81.6, widthPct: 32, heightPct: 18.4 }] },
  { name: "שש עשרה רשת קטנה", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 23.5, heightPct: 23.5 }, { id: "f2", xPct: 25.5, yPct: 0, widthPct: 23.5, heightPct: 23.5 }, { id: "f3", xPct: 51, yPct: 0, widthPct: 23.5, heightPct: 23.5 }, { id: "f4", xPct: 76.5, yPct: 0, widthPct: 23.5, heightPct: 23.5 }, { id: "f5", xPct: 0, yPct: 25.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f6", xPct: 25.5, yPct: 25.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f7", xPct: 51, yPct: 25.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f8", xPct: 76.5, yPct: 25.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f9", xPct: 0, yPct: 51, widthPct: 23.5, heightPct: 23.5 }, { id: "f10", xPct: 25.5, yPct: 51, widthPct: 23.5, heightPct: 23.5 }, { id: "f11", xPct: 51, yPct: 51, widthPct: 23.5, heightPct: 23.5 }, { id: "f12", xPct: 76.5, yPct: 51, widthPct: 23.5, heightPct: 23.5 }, { id: "f13", xPct: 0, yPct: 76.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f14", xPct: 25.5, yPct: 76.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f15", xPct: 51, yPct: 76.5, widthPct: 23.5, heightPct: 23.5 }, { id: "f16", xPct: 76.5, yPct: 76.5, widthPct: 23.5, heightPct: 23.5 }] },
  { name: "עשרים מוזאיקת ענק", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 18.4, heightPct: 23.5 }, { id: "f2", xPct: 20.4, yPct: 0, widthPct: 18.4, heightPct: 23.5 }, { id: "f3", xPct: 40.8, yPct: 0, widthPct: 18.4, heightPct: 23.5 }, { id: "f4", xPct: 61.2, yPct: 0, widthPct: 18.4, heightPct: 23.5 }, { id: "f5", xPct: 81.6, yPct: 0, widthPct: 18.4, heightPct: 23.5 }, { id: "f6", xPct: 0, yPct: 25.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f7", xPct: 20.4, yPct: 25.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f8", xPct: 40.8, yPct: 25.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f9", xPct: 61.2, yPct: 25.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f10", xPct: 81.6, yPct: 25.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f11", xPct: 0, yPct: 51, widthPct: 18.4, heightPct: 23.5 }, { id: "f12", xPct: 20.4, yPct: 51, widthPct: 18.4, heightPct: 23.5 }, { id: "f13", xPct: 40.8, yPct: 51, widthPct: 18.4, heightPct: 23.5 }, { id: "f14", xPct: 61.2, yPct: 51, widthPct: 18.4, heightPct: 23.5 }, { id: "f15", xPct: 81.6, yPct: 51, widthPct: 18.4, heightPct: 23.5 }, { id: "f16", xPct: 0, yPct: 76.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f17", xPct: 20.4, yPct: 76.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f18", xPct: 40.8, yPct: 76.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f19", xPct: 61.2, yPct: 76.5, widthPct: 18.4, heightPct: 23.5 }, { id: "f20", xPct: 81.6, yPct: 76.5, widthPct: 18.4, heightPct: 23.5 }] },
  { name: "פס עליון משולש ותחתון כפול", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 32, heightPct: 40.83 }, { id: "f2", xPct: 34, yPct: 0, widthPct: 32, heightPct: 40.83 }, { id: "f3", xPct: 68, yPct: 0, widthPct: 32, heightPct: 40.83 }, { id: "f4", xPct: 0, yPct: 42.83, widthPct: 49, heightPct: 57.17 }, { id: "f5", xPct: 51, yPct: 42.83, widthPct: 49, heightPct: 57.17 }] },
  { name: "טור זכרונות", frames: [{ id: "f1", xPct: 0, yPct: 0, widthPct: 100, heightPct: 18.4 }, { id: "f2", xPct: 0, yPct: 20.4, widthPct: 100, heightPct: 18.4 }, { id: "f3", xPct: 0, yPct: 40.8, widthPct: 100, heightPct: 18.4 }, { id: "f4", xPct: 0, yPct: 61.2, widthPct: 100, heightPct: 18.4 }, { id: "f5", xPct: 0, yPct: 81.6, widthPct: 100, heightPct: 18.4 }] },
];

function cssFilterFor(filter: AlbumPhotoFilter | undefined, blurPct: number | undefined): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  return parts.length ? parts.join(" ") : undefined;
}

// box-shadow (unlike filter: drop-shadow on a descendant) isn't clipped by the frame's own
// overflow-hidden, so it's the one that can actually bleed outside a cropped photo frame.
function boxShadowFor(shadowPct: number | undefined): string | undefined {
  if (!shadowPct) return undefined;
  const blurPx = (shadowPct / 100) * 24;
  const offsetPx = (shadowPct / 100) * 10;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  return `${offsetPx}px ${offsetPx}px ${blurPx}px rgba(0,0,0,${alpha})`;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    kind: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
    startWidthPct: number;
    startHeightPct: number;
    startFocalX: number;
    startFocalY: number;
    startZoom: number;
  } | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const usedPhotoIds = new Set(elements.filter((e): e is AlbumPhotoElement => e.type === "photo" && !!e.photoId).map((e) => e.photoId as string));
  const favoritePhotos = photos.filter((p) => p.is_favorite);
  const pickerPhotos = showAllInPicker || favoritePhotos.length === 0 ? photos : favoritePhotos;
  // Drag-to-frame panel: by default only favorites not yet used on THIS page (so a placed photo
  // disappears once dragged in, preventing an accidental double-pick) — "הצג הכל" reveals the rest
  // too, badged ✅, purely for review. Grouped by folder/tab when the gallery actually has any;
  // otherwise every favorite sits in one flat, unlabeled group.
  const dragPanelPool = favoritePhotos.filter((p) => showAllDragPanel || !usedPhotoIds.has(p.id));
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
  const marginInsetPct =
    album.width_cm > 0 && album.height_cm > 0 ? { x: (0.5 / album.width_cm) * 100, y: (0.5 / album.height_cm) * 100 } : null;

  // Leaving "position image" mode whenever the selection changes elsewhere keeps its green ring
  // tied to whatever's actually selected, rather than lingering on a no-longer-selected element.
  useEffect(() => {
    setPanModeId((prev) => (prev && prev !== selectedId ? null : prev));
  }, [selectedId]);

  const updateElement = (id: string, patch: Partial<AlbumElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as AlbumElement) : e)));
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
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
      setSelectedId(id);
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

  const confirmMultiPhotos = async () => {
    const ids = Array.from(multiPhotoIds);
    if (ids.length === 0) return;
    setLoadingMultiLayout(true);
    const items = await Promise.all(
      ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") }))
    );
    const frames = generateOrientedFrames(items); // same order/length as `items`
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
    setSelectedId(null);
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
    setSelectedId(id);
  };

  // Replaces the photo layout with the template's empty frames, best-effort auto-filling them in
  // order from favorited photos not already placed elsewhere on this page — text elements (which
  // aren't part of any template) are kept as-is.
  const applyTemplate = (frames: AlbumFrame[]) => {
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
    }));
    setElements((prev) => [...newPhotoElements, ...prev.filter((e) => e.type === "text")]);
    setTemplatePickerOpen(false);
    setSelectedId(null);
  };

  const saveCurrentAsTemplate = async () => {
    if (!templateNameDraft.trim()) return;
    const frames: AlbumFrame[] = elements
      .filter((e): e is AlbumPhotoElement => e.type === "photo")
      .map((e) => ({ id: e.id, xPct: e.xPct, yPct: e.yPct, widthPct: e.widthPct, heightPct: e.heightPct }));
    if (frames.length === 0) return;
    setSavingTemplate(true);
    await onSaveTemplate(templateNameDraft.trim(), frames);
    setSavingTemplate(false);
    setTemplateNameDraft("");
    setSaveTemplateOpen(false);
  };

  const startDrag = (e: React.PointerEvent, el: AlbumElement, kind: "move" | "resize") => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelectedId(el.id);
    dragRef.current = {
      id: el.id,
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPct: el.xPct,
      startYPct: el.yPct,
      startWidthPct: el.widthPct,
      startHeightPct: el.type === "photo" ? el.heightPct : (el.heightPct ?? 15),
      startFocalX: el.type === "photo" ? el.focalX : 50,
      startFocalY: el.type === "photo" ? el.focalY : 50,
      startZoom: el.type === "photo" ? (el.zoom ?? 100) : 100,
    };
  };

  // Alt/Cmd+click a photo to instantly center its frame on the page (size unchanged) — a quick
  // shortcut for the same "reaches page center" alignment the guides highlight during a manual drag.
  const centerElementOnPage = (id: string) => {
    setElements((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const height = e.type === "photo" ? e.heightPct : (e.heightPct ?? 15);
        return { ...e, xPct: Math.max(0, 50 - e.widthPct / 2), yPct: Math.max(0, 50 - height / 2) };
      })
    );
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    const el = elements.find((x) => x.id === drag.id);

    if (drag.kind === "resize") {
      // Every element type resizes freely in both dimensions from its corner handle now — text
      // used to be width-only, but a box height it can't control makes vertical centering (and
      // the "square handle enlarges/shrinks it" request) meaningless.
      const widthPct = Math.max(8, Math.min(100 - drag.startXPct, drag.startWidthPct + dxPct));
      const heightPct = Math.max(6, Math.min(100 - drag.startYPct, drag.startHeightPct + dyPct));
      updateElement(drag.id, { widthPct, heightPct });
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
      const focalX = Math.max(0, Math.min(100, drag.startFocalX + (dxPct / Math.max(1, drag.startWidthPct)) * 100));
      const focalY = Math.max(0, Math.min(100, drag.startFocalY + (dyPct / Math.max(1, drag.startHeightPct)) * 100));
      updateElement(drag.id, { focalX, focalY });
      if (guides.length) setGuides([]);
      return;
    }

    const candidateX = Math.max(0, Math.min(95, drag.startXPct + dxPct));
    const candidateY = Math.max(0, Math.min(95, drag.startYPct + dyPct));
    const others = elements.filter((x) => x.id !== drag.id);
    const { guides: nextGuides, snapXPct, snapYPct } = computeAlignment(
      { xPct: candidateX, yPct: candidateY, widthPct: drag.startWidthPct, heightPct: drag.startHeightPct },
      others
    );
    setGuides(nextGuides);
    updateElement(drag.id, {
      xPct: snapXPct !== undefined ? snapXPct : candidateX,
      yPct: snapYPct !== undefined ? snapYPct : candidateY,
    });
  };

  const endDrag = () => {
    dragRef.current = null;
    setGuides([]);
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
            ✕
          </button>
        </div>

        <div className="lg:flex-1 lg:flex lg:items-center lg:justify-center lg:min-h-0">
        {/* Not overflow-hidden (unlike the canvas below) so the floating photo menu — and the
            flyout sliders it opens — can bleed past the canvas's own edge, not just the photo's. */}
        <div className="relative w-full lg:max-w-full">
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onClick={(e) => {
            // Deselect only when the canvas background itself was clicked — a click on an
            // element bubbles up here too (pointerdown selecting it happens first, but a plain
            // stopPropagation on that pointerdown doesn't stop the separate click event that
            // follows on pointerup), so without this check every selection immediately
            // undid itself before the resize handle even had a chance to render.
            if (e.target === e.currentTarget) setSelectedId(null);
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
              const isSelected = el.id === selectedId;
              if (el.type === "photo") {
                const photo = el.photoId ? photoById.get(el.photoId) : null;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      if (!photo) {
                        e.stopPropagation();
                        return;
                      }
                      if (e.altKey || e.metaKey) {
                        e.stopPropagation();
                        setSelectedId(el.id);
                        centerElementOnPage(el.id);
                        return;
                      }
                      startDrag(e, el, "move");
                    }}
                    onClick={(e) => {
                      if (!photo) {
                        e.stopPropagation();
                        openPickerForFrame(el.id);
                      }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedId = e.dataTransfer.getData("text/plain");
                      if (droppedId) updateElement(el.id, { photoId: droppedId, focalX: 50, focalY: 50 });
                    }}
                    className={`absolute overflow-hidden ${photo ? (panModeId === el.id ? "cursor-crosshair" : "cursor-move") : "cursor-pointer flex items-center justify-center bg-white/10"}`}
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
                      <span className="text-white text-2xl">+</span>
                    )}
                    {isSelected && photo && (
                      // Kept fully inside the box (no corner-straddling negative offset) —
                      // the parent needs overflow-hidden to crop the photo, which would clip
                      // (and make unclickable) any part of the handle bleeding past the edge.
                      <span
                        onPointerDown={(e) => startDrag(e, el, "resize")}
                        className="absolute bottom-0.5 left-0.5 h-4 w-4 bg-amber-deep cursor-nwse-resize rounded-sm"
                      />
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => startDrag(e, el, "move")}
                  className="absolute cursor-move px-1 flex items-center overflow-visible"
                  style={{
                    left: `${el.xPct}%`,
                    top: `${el.yPct}%`,
                    width: `${el.widthPct}%`,
                    height: `${el.heightPct ?? 15}%`,
                    justifyContent: el.align === "right" ? "flex-end" : el.align === "left" ? "flex-start" : "center",
                    textAlign: el.align,
                    color: el.color === "white" ? "#fff" : "#000",
                    // fontSize is stored in points on the album's fixed 1600pt PDF reference canvas
                    // (matches PAGE_WIDTH in albumPdf.ts) — cqw here is "% of this canvas's own
                    // rendered width," so the same ratio keeps the same visual size everywhere.
                    fontSize: `calc(${el.fontSize} / 1600 * 100cqw)`,
                    fontFamily: albumFontFamilyCss(el.fontFamily),
                    fontWeight: 700,
                    textShadow: el.color === "white" ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 4px rgba(255,255,255,0.7)",
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
        </div>
        {selected?.type === "photo" && selected.photoId && (
          <PhotoFloatingMenu
            el={selected}
            panning={panModeId === selected.id}
            onTogglePan={() => setPanModeId((prev) => (prev === selected.id ? null : selected.id))}
            onUpdate={(patch) => updateElement(selected.id, patch)}
          />
        )}
        </div>
        </div>
        </div>

        {/* Controls sidebar — stacks below the canvas on mobile same as before; becomes an
            independently-scrolling side column on desktop so a tall control list never forces
            the canvas itself to scroll out of view. */}
        <div className="lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:pr-1 lg:min-h-0">
        {selected && (
          <div className="space-y-2 mt-2.5">
            {selected.type === "text" && (
              <>
                <div className="flex gap-1.5">
                  {(["white", "black"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => updateElement(selected.id, { color: c })}
                      className="h-7 w-7 rounded-full border border-line"
                      style={{ background: c === "white" ? "#fff" : "#000" }}
                    />
                  ))}
                  {(["right", "center", "left"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => updateElement(selected.id, { align: a })}
                      className="flex-1 rounded-full py-1.5 text-[10px] font-semibold"
                      style={{
                        background: selected.align === a ? "var(--color-amber-deep)" : "var(--color-chip)",
                        color: selected.align === a ? "#fff" : "var(--color-ink-soft)",
                      }}
                    >
                      {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <select
                    value={selected.fontFamily ?? "heebo"}
                    onChange={(e) => updateElement(selected.id, { fontFamily: e.target.value })}
                    className="w-full rounded-lg px-2.5 py-2 text-xs font-semibold bg-white border border-line"
                    style={{ fontFamily: albumFontFamilyCss(selected.fontFamily) }}
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
                <SliderControl label="גודל טקסט" value={selected.fontSize} min={2} max={96} unit="pt" onChange={(v) => updateElement(selected.id, { fontSize: v })} />
              </>
            )}
            {selected.type === "photo" && selected.photoId && (
              <p className="text-[11px] text-ink-soft text-center">
                💡 לחצו על התמונה כדי לפתוח את תפריט העיצוב הצף (שחור-לבן, ספיה, שקיפות, טשטוש, סיבוב, צל וקו מתאר)
              </p>
            )}
            <button onClick={() => removeElement(selected.id)} className="w-full h-8 rounded-full bg-chip text-rose text-xs font-semibold">
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
                  ✕
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
              <button onClick={() => setTemplatePickerOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                📐 תבניות
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
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink mt-2 disabled:opacity-50"
          >
            💾 שמירת הפריסה כתבנית
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
                                className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-[8px]"
                                style={{ background: "var(--color-sage)", color: "#fff" }}
                                title="כבר שובצה בעמוד הזה"
                              >
                                ✅
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">
                {pickingBackground ? "בחירת תמונת רקע — " : ""}
                {addingMultiplePhotos ? "בחירת תמונות להוספה — " : ""}
                {showAllInPicker || favoritePhotos.length === 0 ? "כל התמונות" : "תמונות מועדפות"}
              </h3>
              {favoritePhotos.length > 0 && (
                <button onClick={() => setShowAllInPicker((v) => !v)} className="text-xs font-semibold text-ink-soft underline">
                  {showAllInPicker ? "רק מועדפות" : "כל התמונות"}
                </button>
              )}
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
                      {usedElsewhere?.has(p.id) && multiIdx === -1 && (
                        <span
                          className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px]"
                          style={{ background: "var(--color-sage)", color: "#fff" }}
                          title="כבר נבחרה במקום אחר באלבום"
                        >
                          ✅
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
            <p className="text-sm font-semibold mb-2.5">טקסט חדש (עברית או אנגלית)</p>
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
            <p className="text-sm font-bold mb-3">תבניות מובנות</p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
              {BUILT_IN_TEMPLATES.map((t) => (
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
            <p className="text-sm font-semibold mb-2.5">שם התבנית</p>
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
