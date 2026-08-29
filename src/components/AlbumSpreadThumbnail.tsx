"use client";

import { useState } from "react";
import type { GalleryAlbumSpreadRow } from "@/lib/types";
import { boxShadowFor, cssFilterFor, computePhotoFraming, ALBUM_BLUR_MAX_PX, type PhotoWithUrl } from "@/lib/albumRender";
import { maskCssUrl, findMask } from "@/lib/albumMasks";
import { findOrnament, ornamentDataUrl } from "@/lib/albumOrnaments";
import { hasAdjustments, adjustmentsSvgFilter } from "@/lib/albumAdjustments";

// Shared, read-only rendering of one album spread — used both in the album page grid
// (GalleryManageView.tsx) and in the page-editor's own bottom switcher strip
// (AlbumSpreadCanvasEditor.tsx), so the two previews can never visually drift apart from one
// another. Deliberately non-interactive (no drag handles, no selection) — just the same
// photo/mask/ornament/shape/text compositing math the live editor itself uses, at thumbnail size.
export default function AlbumSpreadThumbnail({
  spread,
  album,
  photos,
  customOrnaments,
  onClick,
  className,
}: {
  spread: GalleryAlbumSpreadRow;
  album: { width_cm: number; height_cm: number };
  photos: PhotoWithUrl[];
  customOrnaments?: { id: string; url: string }[];
  onClick?: () => void;
  className?: string;
}) {
  const [photoAspects, setPhotoAspects] = useState<Record<string, number>>({});
  const photo1 = photos.find((p) => p.id === spread.photo_id_1);
  const photo2 = spread.photo_id_2 ? photos.find((p) => p.id === spread.photo_id_2) : null;

  // Was a flat aspect-[4/3] regardless of the album's real width_cm/height_cm — wrong for most of
  // the size presets, which silently stretched every percentage-positioned element to fit the
  // wrong-shaped box. Real page proportions now come from the album prop itself.
  const pageAspectRatio = `${album.width_cm || 4} / ${album.height_cm || 3}`;

  if (spread.layout !== "custom") {
    return (
      <button
        onClick={onClick}
        className={`flex w-full ${spread.layout === "stack" ? "flex-col" : "flex-row"} gap-px bg-line ${className ?? ""}`}
        style={{ aspectRatio: pageAspectRatio }}
      >
        {photo1 && (
          <div className="relative overflow-hidden" style={{ flex: photo2 && spread.layout === "feature" ? "1.6" : "1" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo1.previewUrl ?? photo1.url}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: `${spread.focal_x_1}% ${spread.focal_y_1}%` }}
            />
          </div>
        )}
        {photo2 && (
          <div className="relative overflow-hidden" style={{ flex: "1" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo2.previewUrl ?? photo2.url}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: `${spread.focal_x_2}% ${spread.focal_y_2}%` }}
            />
          </div>
        )}
      </button>
    );
  }

  return (
    <button onClick={onClick} className={`relative block w-full bg-line overflow-hidden ${className ?? ""}`} style={{ aspectRatio: pageAspectRatio }}>
      {spread.background_photo_id &&
        (() => {
          const bgPhoto = photos.find((p) => p.id === spread.background_photo_id);
          return bgPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={bgPhoto.previewUrl ?? bgPhoto.url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: spread.background_opacity / 100,
                filter: spread.background_blur ? `blur(${(spread.background_blur / 100) * ALBUM_BLUR_MAX_PX}px)` : undefined,
              }}
            />
          ) : null;
        })()}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        {spread.elements
          .filter((el): el is typeof el & { type: "photo" } => el.type === "photo" && hasAdjustments(el))
          .map((el) => (
            <defs key={el.id} dangerouslySetInnerHTML={{ __html: adjustmentsSvgFilter(el.id, el) }} />
          ))}
      </svg>
      {spread.elements.map((el) => {
        const photo = el.type === "photo" ? photos.find((p) => p.id === el.photoId) : null;
        const hasBorderShadow = el.type === "photo" || el.type === "ornament" || el.type === "shape";
        return (
          <div
            key={el.id}
            className="absolute overflow-hidden"
            style={{
              left: `${el.xPct}%`,
              top: `${el.yPct}%`,
              width: `${el.widthPct}%`,
              height: el.type === "text" ? undefined : `${el.heightPct}%`,
              fontSize: el.type === "text" ? `${el.fontSize}px` : undefined,
              color: el.type === "text" ? el.color : undefined,
              textAlign: el.type === "text" ? el.align : undefined,
              fontWeight: el.type === "text" ? 700 : undefined,
              borderRadius: el.type === "shape" && el.shapeStyle === "circle-outline" ? "50%" : undefined,
              border:
                el.type === "shape" && (el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline")
                  ? `${el.borderWidth ?? 5}px solid ${el.borderColor ?? el.color}`
                  : undefined,
              outline:
                el.type === "shape" && (el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline")
                  ? undefined
                  : hasBorderShadow && el.borderWidth
                  ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}`
                  : undefined,
              outlineOffset: hasBorderShadow && el.borderWidth ? `-${el.borderWidth}px` : undefined,
              boxShadow: hasBorderShadow ? boxShadowFor(el.shadow) : undefined,
              opacity: el.type === "ornament" || el.type === "shape" ? (el.opacity ?? 100) / 100 : undefined,
              transform: hasBorderShadow && el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            }}
          >
            {el.type === "ornament" &&
              (() => {
                const ornament = el.customOrnamentId ? null : findOrnament(el.ornamentId);
                const customUrl = el.customOrnamentId ? customOrnaments?.find((o) => o.id === el.customOrnamentId)?.url : undefined;
                const imgSrc = customUrl ?? (ornament ? ornamentDataUrl(ornament, el.color ?? "#2e3142") : undefined);
                const customTint = el.customOrnamentId && el.color ? el.color : undefined;
                if (!imgSrc) return null;
                return customTint ? (
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
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imgSrc} alt="" className="w-full h-full" style={{ objectFit: "contain" }} />
                );
              })()}
            {el.type === "shape" &&
              el.shapeStyle !== "rect-outline" &&
              el.shapeStyle !== "circle-outline" &&
              (() => {
                const mask = el.maskId ? findMask(el.maskId) : undefined;
                return (
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
                );
              })()}
            {el.type === "photo" &&
              photo &&
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
                      filter: cssFilterFor(el.filter, el.blur, { id: el.id, adj: el }),
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
            {el.type === "text" && el.text}
          </div>
        );
      })}
    </button>
  );
}
