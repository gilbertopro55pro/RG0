import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadQuoteDetails } from "@/lib/leadQuote";

// One quote that went out (migration 0183): the builder's "היסטוריה" tab lists these.
export type QuoteHistoryRow = {
  id: string;
  photographer_id: string;
  lead_id: string | null;
  client_name: string;
  client_phone: string | null;
  client_lang: string | null;
  details: LeadQuoteDetails;
  total: number;
  created_at: string;
};

// Called by every route that sends a quote, with the photographer's own client (RLS checks the
// lead is theirs). A history that fails to save must never fail the send itself, so this only logs.
export async function recordQuoteHistory(
  supabase: SupabaseClient,
  row: { photographerId: string; leadId: string | null; clientName: string; clientPhone: string | null; clientLang: string | null; details: LeadQuoteDetails; total: number }
): Promise<void> {
  const { error } = await supabase.from("quote_history").insert({
    photographer_id: row.photographerId,
    lead_id: row.leadId,
    client_name: row.clientName.trim(),
    client_phone: row.clientPhone?.trim() || null,
    client_lang: row.clientLang,
    details: row.details,
    total: row.total,
  });
  if (error) console.error("quote history not saved", error.message);
}

// "DD.MM.YYYY" from a "YYYY-MM-DD" quote date, as the PDF prints it.
export function quoteDateDMY(isoDate?: string): string | undefined {
  const [y, m, d] = (isoDate ?? "").split("-");
  return y && m && d ? `${d.slice(0, 2)}.${m}.${y}` : undefined;
}
