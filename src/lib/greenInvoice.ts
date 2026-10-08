// Green Invoice ("חשבונית ירוקה" / מורנינג) — second supported document-issuing provider,
// alongside Finbot. API docs: https://www.greeninvoice.co.il/api-docs/ (base URL below per the
// 2026 infrastructure update — the old www.greeninvoice.co.il/api host is deprecated).
const GREEN_INVOICE_API_URL = "https://api.greeninvoice.co.il/api/v1";

// 400 = קבלה (Receipt) — for עוסק פטור.
// 320 = חשבונית מס קבלה (Tax Invoice + Receipt, combined) — for עוסק מורשה, includes VAT and
// closes itself with the attached payment in one document, same shape as Finbot's combined type.
const RECEIPT_DOCUMENT_TYPE = 400;
const TAX_INVOICE_DOCUMENT_TYPE = 320;

export function documentTypeForTaxStatus(status: "exempt" | "licensed"): number {
  return status === "licensed" ? TAX_INVOICE_DOCUMENT_TYPE : RECEIPT_DOCUMENT_TYPE;
}

async function getToken(apiId: string, apiSecret: string): Promise<string> {
  const res = await fetch(`${GREEN_INVOICE_API_URL}/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: apiId, secret: apiSecret, grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "פרטי ההתחברות ל-חשבונית ירוקה לא תקינים, בדקו את ה-ID והסוד בהגדרות"
        : `ההתחברות לחשבונית ירוקה נכשלה (קוד ${res.status})`
    );
  }
  const data: { token?: string } = await res.json();
  if (!data.token) {
    throw new Error("ההתחברות לחשבונית ירוקה נכשלה. לא התקבל טוקן");
  }
  return data.token;
}

// Returns the hosted document link on success. Mirrors issueReceipt()'s signature in finbot.ts so
// the dispatcher in invoicing.ts can call either provider through the same shape.
export async function issueDocument({
  apiId,
  apiSecret,
  documentType = RECEIPT_DOCUMENT_TYPE,
  customerName,
  customerEmail,
  amount,
  description,
  date = new Date(),
  emailBody = "שלום, מצורפת קבלה על התשלום שהתקבל. תודה!",
  paymentMethod,
  paymentMethodLabel,
}: {
  apiId?: string;
  apiSecret?: string;
  documentType?: number;
  customerName: string;
  customerEmail?: string;
  amount: number;
  description: string;
  date?: Date;
  emailBody?: string;
  // How the client paid. Cash (1) and bank transfer (4) have their own payment types, per Green
  // Invoice's own /payments/types list; anything else stays "Other" (11), with the method
  // (paymentMethodLabel) written on the item line.
  paymentMethod?: "cash" | "bit" | "paybox" | "transfer" | "other";
  paymentMethodLabel?: string;
}): Promise<{ documentLink: string }> {
  if (!apiId || !apiSecret) {
    throw new Error("חשבון חשבונית ירוקה לא מחובר");
  }

  const token = await getToken(apiId, apiSecret);
  const paymentType = paymentMethod === "cash" ? 1 : paymentMethod === "transfer" ? 4 : 11;
  const itemDescription = paymentType === 11 && paymentMethod && paymentMethodLabel ? `${description} · אמצעי תשלום: ${paymentMethodLabel}` : description;

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const res = await fetch(`${GREEN_INVOICE_API_URL}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      type: documentType,
      lang: "he",
      currency: "ILS",
      client: {
        name: customerName,
        emails: customerEmail ? [customerEmail] : [],
        add: false,
      },
      // `amount` is the real sum received, VAT included. Income-row vatType 0 means "VAT is added on
      // top per the business type", which for an עוסק מורשה (320) would bill amount + 18% against a
      // payment of `amount`. 1 = "VAT included in the price", so Green Invoice backs the VAT out of
      // the paid sum itself. A 400 receipt (עוסק פטור) carries no VAT, so it keeps the default.
      income: [
        {
          description: itemDescription,
          quantity: 1,
          price: amount,
          currency: "ILS",
          vatType: documentType === TAX_INVOICE_DOCUMENT_TYPE ? 1 : 0,
        },
      ],
      // Document types 320/400 require a payment array to close the document. Type 11 ("Other")
      // — same reasoning as Finbot's type "7": the payment already happened elsewhere (PayPlus /
      // bank transfer / cash), we're only recording it, and we don't hold real card details to
      // report accurately as a credit-card payment.
      payment: [{ date: dateStr, type: paymentType, price: amount, currency: "ILS" }],
      remarks: itemDescription,
      emailContent: emailBody,
    }),
  });

  const data: { url?: { origin?: string; he?: string }; errorMessage?: string } = await res
    .json()
    .catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.errorMessage
        ? `הפקת המסמך בחשבונית ירוקה נכשלה: ${data.errorMessage}`
        : `הפקת המסמך בחשבונית ירוקה נכשלה (קוד ${res.status})`
    );
  }
  const link = data.url?.origin ?? data.url?.he;
  if (!link) {
    throw new Error("הפקת המסמך בחשבונית ירוקה נכשלה. לא התקבל קישור למסמך");
  }
  return { documentLink: link };
}
