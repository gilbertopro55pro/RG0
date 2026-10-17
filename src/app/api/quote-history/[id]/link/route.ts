import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { quoteHistoryPdf } from "@/lib/quoteHistoryPdf";
import { quoteDateDMY } from "@/lib/quoteHistory";
import { getSignedDownloadUrl, uploadObject } from "@/lib/storage";
import { quoteShareCaption } from "@/lib/quoteDefaults";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export const runtime = "nodejs";

// Sending a quote from the history again when its client link no longer shows it (the lead is gone,
// it has a newer quote, or it was never on a lead): the PDF goes up as a 7-day download link, the
// same as the Settings send route, and the WhatsApp message with it comes back for the browser to
// open (QuoteHistoryList). A quote whose link still shows it is sent with that link, without this.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const pdf = await quoteHistoryPdf(supabase, user.id, id);
  if (!pdf) return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });

  const t = makeT(messagesFor(pdf.lang));
  const path = `${user.id}/history-${pdf.row.id}-${Date.now()}.pdf`;
  try {
    await uploadObject("price-quotes", path, Buffer.from(pdf.bytes), "application/pdf");
  } catch {
    return NextResponse.json({ error: "העלאת הקובץ נכשלה, נסו שוב" }, { status: 502 });
  }
  const url = await getSignedDownloadUrl("price-quotes", path, 60 * 60 * 24 * 7, t("הצעת-מחיר.pdf"));
  const d = pdf.row.details;
  const message = [
    quoteShareCaption(pdf.row.client_name, d.eventType ?? "", quoteDateDMY(d.eventDate) ?? "", pdf.lang, d.eventDate),
    "",
    t("הצעת המחיר בקובץ PDF: {url}", { url }),
    pdf.photographer.whatsapp_signature?.trim() || null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return NextResponse.json({ message });
}
