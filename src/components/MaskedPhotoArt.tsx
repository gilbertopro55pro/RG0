"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { findMask, maskCssUrl } from "@/lib/albumMasks";

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
  outlineWidth?: number;
  outlineColor?: string;
  // A box-shadow value (boxShadowFor): offset, blur and color, which drop-shadow takes as is.
  shadow?: string;
  children: ReactNode;
}) {
  const svg = findMask(maskId)?.svg ?? "";
  const filterId = `mask-outline-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <>
      {!!outlineWidth && (
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          {/* The region reaches past the frame, so the frame's own edge erodes like the outside. */}
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceGraphic" operator="erode" radius={outlineWidth} result="inner" />
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
        {!!outlineWidth && (
          <div className="absolute inset-0" style={{ filter: `url(#${filterId})` }}>
            <div className="absolute inset-0" style={{ backgroundColor: outlineColor ?? "#fff", ...maskLayerStyle(svg) }} />
          </div>
        )}
      </div>
    </>
  );
}
