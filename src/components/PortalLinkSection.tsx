"use client";

import { useState } from "react";
import { openWhatsApp } from "@/lib/waLink";

export default function PortalLinkSection({
  token,
  eventId,
  clientName,
  clientPhone,
  onSent,
}: {
  token: string;
  eventId: string;
  clientName: string;
  clientPhone: string | null;
  onSent?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const portalLink = () => `${window.location.origin}/portal/${token}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(portalLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Opens the photographer's own WhatsApp with the client's chat pre-filled — see waLink.ts for
  // why this replaced the Meta Business API template send (no approval/verification needed, works
  // today). The photographer still taps send themselves, so this only logs the activity-log entry
  // once they've actually done that — /log-sent just records it, it never touches WhatsApp itself.
  const sendLink = async () => {
    if (sending || !clientPhone) return;
    setSending(true);
    openWhatsApp(clientPhone, `שלום ${clientName},\nהפורטל האישי שלכם מוכן לצפייה בסטטוס האירוע והתשלומים:\n${portalLink()}`);
    await fetch(`/api/events/${eventId}/send-portal-link`, { method: "POST" }).catch(() => {});
    setSent(true);
    setTimeout(() => setSent(false), 2000);
    onSent?.();
    setSending(false);
  };

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">פורטל ללקוח</span>
      </div>
      <p className="text-xs mb-3 text-ink-soft">
        קישור אישי שהלקוח/ה יכולים לפתוח כדי לראות את סטטוס האירוע והתשלומים, בלי צורך להתחבר.
        {clientPhone && " נשלח אוטומטית בוואטסאפ כשהאירוע נסגר. אפשר גם לשלוח שוב בכל שלב."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={copyLink}
          className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
        >
          {copied ? "הקישור הועתק ✓" : "העתקת קישור"}
        </button>
        {clientPhone && (
          <button
            onClick={sendLink}
            disabled={sending}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-60"
          >
            {sending ? "פותח..." : sent ? "נשלח ✓" : "שליחה בוואטסאפ"}
          </button>
        )}
      </div>
    </div>
  );
}
