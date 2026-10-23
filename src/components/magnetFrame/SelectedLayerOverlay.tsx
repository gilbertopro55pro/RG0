"use client";

import { useLayoutEffect, useState } from "react";
import LayerControls from "@/components/LayerControls";
import type { MagnetFramePreviewHandle } from "@/components/magnetFrame/MagnetFramePreview";
import type { MagnetFrameElement } from "@/lib/types";

// The selected element's corner controls (LayerControls) in the magnet editor. The frame clips
// whatever leaves it (MagnetFramePreview is overflow-hidden, as the export is), and a text on the
// bottom mat would lose half its controls, so they're drawn in a layer above the frame instead: a
// box the size of the element (measured from its node, data-el-id), at the same place and turn.

type Props = {
  el: MagnetFrameElement;
  // The frame, where the element's node is looked up.
  frameRef: React.RefObject<MagnetFramePreviewHandle | null>;
  // The element is being dragged: no easing, the box follows the pointer exactly.
  active: boolean;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onRotateStart?: (e: React.PointerEvent) => void;
  onScaleStart?: (e: React.PointerEvent) => void;
};

export default function SelectedLayerOverlay({ el, frameRef, active, ...handlers }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // offsetWidth/Height are the element's own box before its turn. A ResizeObserver catches every
  // change (font, size, text, the frame resizing) and reports once on observe.
  useLayoutEffect(() => {
    const node = frameRef.current?.element?.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(el.id)}"]`);
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setSize((prev) => (prev && prev.w === node.offsetWidth && prev.h === node.offsetHeight ? prev : { w: node.offsetWidth, h: node.offsetHeight }))
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [el.id, frameRef]);

  if (!size) return null;
  const rotation = el.rotation ?? 0;
  // The selection outline sits this far outside the element (MagnetFramePreview's outlineOffset,
  // plus its 1px line): the controls go on its corners.
  const inset = el.type === "text" ? 5 : 4;
  // A small text (a date under the names, a phone screen) keeps its controls apart and off each
  // other: the box is at least this many px on each side, around the element's center.
  const MIN_BOX = 30;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: Math.max(size.w, MIN_BOX),
        height: Math.max(size.h, MIN_BOX),
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transition: active ? "none" : "left 0.18s ease, top 0.18s ease",
        zIndex: 25,
      }}
    >
      <LayerControls {...handlers} upright={rotation} inset={inset} />
    </div>
  );
}
