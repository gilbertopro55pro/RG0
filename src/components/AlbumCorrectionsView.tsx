"use client";

import Link from "next/link";
import AlbumSpreadThumbnail from "@/components/AlbumSpreadThumbnail";
import AlbumCorrectionMarks from "@/components/AlbumCorrectionMarks";
import type { CorrectionMark } from "@/lib/albumCorrections";
import type { PhotoWithUrl } from "@/lib/albumRender";
import type { GalleryAlbumSpreadRow } from "@/lib/types";
import { useT } from "@/i18n/client";

export type CorrectedPageView = {
  spread: GalleryAlbumSpreadRow;
  // 1-based, in the album's order (the number the client saw).
  number: number;
  note: string | null;
  marks: CorrectionMark[];
  // The page's printed size: its own (a cover made at its own size) or the album's.
  size: { width_cm: number; height_cm: number };
};

// The client's corrections on the album design (app/album-corrections/[id]): each page they marked,
// drawn like the album tool draws it (AlbumSpreadThumbnail), with their marks over it and their note.
export default function AlbumCorrectionsView({
  title,
  sentAt,
  isLatest,
  albumStatus,
  editHref,
  pages,
  photos,
  customOrnaments,
}: {
  title: string;
  sentAt: string;
  // An older submission: the client sent newer corrections since.
  isLatest: boolean;
  albumStatus: string;
  editHref: string;
  pages: CorrectedPageView[];
  photos: PhotoWithUrl[];
  customOrnaments: { id: string; url: string }[];
}) {
  const t = useT();
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold font-display leading-tight">{title}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {t("נשלחו ב-{date}", { date: sentAt })} · {t("עמודים עם תיקונים: {n}", { n: pages.length })}
          </p>
        </div>
        <Link href={editHref} className="shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold bg-ink text-white">
          {t("לעריכת האלבום")}
        </Link>
      </div>

      {!isLatest && (
        <p className="mb-4 rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-amber-bg text-amber-deep">{t("הלקוח שלח מאז תיקונים חדשים יותר.")}</p>
      )}
      {isLatest && albumStatus === "sent" && (
        <p className="mb-4 rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-chip text-ink-soft">{t("העיצוב המעודכן כבר נשלח שוב ללקוח.")}</p>
      )}
      {albumStatus === "approved" && (
        <p className="mb-4 rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-sage-bg text-sage">✓ {t("הלקוח אישר בינתיים את העיצוב.")}</p>
      )}

      <div className="space-y-6">
        {pages.map((p) => (
          <section key={p.spread.id} className="rounded-2xl p-3 sm:p-4 bg-card border border-line shadow-card">
            <h2 className="text-sm font-semibold mb-2">{p.number === 1 ? t("כריכה") : t("עמוד {n}", { n: p.number })}</h2>
            <div className="relative">
              <AlbumSpreadThumbnail spread={p.spread} album={p.size} photos={photos} customOrnaments={customOrnaments} exactText />
              <AlbumCorrectionMarks marks={p.marks} pageAspect={p.size.width_cm / p.size.height_cm} className="z-10" />
            </div>
            {p.note && (
              <p className="mt-3 rounded-lg px-3 py-2 text-sm bg-amber-bg text-amber-deep whitespace-pre-wrap" dir="auto">
                {p.note}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
