"use client";

import { useRef, useState } from "react";
import type { AlbumElement, AlbumFrame, AlbumPhotoElement, AlbumPhotoFilter, AlbumTemplateRow, GalleryAlbumSpreadRow } from "@/lib/types";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";

type PhotoWithUrl = { id: string; url: string; is_favorite?: boolean };

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

const BUILT_IN_TEMPLATES: { name: string; frames: AlbumFrame[] }[] = [
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
  photos,
  photo1,
  photo2,
  mode,
  templates,
  onSave,
  onSaveTemplate,
  onClose,
}: {
  spread: GalleryAlbumSpreadRow;
  photos: PhotoWithUrl[];
  photo1: PhotoWithUrl | undefined;
  photo2: PhotoWithUrl | undefined | null;
  mode: "overlay" | "custom";
  templates: AlbumTemplateRow[];
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
  const [showAllInPicker, setShowAllInPicker] = useState(false);
  const [textDraftOpen, setTextDraftOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
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
  } | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const usedPhotoIds = new Set(elements.filter((e): e is AlbumPhotoElement => e.type === "photo" && !!e.photoId).map((e) => e.photoId as string));
  const favoritePhotos = photos.filter((p) => p.is_favorite);
  const pickerPhotos = showAllInPicker || favoritePhotos.length === 0 ? photos : favoritePhotos;
  const backgroundPhoto = backgroundPhotoId ? photos.find((p) => p.id === backgroundPhotoId) : null;

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
    setPhotoPickerOpen(true);
  };

  const openPickerForBackground = () => {
    setFrameTargetId(null);
    setPickingBackground(true);
    setPhotoPickerOpen(true);
  };

  const openPickerForFrame = (id: string) => {
    setFrameTargetId(id);
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
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    if (drag.kind === "move") {
      updateElement(drag.id, {
        xPct: Math.max(0, Math.min(95, drag.startXPct + dxPct)),
        yPct: Math.max(0, Math.min(95, drag.startYPct + dyPct)),
      });
    } else {
      // Every element type resizes freely in both dimensions from its corner handle now — text
      // used to be width-only, but a box height it can't control makes vertical centering (and
      // the "square handle enlarges/shrinks it" request) meaningless.
      const widthPct = Math.max(8, Math.min(100 - drag.startXPct, drag.startWidthPct + dxPct));
      const heightPct = Math.max(6, Math.min(100 - drag.startYPct, drag.startHeightPct + dyPct));
      updateElement(drag.id, { widthPct, heightPct });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const photoById = new Map(photos.map((p) => [p.id, p]));

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${ALBUM_FONT_CLASS_NAMES}`}
      style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
    >
      <div className="w-full max-w-sm rounded-3xl p-4 bg-paper shadow-sheet max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold font-display">{mode === "custom" ? "עיצוב חופשי" : "הוספת טקסט לעמוד"}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            ✕
          </button>
        </div>

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
          className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-line select-none"
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
                    onPointerDown={(e) => (photo ? startDrag(e, el, "move") : e.stopPropagation())}
                    onClick={(e) => {
                      if (!photo) {
                        e.stopPropagation();
                        openPickerForFrame(el.id);
                      }
                    }}
                    className={`absolute overflow-hidden ${photo ? "cursor-move" : "cursor-pointer flex items-center justify-center bg-white/10"}`}
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      outline: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}` : isSelected ? "2px solid var(--color-amber-deep)" : "1px dashed rgba(255,255,255,0.6)",
                      outlineOffset: el.borderWidth ? `-${el.borderWidth}px` : undefined,
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
                          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
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
        </div>

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
              <>
                <div className="flex gap-1.5">
                  {(["none", "bw", "sepia"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => updateElement(selected.id, { filter: f })}
                      className="flex-1 rounded-full py-1.5 text-[10px] font-semibold"
                      style={{
                        background: (selected.filter ?? "none") === f ? "var(--color-amber-deep)" : "var(--color-chip)",
                        color: (selected.filter ?? "none") === f ? "#fff" : "var(--color-ink-soft)",
                      }}
                    >
                      {f === "none" ? "צבע מלא" : f === "bw" ? "שחור-לבן" : "סאפיה"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateElement(selected.id, { borderWidth: 0 })}
                    className="flex-1 rounded-full py-1.5 text-[10px] font-semibold"
                    style={{
                      background: !selected.borderWidth ? "var(--color-amber-deep)" : "var(--color-chip)",
                      color: !selected.borderWidth ? "#fff" : "var(--color-ink-soft)",
                    }}
                  >
                    ללא מסגרת
                  </button>
                  <button
                    onClick={() => updateElement(selected.id, { borderWidth: selected.borderWidth || 8 })}
                    className="flex-1 rounded-full py-1.5 text-[10px] font-semibold"
                    style={{
                      background: selected.borderWidth ? "var(--color-amber-deep)" : "var(--color-chip)",
                      color: selected.borderWidth ? "#fff" : "var(--color-ink-soft)",
                    }}
                  >
                    עם מסגרת
                  </button>
                </div>
                {!!selected.borderWidth && (
                  <>
                    <SliderControl label="עובי מסגרת" value={selected.borderWidth} min={2} max={50} unit="px" onChange={(v) => updateElement(selected.id, { borderWidth: v })} />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-ink-soft shrink-0">צבע מסגרת</span>
                      {BORDER_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateElement(selected.id, { borderColor: c })}
                          className="h-7 w-7 rounded-full"
                          style={{ background: c, boxShadow: (selected.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
                        />
                      ))}
                    </div>
                  </>
                )}
                <SliderControl
                  label="סיבוב"
                  value={selected.rotation ?? 0}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={(v) => updateElement(selected.id, { rotation: v })}
                />
                <SliderControl
                  label="שקיפות"
                  value={selected.opacity ?? 100}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateElement(selected.id, { opacity: v })}
                />
                <SliderControl label="טשטוש (Blur)" value={selected.blur ?? 0} min={0} max={100} unit="%" onChange={(v) => updateElement(selected.id, { blur: v })} />
              </>
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
      </div>

      {photoPickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setPhotoPickerOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl p-4 bg-paper max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">
                {pickingBackground ? "בחירת תמונת רקע — " : ""}
                {showAllInPicker || favoritePhotos.length === 0 ? "כל התמונות" : "תמונות מועדפות"}
              </h3>
              {favoritePhotos.length > 0 && (
                <button onClick={() => setShowAllInPicker((v) => !v)} className="text-xs font-semibold text-ink-soft underline">
                  {showAllInPicker ? "רק מועדפות" : "כל התמונות"}
                </button>
              )}
            </div>
            {pickerPhotos.length === 0 ? (
              <p className="text-xs text-ink-soft text-center py-6">אין תמונות מועדפות בגלריה הזו עדיין.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {pickerPhotos.map((p) => (
                  <button key={p.id} onClick={() => choosePhoto(p.id)} className="aspect-square rounded-lg overflow-hidden" style={{ boxShadow: "0 0 0 1px var(--color-line)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
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
        <div className="fixed inset-0 z-[85] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setTemplatePickerOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl p-5 bg-paper max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold mb-3">תבניות מובנות</p>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
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
                <div className="grid grid-cols-2 gap-2.5">
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
