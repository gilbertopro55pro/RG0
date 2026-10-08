import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInvoiceProviderConnected, issueClientDocument } from "@/lib/invoicing";
import type { InvoiceProvider } from "@/lib/types";
import { amountToDocument, documentedOnLeg, paymentMethodLabel, receivedOnLeg, RECEIPT_PAYMENT_METHODS, type PaymentLegDocState, type ReceiptPaymentMethod } from "@/lib/paymentDocuments";

const FIELD_LABEL: Record<"deposit" | "balance", string> = {
  deposit: "מקדמה",
  balance: "יתרה",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // From the receipt screen (owner, 2026-10-08): the name, payment method and amount the
  // photographer filled in are what goes on the receipt.
  const {
    field,
    clientEmail,
    customerName: customerNameInput,
    amount: amountInput,
    paymentMethod,
    paymentOther,
  }: {
    field: "deposit" | "balance";
    clientEmail?: string;
    customerName?: string;
    amount?: number;
    paymentMethod?: ReceiptPaymentMethod;
    paymentOther?: string;
  } = await request.json();
  if (paymentMethod && !RECEIPT_PAYMENT_METHODS.some((m) => m.id === paymentMethod)) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }
  if (field !== "deposit" && field !== "balance") {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_email, photographer_id")
    .eq("id", eventId)
    .maybeSingle<{ client_name: string; client_email: string | null; photographer_id: string }>();
  if (!event || event.photographer_id !== user.id) {
    return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }

  const email = clientEmail?.trim() || event.client_email;
  if (!email) {
    return NextResponse.json({ error: "נדרש אימייל של הלקוח/ה להפקת המסמך" }, { status: 400 });
  }
  if (clientEmail?.trim() && clientEmail.trim() !== event.client_email) {
    await supabase.from("events").update({ client_email: clientEmail.trim() }).eq("id", eventId);
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, finbot_api_key, business_tax_status, invoice_provider, green_invoice_api_id, green_invoice_api_secret")
    .eq("id", user.id)
    .single<{
      name: string;
      finbot_api_key: string | null;
      business_tax_status: "exempt" | "licensed";
      invoice_provider: InvoiceProvider;
      green_invoice_api_id: string | null;
      green_invoice_api_secret: string | null;
    }>();
  if (!photographer || !isInvoiceProviderConnected(photographer.invoice_provider, photographer)) {
    return NextResponse.json({ error: "יש לחבר מערכת חשבוניות בהגדרות לפני הפקת מסמכים" }, { status: 400 });
  }

  const { data: payment } = await supabase
    .from("event_payments")
    .select(`${field}_amount, ${field}_paid, ${field}_paid_amount, ${field}_documented_amount, ${field}_document_url`)
    .eq("event_id", eventId)
    .maybeSingle<Record<string, unknown>>();
  if (!payment) {
    return NextResponse.json({ error: "לא נמצא סכום תשלום להפקת מסמך" }, { status: 400 });
  }
  // A receipt covers money actually received that no earlier receipt covered: on a partial
  // payment the amount paid so far, and later only the difference (owner, 2026-10-08).
  const leg: PaymentLegDocState = {
    amount: Number(payment[`${field}_amount`]) || 0,
    paid: !!payment[`${field}_paid`],
    paidAmount: payment[`${field}_paid_amount`] == null ? null : Number(payment[`${field}_paid_amount`]),
    documentedAmount: payment[`${field}_documented_amount`] == null ? null : Number(payment[`${field}_documented_amount`]),
    documentUrl: (payment[`${field}_document_url`] as string | null) ?? null,
  };
  const suggested = amountToDocument(leg);
  // The amount typed on the screen (default: what was received and not yet receipted). Never
  // more than what's left of the leg without a receipt.
  const leftOnLeg = Math.max(0, Math.round((leg.amount - documentedOnLeg(leg)) * 100) / 100);
  const amount = amountInput != null ? Math.round(Number(amountInput) * 100) / 100 : suggested;
  if (!(amount > 0)) {
    return NextResponse.json(
      { error: amountInput != null ? "יש להזין סכום גדול מ-0" : receivedOnLeg(leg) > 0 ? "כבר הופקה קבלה על כל הסכום שהתקבל" : "לא נמצא סכום תשלום להפקת מסמך" },
      { status: 400 }
    );
  }
  if (amount > leftOnLeg + 0.004) {
    return NextResponse.json({ error: "הסכום גבוה מהיתרה שעוד לא הופקה עליה קבלה" }, { status: 400 });
  }
  const customerName = customerNameInput?.trim() || event.client_name;
  const methodLabel = paymentMethodLabel(paymentMethod, paymentOther);
  const partial = !leg.paid || documentedOnLeg(leg) > 0;

  try {
    const { documentLink } = await issueClientDocument({
      provider: photographer.invoice_provider,
      taxStatus: photographer.business_tax_status,
      photographer,
      customerName,
      customerEmail: email,
      amount,
      description: `${partial || amount < leftOnLeg - 0.004 ? `תשלום חלקי על ${FIELD_LABEL[field]}` : `תשלום ${FIELD_LABEL[field]}`}, ${customerName}${methodLabel ? ` · אמצעי תשלום: ${methodLabel}` : ""}`,
      paymentMethod,
      emailSubject: `קבלה על תשלום | ${photographer.name}`,
      emailBody: `שלום, מצורפת קבלה על התשלום שהתקבל. תודה,\n${photographer.name}`,
    });

    const documentedAmount = Math.round((documentedOnLeg(leg) + amount) * 100) / 100;
    const patch: Record<string, unknown> = { [`${field}_document_url`]: documentLink, [`${field}_documented_amount`]: documentedAmount };
    // A receipt says the money arrived: when it covers more than was marked as received, the
    // payment is marked to match (fully paid once the whole leg is covered), so the payment
    // status and the revenue charts agree with the receipts.
    if (documentedAmount > receivedOnLeg(leg) + 0.004) {
      const now = new Date().toISOString();
      if (documentedAmount >= leg.amount - 0.004) Object.assign(patch, { [`${field}_paid`]: true, [`${field}_paid_at`]: now, [`${field}_paid_amount`]: null });
      else Object.assign(patch, { [`${field}_paid`]: false, [`${field}_paid_at`]: now, [`${field}_paid_amount`]: documentedAmount });
    }
    await supabase.from("event_payments").update(patch).eq("event_id", eventId);

    return NextResponse.json({ documentUrl: documentLink, documentedAmount, amount, patch });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "הפקת המסמך נכשלה" },
      { status: 500 }
    );
  }
}
