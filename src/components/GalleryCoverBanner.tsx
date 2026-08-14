import { coverAspectRatio, galleryTitleStyle, isOverlayPosition, paletteById } from "@/lib/galleryTheme";

export default function GalleryCoverBanner({
  photoUrl,
  title,
  dateLabel,
  theme,
  textPosition,
  shape,
  palette,
}: {
  photoUrl: string | null;
  title: string;
  dateLabel: string | null;
  theme: string;
  textPosition: string;
  shape: string;
  palette: string;
}) {
  const pal = paletteById(palette);
  const overlay = isOverlayPosition(textPosition);
  const isCircle = shape === "circle";
  const align = textPosition === "center-right" ? "flex-end" : "flex-start";

  const textBlock = (
    <div style={{ color: overlay ? "#ffffff" : pal.ink }}>
      <div className="text-xl" style={galleryTitleStyle(theme)}>
        {title}
      </div>
      {dateLabel && (
        <div className="text-xs mt-1" style={{ opacity: 0.75 }}>
          {dateLabel}
        </div>
      )}
    </div>
  );

  const image = photoUrl ? (
    <div
      className="relative overflow-hidden bg-chip"
      style={{
        aspectRatio: coverAspectRatio(shape),
        borderRadius: isCircle ? "50%" : "20px",
        width: isCircle ? "min(60%, 260px)" : "100%",
        margin: isCircle ? "0 auto" : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="" className="w-full h-full object-cover" />
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
  ) : null;

  return (
    <div className="mb-4">
      {textPosition === "above" && <div className="mb-3">{textBlock}</div>}
      {image}
      {textPosition === "below" && <div className="mt-3">{textBlock}</div>}
    </div>
  );
}
