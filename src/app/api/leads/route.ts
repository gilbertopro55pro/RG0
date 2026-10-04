import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { findLeadsByPhone } from "@/lib/leadDuplicates";
import type { PackageType } from "@/lib/stages";
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import { scheduleLeadQuoteFollowUp } from "@/lib/leadFollowUp";
import { canChooseClientLang } from "@/lib/clientLang";
import { isLang } from "@/i18n/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const body: {
    name: string;
    phone?: string;
    email?: string;
    eventDateInterest?: string;
    packageInterest?: PackageType;
    eventType?: string;
    notes?: string;
    // true = the photographer saw the duplicate warning and chose a new lead anyway.
    allowDuplicate?: boolean;
    // Only run the duplicate check (the quote builder asks before the send tap).
    dryRun?: boolean;
    // The quote builder's one-tap send (admin, lib/quoteDefaults.ts): the link in the WhatsApp
    // message is built before the lead exists, so the builder picks the token, and the quote is
    // attached in the same request (the page may be backgrounded by WhatsApp right after).
    quoteToken?: string;
    quote?: { amount: number; note?: string; details?: LeadQuoteDetails };
    // The client's language (UI languages phase 2, admin only for now): their quote page, contract,
    // portal and gallery show in it. Ignored for other accounts.
    clientLang?: string;
  } = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "יש להזין שם" }, { status: 400 });
  }

  // Same phone already in the leads: return it (409) so the caller can offer to use that lead
  // instead of opening a second one for the same client.
  if (body.phone?.trim() && !body.allowDuplicate) {
    const matches = await findLeadsByPhone(createServiceRoleClient(), user.id, body.phone);
    if (matches.length > 0) {
      return NextResponse.json({ error: "כבר קיים ליד עם מספר הטלפון הזה", duplicate: matches[0] }, { status: 409 });
    }
  }
  if (body.dryRun) return NextResponse.json({ ok: true });

  const quote = body.quote && body.quote.amount > 0 ? body.quote : null;
  const details = quote?.details && Array.isArray(quote.details.items) && JSON.stringify(quote.details).length < 20000 ? quote.details : null;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      photographer_id: user.id,
      name: body.name.trim(),
      phone: body.phone || null,
      email: body.email || null,
      event_date_interest: body.eventDateInterest || null,
      package_interest: body.packageInterest || null,
      event_type_name: body.eventType?.trim() || null,
      notes: body.notes || null,
      ...(isLang(body.clientLang) && canChooseClientLang(user.email) ? { client_lang: body.clientLang } : {}),
      ...(body.quoteToken && UUID_RE.test(body.quoteToken) ? { quote_token: body.quoteToken } : {}),
      ...(quote
        ? {
            quoted_amount: quote.amount,
            quote_note: quote.note || null,
            ...(details ? { quote_details: details } : {}),
            quote_sent_at: new Date().toISOString(),
            status: "quoted",
          }
        : {}),
    })
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת הליד" }, { status: 500 });
  }

  if (quote) await scheduleLeadQuoteFollowUp(supabase, lead.id);

  return NextResponse.json({ lead });
}
