"use client";

import { useState } from "react";

// Shared across every "an update to the client is due" spot — event stage checkpoints, a new
// booking's confirmation screen, a gallery publish/upload confirmation. `onSend` does the actual
// work (opening wa.me + logging); this component only owns the pending/sent visual states.
export default function SendUpdateButton({
  onSend,
  pending,
  label = "שליחת עדכון ללקוח בוואטסאפ",
}: {
  onSend: () => void;
  pending: boolean;
  label?: string;
}) {
  const [sent, setSent] = useState(false);
  return (
    <button
      // `disabled={pending}` is the real guard against a duplicate WhatsApp send from a rapid
      // double-tap — it's driven by the actual fetch still being in flight, not just a cosmetic
      // timer. `sent` below is purely the "✓ sent" flash after it resolves.
      disabled={pending}
      onClick={() => {
        onSend();
        setSent(true);
        setTimeout(() => setSent(false), 2000);
      }}
      className={`whatsapp-update-btn w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2.5 disabled:opacity-60${sent ? " whatsapp-update-btn--sent" : ""}`}
      style={{ background: sent ? "var(--color-sage)" : "#fff", color: sent ? "#fff" : "var(--color-sage)" }}
    >
      {pending ? "שולח..." : sent ? "העדכון נשלח ✓" : label}
    </button>
  );
}
