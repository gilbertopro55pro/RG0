"use client";

import { useRef, useState } from "react";
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import { coverAspectRatio } from "@/lib/galleryTheme";
import { IconClose } from "@/components/icons/AlbumIcons";

// Opens right when a photographer picks/changes the gallery's cover photo — lets them recenter
// which part of the photo stays visible once it's cropped to the cover banner's fixed aspect ratio
// (see coverAspectRatio in galleryTheme.ts), with a live mobile + desktop preview shown side by
// side so they can see the same crop at both real container widths before saving, per explicit
// request rather than only guessing from the single full-photo view above.
export default function GalleryCoverFocalPointModal({
  photoUrl,
  initialFocalX,
  initialFocalY,
  theme,
  shape,
  textPosition,
  titleFontOverride,
  title,
  dateLabel,
  onSave,
  onClose,
}: {
  photoUrl: string;
  initialFocalX: number;
  initialFocalY: number;
  theme: string;
  shape: string;
  textPosition: string;
  titleFontOverride: string | null;
  title: string;
  dateLabel: string | null;
  onSave: (focalX: number, focalY: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const [focalX, setFocalX] = useState(initialFocalX);
  const [focalY, setFocalY] = useState(initialFocalY);
  const [saving, setSaving] = useState(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const setFocalFromPoint = (clientX: number, clientY: number) => {
    const rect = imgWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFocalX(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    setFocalY(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-paper shadow-sheet p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold">מרכוז תמונת השער</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-ink-soft mb-3">לחצו או גררו על התמונה כדי לבחור מה יישאר במרכז כשהיא תיחתך למסגרת השער.</p>

        <div
          ref={imgWrapRef}
          // Matches the real cover shape (coverAspectRatio, the SAME helper GalleryCoverBanner's
          // preview already uses below) — per explicit bug report, this used to be hard-coded to
          // "4 / 3" no matter what shape was selected, so a photographer centering a photo for a
          // square/circle cover was aiming at a mismatched rectangle: the point they picked here
          // didn't correspond to the same point in the actual square/circle crop shown in the
          // preview, creating exactly the felt "distortion." CSS aspect-ratio scales this correctly
          // at any container/window width on its own, so no extra window-size handling is needed.
          className="relative w-full rounded-xl overflow-hidden bg-chip cursor-crosshair select-none"
          style={{ aspectRatio: coverAspectRatio(shape) }}
          onPointerDown={(e) => {
            draggingRef.current = true;
            (e.target as Element).setPointerCapture(e.pointerId);
            setFocalFromPoint(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            setFocalFromPoint(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="w-full h-full object-contain pointer-events-none" draggable={false} />
          <div
            className="absolute h-5 w-5 rounded-full pointer-events-none"
            style={{
              left: `${focalX}%`,
              top: `${focalY}%`,
              transform: "translate(-50%, -50%)",
              background: "var(--color-amber-deep)",
              border: "2px solid #fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }}
          />
        </div>

        <p className="text-xs font-semibold text-ink-soft mt-4 mb-2">תצוגה מקדימה</p>
        <div className="flex items-start gap-4 flex-wrap">
          <div>
            <p className="text-[10px] text-ink-soft mb-1.5">נייד</p>
            <div className="w-[150px] rounded-xl overflow-hidden border border-line p-2" style={{ background: "var(--color-chip)" }}>
              <GalleryCoverBanner
                photoUrl={photoUrl}
                title={title}
                dateLabel={dateLabel}
                theme={theme}
                textPosition={textPosition}
                shape={shape}
                titleFontOverride={titleFontOverride}
                focalX={focalX}
                focalY={focalY}
              />
            </div>
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-[10px] text-ink-soft mb-1.5">מחשב</p>
            <div className="rounded-xl overflow-hidden border border-line p-3" style={{ background: "var(--color-chip)" }}>
              <GalleryCoverBanner
                photoUrl={photoUrl}
                title={title}
                dateLabel={dateLabel}
                theme={theme}
                textPosition={textPosition}
                shape={shape}
                titleFontOverride={titleFontOverride}
                focalX={focalX}
                focalY={focalY}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
            ביטול
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              await onSave(focalX, focalY);
              setSaving(false);
            }}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
