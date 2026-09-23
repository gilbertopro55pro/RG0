"use client";

import { useState } from "react";
import type { StageKey } from "@/lib/stages";

type ClientStage = {
  key: string;
  label: string;
  done: boolean;
  isCurrent: boolean;
};

const EXPLANATIONS: Partial<Record<StageKey, string>> = {
  client_photo_selection: "היכנסו לגלריה שלכם, סמנו לב ❤️ על כל תמונה שתרצו לכלול, ולחצו על \"סיום בחירה\" בתחתית העמוד. השלב יסומן כבוצע אוטומטית ברגע שתאשרו.",
  client_song_selection: "שלחו לנו בוואטסאפ את שם השיר או קישור אליו. זה השיר שילווה את הקליפ שלכם. אחרי ששלחתם, לחצו כאן כדי לסמן שסיימתם.",
  video_approval: "צפו בסרטון שנשלח אליכם. אם הכול נראה מעולה, לחצו לאישור ונמשיך משם לשלב הבא.",
  album_approval: "צפו בעיצוב האלבום ווודאו שהכול נראה בדיוק כמו שרציתם. אם הכול מאושר, לחצו לאישור העיצוב.",
};

export default function PortalStageActions({
  eventToken,
  stages,
  galleryLink,
  albumDesignUrl,
  whatsappLink,
}: {
  eventToken: string;
  stages: ClientStage[];
  galleryLink: string | null;
  albumDesignUrl: string | null;
  whatsappLink: string | null;
}) {
  const [localDone, setLocalDone] = useState<Set<string>>(
    new Set(stages.filter((s) => s.done).map((s) => s.key))
  );
  const [submitting, setSubmitting] = useState<string | null>(null);

  const markDone = async (stageKey: string) => {
    if (submitting) return;
    setSubmitting(stageKey);
    try {
      const res = await fetch(`/api/portal/${eventToken}/complete-stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey }),
      });
      if (res.ok) {
        setLocalDone((prev) => new Set(prev).add(stageKey));
      }
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-1.5">
      {stages.map(({ key, label, isCurrent }) => {
        const done = localDone.has(key);
        const explanation = EXPLANATIONS[key as StageKey];
        const isClientCompletable = key === "client_song_selection" || key === "video_approval" || key === "album_approval";
        const isPhotoSelection = key === "client_photo_selection";

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
                  background: done ? "var(--color-sage)" : "#fff",
                  border: `1px solid ${done ? "var(--color-sage)" : "var(--color-line)"}`,
                  color: done ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {done ? "✓" : ""}
              </span>
              <span className="text-sm">{label}</span>
            </div>

            {!done && explanation && (
              <div className="mt-2 mr-9 space-y-2">
                <p className="text-xs leading-relaxed text-ink-soft">{explanation}</p>

                {isPhotoSelection && (
                  galleryLink ? (
                    <a
                      href={galleryLink}
                      className="inline-block rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white"
                    >
                      מעבר לגלריה ובחירת תמונות
                    </a>
                  ) : (
                    <p className="text-xs text-ink-soft">הגלריה עדיין בהכנה. נשלח לכם הודעה כשהיא תהיה מוכנה</p>
                  )
                )}

                {key === "client_song_selection" && whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-fit rounded-lg px-3.5 py-2 text-xs font-semibold bg-sage-bg text-sage"
                  >
                    שליחת שם השיר בוואטסאפ
                  </a>
                )}

                {key === "album_approval" && albumDesignUrl && (
                  <a
                    href={albumDesignUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-fit rounded-lg px-3.5 py-2 text-xs font-semibold bg-sage-bg text-sage"
                  >
                    צפייה בעיצוב האלבום
                  </a>
                )}

                {key === "album_approval" && !albumDesignUrl && (
                  <p className="text-xs text-ink-soft">
                    עדיין לא הועלה כאן קובץ עיצוב. אם קיבלתם אותו בדרך אחרת (וואטסאפ, מייל וכו') אפשר לאשר גם ככה.
                  </p>
                )}

                {isClientCompletable && (
                  <button
                    onClick={() => markDone(key)}
                    disabled={submitting === key}
                    className="block rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60"
                  >
                    {submitting === key ? "מסמן..." : "אישרתי, סימון כבוצע"}
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
