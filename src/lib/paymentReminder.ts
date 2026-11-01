import { dateLocale, type Lang } from "@/i18n/config";
import { formatClientMessage } from "@/lib/clientMessageFormat";

// The payment reminder to a client, in the client's language: from the dashboard's open balances
// (owner, 2026-10-19, admin only for now) and from the home screen's prompt
// (api/scheduled-messages/[id]/confirm). The amount actually still open (deposit and balance, after
// partial payments, lib/openBalances.ts), the portal link, and the photographer's signature, or
// their name without one. Plain, without "תזכורת ידידותית" (owner: it sounds apologetic).
// Client-safe: built on the tap that opens WhatsApp.

export const PAYMENT_REMINDER_CHANNELS = ["whatsapp", "sms", "email", "copy"] as const;
export type PaymentReminderChannel = (typeof PAYMENT_REMINDER_CHANNELS)[number];

// The event log line of a reminder (event_notifications), which the dashboard also reads back.
export const PAYMENT_REMINDER_LOG_MARK = "תזכורת תשלום";

const TEXT: Record<Lang, { body: string; subject: string }> = {
  he: {
    body: "רצינו לעדכן שנותרה יתרה של {amount} לתשלום עבור האירוע.\nאת פרטי התשלום אפשר לראות בפורטל האישי שלכם.",
    subject: "תזכורת תשלום",
  },
  en: {
    body: "We wanted to let you know that a balance of {amount} remains for your event.\nYou can see the payment details in your personal portal.",
    subject: "Payment reminder",
  },
  ru: {
    body: "Хотим сообщить, что по вашему мероприятию остаётся к оплате {amount}.\nПодробности оплаты — в вашем личном кабинете.",
    subject: "Напоминание об оплате",
  },
};

export function paymentReminderMessage(p: {
  clientName: string;
  amount: number;
  portalUrl: string;
  signature: string | null | undefined;
  senderName: string | null | undefined;
  lang: Lang;
}): string {
  // Agorot, when there are any, always as two digits (₪1,234.50, not ₪1,234.5).
  const amount = `₪${p.amount.toLocaleString(dateLocale(p.lang), Number.isInteger(p.amount) ? undefined : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // The shape of every client message (lib/clientMessageFormat.ts).
  return formatClientMessage({ lang: p.lang, name: p.clientName, body: TEXT[p.lang].body.replace("{amount}", amount), link: p.portalUrl, signature: p.signature, senderName: p.senderName });
}

export function paymentReminderSubject(lang: Lang): string {
  return TEXT[lang].subject;
}
