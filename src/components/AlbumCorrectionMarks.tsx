import { MARK_STROKE, marksViewBox, penPointsAttr, type CorrectionMark } from "@/lib/albumCorrections";

// The client's correction marks over an album page (lib/albumCorrections.ts): pencil strokes and
// outline rectangles, in a view box with the page's proportions so they scale with the page. Drawn
// the same on the client's album view (GalleryAlbumProofing) and the photographer's corrections page.
export default function AlbumCorrectionMarks({ marks, pageAspect, className = "" }: { marks: readonly CorrectionMark[]; pageAspect: number; className?: string }) {
  const view = marksViewBox(pageAspect);
  return (
    <svg
      viewBox={`0 0 ${view.width} ${view.height}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {marks.map((m, i) =>
        m.kind === "pen" ? (
          <polyline
            key={i}
            points={penPointsAttr(m.points, view)}
            fill="none"
            stroke={m.color}
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 1.5px rgba(255,255,255,0.9))" }}
          />
        ) : (
          <rect
            key={i}
            x={m.x * view.width}
            y={m.y * view.height}
            width={m.w * view.width}
            height={m.h * view.height}
            fill="none"
            stroke={m.color}
            strokeWidth={MARK_STROKE}
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 1.5px rgba(255,255,255,0.9))" }}
          />
        )
      )}
    </svg>
  );
}
