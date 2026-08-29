"use client";

import { useState } from "react";
import { useModalEntered } from "@/lib/useModalEntered";
import { openWhatsApp } from "@/lib/waLink";

export type PendingPaymentReminder = {
  type: "payment";
  id: string;
  clientName: string;
  balanceAmount: number;
};

export type PendingReviewRequest = {
  type: "review";
  id: string;
  clientName: string;
};

type PendingItem = PendingPaymentReminder | PendingReviewRequest;

// Both kinds are cron-flagged "awaiting_confirmation" rows the photographer must tap through —
// there's no live browser session at cron time to open a wa.me link, so this surfaces them one
// at a time on next dashboard visit instead. Shown as a single shared queue (payment reminders
// first, then review requests) so the two full-screen prompts never stack on top of each other.
export default function PendingClientMessagePrompts({
  paymentReminders,
  reviewRequests,
}: {
  paymentReminders: PendingPaymentReminder[];
  reviewRequests: PendingReviewRequest[];
}) {
  const [queue, setQueue] = useState<PendingItem[]>([...paymentReminders, ...reviewRequests]);
  const [busy, setBusy] = useState(false);
  const entered = useModalEntered();

  if (queue.length === 0) return null;
  const current = queue[0];

  const respond = async (paidOrSend: boolean) => {
    setBusy(true);
    const url =
      current.type === "payment"
        ? `/api/scheduled-messages/${current.id}/confirm`
        : `/api/scheduled-messages/${current.id}/confirm-review`;
    const body = current.type === "payment" ? { paid: paidOrSend } : { send: paidOrSend };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data: { sent: boolean; clientPhone?: string; message?: string } = await res.json();
      if (data.sent && data.clientPhone && data.message) {
        openWhatsApp(data.clientPhone, data.message);
      }
    }
    setBusy(false);
    setQueue((prev) => prev.slice(1));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet">
        {current.type === "payment" ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">תזכורת תשלום 💰</h2>
            <p className="text-sm text-ink-soft mb-5">
              היתרה של <span className="font-semibold text-ink">{current.clientName}</span> (₪
              {current.balanceAmount}) שולמה?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respond(true)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-sage text-white disabled:opacity-60"
              >
                כן, שולם
              </button>
              <button
                onClick={() => respond(false)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                לא, שלח תזכורת
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">בקשת ביקורת ⭐</h2>
            <p className="text-sm text-ink-soft mb-5">
              לשלוח ל<span className="font-semibold text-ink">{current.clientName}</span> בקשה להשאיר ביקורת?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respond(false)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                דלג הפעם
              </button>
              <button
                onClick={() => respond(true)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-sage text-white disabled:opacity-60"
              >
                כן, שלח
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
