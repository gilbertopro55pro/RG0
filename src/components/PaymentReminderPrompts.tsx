"use client";

import { useState } from "react";
import { useModalEntered } from "@/lib/useModalEntered";

export type PendingPaymentReminder = {
  id: string;
  clientName: string;
  balanceAmount: number;
};

export default function PaymentReminderPrompts({ reminders }: { reminders: PendingPaymentReminder[] }) {
  const [queue, setQueue] = useState(reminders);
  const [busy, setBusy] = useState(false);
  const entered = useModalEntered();

  if (queue.length === 0) return null;
  const current = queue[0];

  const respond = async (paid: boolean) => {
    setBusy(true);
    await fetch(`/api/scheduled-messages/${current.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid }),
    });
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
      </div>
    </div>
  );
}
