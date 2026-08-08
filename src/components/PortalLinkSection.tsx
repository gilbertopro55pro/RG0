"use client";

import { useState } from "react";

export default function PortalLinkSection({
  token,
  eventId,
  hasClientPhone,
  onSent,
}: {
  token: string;
  eventId: string;
  hasClientPhone: boolean;
  onSent?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyLink = async () => {
    const link = `${window.location.origin}/portal/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendLink = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/send-portal-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בשליחת הקישור");
        return;
      }
      setSent(true);
      setTimeout(() => setSent(false), 2000);
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">פורטל ללקוח</span>
      </div>
      <p className="text-xs mb-3 text-ink-soft">
        קישור אישי שהלקוח/ה יכולים לפתוח כדי לראות את סטטוס האירוע והתשלומים, בלי צורך להתחבר.
        {hasClientPhone && " נשלח אוטומטית בוואטסאפ כשהאירוע נסגר — אפשר גם לשלוח שוב בכל שלב."}
      </p>
      {error && <p className="text-xs mb-2 text-rose">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={copyLink}
          className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
        >
          {copied ? "הקישור הועתק ✓" : "העתקת קישור"}
        </button>
        {hasClientPhone && (
          <button
            onClick={sendLink}
            disabled={sending}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-60"
          >
            {sending ? "שולח..." : sent ? "נשלח ✓" : "שליחה בוואטסאפ"}
          </button>
        )}
      </div>
    </div>
  );
}
