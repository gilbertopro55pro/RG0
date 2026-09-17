import { coverAspectRatio, galleryTitleStyle, resolveGalleryTheme, isOverlayPosition } from "@/lib/galleryTheme";

export default function GalleryCoverBanner({
  photoUrl,
  title,
  dateLabel,
  theme: themeId,
  textPosition,
  shape,
  titleFontOverride = null,
  focalX = 50,
  focalY = 50,
}: {
  photoUrl: string | null;
  title: string;
  dateLabel: string | null;
  theme: string;
  textPosition: string;
  shape: string;
  titleFontOverride?: string | null;
  // Percentage (0-100) of the photo to keep centered once cropped to the banner's fixed aspect
  // ratio — defaults to dead-center, matching every gallery that's never had this set.
  focalX?: number;
  focalY?: number;
}) {
  const theme = resolveGalleryTheme(themeId, { titleFontOverride });
  const overlay = isOverlayPosition(textPosition);
  const isCircle = shape === "circle";
  const align = textPosition === "center-right" ? "flex-end" : "flex-start";

  const textBlock = (
    <div style={{ color: overlay ? "#ffffff" : "var(--gt-ink)" }}>
      <div className="text-xl" style={galleryTitleStyle(themeId, { titleFontOverride })}>
        {title}
      </div>
      {theme.bannerDivider && !overlay && (
        <div className="my-2" style={{ width: 40, height: 2, background: "var(--gt-accent)" }} />
      )}
      {dateLabel && (
        <div className="text-xs mt-1" style={{ opacity: 0.75 }}>
          {dateLabel}
        </div>
      )}
    </div>
  );

  const image = photoUrl ? (
    <div
      style={{
        padding: theme.bannerFramed ? "10px" : undefined,
        background: theme.bannerFramed ? "var(--gt-surface)" : undefined,
        borderRadius: theme.bannerFramed ? "var(--gt-radius)" : undefined,
        boxShadow: theme.bannerFramed ? "0 4px 18px rgba(0,0,0,0.08)" : undefined,
        marginInline: theme.bannerFullBleed ? "-1rem" : undefined,
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: coverAspectRatio(shape),
          borderRadius: isCircle ? "50%" : theme.bannerFullBleed ? "0px" : "var(--gt-radius)",
          width: isCircle ? "min(60%, 260px)" : "100%",
          margin: isCircle ? "0 auto" : undefined,
          background: "var(--gt-surface-soft)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${focalX}% ${focalY}%` }} />
        {overlay && (
          <>
            <div
              className="absolute inset-0"
              style={{
                background:
                  textPosition === "center-right"
                    ? "linear-gradient(to left, rgba(0,0,0,0.55), rgba(0,0,0,0) 55%)"
                    : "linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0) 55%)",
              }}
            />
            <div className="absolute inset-0 flex items-center p-5" style={{ justifyContent: align }}>
              {textBlock}
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="mb-4">
      {textPosition === "above" && <div className="mb-3">{textBlock}</div>}
      {image}
      {textPosition === "below" && <div className="mt-3">{textBlock}</div>}
    </div>
  );
}
