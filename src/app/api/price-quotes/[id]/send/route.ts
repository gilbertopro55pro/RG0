import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadObjectBuffer, uploadObject, getSignedDownloadUrl } from "@/lib/storage";
import { buildPriceQuotePdf } from "@/lib/priceQuotePdf";
import { formatWorkHours, quoteEventDetails } from "@/lib/priceQuoteFormat";
import { sendEmail } from "@/lib/resend";
import type { Photographer, PriceQuoteRow } from "@/lib/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: quoteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { method, email, phone }: { method: "email" | "whatsapp"; email?: string; phone?: string } = await request.json();

  const { data: quote } = await supabase.from("price_quotes").select("*").eq("id", quoteId).single<PriceQuoteRow>();
  if (!quote || quote.photographer_id !== user.id) {
    return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, phone, email, logo_storage_path, business_id")
    .eq("id", user.id)
    .single<Pick<Photographer, "name" | "phone" | "email" | "logo_storage_path" | "business_id">>();
  if (!photographer) {
    return NextResponse.json({ error: "לא נמצא פרופיל צלם" }, { status: 404 });
  }

  if (method === "email" && !EMAIL_RE.test(email ?? "")) {
    return NextResponse.json({ error: "כתובת מייל לא תקינה" }, { status: 400 });
  }
  if (method === "whatsapp" && !(phone ?? "").trim()) {
    return NextResponse.json({ error: "יש להזין מספר טלפון" }, { status: 400 });
  }

  const logoBuffer = photographer.logo_storage_path
    ? await downloadObjectBuffer("logos", photographer.logo_storage_path)
    : null;

  const eventDetails = quoteEventDetails(quote);

  const pdfBytes = await buildPriceQuotePdf({
    photographer,
    logoBuffer,
    clientName: quote.client_name,
    items: quote.items,
    subtotal: quote.subtotal,
    vatAmount: quote.vat_amount,
    total: quote.total,
    createdAt: new Date(quote.created_at),
    eventDetails,
  });

  let whatsapp: { clientPhone: string; message: string } | null = null;

  if (method === "email") {
    try {
      await sendEmail({
        to: email!.trim(),
        subject: `הצעת מחיר מ${photographer.name}`,
        text: `שלום,\n\nמצורפת הצעת מחיר מ${photographer.name}.\n\nבברכה,\n${photographer.name}`,
        replyTo: photographer.email,
        attachments: [{ filename: "הצעת-מחיר.pdf", content: Buffer.from(pdfBytes).toString("base64") }],
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "שליחת המייל נכשלה" }, { status: 500 });
    }
  } else {
    // A wa.me link can only pre-fill text, not attach a file — so instead of a WhatsApp document
    // message (Meta Business API, blocked pending verification) this uploads the PDF and hands
    // back a signed download link for the photographer's own browser to send via wa.me, same
    // pattern as the other client-facing links in the app (portal/gallery).
    const path = `${user.id}/${quote.id}-${Date.now()}.pdf`;
    await uploadObject("price-quotes", path, Buffer.from(pdfBytes), "application/pdf");
    const url = await getSignedDownloadUrl("price-quotes", path, 60 * 60 * 24 * 7, "הצעת-מחיר.pdf");
    const intro =
      eventDetails.type && eventDetails.date
        ? `הצעת מחיר ל${eventDetails.type} בתאריך ${eventDetails.date}`
        : "הצעת מחיר";
    whatsapp = {
      clientPhone: phone!.trim(),
      message: `${intro}\nלכבוד: ${quote.client_name}\n\n${url}`,
    };
  }

  const { data: updated } = await supabase
    .from("price_quotes")
    .update({
      sent_at: new Date().toISOString(),
      sent_via: method,
      ...(method === "email" ? { client_email: email!.trim() } : {}),
      ...(method === "whatsapp" ? { client_phone: phone!.trim() } : {}),
    })
    .eq("id", quoteId)
    .select()
    .single<PriceQuoteRow>();

  return NextResponse.json({ quote: updated ?? quote, whatsapp });
}
