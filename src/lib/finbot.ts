// Finbot ("פינבוט") — the accountant's document-issuing system. API docs:
// https://finbot.helpjuice.com/he_IL/api-docs-create-income
const FINBOT_API_URL = "https://api.finbotai.co.il/income";

// 1 = קבלה (Receipt) — matches an עוסק פטור business, which cannot legally issue a VAT
// invoice (type 0/2/8). If the business's tax status ever changes to עוסק מורשה/חברה,
// this needs to change too.
const RECEIPT_DOCUMENT_TYPE = "1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Returns the hosted document link on success. Throws on any Finbot-reported failure so the
// caller decides how to handle/log it — this never blocks the payment itself, since by the time
// this runs the charge has already succeeded, we're just recording it.
export async function issueReceipt({
  customerName,
  customerEmail,
  amount,
  description,
  date = new Date(),
}: {
  customerName: string;
  customerEmail: string;
  amount: number;
  description: string;
  date?: Date;
}): Promise<{ documentLink: string }> {
  const apiKey = requireEnv("FINBOT_API_KEY");

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  const dateStr = `${dd}/${mm}/${yyyy}`;

  const res = await fetch(FINBOT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", secret: apiKey },
    body: JSON.stringify({
      type: RECEIPT_DOCUMENT_TYPE,
      date: dateStr,
      // Finbot's real API rejects lowercase "he"/"en" (code 109) despite the docs page showing
      // lowercase — the actual enum, confirmed against the live Swagger schema, is uppercase.
      language: "HE",
      currency: "ILS",
      vatType: false,
      rounding: true,
      customer: {
        name: customerName,
        email: customerEmail,
        save: false,
      },
      items: [{ name: description, amount: 1, price: amount }],
      // A receipt can't be issued without a payments entry (Finbot: "לא ניתן להפיק מסמך זה ללא
      // אמצעי תשלום"). Using type "7" (Other) rather than "2" (credit card) — credit card entries
      // require a real cardNumber + numberPayments, which PayPlus's webhook callback doesn't
      // currently surface to us, and fabricating a card number on a real customer receipt would
      // be wrong bookkeeping.
      payments: [{ type: "7", date: dateStr, sum: amount }],
      email: {
        to: customerEmail,
        subject: "קבלה על תשלום — photographer-flow",
        body: "שלום, מצורפת קבלה על התשלום שהתקבל. תודה!",
      },
    }),
  });

  const data = await res.json();
  if (!res.ok || data?.status !== 1) {
    throw new Error(`Finbot receipt issuance failed: ${JSON.stringify(data)}`);
  }
  return { documentLink: data.data };
}
