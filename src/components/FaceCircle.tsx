import type { FaceBox } from "@/lib/faceRecognition";

// Crops a circular avatar out of a full photo purely with CSS (no server-side thumbnail
// generation needed): the source <img> is scaled and offset so the detected face box exactly
// fills the circle, with a little padding added around the tight detection box since face-api's
// raw box crops right at the eyebrows/chin and looks awkward zoomed to 100%.
export default function FaceCircle({
  url,
  box,
  size,
  selected,
  onClick,
}: {
  url: string;
  box: FaceBox;
  size: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const pad = 0.35;
  const paddedWidth = Math.min(1, box.width * (1 + pad * 2));
  const paddedHeight = Math.min(1, box.height * (1 + pad * 2));
  const paddedX = Math.max(0, box.x - (paddedWidth - box.width) / 2);
  const paddedY = Math.max(0, box.y - (paddedHeight - box.height) / 2);

  const imgWidthPx = size / paddedWidth;
  const imgHeightPx = size / paddedHeight;
  const leftPx = -(paddedX * imgWidthPx);
  const topPx = -(paddedY * imgHeightPx);

  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full overflow-hidden relative"
      style={{
        width: size,
        height: size,
        outline: selected ? "3px solid var(--color-amber-deep)" : "1px solid var(--color-line)",
        outlineOffset: selected ? 2 : 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- absolutely positioned + cropped via CSS math, not a plain display image */}
      <img
        src={url}
        alt=""
        style={{ position: "absolute", width: imgWidthPx, height: imgHeightPx, left: leftPx, top: topPx, maxWidth: "none" }}
      />
    </button>
  );
}
