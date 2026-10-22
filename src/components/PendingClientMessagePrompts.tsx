"use client";

import { useEffect, useRef, useState } from "react";
import { useModalEntered } from "@/lib/useModalEntered";
import ReminderDateTimeField from "@/components/ReminderDateTimeField";
import { openWhatsApp } from "@/lib/waLink";
import { useLang, useT } from "@/i18n/client";
import { dateLocale, type Lang } from "@/i18n/config";
import ClientMessageSheet, { type ClientMessageChannel } from "@/components/ClientMessageSheet";

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

// "תזכורת" on the quote follow-up, as on the new-lead popup (AssistantLeadPopup): the prompt comes
// back then, with a phone notification, unless the lead is handled by hand before that. Besides
// the two quick times, a date and time of the photographer's choice (owner, 2026-10-15).
const REMIND_OPTIONS = [
  { minutes: 30, label: "30 דקות" },
  { minutes: 60, label: "שעה" },
];

// "2026-10-16T10:00" in the device's own time zone, for a datetime-local field.
function localInputValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 3 days after the album-design-ready / full-film-ready message, when the client still hasn't
// approved the album / picked the clip songs (lib/clientReminders.ts).
export type PendingClientReminder = {
  type: "album_reminder" | "song_reminder";
  id: string;
  clientName: string;
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

type PendingItem = PendingPaymentReminder | PendingReviewRequest | PendingLeadFollowUp | PendingClientReminder | PendingShootDayReminder;

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
}: {
  paymentReminders: PendingPaymentReminder[];
  reviewRequests: PendingReviewRequest[];
  leadFollowUps: PendingLeadFollowUp[];
  clientReminders?: PendingClientReminder[];
  shootDayReminders?: PendingShootDayReminder[];
}) {
  const t = useT();
  const lang = useLang();
  const [queue, setQueue] = useState<PendingItem[]>([...shootDayReminders, ...paymentReminders, ...reviewRequests, ...leadFollowUps, ...clientReminders]);
  // The shoot-day window: whether its message went out, so closing it after a send isn't a cancel.
  const shootDaySent = useRef(false);
  const [busy, setBusy] = useState(false);
  // The WhatsApp message of the prompt on screen, fetched when it shows (dryRun), so the send button
  // opens WhatsApp right in the tap. iPhone blocks opening it after a request, and the reminder was
  // then recorded as sent although WhatsApp never opened (audit 2026-10-13).
  const [preview, setPreview] = useState<{ id: string; phone: string; message: string } | null>(null);
  const entered = useModalEntered();
  const current = queue[0] as PendingItem | undefined;
  // The prompt whose reminder times are showing, and the date and time being picked (with its
  // earliest value) when the photographer chose their own.
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ value: string; min: string; error: boolean } | null>(null);

  const urlFor = (item: PendingItem) =>
    item.type === "shoot_day"
      ? `/api/scheduled-messages/${item.id}/confirm-shoot-day`
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
    if (!current || current.type === "shoot_day") return;
    let cancelled = false;
    fetch(urlFor(current), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  if (current.type === "shoot_day") {
    const record = (body: { send: boolean; channel?: ClientMessageChannel }) =>
      fetch(urlFor(current), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => null);
    return (
      <ClientMessageSheet
        key={current.id}
        title={t("הודעה לפני יום הצילום")}
        intro={
          current.daysUntil === 1
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
        subject={t("יום הצילום")}
        onSend={(channel) => {
          shootDaySent.current = true;
          void record({ send: true, channel });
        }}
        onClose={() => {
          if (!shootDaySent.current) void record({ send: false });
          shootDaySent.current = false;
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

  const remind = async (when: { remindMinutes: number } | { remindAt: string }) => {
    setBusy(true);
    await fetch(urlFor(current), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(when),
      keepalive: true,
    }).catch(() => null);
    setBusy(false);
    setPickingId(null);
    setCustom(null);
    setQueue((prev) => prev.slice(1));
  };
  // Own date and time: tomorrow at 10:00 to start from, never in the past.
  const openCustom = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    setCustom({ value: localInputValue(start), min: localInputValue(now), error: false });
  };
  const remindAtCustom = () => {
    if (!custom) return;
    const at = new Date(custom.value);
    if (Number.isNaN(at.getTime()) || at.getTime() < new Date().getTime() + 60_000) {
      setCustom({ ...custom, error: true });
      return;
    }
    remind({ remindAt: at.toISOString() });
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
              {withBoldName(t("היתרה של {name} (₪{amount}) שולמה?", { amount: current.balanceAmount.toLocaleString(dateLocale(lang), Number.isInteger(current.balanceAmount) ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }), current.clientName)}
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
            <h2 className="text-lg font-bold mb-2 font-display">{current.reminder ? t("תזכורת: מעקב אחרי הצעת מחיר") : t("מעקב אחרי הצעת מחיר")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {withBoldName(t("עברו יומיים מאז ששלחת ל{name} הצעת מחיר של ₪{amount}. לשלוח תזכורת מעקב בוואטסאפ?", { amount: current.quotedAmount }), current.leadName)}
            </p>
            {pickingId === current.id ? (
              <div>
                <p className="text-sm font-semibold mb-2">{t("מתי להזכיר לך?")}</p>
                <div className="flex gap-2">
                  {REMIND_OPTIONS.map((o) => (
                    <button
                      key={o.minutes}
                      onClick={() => remind({ remindMinutes: o.minutes })}
                      disabled={busy}
                      className="flex-1 rounded-lg py-3 text-sm font-semibold border border-line bg-white text-ink disabled:opacity-60"
                    >
                      {t(o.label)}
                    </button>
                  ))}
                  <button
                    onClick={openCustom}
                    disabled={busy}
                    className={`flex-1 rounded-lg py-3 text-sm font-semibold border disabled:opacity-60 ${custom ? "border-amber-deep bg-amber-bg text-ink" : "border-line bg-white text-ink"}`}
                  >
                    {t("תאריך ושעה")}
                  </button>
                </div>
                {custom && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <ReminderDateTimeField
                      value={custom.value}
                      min={custom.min}
                      onChange={(v) => setCustom({ ...custom, value: v, error: false })}
                      ariaLabel={t("תאריך ושעה")}
                      className="sm:flex-1 min-w-0"
                    />
                    <button onClick={remindAtCustom} disabled={busy || !custom.value} className="rounded-lg h-11 px-4 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                      {t("קביעת התזכורת")}
                    </button>
                  </div>
                )}
                {custom?.error && <p className="text-xs text-rose mt-1.5">{t("בחרו תאריך ושעה שעוד לא עברו.")}</p>}
                <p className="text-xs text-ink-soft mt-2">{t("אם תטפלו בהצעת המחיר לפני כן, התזכורת לא תופיע.")}</p>
                <button
                  onClick={() => {
                    setPickingId(null);
                    setCustom(null);
                  }}
                  className="mt-2 text-xs font-semibold underline text-ink-soft"
                >
                  {t("חזרה")}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => respond(false)}
                  disabled={busy}
                  className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                >
                  {t("דלג הפעם")}
                </button>
                <button
                  onClick={() => setPickingId(current.id)}
                  disabled={busy}
                  className="rounded-lg py-3 px-4 text-sm font-semibold border border-line bg-white text-ink disabled:opacity-60"
                >
                  {t("תזכורת")}
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
        )}
      </div>
    </div>
  );
}
