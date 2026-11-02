"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { findMask, maskCssUrl } from "@/lib/albumMasks";
import { OUTLINE_REF_WIDTH } from "@/lib/albumRender";

export function maskLayerStyle(svg: string): CSSProperties {
  return {
    WebkitMaskImage: maskCssUrl(svg),
    maskImage: maskCssUrl(svg),
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

// A photo with a mask, drawn the way every export draws it (2026-11-01, user request: the outline
// went around the frame's rectangle, not the mask's shape):
// - the mask is the FRAME's, not the photo's: on the <img> it was stretched over the whole photo,
//   which is bigger than the frame whenever the photo is cropped, while the exports mask the frame;
// - the outline follows the mask's shape: an SVG erode filter leaves the band `outlineWidth` px
//   wide inside the shape (the shape minus the eroded shape), the same band addMaskOutline paints
//   in the JPG and the PDF, and the PSD's inside stroke. Its strength is squared, so along a soft
//   edge (a fade), where the two barely differ, there is no gray band across the photo;
// - the shadow is a drop-shadow of that shape, not the frame's box-shadow (a gray rectangle showed
//   through the cut-out parts).
// The parent frame must not clip it (overflow visible), or the shadow is cut off at the frame.
export default function MaskedPhotoArt({
  maskId,
  outlineWidth,
  outlineColor,
  shadow,
  children,
}: {
  maskId: string;
  // The element's borderWidth: px on a page 1000px wide (outlineWidthAt), like every renderer.
  outlineWidth?: number;
  outlineColor?: string;
  // A box-shadow value (boxShadowFor): offset, blur and color, which drop-shadow takes as is.
  shadow?: string;
  children: ReactNode;
}) {
  const svg = findMask(maskId)?.svg ?? "";
  const filterId = `mask-outline-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // The SVG filter takes the band's width in CSS px, so the page's width is measured: a probe
  // 100cqw wide (the page canvas is a size container) tells it, and follows resizes.
  const probeRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const outlined = !!outlineWidth;
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!outlined || !probe) return;
    const measure = () => setPageWidth(probe.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [outlined]);
  // At least 1px: a radius that rounds to 0 turns the erode off, and the whole shape would fill in.
  const radius = outlineWidth && pageWidth ? Math.max(1, (outlineWidth * pageWidth) / OUTLINE_REF_WIDTH) : 0;
  return (
    <>
      {outlined && (
        <div ref={probeRef} aria-hidden="true" className="absolute left-0 top-0 h-0 invisible pointer-events-none" style={{ width: "100cqw" }} />
      )}
      {radius > 0 && (
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          {/* The region reaches past the frame, so the frame's own edge erodes like the outside. */}
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceGraphic" operator="erode" radius={radius} result="inner" />
            <feComposite in="SourceGraphic" in2="inner" operator="arithmetic" k1={0} k2={1} k3={-1} k4={0} result="band" />
            {/* Squared: a soft edge (a fade) barely differs from its eroded self, and leaves no haze. */}
            <feComponentTransfer in="band">
              <feFuncA type="gamma" amplitude={1} exponent={2} offset={0} />
            </feComponentTransfer>
          </filter>
        </svg>
      )}
      <div className="absolute inset-0 pointer-events-none" style={{ filter: shadow ? `drop-shadow(${shadow})` : undefined }}>
        <div className="absolute inset-0 overflow-hidden" style={maskLayerStyle(svg)}>
          {children}
        </div>
        {radius > 0 && (
          <div className="absolute inset-0" style={{ filter: `url(#${filterId})` }}>
            <div className="absolute inset-0" style={{ backgroundColor: outlineColor ?? "#fff", ...maskLayerStyle(svg) }} />
          </div>
        )}
      </div>
    </>
  );
}
