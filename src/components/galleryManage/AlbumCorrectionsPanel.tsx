"use client";

import { useEffect, useRef } from "react";
import AlbumSpreadThumbnail from "@/components/AlbumSpreadThumbnail";
import AlbumCorrectionMarks from "@/components/AlbumCorrectionMarks";
import type { MergedCorrectionPage } from "@/lib/albumCorrections";
import type { PhotoWithUrl } from "@/lib/albumRender";
import type { GalleryAlbumSpreadRow } from "@/lib/types";
import { useT } from "@/i18n/client";

// The panel's slide in and out, and the editor's resize beside it (AlbumSpreadCanvasEditor's
// leftInsetPx): the same duration, so the two move together.
export const CORRECTIONS_PANEL_MS = 300;

export type CorrectionsPanelPage = MergedCorrectionPage & { number: number };

// The client's corrections beside the album editor (owner, 2026-11-02, admin for now): on the left
// edge of the screen, whatever the language, sliding in to the right; the editor shrinks beside it
// on a computer and comes back to its size when it slides out. The vertical "תיקונים" tab on the
// edge shows and hides it; it's there only while the album has corrections waiting.
//
// It lives in GalleryManageView, not in the editor: the editor remounts on every page switch, and
// the panel keeps its place and its scroll. A page in the list opens in the editor through the
// editor's own switch (switchSpreadRef), so a changed page still asks to save first.
export default function AlbumCorrectionsPanel({
  open,
  onToggle,
  width,
  pages,
  spreads,
  album,
  photos,
  customOrnaments,
  currentSpreadId,
  onGoTo,
  sentLine,
}: {
  open: boolean;
  onToggle: () => void;
  width: number;
  pages: CorrectionsPanelPage[];
  spreads: GalleryAlbumSpreadRow[];
  album: { width_cm: number; height_cm: number };
  photos: PhotoWithUrl[];
  customOrnaments?: { id: string; url: string }[];
  currentSpreadId: string | null;
  onGoTo: (spreadId: string) => void;
  // When the client sent them ("נשלחו ב-…").
  sentLine: string | null;
}) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const spreadById = new Map(spreads.map((s) => [s.id, s]));
  const currentIndex = pages.findIndex((p) => p.spreadId === currentSpreadId);
  // The pages before and after the open one, by page number (the open page may have no corrections).
  const currentNumber = currentSpreadId ? spreads.findIndex((s) => s.id === currentSpreadId) + 1 : 0;
  const prev = [...pages].reverse().find((p) => p.number < currentNumber) ?? null;
  const next = pages.find((p) => p.number > currentNumber) ?? null;

  // The open page's corrections in view whenever the editor moves to another page.
  useEffect(() => {
    if (!open) return;
    const card = listRef.current?.querySelector<HTMLElement>('[data-current="1"]');
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentSpreadId, open]);

  const pageTitle = (n: number) => (n === 1 ? t("כריכה") : t("עמוד {n}", { n }));

  return (
    <>
      <aside
        aria-label={t("תיקונים מהלקוח")}
        aria-hidden={!open}
        className="fixed top-0 bottom-0 z-[82] flex flex-col bg-paper shadow-sheet border-e border-line"
        style={{
          left: 0,
          width,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          // visibility waits for the slide out to end, and comes back as it starts.
          transition: `transform ${CORRECTIONS_PANEL_MS}ms ease, visibility ${CORRECTIONS_PANEL_MS}ms`,
          visibility: open ? "visible" : "hidden",
        }}
      >
        <div className="px-4 pt-4 pb-3 border-b border-line">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-bold font-display leading-tight">{t("תיקונים מהלקוח")}</h2>
              <p className="text-xs text-ink-soft mt-0.5">
                {t("עמודים עם תיקונים: {n}", { n: pages.length })}
                {sentLine ? ` · ${sentLine}` : ""}
              </p>
            </div>
            <button
              onClick={onToggle}
              aria-label={t("הסתרת התיקונים")}
              className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line text-ink"
            >
              {/* Points to the left edge the panel slides back into, in every language. */}
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => prev && onGoTo(prev.spreadId)}
              disabled={!prev}
              className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink disabled:opacity-40"
            >
              {t("לתיקון הקודם")}
            </button>
            <span className="shrink-0 text-xs text-ink-soft font-data">
              {currentIndex >= 0 ? `${currentIndex + 1} / ${pages.length}` : `– / ${pages.length}`}
            </span>
            <button
              onClick={() => next && onGoTo(next.spreadId)}
              disabled={!next}
              className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-40"
            >
              {t("לתיקון הבא")}
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
          {pages.map((p) => {
            const spread = spreadById.get(p.spreadId);
            if (!spread) return null;
            const size = { width_cm: Number(spread.width_cm ?? album.width_cm), height_cm: Number(spread.height_cm ?? album.height_cm) };
            const current = p.spreadId === currentSpreadId;
            return (
              <section
                key={p.spreadId}
                data-current={current ? "1" : undefined}
                className="rounded-2xl p-2.5 bg-card border shadow-card"
                style={{ borderColor: current ? "var(--color-amber-deep)" : "var(--color-line)", borderWidth: current ? 2 : 1 }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold">{pageTitle(p.number)}</h3>
                  {current ? (
                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-bg text-amber-deep">{t("פתוח בעורך")}</span>
                  ) : (
                    <button onClick={() => onGoTo(p.spreadId)} className="text-xs font-semibold underline text-ink">
                      {t("מעבר לעמוד")}
                    </button>
                  )}
                </div>
                {/* The thumbnail is a button of its own: a tap on it opens the page. */}
                <div className="relative">
                  <AlbumSpreadThumbnail
                    spread={spread}
                    album={size}
                    photos={photos}
                    customOrnaments={customOrnaments}
                    exactText
                    onClick={() => !current && onGoTo(p.spreadId)}
                  />
                  <AlbumCorrectionMarks marks={p.marks} pageAspect={size.width_cm / size.height_cm} className="z-10" />
                </div>
                {p.notes.map((n, i) => (
                  <p key={i} className="mt-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-snug bg-amber-bg text-amber-deep whitespace-pre-wrap" dir="auto">
                    {n.text}
                  </p>
                ))}
              </section>
            );
          })}
        </div>
      </aside>

      {/* The tab on the edge: at the screen's left edge while the panel is hidden, on the panel's edge
          while it shows, moving with it. */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? t("הסתרת התיקונים") : t("הצגת התיקונים")}
        className="fixed z-[82] top-1/2 flex flex-col items-center gap-1.5 px-1.5 py-3 text-white text-[13px] font-semibold shadow-sheet"
        style={{
          left: open ? width : 0,
          transform: "translateY(-50%)",
          transition: `left ${CORRECTIONS_PANEL_MS}ms ease`,
          background: "var(--color-rose)",
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
        }}
      >
        <span className="rounded-full bg-white text-[11px] font-bold leading-none px-1.5 py-1" style={{ color: "var(--color-rose)" }}>
          {pages.length}
        </span>
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{t("תיקונים")}</span>
      </button>
    </>
  );
}
