"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import BodyPortal from "@/components/BodyPortal";
import type { LeftoverFrames, LeftoverPhotos } from "@/lib/albumSelection";

// What a changed album selection does to the album that already exists (owner, 2026-10-27): how
// many photos left it and how many joined, and, when the counts differ, the photographer's choice
// for the frames left over or the photos left over (lib/albumSelection.ts selectionPlan).
export default function AlbumSelectionConfirm({
  removedCount,
  addedCount,
  albumShared,
  busy,
  onApply,
  onCancel,
}: {
  removedCount: number;
  addedCount: number;
  // The album was already sent to the client: the change shows on their page too.
  albumShared: boolean;
  busy: boolean;
  onApply: (options: { leftoverFrames?: LeftoverFrames; leftoverPhotos?: LeftoverPhotos }) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const fewerJoined = removedCount > addedCount;
  const moreJoined = addedCount > removedCount;
  const [frames, setFrames] = useState<LeftoverFrames>("empty");
  const [extra, setExtra] = useState<LeftoverPhotos>("newPage");
  const leftover = Math.abs(removedCount - addedCount);

  const frameOptions: { id: LeftoverFrames; title: string; body: string }[] = [
    { id: "empty", title: t("מסגרת ריקה עם נקודה אדומה"), body: t("המסגרת נשארת במקום, ריקה ומסומנת. ממלאים או מוחקים אותה בעורך. העיצוב לא זז.") },
    { id: "redesign", title: t("עיצוב מחדש של הדף"), body: t("הדף מעוצב מחדש לפי כמות התמונות שנשארה בו.") },
    { id: "remove", title: t("מחיקת המסגרת מהדף"), body: t("המסגרת נעלמת, והדף נשאר עם מקום ריק בעיצוב.") },
  ];
  const photoOptions: { id: LeftoverPhotos; title: string; body: string }[] = [
    { id: "newPage", title: t("דף חדש בסוף האלבום"), body: t("התמונות העודפות נכנסות לדף חדש בסוף האלבום, בפריסה אוטומטית.") },
    { id: "redesign", title: t("עיצוב מחדש של הדף"), body: t("כל תמונה עודפת נכנסת לדף הקרוב אליה בגלריה, והדף מעוצב מחדש לפי כמות התמונות החדשה.") },
  ];

  const option = <K extends string>(o: { id: K; title: string; body: string }, chosen: K, choose: (k: K) => void) => (
    <label
      key={o.id}
      className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer"
      style={{ borderColor: chosen === o.id ? "var(--color-ink)" : "var(--color-line)", background: chosen === o.id ? "var(--color-chip-tint)" : "#ffffff" }}
    >
      <input type="radio" className="mt-0.5" checked={chosen === o.id} onChange={() => choose(o.id)} />
      <span>
        <span className="block text-sm font-semibold">{o.title}</span>
        <span className="block text-xs text-ink-soft mt-0.5 leading-relaxed">{o.body}</span>
      </span>
    </label>
  );

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(28, 27, 25, 0.6)" }} onClick={busy ? undefined : onCancel}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="album-selection-confirm-title"
          className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-paper p-5 pb-7 shadow-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="album-selection-confirm-title" className="text-lg font-bold font-display">
            {t("הבחירה משנה את האלבום")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            {t("תמונות שהוסרו מהאלבום: {removed}. תמונות שנוספו: {added}.", { removed: removedCount, added: addedCount })}{" "}
            {Math.min(removedCount, addedCount) > 0 &&
              t("תמונות חדשות שייכנסו במקום תמונות שהוסרו, באותן מסגרות: {n}.", { n: Math.min(removedCount, addedCount) })}
          </p>
          {fewerJoined && (
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">{t("מה לעשות עם המסגרות שנשארו בלי תמונה ({n})?", { n: leftover })}</div>
              <div className="flex flex-col gap-2">{frameOptions.map((o) => option(o, frames, setFrames))}</div>
            </div>
          )}
          {moreJoined && (
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">{t("מה לעשות עם התמונות שאין להן מקום ({n})?", { n: leftover })}</div>
              <div className="flex flex-col gap-2">{photoOptions.map((o) => option(o, extra, setExtra))}</div>
            </div>
          )}
          <p className="mt-4 text-xs text-ink-soft leading-relaxed">
            {t("כל תמונה חדשה מסומנת בנקודה אדומה בעיצוב האלבום, עד ששומרים את הדף בעורך. הנקודה לא מופיעה בקבצים להדפסה.")}
          </p>
          {albumShared && <p className="mt-2 text-xs font-semibold leading-relaxed" style={{ color: "var(--color-amber-deep)" }}>{t("האלבום כבר נשלח ללקוח, והשינוי יופיע גם אצלו.")}</p>}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => onApply(fewerJoined ? { leftoverFrames: frames } : moreJoined ? { leftoverPhotos: extra } : {})}
              disabled={busy}
              className="flex-1 h-11 rounded-xl text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "var(--color-ink)" }}
            >
              {busy ? t("מעדכן את האלבום…") : t("אישור ועדכון האלבום")}
            </button>
            <button type="button" onClick={onCancel} disabled={busy} className="h-11 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-60">
              {t("ביטול")}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
