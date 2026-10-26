"use client";

import { useState } from "react";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import { CLIP_NOTES_MAX } from "@/lib/clipNotes";

// The client's notes for the clip, in the portal of a package with a clip (owner, 2026-10-25;
// lib/clipNotes.ts). Saved by api/portal/[token]/clip-notes; the photographer sees them on the
// event page without an edit field. While the song stage is open the notes are a field under the
// songs (ClipSongsFields) and saved with them; this is the field after the songs are chosen, under
// them in the stage (`embedded`, owner 2026-10-26), or its own card in a package whose song stage
// the client doesn't see.
export default function PortalClipNotes({
  eventToken,
  photographerName,
  initialNotes,
  initialAt,
  embedded = false,
}: {
  eventToken: string;
  photographerName: string | null;
  initialNotes: string | null;
  initialAt: string | null;
  embedded?: boolean;
}) {
  const t = useT();
  const locale = dateLocale(useLang());
  const [saved, setSaved] = useState<{ notes: string | null; at: string | null }>({ notes: initialNotes, at: initialAt });
  // Under the chosen songs, no notes yet is one "add" link, not an open field.
  const [editing, setEditing] = useState(!initialNotes && !embedded);
  const [text, setText] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const changed = text.trim() !== (saved.notes ?? "");

  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/portal/${eventToken}/clip-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { notes?: string | null; at?: string | null };
      if (!res.ok) {
        setError(true);
        return;
      }
      setSaved({ notes: data.notes ?? null, at: data.at ?? null });
      setText(data.notes ?? "");
      setEditing(!data.notes && !embedded);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const title = embedded ? (
    <div className="text-xs font-semibold text-ink">{t("הערות לקליפ")}</div>
  ) : (
    <div className="text-sm font-semibold mb-1">{t("הערות לקליפ")}</div>
  );

  let body: React.ReactNode;
  if (saved.notes && !editing) {
    body = (
      <>
        {title}
        <p className={`text-sm whitespace-pre-wrap [overflow-wrap:anywhere] ${embedded ? "mt-1" : "mt-2"}`} dir="auto">
          {saved.notes}
        </p>
        <div className="flex items-center justify-between gap-2 mt-2.5">
          <span className="text-[11px] text-ink-soft">
            {saved.at ? t("נשמר {date}", { date: new Date(saved.at).toLocaleDateString(locale, { timeZone: "Asia/Jerusalem" }) }) : null}
          </span>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold underline underline-offset-2 text-ink">
            {t("עריכה")}
          </button>
        </div>
      </>
    );
  } else if (!editing) {
    body = (
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold underline underline-offset-2 text-ink">
        {t("הוספת הערות לקליפ")}
      </button>
    );
  } else {
    body = (
      <>
        {title}
        <p className={`text-xs leading-relaxed text-ink-soft ${embedded ? "mt-0.5 mb-1.5" : "mb-2.5"}`}>
          {photographerName
            ? t("משהו שחשוב לכם בקליפ? רגעים או אנשים שחשוב שיופיעו, או משהו שעדיף שלא. כתבו כאן, ו{name} יראו את זה.", { name: photographerName })
            : t("משהו שחשוב לכם בקליפ? רגעים או אנשים שחשוב שיופיעו, או משהו שעדיף שלא. כתבו כאן, והצלם יראה את זה.")}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CLIP_NOTES_MAX}
          rows={embedded ? 3 : 4}
          dir="auto"
          placeholder={t("ההערות שלכם לקליפ")}
          className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-y"
        />
        {text.length > CLIP_NOTES_MAX - 200 && (
          <p className="text-[11px] text-ink-soft mt-1 font-data">
            {text.length}/{CLIP_NOTES_MAX}
          </p>
        )}
        {error && <p className="text-xs text-rose mt-1.5">{t("לא הצלחנו לשמור. נסו שוב.")}</p>}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => save()}
            disabled={busy || !changed || (!saved.notes && !text.trim())}
            className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white disabled:opacity-50"
          >
            {busy ? t("שומר...") : t("שמירת ההערות")}
          </button>
          {(saved.notes || embedded) && (
            <button
              type="button"
              onClick={() => {
                setText(saved.notes ?? "");
                setEditing(false);
                setError(false);
              }}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-soft"
            >
              {t("ביטול")}
            </button>
          )}
        </div>
      </>
    );
  }

  if (embedded) return <div className="mt-2.5 pt-2.5 border-t border-line">{body}</div>;
  return <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">{body}</div>;
}
