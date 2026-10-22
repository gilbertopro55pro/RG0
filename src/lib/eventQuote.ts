import type { LeadQuoteDetails } from "@/lib/leadQuote";

// The quote an event was booked from (owner, 2026-10-22): a lead that closed into this event
// (leads.converted_event_id) brings its quote to the event page, to send the link again or the PDF
// (EventQuoteSection).
export type EventQuote = {
  leadId: string;
  // The client's quote page (/quotes/<token>).
  token: string | null;
  details: LeadQuoteDetails | null;
  // A quote sent as an amount only (the old lead form), without items.
  amount: number | null;
  sentAt: string | null;
  approvedAt: string | null;
  // The quote_history row of this quote, for its PDF; null for an amount-only quote.
  historyId: string | null;
};

type HistoryRef = { id: string; created_at: string; details: { createdAt?: string } | null };

// The history row of the quote on the lead: the one sent with the same createdAt (the lead keeps its
// latest quote), else the lead's newest row. A lead can have several rows, one per quote it was sent.
export function eventQuoteHistoryId(rows: readonly HistoryRef[], details: Pick<LeadQuoteDetails, "createdAt"> | null): string | null {
  if (rows.length === 0) return null;
  const same = details?.createdAt ? rows.find((r) => r.details?.createdAt === details.createdAt) : undefined;
  if (same) return same.id;
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].id;
}

// What the section shows: an itemised quote, or just the amount of an old one.
export function eventQuoteTotal(quote: Pick<EventQuote, "details" | "amount">): number | null {
  if (quote.details) return quote.details.total;
  return quote.amount != null && Number.isFinite(Number(quote.amount)) ? Number(quote.amount) : null;
}
