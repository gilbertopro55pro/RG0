"use client";

import { useT } from "@/i18n/client";
import type { AlbumElement } from "@/lib/types";

// The red dot on each frame a changed album selection gave a new photo or left empty (owner,
// 2026-10-27; lib/albumSelection.ts, gallery_album_spreads.marked_frames), over a page in the album
// preview and over the editor's canvas. Only drawn here, on screen: the exports never see it.
export default function MarkedFrameDots({ elements, marked, size = 10 }: { elements: readonly AlbumElement[] | null; marked: readonly string[] | null | undefined; size?: number }) {
  const t = useT();
  if (!marked?.length || !elements?.length) return null;
  const ids = new Set(marked);
  return (
    <>
      {elements
        .filter((el) => ids.has(el.id) && el.type === "photo")
        .map((el) => {
          // Just inside the frame's top corner, kept on the page.
          const right = Math.min(100, el.xPct + el.widthPct);
          const top = Math.max(0, el.yPct);
          return (
            <span
              key={el.id}
              role="img"
              aria-label={el.type === "photo" && !el.photoId ? t("מסגרת שנשארה ריקה אחרי שינוי הבחירה") : t("תמונה חדשה מהבחירה לאלבום")}
              title={el.type === "photo" && !el.photoId ? t("מסגרת שנשארה ריקה אחרי שינוי הבחירה") : t("תמונה חדשה מהבחירה לאלבום")}
              className="absolute z-[3] rounded-full pointer-events-none"
              style={{
                left: `calc(${right}% - ${size + 4}px)`,
                top: `calc(${top}% + 4px)`,
                width: size,
                height: size,
                background: "#e5322d",
                boxShadow: "0 0 0 2px #ffffff, 0 1px 3px rgba(0,0,0,0.35)",
              }}
            />
          );
        })}
    </>
  );
}
