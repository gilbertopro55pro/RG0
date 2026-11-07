"use client";

import { useEffect, useRef, useState } from "react";
import { useModalEntered } from "@/lib/useModalEntered";
import SnoozePicker, { type SnoozeChoice } from "@/components/SnoozePicker";
import { openWhatsApp } from "@/lib/waLink";
import { useLang, useT } from "@/i18n/client";
import { dateLocale, type Lang } from "@/i18n/config";
import ClientMessageSheet, { type ClientMessageChannel } from "@/components/ClientMessageSheet";
import { READ_ONLY_HEADER } from "@/lib/dataChanges";

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
  // Back after "תזכורת" (owner, 2026-10-15).
  reminder?: boolean;
};

// "להזכיר לי מאוחר יותר" on every window (owner, 2026-11-07; the quote follow-up had it since
// 2026-10-15): in an hour, in three hours, or at a date and time of the photographer's choice
// (SnoozePicker). The window comes back then, with a phone notification (lib/reminderSnooze.ts).

// Days after the album-design-ready / full-film-ready message (the album's are the photographer's,
// 1–14), when the client still hasn't approved the album / picked the clip songs
// (lib/clientReminders.ts).
export type PendingClientReminder = {
  type: "album_reminder" | "song_reminder";
  id: string;
  clientName: string;
  // When the message went out (the reminder was scheduled with it).
  sentAt: string;
};

// 1–3 days before the event: the "יום הצילום" message from the client messages settings, ready to
// send (lib/shootDayReminder.ts, owner 2026-10-22). Shown in ClientMessageSheet: edit, send by
// WhatsApp / SMS / email / copy, or cancel.
export type PendingShootDayReminder = {
  type: "shoot_day";
  id: string;
  clientName: string;
  daysUntil: number;
  message: string;
  phone: string;
  email: string | null;
  lang: Lang;
};

// While the clip song-selection stage is the current stage or was left open: the song stage's
// message from the client messages settings, with the portal link where the client writes the
// songs (lib/songStageReminder.ts, owner 2026-10-25). The same window as the shoot day's.
export type PendingSongStageReminder = {
  type: "song_stage";
  id: string;
  clientName: string;
  message: string;
  phone: string;
  email: string | null;
  lang: Lang;
};

type PendingItem =
  | PendingPaymentReminder
  | PendingReviewRequest
  | PendingLeadFollowUp
  | PendingClientReminder
  | PendingShootDayReminder
  | PendingSongStageReminder;

// Puts a window off (lib/reminderSnooze.ts); the photographer's own reminders only (RLS).
function snooze(id: string, when: SnoozeChoice) {
  return fetch(`/api/scheduled-messages/${id}/snooze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(when),
    keepalive: true,
  }).catch(() => null);
}

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
  shootDayReminders = [],
  songStageReminders = [],
}: {
  paymentReminders: PendingPaymentReminder[];
  reviewRequests: PendingReviewRequest[];
  leadFollowUps: PendingLeadFollowUp[];
  clientReminders?: PendingClientReminder[];
  shootDayReminders?: PendingShootDayReminder[];
  songStageReminders?: PendingSongStageReminder[];
}) {
  const t = useT();
  const lang = useLang();
  const [queue, setQueue] = useState<PendingItem[]>([
    ...shootDayReminders,
    ...paymentReminders,
    ...reviewRequests,
    ...leadFollowUps,
    ...clientReminders,
    ...songStageReminders,
  ]);
  // The shoot-day / song-stage window: whether its message went out, so closing it after a send
  // isn't a cancel.
  const windowSent = useRef(false);
  const [busy, setBusy] = useState(false);
  // The WhatsApp message of the prompt on screen, fetched when it shows (dryRun), so the send button
  // opens WhatsApp right in the tap. iPhone blocks opening it after a request, and the reminder was
  // then recorded as sent although WhatsApp never opened (audit 2026-10-13).
  const [preview, setPreview] = useState<{ id: string; phone: string; message: string } | null>(null);
  const entered = useModalEntered();
  const current = queue[0] as PendingItem | undefined;
  // The prompt whose reminder times are showing.
  const [pickingId, setPickingId] = useState<string | null>(null);
  // The shoot-day / song-stage window was put off: closing it isn't a cancel.
  const windowSnoozed = useRef(false);

  const urlFor = (item: PendingItem) =>
    item.type === "shoot_day"
      ? `/api/scheduled-messages/${item.id}/confirm-shoot-day`
      : item.type === "song_stage"
      ? `/api/scheduled-messages/${item.id}/confirm-song-stage`
      : item.type === "payment"
      ? `/api/scheduled-messages/${item.id}/confirm`
      : item.type === "review"
        ? `/api/scheduled-messages/${item.id}/confirm-review`
        : isClientReminder(item)
          ? `/api/scheduled-messages/${item.id}/confirm-client-reminder`
          : `/api/scheduled-messages/${item.id}/confirm-lead-followup`;
  // The answer that sends a message: "not paid yet" for a payment, "send" for the others.
  const sendBody = (item: PendingItem) => (item.type === "payment" ? { paid: false } : { send: true });

  useEffect(() => {
    if (!current || current.type === "shoot_day" || current.type === "song_stage") return;
    let cancelled = false;
    fetch(urlFor(current), {
      method: "POST",
      headers: { "Content-Type": "application/json", [READ_ONLY_HEADER]: "1" },
      body: JSON.stringify({ ...sendBody(current), dryRun: true }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { clientPhone?: string; message?: string } | null) => {
        if (!cancelled && data?.clientPhone && data.message) setPreview({ id: current.id, phone: data.clientPhone, message: data.message });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;

  if (current.type === "shoot_day" || current.type === "song_stage") {
    const record = (body: { send: boolean; channel?: ClientMessageChannel }) =>
      fetch(urlFor(current), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => null);
    const shootDay = current.type === "shoot_day";
    return (
      <ClientMessageSheet
        key={current.id}
        title={shootDay ? t("הודעה לפני יום הצילום") : t("תזכורת לבחירת שירים לקליפ")}
        intro={
          !shootDay
            ? t("{name} עוד לא בחרו שירים לקליפ. זו ההודעה של שלב בחירת השירים מההודעות ללקוח, עם הקישור לפורטל שבו בוחרים. אפשר לערוך אותה לפני השליחה.", {
                name: current.clientName,
              })
            : current.daysUntil === 1
            ? t("מחר הצילום של {name}. זו הודעת יום הצילום מההודעות ללקוח, ואפשר לערוך אותה לפני השליחה.", { name: current.clientName })
            : t("בעוד {days} ימים הצילום של {name}. זו הודעת יום הצילום מההודעות ללקוח, ואפשר לערוך אותה לפני השליחה.", {
                days: current.daysUntil,
                name: current.clientName,
              })
        }
        initialText={current.message}
        lang={current.lang}
        phone={current.phone}
        email={current.email}
        subject={shootDay ? t("יום הצילום") : t("השירים לקליפ")}
        onSend={(channel) => {
          windowSent.current = true;
          void record({ send: true, channel });
        }}
        onRemind={async (when) => {
          windowSnoozed.current = true;
          await snooze(current.id, when);
        }}
        onClose={() => {
          if (!windowSent.current && !windowSnoozed.current) void record({ send: false });
          windowSent.current = false;
          windowSnoozed.current = false;
          setQueue((prev) => prev.slice(1));
        }}
      />
    );
  }

  const respond = async (paidOrSend: boolean) => {
    const sends = current.type === "payment" ? !paidOrSend : paidOrSend;
    const ready = sends && preview?.id === current.id ? preview : null;
    // Opened first, inside the tap; the send is recorded right after.
    if (ready) openWhatsApp(ready.phone, ready.message);
    setBusy(true);
    const body = current.type === "payment" ? { paid: paidOrSend } : { send: paidOrSend };
    const res = await fetch(urlFor(current), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => null);
    if (res?.ok && !ready) {
      const data: { sent: boolean; clientPhone?: string; message?: string } = await res.json();
      if (data.sent && data.clientPhone && data.message) {
        openWhatsApp(data.clientPhone, data.message);
      }
    }
    setBusy(false);
    setQueue((prev) => prev.slice(1));
  };

  const remind = async (when: SnoozeChoice) => {
    setBusy(true);
    await snooze(current.id, when);
    setBusy(false);
    setPickingId(null);
    setQueue((prev) => prev.slice(1));
  };
  // The quick buttons under each window's answers, or the reminder times once tapped.
  const actions = (buttons: React.ReactNode, hint?: string) =>
    pickingId === current.id ? (
      <SnoozePicker busy={busy} hint={hint} onPick={remind} onBack={() => setPickingId(null)} />
    ) : (
      <>
        {buttons}
        <button onClick={() => setPickingId(current.id)} disabled={busy} className="w-full mt-2 h-10 rounded-lg text-sm font-semibold text-ink-soft disabled:opacity-60">
          {t("להזכיר לי מאוחר יותר")}
        </button>
      </>
    );

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
              {withBoldName(t("היתרה של {name} (₪{amount}) שולמה?", { amount: current.balanceAmount.toLocaleString(dateLocale(lang), Number.isInteger(current.balanceAmount) ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }), current.clientName)}
            </p>
            {actions(
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
            )}
          </>
        ) : current.type === "review" ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{t("בקשת ביקורת")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {withBoldName(t("לשלוח ל{name} בקשה להשאיר ביקורת?"), current.clientName)}
            </p>
            {actions(
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
            )}
          </>
        ) : isClientReminder(current) ? (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">
              {current.type === "album_reminder" ? t("תזכורת לאישור עיצוב האלבום") : t("תזכורת לבחירת שירים לקליפ")}
            </h2>
            <p className="text-sm text-ink-soft mb-5">
              {current.type === "album_reminder"
                ? withBoldName(
                    t("שלחת ל{name} את עיצוב האלבום ב-{date}, והוא עוד לא אושר. לשלוח תזכורת בוואטסאפ?", {
                      date: new Date(current.sentAt).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "numeric", timeZone: "Asia/Jerusalem" }),
                    }),
                    current.clientName
                  )
                : withBoldName(t("עברו 3 ימים מאז ששלחת ל{name} שהסרט המלא מוכן, ועוד לא נבחרו שירים לקליפ. לשלוח תזכורת להוריד את הסרט ולבחור שיר שקט ושיר קצבי?"), current.clientName)}
            </p>
            {actions(
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
            )}
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-2 font-display">{current.reminder ? t("תזכורת: מעקב אחרי הצעת מחיר") : t("מעקב אחרי הצעת מחיר")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {withBoldName(t("עברו יומיים מאז ששלחת ל{name} הצעת מחיר של ₪{amount}. לשלוח תזכורת מעקב בוואטסאפ?", { amount: current.quotedAmount }), current.leadName)}
            </p>
            {actions(
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
              </div>,
              t("אם תטפלו בהצעת המחיר לפני כן, התזכורת לא תופיע.")
            )}
          </>
        )}
      </div>
    </div>
  );
}
