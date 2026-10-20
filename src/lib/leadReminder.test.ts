import { describe, expect, it } from "vitest";
import {
  LEAD_REMINDER_AFTER_DAYS,
  LEAD_REMINDER_CHANNELS,
  leadReminderDue,
  leadReminderDueAt,
  leadReminderKind,
  leadReminderMessage,
  leadReminderSubject,
  type LeadReminderLead,
} from "@/lib/leadReminder";

const H = 3_600_000;
const DAY = 24 * H;

const lead = (over: Partial<LeadReminderLead> = {}): LeadReminderLead => ({
  name: "Dana Levi",
  status: "quoted",
  phone: "050-1234567",
  email: null,
  quoted_amount: 5000,
  quote_sent_at: null,
  quote_approved_at: null,
  converted_event_id: null,
  archived_at: null,
  event_date_interest: null,
  contacted_at: null,
  reminder_sent_at: null,
  reminder_count: 0,
  ...over,
});

const QUOTE_AT = "2026-10-15T09:00:00.000Z";
const CONTACT_AT = "2026-10-16T18:30:00.000Z";

describe("leadReminderKind", () => {
  it("is about the quote when only a quote was sent", () => {
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT }))).toBe("quote");
  });

  it("is about the conversation when only a contact was marked", () => {
    expect(leadReminderKind(lead({ status: "contacted", contacted_at: CONTACT_AT }))).toBe("contact");
  });

  it("follows the later of the two", () => {
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT, contacted_at: CONTACT_AT }))).toBe("contact");
    expect(leadReminderKind(lead({ quote_sent_at: CONTACT_AT, contacted_at: QUOTE_AT }))).toBe("quote");
  });

  it("prefers the quote when both happened at the same moment", () => {
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT, contacted_at: QUOTE_AT }))).toBe("quote");
  });

  it("is null before anything was sent or marked", () => {
    expect(leadReminderKind(lead())).toBeNull();
    expect(leadReminderKind(lead({ quote_sent_at: "not a date" }))).toBeNull();
  });

  it("is null for a lead that became an event, was approved, won, lost or archived", () => {
    const sent = { quote_sent_at: QUOTE_AT, contacted_at: CONTACT_AT };
    expect(leadReminderKind(lead({ ...sent, converted_event_id: "ev1" }))).toBeNull();
    expect(leadReminderKind(lead({ ...sent, quote_approved_at: "2026-10-16T10:00:00Z" }))).toBeNull();
    expect(leadReminderKind(lead({ ...sent, status: "won" }))).toBeNull();
    expect(leadReminderKind(lead({ ...sent, status: "lost" }))).toBeNull();
    expect(leadReminderKind(lead({ ...sent, archived_at: "2026-10-17T00:00:00Z" }))).toBeNull();
  });

  it("is null with no phone and no email, and works with either one", () => {
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT, phone: null, email: null }))).toBeNull();
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT, phone: "", email: "" }))).toBeNull();
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT, phone: null, email: "dana@example.com" }))).toBe("quote");
    expect(leadReminderKind(lead({ quote_sent_at: QUOTE_AT, phone: "0501234567", email: null }))).toBe("quote");
  });
});

describe("leadReminderDueAt / leadReminderDue", () => {
  it("waits two days", () => {
    expect(LEAD_REMINDER_AFTER_DAYS).toBe(2);
  });

  it("is due exactly 48 hours after the quote, not a millisecond before", () => {
    const l = lead({ quote_sent_at: QUOTE_AT });
    const due = Date.parse(QUOTE_AT) + 2 * DAY;
    expect(leadReminderDueAt(l)).toBe(due);
    expect(leadReminderDue(l, due - 1)).toBe(false);
    expect(leadReminderDue(l, due)).toBe(true);
    expect(leadReminderDue(l, due + 5 * DAY)).toBe(true);
  });

  it("counts from the later of the quote and the contact", () => {
    const l = lead({ quote_sent_at: QUOTE_AT, contacted_at: CONTACT_AT });
    expect(leadReminderDueAt(l)).toBe(Date.parse(CONTACT_AT) + 2 * DAY);
    // Two days after the quote but not yet two days after the contact.
    expect(leadReminderDue(l, Date.parse(QUOTE_AT) + 2 * DAY + H)).toBe(false);
  });

  it("waits another two days after a reminder was sent", () => {
    const sentAt = "2026-10-18T12:00:00.000Z";
    const l = lead({ quote_sent_at: QUOTE_AT, reminder_sent_at: sentAt, reminder_count: 1 });
    expect(leadReminderDueAt(l)).toBe(Date.parse(sentAt) + 2 * DAY);
    expect(leadReminderDue(l, Date.parse(sentAt) + 2 * DAY - 1)).toBe(false);
    expect(leadReminderDue(l, Date.parse(sentAt) + 2 * DAY)).toBe(true);
  });

  it("counts from a new quote sent after the last reminder", () => {
    const newQuote = "2026-10-19T08:00:00.000Z";
    const l = lead({ quote_sent_at: newQuote, reminder_sent_at: "2026-10-18T12:00:00.000Z" });
    expect(leadReminderDueAt(l)).toBe(Date.parse(newQuote) + 2 * DAY);
  });

  it("is 48 real hours across the end of Israel daylight time (2026-10-25)", () => {
    // Sent at 23:30 Israel summer time on Oct 24; due at 22:30 Israel winter time on Oct 26.
    const l = lead({ quote_sent_at: "2026-10-24T20:30:00.000Z" });
    expect(new Date(leadReminderDueAt(l)!).toISOString()).toBe("2026-10-26T20:30:00.000Z");
  });

  it("is never due for a lead that gets no reminder", () => {
    const far = Date.parse(QUOTE_AT) + 365 * DAY;
    for (const l of [
      lead(),
      lead({ quote_sent_at: QUOTE_AT, status: "won" }),
      lead({ quote_sent_at: QUOTE_AT, status: "lost" }),
      lead({ quote_sent_at: QUOTE_AT, converted_event_id: "ev1" }),
      lead({ quote_sent_at: QUOTE_AT, quote_approved_at: QUOTE_AT }),
      lead({ quote_sent_at: QUOTE_AT, archived_at: QUOTE_AT }),
      lead({ quote_sent_at: QUOTE_AT, phone: null, email: null }),
    ]) {
      expect(leadReminderDueAt(l)).toBeNull();
      expect(leadReminderDue(l, far)).toBe(false);
    }
  });
});

describe("leadReminderMessage", () => {
  const base = { quoteUrl: null, signature: null, senderName: null, lang: "he" as const };

  it("greets by first name and asks about the quote, with its link", () => {
    expect(
      leadReminderMessage({ ...base, lead: lead({ name: "  Dana   Levi " }), kind: "quote", quoteUrl: "https://myframeflow.com/s/q00000000001" }),
    ).toBe(
      "שלום Dana,\n" +
        "רציתי לבדוק אם יצא לכם לעבור על הצעת המחיר ששלחתי. אשמח לענות על כל שאלה, ולשריין לכם את התאריך.\n" +
        "להצעת המחיר: https://myframeflow.com/s/q00000000001",
    );
  });

  it("leaves out the link line when there's no quote page", () => {
    const text = leadReminderMessage({ ...base, lead: lead(), kind: "quote" });
    expect(text).not.toContain("להצעת המחיר");
    expect(text.split("\n")).toHaveLength(2);
  });

  it("keeps a one-word name as is", () => {
    expect(leadReminderMessage({ ...base, lead: lead({ name: "דנה" }), kind: "quote" }).split("\n")[0]).toBe("שלום דנה,");
  });

  it("follows up on the conversation, with the event date when known", () => {
    expect(leadReminderMessage({ ...base, lead: lead(), kind: "contact" })).toBe(
      "שלום Dana,\nרציתי לחזור אליכם בהמשך לשיחה שלנו. אשמח לשמוע אם יש שאלות, או אם תרצו להתקדם ולשריין את התאריך.",
    );
    expect(leadReminderMessage({ ...base, lead: lead({ event_date_interest: "2026-12-03" }), kind: "contact" })).toBe(
      "שלום Dana,\nרציתי לחזור אליכם בהמשך לשיחה שלנו על האירוע ב-3.12.2026. אשמח לשמוע אם יש שאלות, או אם תרצו להתקדם ולשריין את התאריך.",
    );
  });

  it("reads a date with a time part, and ignores a value that isn't a date", () => {
    expect(leadReminderMessage({ ...base, lead: lead({ event_date_interest: "2026-12-03T00:00:00+02:00" }), kind: "contact" })).toContain("ב-3.12.2026");
    const free = leadReminderMessage({ ...base, lead: lead({ event_date_interest: "next summer" }), kind: "contact" });
    expect(free).toContain("בהמשך לשיחה שלנו. ");
    expect(free).not.toContain("next summer");
  });

  it("signs with the signature, or the name when there's none, never both", () => {
    const signed = leadReminderMessage({ ...base, lead: lead(), kind: "quote", signature: "  סטודיו אור\n050-0000000 ", senderName: "Or" });
    expect(signed.endsWith("\n\nסטודיו אור\n050-0000000")).toBe(true);
    expect(signed).not.toContain("Or\n");
    expect(signed.endsWith("Or")).toBe(false);

    const named = leadReminderMessage({ ...base, lead: lead(), kind: "quote", signature: "   ", senderName: " Or Cohen " });
    expect(named.endsWith("\n\nOr Cohen")).toBe(true);

    const bare = leadReminderMessage({ ...base, lead: lead(), kind: "quote", signature: null, senderName: "  " });
    expect(bare.endsWith("ולשריין לכם את התאריך.")).toBe(true);
  });

  it("writes in English", () => {
    expect(
      leadReminderMessage({ lead: lead({ event_date_interest: "2026-12-03" }), kind: "contact", quoteUrl: null, signature: null, senderName: "Or", lang: "en" }),
    ).toBe(
      "Hi Dana,\nFollowing up on our conversation about your event on 03/12/2026. Let me know if you have any questions, or if you'd like to go ahead and book the date.\n\nOr",
    );
    expect(leadReminderMessage({ lead: lead(), kind: "quote", quoteUrl: "https://x/s/q1", signature: null, senderName: null, lang: "en" })).toBe(
      "Hi Dana,\nI wanted to check whether you had a chance to look at the price quote I sent. I'm happy to answer any questions and hold the date for you.\nYour quote: https://x/s/q1",
    );
  });

  it("writes in Russian", () => {
    const text = leadReminderMessage({ lead: lead({ name: "Анна Иванова" }), kind: "quote", quoteUrl: "https://x/s/q1", signature: "Студия", senderName: "Or", lang: "ru" });
    expect(text.split("\n")[0]).toBe("Здравствуйте, Анна!");
    expect(text).toContain("Ваше предложение: https://x/s/q1");
    expect(text.endsWith("\n\nСтудия")).toBe(true);
    expect(leadReminderMessage({ lead: lead({ event_date_interest: "2026-12-03" }), kind: "contact", quoteUrl: null, signature: null, senderName: null, lang: "ru" })).toContain(
      "о вашем мероприятии 03.12.2026.",
    );
  });

  it("puts no link in a contact reminder even when one is given", () => {
    expect(leadReminderMessage({ ...base, lead: lead(), kind: "contact", quoteUrl: "https://x/s/q1" })).not.toContain("https://");
  });
});

describe("leadReminderSubject", () => {
  it("names the studio on a quote reminder when there is one", () => {
    expect(leadReminderSubject("quote", " סטודיו אור ", "he")).toBe("הצעת המחיר מסטודיו אור");
    expect(leadReminderSubject("quote", "  ", "he")).toBe("הצעת המחיר");
    expect(leadReminderSubject("quote", null, "en")).toBe("Your price quote");
    expect(leadReminderSubject("quote", "Studio Or", "en")).toBe("Your price quote from Studio Or");
    expect(leadReminderSubject("quote", "Studio Or", "ru")).toBe("Ваше ценовое предложение от Studio Or");
  });

  it("has a fixed subject after a conversation", () => {
    expect(leadReminderSubject("contact", "Studio Or", "he")).toBe("בהמשך לשיחה שלנו");
    expect(leadReminderSubject("contact", null, "en")).toBe("Following up on our conversation");
    expect(leadReminderSubject("contact", null, "ru")).toBe("В продолжение нашего разговора");
  });
});

describe("LEAD_REMINDER_CHANNELS", () => {
  it("offers WhatsApp, SMS, email and copy", () => {
    expect([...LEAD_REMINDER_CHANNELS]).toEqual(["whatsapp", "sms", "email", "copy"]);
  });
});
