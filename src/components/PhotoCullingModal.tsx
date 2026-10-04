"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BTN_PRESS } from "@/lib/viewTransition";
import type { GalleryPhotoRow } from "@/lib/types";
import { IconClose } from "@/components/icons/AlbumIcons";
import { useT } from "@/i18n/client";

type PhotoWithUrl = GalleryPhotoRow & { url: string; previewUrl?: string | null };
type CullingStatus = GalleryPhotoRow["culling_status"];

export default function PhotoCullingModal({
  photos,
  galleryId,
  supabase,
  startIndex,
  onUpdateStatus,
  onClose,
}: {
  photos: PhotoWithUrl[];
  galleryId: string;
  supabase: SupabaseClient;
  startIndex: number;
  onUpdateStatus: (photoId: string, status: CullingStatus) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(startIndex);
  const [saving, setSaving] = useState(false);

  const photo = photos[index];
  const keptCount = photos.filter((p) => p.culling_status === "kept").length;
  const rejectedCount = photos.filter((p) => p.culling_status === "rejected").length;

  const decide = async (status: CullingStatus) => {
    if (!photo || saving) return;
    setSaving(true);
    onUpdateStatus(photo.id, status);
    await supabase.from("gallery_photos").update({ culling_status: status }).eq("id", photo.id).eq("gallery_id", galleryId);
    setSaving(false);
    setIndex((i) => (i < photos.length - 1 ? i + 1 : i));
  };

  // Same RTL convention as the regular lightbox — visual "forward" (left) advances to the next photo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === (document.documentElement.dir !== "ltr" ? "ArrowLeft" : "ArrowRight") && index < photos.length - 1) setIndex(index + 1);
      else if (e.key === (document.documentElement.dir !== "ltr" ? "ArrowRight" : "ArrowLeft") && index > 0) setIndex(index - 1);
      else if (e.key === "k" || e.key === "K" || e.key === "Enter") decide("kept");
      else if (e.key === "x" || e.key === "X" || e.key === "Backspace" || e.key === "Delete") decide("rejected");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length, saving]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 text-white">
        <button onClick={onClose} className={`h-9 w-9 rounded-full bg-white/10 flex items-center justify-center ${BTN_PRESS}`} aria-label={t("סגירה")}>
          <IconClose className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold font-data">
            {t("תמונה {n} מתוך {total}", { n: index + 1, total: photos.length })}
          </div>
          <div className="text-[11px] text-white/60 flex items-center gap-2 justify-center mt-0.5">
            <span>✓ {t("{n} נשמרו", { n: keptCount })}</span>
            <span>✗ {t("{n} נפסלו", { n: rejectedCount })}</span>
          </div>
        </div>
        <div className="h-9 w-9" />
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden px-2">
        {index > 0 && (
          <button
            onClick={() => setIndex(index - 1)}
            className={`absolute start-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center z-10 ${BTN_PRESS}`}
            aria-label={t("הקודמת")}
          >
            <span className="inline-block ltr:rotate-180">›</span>
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            onClick={() => setIndex(index + 1)}
            className={`absolute end-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center z-10 ${BTN_PRESS}`}
            aria-label={t("הבאה")}
          >
            <span className="inline-block ltr:rotate-180">‹</span>
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={photo.previewUrl ?? `/api/galleries/${galleryId}/photos/${photo.id}/preview`}
          alt={photo.original_filename}
          className="max-h-full max-w-full object-contain"
        />
        {photo.culling_status !== "pending" && (
          <span
            className="absolute top-3 right-1/2 translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full text-white"
            style={{ background: photo.culling_status === "kept" ? "var(--color-sage)" : "var(--color-rose)" }}
          >
            {photo.culling_status === "kept" ? `✓ ${t("נשמרה")}` : `✗ ${t("נפסלה")}`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        <button
          onClick={() => decide("rejected")}
          disabled={saving}
          className={`flex-1 rounded-2xl py-4 text-sm font-bold text-white disabled:opacity-60 ${BTN_PRESS}`}
          style={{ background: "var(--color-rose)" }}
        >
          ✗ {t("פסילה")}
        </button>
        <button
          onClick={() => decide("kept")}
          disabled={saving}
          className={`flex-1 rounded-2xl py-4 text-sm font-bold text-white disabled:opacity-60 ${BTN_PRESS}`}
          style={{ background: "var(--color-sage)" }}
        >
          ✓ {t("שמירה")}
        </button>
      </div>
    </div>
  );
}
