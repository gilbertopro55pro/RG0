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
  // Every note the client wrote on the page; `at` only when the round came in more than one part.
  notes: { text: string; at: string | null }[];
  marks: CorrectionMark[];
  // The page's printed size: its own (a cover made at its own size) or the album's.
  size: { width_cm: number; height_cm: number };
};

// One round of the client's corrections, in the admin's list of them all (owner, 2026-11-02).
export type CorrectionRoundLink = { id: string; sentAt: string; pages: number; open: boolean; current: boolean };

// The client's corrections on the album design (app/album-corrections/[id]): each page they marked,
// drawn like the album tool draws it (AlbumSpreadThumbnail), with their marks over it and their notes.
export default function AlbumCorrectionsView({
  title,
  sentAt,
  newerId,
  open,
  albumStatus,
  editHref,
  pages,
  photos,
  customOrnaments,
  history = null,
}: {
  title: string;
  // When the round came in ("נשלחו ב-…", or in how many parts).
  sentAt: string;
  // An older round: the client sent newer corrections since (the id of the newest).
  newerId: string | null;
  // Still waiting for the photographer (sent after the design was last sent).
  open: boolean;
  albumStatus: string;
  editHref: string;
  pages: CorrectedPageView[];
  photos: PhotoWithUrl[];
  customOrnaments: { id: string; url: string }[];
  // Every round, newest first (the admin's list); null hides it.
  history?: CorrectionRoundLink[] | null;
}) {
  const t = useT();
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold font-display leading-tight">{title}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {sentAt} · {t("עמודים עם תיקונים: {n}", { n: pages.length })}
          </p>
        </div>
        <Link href={editHref} className="shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold bg-ink text-white">
          {t("לעריכת האלבום")}
        </Link>
      </div>

      {newerId && (
        <p className="mb-4 rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-amber-bg text-amber-deep">
          {t("הלקוח שלח מאז תיקונים חדשים יותר.")}{" "}
          <Link href={`/album-corrections/${newerId}`} className="underline">
            {t("לתיקונים החדשים")}
          </Link>
        </p>
      )}
      {!newerId && !open && albumStatus === "sent" && (
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
            {p.notes.map((n, i) => (
              <div key={i} className="mt-3 rounded-lg px-3 py-2 text-sm bg-amber-bg text-amber-deep">
                {n.at && <p className="text-[11px] font-semibold opacity-75 mb-0.5">{n.at}</p>}
                <p className="whitespace-pre-wrap" dir="auto">
                  {n.text}
                </p>
              </div>
            ))}
          </section>
        ))}
      </div>

      {history && history.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-bold font-display mb-2">{t("כל התיקונים מהלקוח")}</h2>
          <ul className="rounded-2xl bg-card border border-line shadow-card divide-y divide-[var(--color-line)] overflow-hidden">
            {history.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/album-corrections/${r.id}`}
                  aria-current={r.current ? "page" : undefined}
                  className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${r.current ? "bg-chip" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{t("נשלחו ב-{date}", { date: r.sentAt })}</span>
                    <span className="block text-xs text-ink-soft">{t("עמודים עם תיקונים: {n}", { n: r.pages })}</span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={
                      r.open
                        ? { background: "#FBEEEC", color: "var(--color-rose)" }
                        : { background: "var(--color-sage-bg)", color: "var(--color-sage)" }
                    }
                  >
                    {r.open ? t("ממתין לתיקון") : t("טופל")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
