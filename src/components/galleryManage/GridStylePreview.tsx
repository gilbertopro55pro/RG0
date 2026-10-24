import type { PhotoWithUrl } from "@/components/galleryManage/types";
import { resizedPhotoUrl } from "@/lib/galleryPhotoUrls";

// A small live sample of the actual grid style — not a literal WYSIWYG crop, just enough real
// photos in the real layout shape that a picked layout is visibly different from the others,
// since the layout picker used to have no visual feedback at all until leaving the modal.
export function GridStylePreview({ photos, gridStyle }: { photos: PhotoWithUrl[]; gridStyle: string }) {
  const sample = photos.slice(0, 6);
  if (gridStyle === "grid") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gt-gap)" }}>
        {sample.map((p) => (
          <div key={p.id} className="aspect-square overflow-hidden" style={{ borderRadius: "var(--gt-photo-radius)", background: "var(--gt-surface-soft)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resizedPhotoUrl(p, 256)} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }
  if (gridStyle === "justified") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--gt-gap)" }}>
        {sample.map((p) => (
          <div
            key={p.id}
            className="overflow-hidden"
            style={{ height: 46, width: 62, flexGrow: 1, borderRadius: "var(--gt-photo-radius)", background: "var(--gt-surface-soft)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resizedPhotoUrl(p, 256)} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }
  const framed = gridStyle === "framed";
  return (
    <div style={{ columnWidth: 72, columnGap: "var(--gt-gap)" }}>
      {sample.map((p, i) => (
        <div
          key={p.id}
          className="break-inside-avoid overflow-hidden"
          style={{
            marginBottom: "var(--gt-gap)",
            height: i % 2 === 0 ? 58 : 84,
            borderRadius: "var(--gt-photo-radius)",
            background: "var(--gt-surface-soft)",
            ...(framed ? { padding: 4, border: "1px solid var(--gt-border)" } : {}),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resizedPhotoUrl(p, 256)}
            alt=""
            className="w-full h-full object-cover"
            style={{ borderRadius: framed ? "calc(var(--gt-photo-radius) - 3px)" : undefined }}
          />
        </div>
      ))}
    </div>
  );
}
