import crypto from "node:crypto";

const GRAPH_API_VERSION = "v21.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Meta signs every webhook POST body with the app secret (HMAC-SHA256, hex, prefixed "sha256=").
// Without this check, anyone who finds the webhook URL can POST fabricated "incoming messages"
// with any phone number in `from`, which the bot would treat as a real client — creating fake
// leads/waitlist rows and, via sendWhatsAppMessage, sending real outbound messages to that number.
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const secret = requireEnv("WHATSAPP_APP_SECRET");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// Meta's Graph API errors come back as terse, code-prefixed English strings ("(#132001) Template
// name does not exist in the translation") that mean nothing to a non-technical photographer
// reading their event's activity log. This maps the handful of codes actually seen in production
// to a plain-language Hebrew sentence describing what happened and what to do about it, falling
// back to a generic "try again" message (with the raw text kept alongside, not discarded) for
// anything unrecognized.
export function friendlyWhatsAppError(rawMessage: string): string {
  if (/#131030/.test(rawMessage) || /not in allowed list/i.test(rawMessage)) {
    return "ההודעה לא נשלחה — מספר הטלפון של הלקוח/ה לא מאושר עדיין בחשבון הוואטסאפ העסקי (מצב בדיקה). אפשר לנסות שוב אחרי שהעסק יעבור אימות מלא מול מטא.";
  }
  if (/#132001/.test(rawMessage) || /template.*(does not exist|not exist)/i.test(rawMessage)) {
    return "ההודעה לא נשלחה — תבנית ההודעה לא נמצאה או לא אושרה עדיין בשפה הנדרשת. אפשר לנסות לשלוח שוב בעוד כמה דקות, או לבדוק את תבניות הוואטסאפ בהגדרות.";
  }
  if (/access blocked/i.test(rawMessage)) {
    return "ההודעה לא נשלחה — הגישה לחשבון הוואטסאפ העסקי חסומה זמנית. נסו שוב בעוד כמה דקות; אם זה חוזר, יש לבדוק את חיבור הוואטסאפ.";
  }
  if (/#131047/.test(rawMessage) || /24.?hour/i.test(rawMessage)) {
    return "ההודעה לא נשלחה — עברו יותר מ-24 שעות מאז שהלקוח/ה כתבו לעסק, ולכן וואטסאפ דורש הודעת תבנית מאושרת במקום הודעה חופשית. נסו שוב.";
  }
  return `ההודעה לא נשלחה — אפשר לנסות שוב. (${rawMessage})`;
}

export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<{ messageId: string }> {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeIsraeliPhone(to),
      type: "text",
      text: { body },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "שליחת הודעת וואטסאפ נכשלה");
  }
  return { messageId: data.messages?.[0]?.id };
}

// Business-initiated messages (this app's entire use case) only deliver via a Meta-approved
// template outside a 24h customer-service window — free text (sendWhatsAppMessage) will silently
// fail with error 131047 in that case. Prefer this for anything the photographer sends proactively.
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  parameters: string[]
): Promise<{ messageId: string }> {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeIsraeliPhone(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: "he" },
        components: [
          {
            type: "body",
            parameters: parameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "שליחת הודעת תבנית וואטסאפ נכשלה");
  }
  return { messageId: data.messages?.[0]?.id };
}

// A plain (non-template) document message — needs no Meta-approved template, but is subject to
// the exact same 24h customer-service-window rule as sendWhatsAppMessage (fails with the same
// #131047 outside that window). Used wherever the client should receive an actual file (e.g. a
// price quote PDF) rather than a text message with a link — `documentUrl` must be a URL WhatsApp's
// servers can fetch at send time.
export async function sendWhatsAppDocument(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<{ messageId: string }> {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeIsraeliPhone(to),
      type: "document",
      document: { link: documentUrl, filename, ...(caption ? { caption } : {}) },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "שליחת הקובץ בוואטסאפ נכשלה");
  }
  return { messageId: data.messages?.[0]?.id };
}

