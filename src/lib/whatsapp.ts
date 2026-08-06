const GRAPH_API_VERSION = "v21.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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

// Same as sendWhatsAppTemplate, but for a template whose HEADER component is a document — used
// to hand the client an actual file (e.g. the album design PDF) alongside the templated text.
// `documentUrl` must be a URL WhatsApp's servers can fetch at send time (a signed Storage URL is
// fine — it just needs to still be valid when Meta's servers request it, not indefinitely).
export async function sendWhatsAppDocumentTemplate(
  to: string,
  templateName: string,
  documentUrl: string,
  documentFilename: string,
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
            type: "header",
            parameters: [{ type: "document", document: { link: documentUrl, filename: documentFilename } }],
          },
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
    throw new Error(data?.error?.message ?? "שליחת הודעת תבנית וואטסאפ (עם קובץ) נכשלה");
  }
  return { messageId: data.messages?.[0]?.id };
}
