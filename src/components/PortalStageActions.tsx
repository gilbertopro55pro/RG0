"use client";

import { useState } from "react";
import type { StageKey } from "@/lib/stages";
import { useT } from "@/i18n/client";
import { clipSongLines, type ClipSongs } from "@/lib/clipSongs";
import { clipSongsWhatsAppMessage } from "@/lib/clipSongsMessage";
import ClipSongsFields, { type ClipSongsInput } from "@/components/ClipSongsFields";
import { openWhatsApp } from "@/lib/waLink";
import { clipNotesBridge } from "@/lib/portalClipNotesBridge";

type ClientStage = {
  key: string;
  // What the stage is (album approval / video approval / song selection), also for custom-package
  // stages named like them (lib/clientReminders.ts stageRole). Falls back to the key.
  role?: string | null;
  label: string;
  done: boolean;
  isCurrent: boolean;
  // An approval stage only takes the client's approval once there's something to approve.
  approvalOpen?: boolean;
};

const EXPLANATIONS: Partial<Record<StageKey, string>> = {
  client_photo_selection: "היכנסו לגלריה שלכם, סמנו לב ❤️ על כל תמונה שתרצו לכלול, ולחצו על \"סיום בחירה\" בתחתית העמוד. השלב יסומן כבוצע אוטומטית ברגע שתאשרו.",
  video_approval: "צפו בסרטון שנשלח אליכם. אם הכול נראה מעולה, לחצו לאישור ונמשיך משם לשלב הבא.",
  album_approval: "צפו בעיצוב האלבום ווודאו שהכול נראה בדיוק כמו שרציתם. אם הכול מאושר, לחצו לאישור העיצוב.",
};

export default function PortalStageActions({
  eventToken,
  stages,
  galleryLink,
  albumDesignUrl,
  twoSongs,
  clipSongs,
  songsWhatsApp,
}: {
  eventToken: string;
  stages: ClientStage[];
  galleryLink: string | null;
  albumDesignUrl: string | null;
  // A wedding: a calm song and an upbeat one for the highlights clip, or one if the client prefers.
  twoSongs: boolean;
  clipSongs: ClipSongs | null;
  // The photographer's phone and what the message names (owner, 2026-10-26): the songs' button
  // saves them and opens WhatsApp to the photographer with the songs and the clip notes. Null
  // without a phone: the button only saves, as before.
  songsWhatsApp: { phone: string; photographerName: string | null; eventName: string; eventDate: string } | null;
}) {
  const [localDone, setLocalDone] = useState<Set<string>>(
    new Set(stages.filter((s) => s.done).map((s) => s.key))
  );
  const t = useT();
  const [submitting, setSubmitting] = useState<string | null>(null);
  // The clip songs (owner, 2026-10-13): written here instead of sent on WhatsApp.
  const [chosen, setChosen] = useState<ClipSongs | null>(clipSongs);
  const [songError, setSongError] = useState<string | null>(null);

  // keepalive: the save goes on while WhatsApp opens (sendSongs).
  const markDone = async (stageKey: string, songs?: ClipSongsInput, keepalive = false) => {
    if (submitting) return;
    setSubmitting(stageKey);
    setSongError(null);
    try {
      const res = await fetch(`/api/portal/${eventToken}/complete-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey, ...(songs ? { songs } : {}) }),
        keepalive,
      });
      if (res.ok) {
        setLocalDone((prev) => new Set(prev).add(stageKey));
        if (songs) {
          const at = new Date().toISOString();
          setChosen(songs.oneSong ? { single: songs.single.trim(), chosenAt: at } : { calm: songs.calm.trim(), upbeat: songs.upbeat.trim(), chosenAt: at });
        }
      } else if (songs) {
        setSongError(t("לא הצלחנו לשמור. נסו שוב."));
      }
    } finally {
      setSubmitting(null);
    }
  };

  // "שמירה ושליחה בוואטסאפ": WhatsApp opens first, inside the tap (iPhone blocks it after a
  // request), with the songs and the notes on the screen; then the songs and a typed notes draft
  // are saved.
  const sendSongs = (stageKey: string, songs: ClipSongsInput) => {
    if (submitting) return;
    if (songsWhatsApp) {
      const notes = clipNotesBridge();
      openWhatsApp(
        songsWhatsApp.phone,
        clipSongsWhatsAppMessage(
          {
            photographerName: songsWhatsApp.photographerName,
            eventName: songsWhatsApp.eventName,
            eventDate: songsWhatsApp.eventDate,
            songs,
            notes: notes?.current() ?? "",
          },
          t
        )
      );
      notes?.flush();
    }
    void markDone(stageKey, songs, !!songsWhatsApp);
  };

  return (
    <div className="space-y-1.5">
      {stages.map(({ key, role, label, isCurrent, approvalOpen = true }) => {
        const done = localDone.has(key);
        const r = role ?? key;
        const explanationHe = EXPLANATIONS[r as StageKey];
        const explanation = explanationHe ? t(explanationHe) : undefined;
        const isSongs = r === "client_song_selection";
        const isClientCompletable = r === "video_approval" || r === "album_approval";
        const isPhotoSelection = r === "client_photo_selection";

        return (
          <div
            key={key}
            className="rounded-xl px-3.5 py-2.5"
            style={{ background: done ? "var(--color-sage-bg)" : isCurrent ? "var(--color-chip-tint)" : "var(--color-chip)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]"
                style={{
                  background: done ? "var(--color-sage)" : "var(--color-input-bg)",
                  border: `1px solid ${done ? "var(--color-sage)" : "var(--color-line)"}`,
                  color: done ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {done ? "✓" : ""}
              </span>
              <span className="text-sm">{label}</span>
            </div>

            {isSongs && done && chosen && (
              <ul className="mt-2 ms-9 space-y-0.5 text-xs text-ink-soft">
                {clipSongLines(chosen).map((l) => (
                  <li key={l.label} className="[overflow-wrap:anywhere]">
                    {t(l.label)}: <span dir="auto">{l.value}</span>
                  </li>
                ))}
              </ul>
            )}

            {isSongs && !done && (
              <div className="mt-2 ms-9">
                <ClipSongsFields
                  twoSongs={twoSongs}
                  submitLabel={(one) => (songsWhatsApp ? t("שמירה ושליחה בוואטסאפ") : one ? t("אישור השיר") : t("אישור השירים"))}
                  submitTone={songsWhatsApp ? "whatsapp" : undefined}
                  busy={submitting === key}
                  error={songError}
                  onSubmit={(songs) => sendSongs(key, songs)}
                />
              </div>
            )}

            {!done && isClientCompletable && !approvalOpen && (
              <p className="mt-2 ms-9 text-xs leading-relaxed text-ink-soft">
                {r === "album_approval"
                  ? t("כשעיצוב האלבום יהיה מוכן, נשלח לכם הודעה ותוכלו לאשר אותו כאן.")
                  : t("כשהסרטון יהיה מוכן, נשלח לכם הודעה ותוכלו לאשר אותו כאן.")}
              </p>
            )}

            {!done && explanation && (!isClientCompletable || approvalOpen) && (
              <div className="mt-2 ms-9 space-y-2">
                <p className="text-xs leading-relaxed text-ink-soft">{explanation}</p>

                {isPhotoSelection && (
                  galleryLink ? (
                    <a
                      href={galleryLink}
                      className="inline-block rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white"
                    >
                      {t("מעבר לגלריה ובחירת תמונות")}
                    </a>
                  ) : (
                    <p className="text-xs text-ink-soft">{t("הגלריה עדיין בהכנה. נשלח לכם הודעה כשהיא תהיה מוכנה")}</p>
                  )
                )}

                {r === "album_approval" && albumDesignUrl && (
                  <a
                    href={albumDesignUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-fit rounded-lg px-3.5 py-2 text-xs font-semibold bg-sage-bg text-sage"
                  >
                    {t("צפייה בעיצוב האלבום")}
                  </a>
                )}

                {r === "album_approval" && !albumDesignUrl && (
                  <p className="text-xs text-ink-soft">
                    {t("עדיין לא הועלה כאן קובץ עיצוב. אם קיבלתם אותו בדרך אחרת (וואטסאפ, מייל וכו') אפשר לאשר גם ככה.")}
                  </p>
                )}

                {isClientCompletable && (
                  <button
                    onClick={() => markDone(key)}
                    disabled={submitting === key}
                    className="block rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60"
                  >
                    {submitting === key ? t("מסמן...") : t("אישרתי, סימון כבוצע")}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
