"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { CLIP_SONG_MAX, type ClipSongs } from "@/lib/clipSongs";
import { CLIP_NOTES_MAX } from "@/lib/clipNotes";

export type ClipSongsInput = { oneSong: boolean; single: string; calm: string; upbeat: string };

// The clip song fields (lib/clipSongs.ts): a song name or a YouTube link per field. A wedding asks
// for a calm song and an upbeat one unless "one song" is ticked; any other event asks for one. The
// client fills them in the portal (PortalStageActions), and the photographer sees the same fields
// on the event page and can fill them for the client (ClipSongsStagePanel, owner 2026-10-22).
// `notes` (the portal, owner 2026-10-26): the clip notes field under the songs, sent with them.
export default function ClipSongsFields({
  twoSongs,
  initial,
  submitLabel,
  submitTone,
  busy,
  error,
  onSubmit,
  onCancel,
  notes,
}: {
  twoSongs: boolean;
  // Songs already chosen, to edit.
  initial?: ClipSongs | null;
  submitLabel: (oneSong: boolean) => string;
  // The portal's "שמירה ושליחה בוואטסאפ" (owner, 2026-10-26): in WhatsApp green.
  submitTone?: "whatsapp";
  busy: boolean;
  error: string | null;
  onSubmit: (songs: ClipSongsInput, notes?: string) => void;
  onCancel?: () => void;
  // The saved notes to start from, and the line under the field's title.
  notes?: { initial: string; hint: string };
}) {
  const t = useT();
  const [oneSong, setOneSong] = useState(!twoSongs || !!initial?.single);
  const [single, setSingle] = useState(initial?.single ?? "");
  const [calm, setCalm] = useState(initial?.calm ?? "");
  const [upbeat, setUpbeat] = useState(initial?.upbeat ?? "");
  const [notesText, setNotesText] = useState(notes?.initial ?? "");
  const ready = oneSong ? !!single.trim() : !!calm.trim() && !!upbeat.trim();

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="block">
      <span className="block text-xs font-semibold text-ink mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={CLIP_SONG_MAX}
        dir="auto"
        placeholder={t("שם השיר או קישור ליוטיוב")}
        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
      />
    </label>
  );

  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-relaxed text-ink-soft">
        {oneSong
          ? t("כתבו את שם השיר לקליפ, או הדביקו קישור מיוטיוב.")
          : t("כתבו את שמות השירים לקליפ ההיילייטס, או הדביקו קישורים מיוטיוב: שיר רגוע ושיר קצבי.")}
      </p>
      {twoSongs && (
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={oneSong} onChange={(e) => setOneSong(e.target.checked)} className="h-4 w-4" />
          {t("מעדיפים שיר אחד לקליפ")}
        </label>
      )}
      {oneSong ? (
        field(t("השיר לקליפ"), single, setSingle)
      ) : (
        <>
          {field(t("שיר רגוע"), calm, setCalm)}
          {field(t("שיר קצבי"), upbeat, setUpbeat)}
        </>
      )}
      {notes && (
        <label className="block pt-1">
          <span className="block text-xs font-semibold text-ink">{t("הערות לקליפ")}</span>
          <span className="block text-[11px] leading-relaxed text-ink-soft mt-0.5 mb-1">{notes.hint}</span>
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            maxLength={CLIP_NOTES_MAX}
            rows={3}
            dir="auto"
            placeholder={t("ההערות שלכם לקליפ")}
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-y"
          />
        </label>
      )}
      {error && <p className="text-xs text-rose">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSubmit({ oneSong, single, calm, upbeat }, notes ? notesText : undefined)}
          disabled={!ready || busy}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 ${submitTone === "whatsapp" ? "" : "bg-ink"}`}
          style={submitTone === "whatsapp" ? { background: "#25D366" } : undefined}
        >
          {busy ? t("שומר...") : submitLabel(oneSong)}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-soft">
            {t("ביטול")}
          </button>
        )}
      </div>
    </div>
  );
}
