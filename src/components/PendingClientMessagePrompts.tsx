"use client";

import { useState } from "react";
import { useModalEntered } from "@/lib/useModalEntered";
import { openWhatsApp } from "@/lib/waLink";
import { useT } from "@/i18n/client";

// A translated sentence with the client/lead name in bold: the {name} placeholder is left in by
// t() (it isn't in vars) and swapped for the bold span here.
function withBoldName(text: string, name: string) {
  const [before, after = ""] = text.split("{name}");
  return (
    <>
      {before}
      <span className="font-semibold text-ink">{name}</span>
      {after}
    </>
  );
}

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

export type PendingLeadFollowUp = {
  type: "lead_followup";
  id: string;
  leadName: string;
  quotedAmount: number;
};

// 3 days after the album-design-ready / full-film-ready message, when the client still hasn't
// approved the album / picked the clip songs (lib/clientReminders.ts).
export type PendingClientReminder = {
  type: "album_reminder" | "song_reminder";
  id: string;
  clientName: string;
};

type PendingItem = PendingPaymentReminder | PendingReviewRequest | PendingLeadFollowUp | PendingClientReminder;

function isClientReminder(item: PendingItem): item is PendingClientReminder {
  return item.type === "album_reminder" || item.type === "song_reminder";
}

// All three kinds are cron-flagged "awaiting_confirmation" rows the photographer must tap
// through — there's no live browser session at cron time to open a wa.me link, so this surfaces
// them one at a time on next dashboard visit instead. Shown as a single shared queue (payment
// reminders, then review requests, then lead follow-ups) so the prompts never stack on top of
// each other.
export default function PendingClientMessagePrompts({
  paymentReminders,
  reviewRequests,
  leadFollowUps,
  clientReminders = [],
}: {
  paymentReminders: PendingPaymentReminder[];
  reviewRequests: PendingReviewRequest[];
  leadFollowUps: PendingLeadFollowUp[];
  clientReminders?: PendingClientReminder[];
}) {
  const t = useT();
  const [queue, setQueue] = useState<PendingItem[]>([...paymentReminders, ...reviewRequests, ...leadFollowUps, ...clientReminders]);
  const [busy, setBusy] = useState(false);
  const entered = useModalEntered();

  if (queue.length === 0) return null;
  const current = queue[0];

  const respond = async (paidOrSend: boolean) => {
    setBusy(true);
    const url =
      current.type === "payment"
        ? `/api/scheduled-messages/${current.id}/confirm`
        : current.type === "review"
          ? `/api/scheduled-messages/${current.id}/confirm-review`
          : isClientReminder(current)
            ? `/api/scheduled-messages/${current.id}/confirm-client-reminder`
            : `/api/scheduled-messages/${current.id}/confirm-lead-followup`;
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(28, 27, 25, 0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet">
        {current.type === "payment" ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{t("תזכורת תשלום")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {withBoldName(t("היתרה של {name} (₪{amount}) שולמה?", { amount: current.balanceAmount }), current.clientName)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respond(true)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-sage text-white disabled:opacity-60"
              >
                {t("כן, שולם")}
              </button>
              <button
                onClick={() => respond(false)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {t("לא, שלח תזכורת")}
              </button>
            </div>
          </>
        ) : current.type === "review" ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{t("בקשת ביקורת")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {withBoldName(t("לשלוח ל{name} בקשה להשאיר ביקורת?"), current.clientName)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respond(false)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {t("דלג הפעם")}
              </button>
              <button
                onClick={() => respond(true)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-sage text-white disabled:opacity-60"
              >
                {t("כן, שלח")}
              </button>
            </div>
          </>
        ) : isClientReminder(current) ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">
              {current.type === "album_reminder" ? t("תזכורת לאישור עיצוב האלבום") : t("תזכורת לבחירת שירים לקליפ")}
            </h2>
            <p className="text-sm text-ink-soft mb-5">
              {current.type === "album_reminder"
                ? withBoldName(t("עברו 3 ימים מאז ששלחת ל{name} את עיצוב האלבום, והוא עוד לא אושר בפורטל. לשלוח תזכורת בוואטסאפ?"), current.clientName)
                : withBoldName(t("עברו 3 ימים מאז ששלחת ל{name} שהסרט המלא מוכן, ועוד לא נבחרו שירים לקליפ. לשלוח תזכורת להוריד את הסרט ולבחור שיר שקט ושיר קצבי?"), current.clientName)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respond(false)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {t("דלג הפעם")}
              </button>
              <button
                onClick={() => respond(true)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-sage text-white disabled:opacity-60"
              >
                {t("שליחה בוואטסאפ")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{t("מעקב אחרי הצעת מחיר")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {withBoldName(t("עברו יומיים מאז ששלחת ל{name} הצעת מחיר של ₪{amount}. לשלוח תזכורת מעקב בוואטסאפ?", { amount: current.quotedAmount }), current.leadName)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => respond(false)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {t("דלג הפעם")}
              </button>
              <button
                onClick={() => respond(true)}
                disabled={busy}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-sage text-white disabled:opacity-60"
              >
                {t("שליחה בוואטסאפ")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
