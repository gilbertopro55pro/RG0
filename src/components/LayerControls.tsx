"use client";

import { useT } from "@/i18n/client";

// The four round controls on the corners of a selected layer (owner, 2026-10-23, the magnet frame
// editor and the album editor alike): top-left deletes, bottom-left duplicates ("+1"), bottom-right
// turns it, top-right makes it bigger or smaller. Physical corners, not logical ones: the owner
// placed each control on a side, in every language.
//
// Rendered inside a box the size of the layer (position: relative/absolute), so the controls sit on
// its corners and turn with it. `upright` turns each icon back by the layer's rotation, so X and +1
// stay readable on a tilted layer. A control without a handler isn't shown.

type Props = {
  onDelete?: () => void;
  onDuplicate?: () => void;
  onRotateStart?: (e: React.PointerEvent) => void;
  onScaleStart?: (e: React.PointerEvent) => void;
  upright?: number;
  // Gap between the layer's edge and the controls' centers, in px (the selection outline's offset).
  inset?: number;
};

export default function LayerControls({ onDelete, onDuplicate, onRotateStart, onScaleStart, upright = 0, inset = 0 }: Props) {
  const t = useT();
  const corner = (v: "top" | "bottom", h: "left" | "right") => ({ [v]: -inset, [h]: -inset });
  return (
    <>
      {onDelete && (
        <Control label={t("מחיקה")} style={corner("top", "left")} upright={upright} onClick={onDelete}>
          <path d="M7 7l10 10M17 7L7 17" />
        </Control>
      )}
      {onScaleStart && (
        <Control label={t("שינוי גודל")} style={corner("top", "right")} upright={upright} onPointerDown={onScaleStart} cursor="nesw-resize">
          <path d="M5 9h13M15 5.5L18.5 9 15 12.5M19 15H6M9 11.5L5.5 15 9 18.5" />
        </Control>
      )}
      {onDuplicate && (
        <Control label={t("שכפול")} style={corner("bottom", "left")} upright={upright} onClick={onDuplicate}>
          <path d="M4 12h6M7 9v6M15 8.5l2.5-2V18" />
        </Control>
      )}
      {onRotateStart && (
        <Control label={t("סיבוב")} style={corner("bottom", "right")} upright={upright} onPointerDown={onRotateStart} cursor="grab">
          <path d="M18.5 9.5A7 7 0 0 0 6 8M5.5 14.5A7 7 0 0 0 18 16M6 4v4h4M18 20v-4h-4" />
        </Control>
      )}
    </>
  );
}

function Control({
  label,
  style,
  upright,
  onClick,
  onPointerDown,
  cursor = "pointer",
  children,
}: {
  label: string;
  style: React.CSSProperties;
  upright: number;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  cursor?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      data-layer-control
      // The press never reaches the layer underneath (it would start moving it) or the canvas (it
      // would let go of the selection).
      onPointerDown={(e) => {
        e.stopPropagation();
        if (onPointerDown) onPointerDown(e);
        else e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      // Quiet on purpose (owner, 2026-10-23: "הרבה יותר עדינים ולא בולטים"): small, white, a hairline
      // edge and a grey icon that darkens under the pointer (.layer-control in globals.css).
      className="layer-control pointer-events-auto absolute z-40 flex items-center justify-center rounded-full select-none touch-none"
      style={{ ...style, transform: `translate(${style.left !== undefined ? "-50%" : "50%"}, ${style.top !== undefined ? "-50%" : "50%"})`, cursor }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: "64%", height: "64%", transform: upright ? `rotate(${-upright}deg)` : undefined }}>
        {children}
      </svg>
    </span>
  );
}
