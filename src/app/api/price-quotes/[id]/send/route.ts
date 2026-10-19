import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadObjectBuffer, uploadObject, getSignedDownloadUrl } from "@/lib/storage";
import { shortFileUrl } from "@/lib/shortFileLinks";
import { buildPriceQuotePdf } from "@/lib/priceQuotePdf";
import { formatWorkHours, quoteEventDetails } from "@/lib/priceQuoteFormat";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { Photographer, PriceQuoteRow } from "@/lib/types";
import { clientLangFor } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import { quoteShareCaption } from "@/lib/quoteDefaults";
import { quoteTotals, readQuoteDiscount } from "@/lib/quoteDiscount";
import { recordQuoteHistory } from "@/lib/quoteHistory";

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

  // clientLang (optional): the client's language for the PDF, the email and the WhatsApp text (UI
  // languages phase 3). clientLangFor keeps Hebrew for every non-admin account.
  const { method, email, phone, clientLang }: { method: "email" | "whatsapp"; email?: string; phone?: string; clientLang?: string } = await request.json();

  const { data: quote } = await supabase.from("price_quotes").select("*").eq("id", quoteId).single<PriceQuoteRow>();
  if (!quote || quote.photographer_id !== user.id) {
    return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, phone, email, logo_storage_path, business_id, business_tax_status")
    .eq("id", user.id)
    .single<Pick<Photographer, "name" | "phone" | "email" | "logo_storage_path" | "business_id" | "business_tax_status">>();
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

  // VAT follows the business status in Settings at the time of sending (owner, 2026-10-17): a quote
  // saved with VAT goes out without it from an exempt business, and the other way round. subtotal
  // is the price before VAT (after any discount), whichever way the quote was saved.
  const showVat = photographer.business_tax_status !== "exempt";
  const { vatAmount, total } = quoteTotals(Number(quote.subtotal), null, showVat ? 0.18 : 0);

  const eventDetails = quoteEventDetails(quote);
  const lang = clientLangFor(photographer.email, clientLang);
  const t = makeT(messagesFor(lang));
  const fileName = t("הצעת-מחיר.pdf");

  const pdfBytes = await buildPriceQuotePdf({
    photographer,
    logoBuffer,
    clientName: quote.client_name,
    items: quote.items,
    subtotal: Number(quote.subtotal),
    vatAmount,
    total,
    showVat,
    createdAt: new Date(quote.created_at),
    eventDetails,
    notes: quote.notes ?? undefined,
    discount: readQuoteDiscount(quote.discount),
    lang,
  });

  let whatsapp: { clientPhone: string; message: string } | null = null;

  if (method === "email") {
    try {
      await sendEmail({
        to: email!.trim(),
        fromName: photographer.name,
        subject: t("הצעת מחיר מ{name}", { name: photographer.name }),
        text: t("שלום,\n\nמצורפת הצעת מחיר מ{name}.\n\nבברכה,\n{name}", { name: photographer.name }),
        replyTo: notificationEmailFor(photographer.email),
        attachments: [{ filename: fileName, content: Buffer.from(pdfBytes).toString("base64") }],
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
    const ttl = 60 * 60 * 24 * 7;
    const url = await shortFileUrl({ bucket: "price-quotes", path, filename: fileName, photographerId: user.id, ttlSeconds: ttl }, () =>
      getSignedDownloadUrl("price-quotes", path, ttl, fileName),
    );
    const intro =
      lang !== "he"
        ? quoteShareCaption("", eventDetails.type ?? "", eventDetails.date ?? "", lang, quote.event_date?.slice(0, 10))
        : eventDetails.type && eventDetails.date
          ? `הצעת מחיר ל${eventDetails.type} בתאריך ${eventDetails.date}`
          : "הצעת מחיר";
    whatsapp = {
      clientPhone: phone!.trim(),
      message: `${intro}\n${t("לכבוד: {name}", { name: quote.client_name })}\n\n${url}`,
    };
  }

  const { data: updated } = await supabase
    .from("price_quotes")
    .update({
      sent_at: new Date().toISOString(),
      sent_via: method,
      vat_amount: vatAmount,
      total,
      ...(method === "email" ? { client_email: email!.trim() } : {}),
      ...(method === "whatsapp" ? { client_phone: phone!.trim() } : {}),
    })
    .eq("id", quoteId)
    .select()
    .single<PriceQuoteRow>();

  // Into the quote history like every quote that goes out (lib/quoteHistory.ts).
  const sentQuote = updated ?? quote;
  await recordQuoteHistory(supabase, {
    photographerId: user.id,
    leadId: null,
    clientName: sentQuote.client_name,
    clientPhone: sentQuote.client_phone,
    clientLang: lang === "he" ? null : lang,
    details: {
      items: sentQuote.items,
      subtotal: Number(sentQuote.subtotal),
      vatAmount,
      total,
      showVat,
      eventType: sentQuote.event_type ?? undefined,
      eventDate: sentQuote.event_date?.slice(0, 10) ?? undefined,
      eventLocation: sentQuote.event_location ?? undefined,
      startTime: sentQuote.work_start_time?.slice(0, 5) ?? undefined,
      endTime: sentQuote.work_end_time?.slice(0, 5) ?? undefined,
      notes: sentQuote.notes ?? undefined,
      discount: readQuoteDiscount(sentQuote.discount) ?? undefined,
      createdAt: new Date().toISOString(),
    },
    total,
  });

  return NextResponse.json({ quote: sentQuote, whatsapp });
}
