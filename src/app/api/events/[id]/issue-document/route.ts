import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInvoiceProviderConnected, issueClientDocument } from "@/lib/invoicing";
import type { InvoiceProvider } from "@/lib/types";

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

  const { field, clientEmail }: { field: "deposit" | "balance"; clientEmail?: string } = await request.json();
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
    .select("deposit_amount, balance_amount")
    .eq("event_id", eventId)
    .maybeSingle<{ deposit_amount: number | null; balance_amount: number | null }>();
  const amount = field === "deposit" ? payment?.deposit_amount : payment?.balance_amount;
  if (!amount) {
    return NextResponse.json({ error: "לא נמצא סכום תשלום להפקת מסמך" }, { status: 400 });
  }

  try {
    const { documentLink } = await issueClientDocument({
      provider: photographer.invoice_provider,
      taxStatus: photographer.business_tax_status,
      photographer,
      customerName: event.client_name,
      customerEmail: email,
      amount,
      description: `תשלום ${FIELD_LABEL[field]}, ${event.client_name}`,
      emailSubject: `קבלה על תשלום | ${photographer.name}`,
      emailBody: `שלום, מצורפת קבלה על התשלום שהתקבל. תודה,\n${photographer.name}`,
    });

    const column = field === "deposit" ? "deposit_document_url" : "balance_document_url";
    await supabase.from("event_payments").update({ [column]: documentLink }).eq("event_id", eventId);

    return NextResponse.json({ documentUrl: documentLink });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "הפקת המסמך נכשלה" },
      { status: 500 }
    );
  }
}
