import { dateLocale, type Lang } from "@/i18n/config";

// "תזכורת תשלום" from the dashboard's open balances (owner, 2026-10-19, admin only for now): the
// reminder for one client, in the client's language. The wording is the home screen's payment
// reminder (api/scheduled-messages/[id]/confirm), with the amount actually still open (deposit and
// balance, after partial payments) and the photographer's signature, or their name without one.
// Client-safe: built on the tap that opens WhatsApp.

export const PAYMENT_REMINDER_CHANNELS = ["whatsapp", "sms", "email", "copy"] as const;
export type PaymentReminderChannel = (typeof PAYMENT_REMINDER_CHANNELS)[number];

// The event log line of a reminder (event_notifications), which the dashboard also reads back.
export const PAYMENT_REMINDER_LOG_MARK = "תזכורת תשלום";

const TEXT: Record<Lang, { body: string; subject: string }> = {
  he: {
    body: "שלום {name},\nתזכורת ידידותית, נשארה יתרה של {amount} לתשלום עבור האירוע שלכם.\n\nלצפייה בפרטי התשלום ניתן להיכנס לפורטל האישי שלכם:\n{link}",
    subject: "תזכורת תשלום",
  },
  en: {
    body: "Hi {name},\nA friendly reminder: a balance of {amount} is still due for your event.\n\nYou can see the payment details in your personal portal:\n{link}",
    subject: "Payment reminder",
  },
  ru: {
    body: "Здравствуйте, {name}!\nДружеское напоминание: по вашему мероприятию остаётся к оплате {amount}.\n\nПодробности оплаты — в вашем личном кабинете:\n{link}",
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
  const amount = `₪${p.amount.toLocaleString(dateLocale(p.lang))}`;
  const body = TEXT[p.lang].body.replace("{name}", p.clientName.trim()).replace("{amount}", amount).replace("{link}", p.portalUrl);
  const signature = p.signature?.trim() || p.senderName?.trim();
  return signature ? `${body}\n\n${signature}` : body;
}

export function paymentReminderSubject(lang: Lang): string {
  return TEXT[lang].subject;
}
