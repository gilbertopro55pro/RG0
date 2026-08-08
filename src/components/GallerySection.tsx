"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { GalleryRow } from "@/lib/types";
import NewGalleryModal from "@/components/NewGalleryModal";

export default function GallerySection({
  eventId,
  initialGallery,
  photoCount,
  coverUrl,
}: {
  eventId: string;
  initialGallery: GalleryRow | null;
  photoCount: number;
  coverUrl: string | null;
}) {
  const [gallery] = useState(initialGallery);
  const [showNewGallery, setShowNewGallery] = useState(false);

  const isArchived = !!gallery?.archived_at;

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-sm font-semibold tracking-wide">גלריית תמונות</span>
        {gallery && <span className="text-xs text-ink-soft font-data">{photoCount} תמונות</span>}
      </div>

      {gallery ? (
        <Link href={`/galleries/${gallery.id}`} className="flex items-center gap-3">
          <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-line shrink-0">
            {coverUrl && <Image src={coverUrl} alt="" fill sizes="56px" className="object-cover" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">
              {isArchived ? (
                <span className="text-rose">בארכיון</span>
              ) : gallery.published ? (
                <span className="text-sage">פורסמה ✓</span>
              ) : (
                <span className="text-ink-soft">טיוטה — עדיין לא פורסמה</span>
              )}
            </div>
            <div className="text-xs text-amber-deep underline mt-0.5">ניהול גלריה ←</div>
          </div>
        </Link>
      ) : (
        <button
          onClick={() => setShowNewGallery(true)}
          className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
        >
          יצירת גלריה
        </button>
      )}

      {showNewGallery && <NewGalleryModal eventId={eventId} onClose={() => setShowNewGallery(false)} />}
    </div>
  );
}
