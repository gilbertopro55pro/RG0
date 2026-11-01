"use client";

import { useState } from "react";
import ClientMessageSheet from "@/components/ClientMessageSheet";
import { useT } from "@/i18n/client";
import type { Lang } from "@/i18n/config";

// Under the song-selection stage on the event page, while the client hasn't chosen yet (owner,
// 2026-11-01): a reminder to the client in ClientMessageSheet, as the album is sent for approval.
// The message is the stage's saved message with the client portal's link (where the songs are
// chosen), built on the tap. The send is recorded as the quick actions' song reminder
// (api/events/[id]/quick-reminder): a line on the event's log, which also holds the daily reminder
// back for 3 days, and the home screen's prompt for it, if waiting, is closed.
export default function ClipSongsReminder({
  eventId,
  stageLabel,
  clientName,
  lang,
  phone,
  email,
  buildMessage,
  onSent,
}: {
  eventId: string;
  stageLabel: string;
  clientName: string | null;
  lang: Lang;
  phone: string | null;
  email: string | null;
  buildMessage: () => string;
  onSent: () => void;
}) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const canSend = !!(phone || email);

  return (
    <div className="border-t border-line px-3.5 py-3 bg-white">
      <button
        type="button"
        onClick={() => setText(buildMessage())}
        disabled={!canSend}
        className="w-full h-10 rounded-lg text-sm font-semibold border border-ink text-ink bg-white disabled:opacity-50"
      >
        {t("שליחת תזכורת ללקוח")}
      </button>
      <p className="text-[11px] text-ink-soft mt-1.5 text-center">
        {canSend ? t("תזכורת לבחור את השירים בפורטל, עם הקישור לפורטל של האירוע.") : t("אין טלפון או מייל ללקוח")}
      </p>
      {text !== null && (
        <ClientMessageSheet
          title={clientName ? t("תזכורת לבחירת שירים ל{name}", { name: clientName }) : t("תזכורת לבחירת שירים לקליפ")}
          intro={t("הלקוח יפתח את הפורטל בקישור ויבחר שם את השירים לקליפ. אפשר לערוך את ההודעה לפני השליחה.")}
          initialText={text}
          lang={lang}
          phone={phone}
          email={email}
          subject={t(stageLabel)}
          onSend={() => {
            void fetch(`/api/events/${eventId}/quick-reminder`, {
              method: "POST",
              keepalive: true,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "songs" }),
            })
              .catch(() => {})
              .then(onSent);
          }}
          onClose={() => setText(null)}
        />
      )}
    </div>
  );
}
