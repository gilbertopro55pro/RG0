import { stripPhoneFormatting } from "@/lib/phone";

// Finbot ("פינבוט") — the accountant's document-issuing system. API docs:
// https://finbot.helpjuice.com/he_IL/api-docs-create-income
const FINBOT_API_URL = "https://api.finbotai.co.il/income";

// Per Finbot's own API docs, "type" has distinct values for a document confirming payment
// ALREADY received (what every caller here issues — this only ever runs after a charge already
// succeeded) versus one billing for payment not yet received:
//   1 = קבלה (Receipt) — the only type an עוסק פטור business can legally issue.
//   2 = חשבונית מס קבלה (Tax invoice + receipt combined) — for עוסק מורשה, payment already in hand.
// NOT type 0 ("חשבונית מס" — a plain unpaid tax invoice, billing for money not yet received) or
// type 8 ("חשבונית" — non-tax invoice) — this file previously used "0" here, which was wrong for
// every existing call site (all of them fire post-payment).
const RECEIPT_DOCUMENT_TYPE = "1";
const TAX_INVOICE_DOCUMENT_TYPE = "2";

// Current standard Israeli VAT rate — verify this is still current with the photographer's/
// platform's accountant if it's ever changed by law; nothing else in this file tracks it.
const VAT_RATE = 0.18;

// The document identity (business name, ID, address) is entirely determined by which Finbot
// account the API key belongs to — the request body carries no business info at all. That's why
// every caller MUST pass its own apiKey: the platform's own key (env var) for the platform's own
// subscription receipts, and a photographer's own connected key for their clients' documents.
// Reusing one key for the other would issue a document under the wrong business.
export function documentTypeForTaxStatus(status: "exempt" | "licensed"): string {
  return status === "licensed" ? TAX_INVOICE_DOCUMENT_TYPE : RECEIPT_DOCUMENT_TYPE;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Finbot needs a clean digit string, not just the bidi-stripped value stripPhoneFormatting
// already guarantees at every entry point (signup, profile save) — this also normalizes a "972"
// country code to the local "0" prefix and drops any dashes/spaces a photographer typed. Doing
// this again here (not just trusting the stored value is already clean) covers any row saved
// before those entry-point fixes existed, or reachable through some other, still-uncaught path.
function sanitizePhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let digits = stripPhoneFormatting(raw).replace(/\D/g, "");
  if (digits.startsWith("972")) digits = `0${digits.slice(3)}`;
  return digits || undefined;
}

// Returns the hosted document link on success. Throws on any Finbot-reported failure so the
// caller decides how to handle/log it — this never blocks the payment itself, since by the time
// this runs the charge has already succeeded, we're just recording it.
export async function issueReceipt({
  apiKey,
  documentType = RECEIPT_DOCUMENT_TYPE,
  customerName,
  customerEmail,
  customerPhone,
  amount,
  description,
  date = new Date(),
  emailSubject = "קבלה על תשלום | מערכת גילברטו",
  emailBody = "שלום, מצורפת קבלה על התשלום שהתקבל עבור המנוי במערכת גילברטו - ניהול צילום אירועים. תודה!",
}: {
  apiKey?: string;
  documentType?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  amount: number;
  description: string;
  date?: Date;
  emailSubject?: string;
  emailBody?: string;
}): Promise<{ documentLink: string }> {
  const key = apiKey ?? requireEnv("FINBOT_API_KEY");

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  const dateStr = `${dd}/${mm}/${yyyy}`;
  const cleanPhone = sanitizePhone(customerPhone);

  // Finbot: "מסמך כולל/ לא כולל מע"מ" — vatType true means the document CHARGES VAT (only valid
  // for a licensed/עוסק מורשה document; an exempt business gets error 115 if this is true at all).
  // When it's true, Finbot's own docs are explicit that line-item prices must be submitted
  // BEFORE VAT ("יש לרשום את המחיר לפני מע"מ") — Finbot adds VAT on top itself. `amount` here is
  // always the real, full, VAT-inclusive sum actually charged/received (Israeli consumer pricing
  // law requires that), so it's backed out to a pre-VAT line price only for the licensed case;
  // the `payments` entry below stays the real amount received either way, since that's what
  // actually changed hands, not a pre-VAT figure.
  const isLicensedDocument = documentType === TAX_INVOICE_DOCUMENT_TYPE;
  const lineItemPrice = isLicensedDocument ? Math.round((amount / (1 + VAT_RATE)) * 100) / 100 : amount;

  const res = await fetch(FINBOT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", secret: key },
    body: JSON.stringify({
      type: documentType,
      date: dateStr,
      // Finbot's real API rejects lowercase "he"/"en" (code 109) despite the docs page showing
      // lowercase — the actual enum, confirmed against the live Swagger schema, is uppercase.
      language: "HE",
      currency: "ILS",
      vatType: isLicensedDocument,
      rounding: true,
      customer: {
        name: customerName,
        email: customerEmail,
        ...(cleanPhone ? { phone: cleanPhone } : {}),
        save: false,
      },
      items: [{ name: description, amount: 1, price: lineItemPrice }],
      // A receipt can't be issued without a payments entry (Finbot: "לא ניתן להפיק מסמך זה ללא
      // אמצעי תשלום"). Using type "7" (Other) rather than "2" (credit card) — credit card entries
      // require a real cardNumber + numberPayments, which PayPlus's webhook callback doesn't
      // currently surface to us, and fabricating a card number on a real customer receipt would
      // be wrong bookkeeping.
      payments: [{ type: "7", date: dateStr, sum: amount }],
      email: {
        to: customerEmail,
        subject: emailSubject,
        body: emailBody,
      },
    }),
  });

  // An invalid/expired API key gets rejected before Finbot's own JSON-aware logic runs — the
  // response body is a plain-text "Unauthorized", not JSON. Handle that case explicitly instead
  // of letting res.json() throw a confusing parse error that masks the real problem.
  const rawBody = await res.text();
  let data: { status?: number; data?: string } | null = null;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(
      res.status === 401 || /unauthorized/i.test(rawBody)
        ? "מפתח ה-API של Finbot לא תקין, בדקו את המפתח בהגדרות"
        : `הפקת המסמך ב-Finbot נכשלה (קוד ${res.status})`
    );
  }
  if (!res.ok || data?.status !== 1) {
    throw new Error(`Finbot receipt issuance failed: ${JSON.stringify(data)}`);
  }
  return { documentLink: data.data as string };
}
