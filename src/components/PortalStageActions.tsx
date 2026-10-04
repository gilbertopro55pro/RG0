"use client";

import { useState } from "react";
import type { StageKey } from "@/lib/stages";
import { useT } from "@/i18n/client";

type ClientStage = {
  key: string;
  // What the stage is (album approval / video approval / song selection), also for custom-package
  // stages named like them (lib/clientReminders.ts stageRole). Falls back to the key.
  role?: string | null;
  label: string;
  done: boolean;
  isCurrent: boolean;
};

const EXPLANATIONS: Partial<Record<StageKey, string>> = {
  client_photo_selection: "היכנסו לגלריה שלכם, סמנו לב ❤️ על כל תמונה שתרצו לכלול, ולחצו על \"סיום בחירה\" בתחתית העמוד. השלב יסומן כבוצע אוטומטית ברגע שתאשרו.",
  client_song_selection: "שלחו לנו בוואטסאפ שיר אחד או שניים לקליפ, שיר שקט ושיר קצבי (שם השיר או קישור). אחרי ששלחתם, לחצו כאן כדי לסמן שסיימתם.",
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
  const t = useT();
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
      {stages.map(({ key, role, label, isCurrent }) => {
        const done = localDone.has(key);
        const r = role ?? key;
        const explanationHe = EXPLANATIONS[r as StageKey];
        const explanation = explanationHe ? t(explanationHe) : undefined;
        const isClientCompletable = r === "client_song_selection" || r === "video_approval" || r === "album_approval";
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

            {!done && explanation && (
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

                {r === "client_song_selection" && whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-fit rounded-lg px-3.5 py-2 text-xs font-semibold bg-sage-bg text-sage"
                  >
                    {t("שליחת שם השיר בוואטסאפ")}
                  </a>
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
