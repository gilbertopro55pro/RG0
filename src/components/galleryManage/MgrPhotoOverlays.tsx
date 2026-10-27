"use client";

import { useT } from "@/i18n/client";
import type { PhotoWithUrl } from "@/components/galleryManage/types";

export function MgrPhotoOverlays({
  photo,
  isCover,
  selectedIds,
  onDownload,
  onSetCover,
  offset = 4,
  quiet = false,
  albumPick,
}: {
  photo: PhotoWithUrl;
  isCover: boolean;
  selectedIds: Set<string>;
  onDownload?: (photo: PhotoWithUrl) => void;
  onSetCover?: (photo: PhotoWithUrl) => void;
  offset?: number;
  // Hide the action icons until hover on mouse devices (the tile carries the "group" class).
  quiet?: boolean;
  // While narrowing the favorites for the album (lib/albumSelection.ts): whether this photo is
  // picked. A tick in place of the favorite mark, and a photo left out is dimmed.
  albumPick?: boolean;
}) {
  const t = useT();
  const hoverOnly = quiet ? " transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "";
  // The parent thumbnail is itself a <button> (opens the lightbox on click), so these can't be
  // real <button> elements — nested buttons are invalid HTML and browsers silently mangle the
  // DOM. role="button" spans + stopPropagation get the same click/keyboard behavior without that.
  const iconBtnClass = "absolute h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center text-[11px]";
  return (
    <>
      {onSetCover && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onSetCover(photo);
          }}
          className={iconBtnClass + (isCover ? "" : hoverOnly)}
          style={{ top: offset, right: offset, background: isCover ? "var(--color-amber-deep)" : "rgba(0,0,0,0.5)" }}
          aria-label={isCover ? t("שער הגלריה הנוכחי") : t("קביעה כשער הגלריה")}
          title={isCover ? t("שער הגלריה הנוכחי") : t("קביעה כשער הגלריה")}
        >
          ★
        </span>
      )}
      {onDownload && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDownload(photo);
          }}
          className={iconBtnClass + hoverOnly}
          style={{ top: offset + 30, right: offset }}
          aria-label={t("הורדת התמונה")}
          title={t("הורדת התמונה")}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
            <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
          </svg>
        </span>
      )}
      {albumPick !== undefined ? (
        <>
          {!albumPick && <span aria-hidden="true" className="absolute inset-0 bg-white/55 pointer-events-none" />}
          <span
            className="absolute h-6 w-6 rounded-full border-2 flex items-center justify-center"
            style={{ top: offset, left: offset, borderColor: "#ffffff", background: albumPick ? "var(--color-sage)" : "rgba(0,0,0,0.35)" }}
            role="img"
            aria-label={albumPick ? t("נבחרה לאלבום") : t("לא נבחרה לאלבום")}
          >
            {albumPick && <span className="text-white text-[12px] leading-none">✓</span>}
          </span>
        </>
      ) : selectedIds.size > 0 ? (
        <span
          className="absolute h-5 w-5 rounded-full border-2 flex items-center justify-center"
          style={{
            top: offset,
            left: offset,
            borderColor: "#ffffff",
            background: selectedIds.has(photo.id) ? "var(--color-amber-deep)" : "rgba(0,0,0,0.35)",
          }}
        >
          {selectedIds.has(photo.id) && <span className="text-white text-[10px] leading-none">✓</span>}
        </span>
      ) : (
        photo.is_favorite && (
          <span
            className="absolute text-[11px] h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center"
            style={{ top: offset, left: offset }}
          >
            💜
          </span>
        )
      )}
      {photo.culling_status === "rejected" && (
        <span
          className="absolute text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold"
          style={{ bottom: offset, right: offset, background: "var(--color-rose)" }}
        >
          ✗ {t("נפסל")}
        </span>
      )}
      {photo.custom_label && (
        <span
          className="absolute text-[9px] px-1.5 py-0.5 rounded-full bg-black/60 text-white max-w-[85%] truncate"
          style={{ bottom: offset, left: "50%", transform: "translateX(-50%)" }}
        >
          ◆ {photo.custom_label}
        </span>
      )}
      {photo.in_portfolio && (
        <span
          className="absolute h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center"
          style={{ bottom: offset, left: offset }}
          title={t("בפורטפוליו")}
          aria-label={t("בפורטפוליו")}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
        </span>
      )}
    </>
  );
}
