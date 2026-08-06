"use client";

import { useState } from "react";

export default function PortalLinkSection({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const link = `${window.location.origin}/portal/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">פורטל ללקוח</span>
      </div>
      <p className="text-xs mb-3 text-ink-soft">
        קישור אישי שהלקוח/ה יכולים לפתוח כדי לראות את סטטוס האירוע והתשלומים, בלי צורך להתחבר.
      </p>
      <button
        onClick={copyLink}
        className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
      >
        {copied ? "הקישור הועתק ✓" : "העתקת קישור לפורטל הלקוח"}
      </button>
    </div>
  );
}
