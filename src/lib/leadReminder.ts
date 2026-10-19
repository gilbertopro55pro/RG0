import { dateLocale, type Lang } from "@/i18n/config";

// "שליחת תזכורת" on the leads page (owner, 2026-10-19): two days after the quote was sent or the
// lead was marked "יצרתי קשר" (leads.quote_sent_at / contacted_at, migration 0186), the lead gets a
// button to send the client a reminder on WhatsApp, SMS, email, or as copied text. After a reminder
// (reminder_sent_at) the button waits another two days. A lead that became an event, or whose
// client approved the quote, or that's marked won or lost, gets none. Shared by the page
// (LeadsView) and nothing server-side, so it's client-safe.

export const LEAD_REMINDER_AFTER_DAYS = 2;

// The lead columns behind it (migration 0186), beside LeadRow: lib/types.ts is part of the PDF
// worker's build, and a change there redeploys it.
export type LeadReminderFields = {
  contacted_at?: string | null;
  reminder_sent_at?: string | null;
  reminder_count?: number;
};

export type LeadReminderLead = {
  name: string;
  status: string;
  phone: string | null;
  email: string | null;
  quoted_amount: number | null;
  quote_sent_at: string | null;
  quote_approved_at: string | null;
  converted_event_id: string | null;
  archived_at: string | null;
  event_date_interest: string | null;
} & LeadReminderFields;

export type LeadReminderKind = "quote" | "contact";

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

// What the reminder is about (the later of the quote and the contact), or null when the lead gets
// no reminder at all.
export function leadReminderKind(lead: LeadReminderLead): LeadReminderKind | null {
  if (lead.converted_event_id || lead.quote_approved_at || lead.archived_at) return null;
  if (lead.status === "won" || lead.status === "lost") return null;
  if (!lead.phone && !lead.email) return null;
  const quote = ms(lead.quote_sent_at);
  const contact = ms(lead.contacted_at);
  if (!Number.isFinite(quote) && !Number.isFinite(contact)) return null;
  return Number.isFinite(quote) && !(contact > quote) ? "quote" : "contact";
}

// When the button shows: two days after the quote or the contact, and two days after the last
// reminder. Null when the lead gets no reminder.
export function leadReminderDueAt(lead: LeadReminderLead): number | null {
  const kind = leadReminderKind(lead);
  if (!kind) return null;
  const from = Math.max(...[ms(lead.quote_sent_at), ms(lead.contacted_at), ms(lead.reminder_sent_at)].filter(Number.isFinite));
  return from + LEAD_REMINDER_AFTER_DAYS * 86_400_000;
}

export function leadReminderDue(lead: LeadReminderLead, now: number): boolean {
  const at = leadReminderDueAt(lead);
  return at !== null && now >= at;
}

const TEXT: Record<Lang, { hi: string; quote: string; quoteLink: string; contact: string; contactOn: string; subjectQuote: string; subjectQuoteOnly: string; subjectContact: string }> = {
  he: {
    hi: "שלום {name},",
    quote: "רציתי לבדוק אם יצא לכם לעבור על הצעת המחיר ששלחתי. אשמח לענות על כל שאלה, ולשריין לכם את התאריך.",
    quoteLink: "להצעת המחיר: {url}",
    contact: "רציתי לחזור אליכם בהמשך לשיחה שלנו. אשמח לשמוע אם יש שאלות, או אם תרצו להתקדם ולשריין את התאריך.",
    contactOn: "רציתי לחזור אליכם בהמשך לשיחה שלנו על האירוע ב-{date}. אשמח לשמוע אם יש שאלות, או אם תרצו להתקדם ולשריין את התאריך.",
    subjectQuote: "הצעת המחיר מ{studio}",
    subjectQuoteOnly: "הצעת המחיר",
    subjectContact: "בהמשך לשיחה שלנו",
  },
  en: {
    hi: "Hi {name},",
    quote: "I wanted to check whether you had a chance to look at the price quote I sent. I'm happy to answer any questions and hold the date for you.",
    quoteLink: "Your quote: {url}",
    contact: "Following up on our conversation. Let me know if you have any questions, or if you'd like to go ahead and book the date.",
    contactOn: "Following up on our conversation about your event on {date}. Let me know if you have any questions, or if you'd like to go ahead and book the date.",
    subjectQuote: "Your price quote from {studio}",
    subjectQuoteOnly: "Your price quote",
    subjectContact: "Following up on our conversation",
  },
  ru: {
    hi: "Здравствуйте, {name}!",
    quote: "Хотели уточнить, удалось ли вам посмотреть ценовое предложение, которое мы отправили. С радостью ответим на вопросы и забронируем для вас дату.",
    quoteLink: "Ваше предложение: {url}",
    contact: "Пишем в продолжение нашего разговора. Будем рады ответить на вопросы, а если вы готовы, забронировать дату.",
    contactOn: "Пишем в продолжение нашего разговора о вашем мероприятии {date}. Будем рады ответить на вопросы, а если вы готовы, забронировать дату.",
    subjectQuote: "Ваше ценовое предложение от {studio}",
    subjectQuoteOnly: "Ваше ценовое предложение",
    subjectContact: "В продолжение нашего разговора",
  },
};

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

// The reminder, in the client's language: the client's first name, one line about the quote (with
// its short link when the quote has a page) or the conversation, then the photographer's signature,
// or their name when they have none (never both, owner 2026-10-19).
export function leadReminderMessage(p: {
  lead: LeadReminderLead;
  kind: LeadReminderKind;
  quoteUrl: string | null;
  signature: string | null | undefined;
  senderName: string | null | undefined;
  lang: Lang;
}): string {
  const tx = TEXT[p.lang];
  const first = p.lead.name.trim().split(/\s+/)[0] || p.lead.name.trim();
  const lines = [fill(tx.hi, { name: first })];
  if (p.kind === "quote") {
    lines.push(tx.quote);
    if (p.quoteUrl) lines.push(fill(tx.quoteLink, { url: p.quoteUrl }));
  } else {
    const date = p.lead.event_date_interest && /^\d{4}-\d{2}-\d{2}/.test(p.lead.event_date_interest)
      ? new Date(`${p.lead.event_date_interest.slice(0, 10)}T12:00:00`).toLocaleDateString(dateLocale(p.lang))
      : null;
    lines.push(date ? fill(tx.contactOn, { date }) : tx.contact);
  }
  const signature = p.signature?.trim() || p.senderName?.trim();
  return signature ? `${lines.join("\n")}\n\n${signature}` : lines.join("\n");
}

export function leadReminderSubject(kind: LeadReminderKind, studio: string | null | undefined, lang: Lang): string {
  const tx = TEXT[lang];
  if (kind === "contact") return tx.subjectContact;
  return studio?.trim() ? fill(tx.subjectQuote, { studio: studio.trim() }) : tx.subjectQuoteOnly;
}

export const LEAD_REMINDER_CHANNELS = ["whatsapp", "sms", "email", "copy"] as const;
export type LeadReminderChannel = (typeof LEAD_REMINDER_CHANNELS)[number];
