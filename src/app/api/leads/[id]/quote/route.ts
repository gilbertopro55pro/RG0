import { NextResponse } from "next/server";
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import { createClient } from "@/lib/supabase/server";
import { scheduleLeadQuoteFollowUp } from "@/lib/leadFollowUp";
import { recordQuoteHistory } from "@/lib/quoteHistory";
import { canChooseClientLang } from "@/lib/clientLang";
import { isLang } from "@/i18n/config";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // clientLang: the client's language picked on the builder's preview (admin only for now).
  // client: the name and phone typed on the quote, for the quote history (they can differ from the lead's).
  const { amount, note, details, clientLang, client }: { amount: number; note?: string; details?: LeadQuoteDetails; clientLang?: string; client?: { name?: string; phone?: string } } =
    await request.json();
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "יש להזין סכום תקין" }, { status: 400 });
  }

  // A quote that changed after the client approved it needs their approval again: the client's page
  // opened on the old approval, so the new price was never seen or approved (audit 2026-10-13).
  const { data: before } = await supabase
    .from("leads")
    .select("quoted_amount, quote_details, quote_approved_at")
    .eq("id", leadId)
    .maybeSingle<{ quoted_amount: number | null; quote_details: unknown; quote_approved_at: string | null }>();
  const sentDetails = details && Array.isArray(details.items) && JSON.stringify(details).length < 20000 ? details : null;
  const changed =
    !!before &&
    (Number(before.quoted_amount) !== Number(amount) || (sentDetails !== null && stableJson(before.quote_details) !== stableJson(sentDetails)));

  const { data: lead, error } = await supabase
    .from("leads")
    .update({
      ...(changed && before?.quote_approved_at ? { quote_approved_at: null } : {}),
      quoted_amount: amount,
      quote_note: note || null,
      // The full quote from the builder (lib/leadQuote.ts); the old amount-only form sends none.
      ...(sentDetails ? { quote_details: sentDetails } : {}),
      quote_sent_at: new Date().toISOString(),
      status: "quoted",
      ...(isLang(clientLang) && canChooseClientLang(user.email) ? { client_lang: clientLang } : {}),
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת הצעת המחיר" }, { status: 500 });
  }

  await scheduleLeadQuoteFollowUp(supabase, leadId);
  // Every quote from the builder goes into the history (the amount-only form sends no items).
  if (sentDetails) {
    await recordQuoteHistory(supabase, {
      photographerId: user.id,
      leadId,
      clientName: client?.name || lead.name || "",
      clientPhone: client?.phone || lead.phone,
      clientLang: lead.client_lang ?? null,
      details: sentDetails,
      total: amount,
    });
  }

  return NextResponse.json({ lead });
}

// JSON with object keys sorted at every level: the database (jsonb) doesn't keep the key order the
// builder sent, so a plain JSON.stringify would call every resent quote "changed".
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
