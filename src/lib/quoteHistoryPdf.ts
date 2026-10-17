import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadObjectBuffer } from "@/lib/storage";
import { buildPriceQuotePdf } from "@/lib/priceQuotePdf";
import { clientLangFor } from "@/lib/clientLang";
import { readQuoteDiscount } from "@/lib/quoteDiscount";
import { quoteDateDMY, type QuoteHistoryRow } from "@/lib/quoteHistory";
import type { Photographer } from "@/lib/types";
import type { Lang } from "@/i18n/config";

type PdfPhotographer = Pick<Photographer, "name" | "phone" | "email" | "logo_storage_path" | "business_id" | "whatsapp_signature">;

// A quote from the history as a PDF, the same document the builder made when it was sent: its own
// items, totals, discount and date, in the client's language. Reads with the photographer's client,
// so RLS keeps it to their own rows. null when the row isn't theirs.
export async function quoteHistoryPdf(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ bytes: Uint8Array; row: QuoteHistoryRow; photographer: PdfPhotographer; lang: Lang } | null> {
  const [{ data: row }, { data: photographer }] = await Promise.all([
    supabase.from("quote_history").select("*").eq("id", id).maybeSingle<QuoteHistoryRow>(),
    supabase
      .from("photographers")
      .select("name, phone, email, logo_storage_path, business_id, whatsapp_signature")
      .eq("id", userId)
      .single<PdfPhotographer>(),
  ]);
  if (!row || row.photographer_id !== userId || !photographer) return null;

  const d = row.details;
  const lang = clientLangFor(photographer.email, row.client_lang);
  const logoBuffer = photographer.logo_storage_path ? await downloadObjectBuffer("logos", photographer.logo_storage_path) : null;
  const bytes = await buildPriceQuotePdf({
    photographer,
    logoBuffer,
    clientName: row.client_name,
    items: Array.isArray(d.items) ? d.items : [],
    subtotal: Number(d.subtotal) || 0,
    vatAmount: Number(d.vatAmount) || 0,
    total: Number(d.total ?? row.total) || 0,
    createdAt: new Date(d.createdAt && !Number.isNaN(Date.parse(d.createdAt)) ? d.createdAt : row.created_at),
    showVat: d.showVat !== false,
    eventDetails: {
      type: d.eventType,
      date: quoteDateDMY(d.eventDate),
      location: d.eventLocation,
      workHours: d.startTime && d.endTime ? `${d.startTime}-${d.endTime}` : undefined,
    },
    notes: d.notes,
    discount: readQuoteDiscount(d.discount),
    lang,
  });
  return { bytes, row, photographer, lang };
}
