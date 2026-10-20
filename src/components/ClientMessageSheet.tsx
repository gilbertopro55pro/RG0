"use client";

import { useState, type ReactNode } from "react";
import BodyPortal from "@/components/BodyPortal";
import { useT } from "@/i18n/client";
import type { Lang } from "@/i18n/config";
import { buildWaMeLink } from "@/lib/waLink";

export type ClientMessageChannel = "whatsapp" | "sms" | "email" | "copy";

// A message to a client, ready and editable, and the ways to send it: WhatsApp, SMS, email (when
// there's an address) or copied text. Each one opens on the tap itself (iPhone blocks opening an app
// after waiting on the server), and `onSend` records it on the way out. Shared by the lead reminder
// (LeadsView) and the payment reminder (AnalyticsView).
export default function ClientMessageSheet({
  title,
  intro,
  initialText,
  lang,
  phone,
  email,
  subject,
  onSend,
  onClose,
}: {
  title: string;
  intro: ReactNode;
  initialText: string;
  // The client's language: the message's direction.
  lang: Lang;
  phone: string | null;
  email: string | null;
  subject: string;
  onSend: (channel: ClientMessageChannel) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const sendVia = (channel: ClientMessageChannel) => () => {
    onSend(channel);
    onClose();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    onSend("copy");
    setTimeout(onClose, 900);
  };
  const btn = "h-11 rounded-xl text-sm font-semibold flex items-center justify-center";

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        style={{ background: "rgba(28, 27, 25, 0.45)" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={onClose}
      >
        <div className="w-full max-w-sm max-h-[calc(100dvh-2rem)] flex flex-col rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold font-display">{title}</h2>
          <p className="text-sm text-ink-soft mt-1 mb-3">{intro}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir={lang === "he" ? "rtl" : "ltr"}
            rows={9}
            aria-label={t("הודעת התזכורת")}
            className="min-h-0 w-full rounded-2xl bg-white border border-line px-3.5 py-3 text-[13px] leading-relaxed mb-4 resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            {phone && (
              <a href={buildWaMeLink(phone, text)} target="_blank" rel="noopener noreferrer" onClick={sendVia("whatsapp")} className={`${btn} col-span-2 bg-sage text-white`}>
                {t("וואטסאפ")}
              </a>
            )}
            {phone && (
              <a href={`sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`} onClick={sendVia("sms")} className={`${btn} bg-white border border-line text-ink`}>
                {t("הודעת SMS")}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}
                onClick={sendVia("email")}
                className={`${btn} bg-white border border-line text-ink`}
              >
                {t("מייל")}
              </a>
            )}
            <button onClick={copy} className={`${btn} bg-white border border-line text-ink ${phone && email ? "col-span-2" : ""}`}>
              {copied ? t("ההודעה הועתקה ✓") : t("העתקת ההודעה")}
            </button>
          </div>
          <button onClick={onClose} className="h-10 mt-2 rounded-xl text-sm font-semibold text-ink-soft">
            {t("ביטול")}
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}
