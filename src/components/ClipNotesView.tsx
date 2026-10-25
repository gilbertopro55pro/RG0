"use client";

import { useState } from "react";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// The client's notes for the clip on the event page (owner, 2026-10-25; lib/clipNotes.ts): to read
// and copy. Only the client writes them, in the portal, so there's no edit field here. Under the
// song-selection stage, or in a card of its own when the package has a clip but no song stage.
export default function ClipNotesView({ notes, at, card = false }: { notes: string | null; at: string | null; card?: boolean }) {
  const t = useT();
  const locale = dateLocale(useLang());
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!notes) return;
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={card ? "text-sm font-semibold" : "text-xs font-semibold text-ink"}>{t("הערות הלקוח לקליפ")}</span>
        {notes && (
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-line bg-white text-ink"
          >
            {copied ? t("הועתק ✓") : t("העתקה")}
          </button>
        )}
      </div>
      {notes ? (
        <>
          <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere] mt-1.5 select-text" dir="auto">
            {notes}
          </p>
          {at && (
            <p className="text-[11px] text-ink-soft mt-1.5">
              {t("נכתבו בפורטל על ידי הלקוח, {date}", { date: new Date(at).toLocaleDateString(locale, { timeZone: "Asia/Jerusalem" }) })}
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-ink-soft mt-1 leading-relaxed">{t("הלקוח עוד לא כתב הערות לקליפ. הוא יכול לכתוב אותן בפורטל.")}</p>
      )}
    </>
  );

  return card ? (
    <div className="mt-7 rounded-2xl p-4 bg-card border border-line shadow-card">{body}</div>
  ) : (
    <div className="border-t border-line px-3.5 py-3 bg-white">{body}</div>
  );
}
