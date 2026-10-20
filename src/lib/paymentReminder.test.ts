import { describe, expect, it } from "vitest";
import { PAYMENT_REMINDER_CHANNELS, PAYMENT_REMINDER_LOG_MARK, paymentReminderMessage, paymentReminderSubject } from "@/lib/paymentReminder";
import { LANGS } from "@/i18n/config";

const PORTAL = "https://myframeflow.com/s/p1za9SwBtHTS";

const base = {
  clientName: "דנה",
  amount: 3500,
  portalUrl: PORTAL,
  signature: null as string | null,
  senderName: "סטודיו אור",
  lang: "he" as const,
};

describe("paymentReminderMessage", () => {
  it("writes the owner's Hebrew wording: greeting, the open amount, the portal link, then the name", () => {
    expect(paymentReminderMessage(base)).toBe(
      ["שלום דנה,", "נשארה יתרה של ₪3,500 לתשלום עבור האירוע שלכם.", "", "לצפייה בפרטי התשלום ניתן להיכנס לפורטל האישי שלכם:", PORTAL, "", "סטודיו אור"].join("\n")
    );
  });

  it("writes agorot as two digits, and whole shekels without any", () => {
    expect(paymentReminderMessage({ ...base, amount: 1234.5 })).toContain("₪1,234.50 ");
    expect(paymentReminderMessage({ ...base, amount: 1234 })).toContain("₪1,234 ");
  });

  it("never says 'תזכורת ידידותית' (owner: it sounds apologetic), in any language", () => {
    for (const lang of LANGS) {
      const msg = paymentReminderMessage({ ...base, lang });
      expect(msg).not.toContain("תזכורת ידידותית");
      expect(msg.toLowerCase()).not.toContain("friendly");
    }
  });

  it("ends with the signature, and then not the name too", () => {
    const msg = paymentReminderMessage({ ...base, signature: "בברכה,\nאור כהן צילום" });
    expect(msg.endsWith("\n\nבברכה,\nאור כהן צילום")).toBe(true);
    expect(msg).not.toContain("סטודיו אור");
  });

  it("falls back to the name when the signature is blank", () => {
    expect(paymentReminderMessage({ ...base, signature: "   " }).endsWith("\n\nסטודיו אור")).toBe(true);
    expect(paymentReminderMessage({ ...base, signature: undefined }).endsWith("\n\nסטודיו אור")).toBe(true);
  });

  it("ends at the link when there's neither a signature nor a name", () => {
    expect(paymentReminderMessage({ ...base, senderName: "  " }).endsWith(`\n${PORTAL}`)).toBe(true);
    expect(paymentReminderMessage({ ...base, senderName: null }).endsWith(`\n${PORTAL}`)).toBe(true);
  });

  it("trims the client's name", () => {
    expect(paymentReminderMessage({ ...base, clientName: "  דנה כהן " }).startsWith("שלום דנה כהן,\n")).toBe(true);
  });

  it("writes the amount in shekels with thousands separators", () => {
    expect(paymentReminderMessage({ ...base, amount: 12500 })).toContain("נשארה יתרה של ₪12,500 לתשלום");
    expect(paymentReminderMessage({ ...base, amount: 800 })).toContain("נשארה יתרה של ₪800 לתשלום");
  });

  it("writes English for an English-speaking client", () => {
    expect(paymentReminderMessage({ ...base, clientName: "Dana", amount: 3500, lang: "en", signature: "Or Studio" })).toBe(
      ["Hi Dana,", "A balance of ₪3,500 is still due for your event.", "", "You can see the payment details in your personal portal:", PORTAL, "", "Or Studio"].join("\n")
    );
  });

  it("writes Russian for a Russian-speaking client, with Russian digit grouping", () => {
    const msg = paymentReminderMessage({ ...base, clientName: "Анна", amount: 3500, lang: "ru" });
    expect(msg.startsWith("Здравствуйте, Анна!\n")).toBe(true);
    expect(msg).toMatch(/остаётся к оплате ₪3\s500\./);
    expect(msg).toContain(`\n${PORTAL}\n\nסטודיו אור`);
  });
});

describe("paymentReminderSubject", () => {
  it("is the email subject in the client's language", () => {
    expect(paymentReminderSubject("he")).toBe("תזכורת תשלום");
    expect(paymentReminderSubject("en")).toBe("Payment reminder");
    expect(paymentReminderSubject("ru")).toBe("Напоминание об оплате");
  });
});

describe("constants", () => {
  it("offers WhatsApp, SMS, email and copy", () => {
    expect([...PAYMENT_REMINDER_CHANNELS]).toEqual(["whatsapp", "sms", "email", "copy"]);
  });

  it("logs with the mark the dashboard reads back", () => {
    expect(PAYMENT_REMINDER_LOG_MARK).toBe("תזכורת תשלום");
  });
});
