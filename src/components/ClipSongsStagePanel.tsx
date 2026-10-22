"use client";

import { useState } from "react";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import { clipSongLines, type ClipSongs } from "@/lib/clipSongs";
import ClipSongsFields from "@/components/ClipSongsFields";

// Under the song-selection stage on the event page (owner, 2026-10-22): the same fields the client
// sees in the portal, which the photographer can fill for the client (api/events/[id]/clip-songs:
// saving also marks the stage done), and the songs once chosen, by the client or here, with an
// edit button.
export default function ClipSongsStagePanel({
  eventId,
  stageKey,
  twoSongs,
  songs,
  onSaved,
}: {
  eventId: string;
  stageKey: string;
  twoSongs: boolean;
  songs: ClipSongs | null;
  onSaved: (songs: ClipSongs, stageDoneAt: string | null) => void;
}) {
  const t = useT();
  const locale = dateLocale(useLang());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = clipSongLines(songs);

  const save = async (input: { oneSong: boolean; single: string; calm: string; upbeat: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/clip-songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey, songs: input }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; songs?: ClipSongs; doneAt?: string | null };
      if (!res.ok || !data.songs) {
        setError(data.error ? t(data.error) : t("השמירה נכשלה. נסו שוב"));
        return;
      }
      setEditing(false);
      onSaved(data.songs, data.doneAt ?? null);
    } catch {
      setError(t("השמירה נכשלה. נסו שוב"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line px-3.5 py-3 bg-white">
      {lines.length > 0 && !editing ? (
        <>
          <ul className="space-y-1.5 text-sm">
            {lines.map((l) => (
              <li key={l.label} className="[overflow-wrap:anywhere]">
                <span className="text-ink-soft">{t(l.label)}: </span>
                {l.value.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" dir="ltr" className="font-semibold underline underline-offset-2" style={{ color: "var(--color-amber-deep)" }}>
                      {part}
                    </a>
                  ) : (
                    <span key={i} dir="auto">
                      {part}
                    </span>
                  )
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="text-[11px] text-ink-soft">
              {songs?.by === "photographer"
                ? t("נכתבו כאן בשביל הלקוח, {date}", { date: new Date(songs.chosenAt).toLocaleDateString(locale) })
                : t("נבחרו על ידי הלקוח בפורטל, {date}", { date: new Date(songs!.chosenAt).toLocaleDateString(locale) })}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold underline underline-offset-2 text-ink">
              {t("עריכה")}
            </button>
          </div>
        </>
      ) : (
        <>
          {!editing && (
            <p className="text-[11px] text-ink-soft mb-2.5 leading-relaxed">
              {t("אלה השדות שהלקוח רואה בפורטל. אפשר למלא אותם כאן בשבילו, והשלב יסומן כבוצע.")}
            </p>
          )}
          <ClipSongsFields
            twoSongs={twoSongs}
            initial={editing ? songs : null}
            submitLabel={(one) => (one ? t("שמירת השיר") : t("שמירת השירים"))}
            busy={busy}
            error={error}
            onSubmit={save}
            onCancel={editing ? () => setEditing(false) : undefined}
          />
        </>
      )}
    </div>
  );
}
