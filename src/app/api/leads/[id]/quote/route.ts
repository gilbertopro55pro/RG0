import { NextResponse } from "next/server";
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import { createClient } from "@/lib/supabase/server";
import { scheduleLeadQuoteFollowUp } from "@/lib/leadFollowUp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { amount, note, details }: { amount: number; note?: string; details?: LeadQuoteDetails } = await request.json();
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "יש להזין סכום תקין" }, { status: 400 });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update({
      quoted_amount: amount,
      quote_note: note || null,
      // The full quote from the builder (lib/leadQuote.ts); the old amount-only form sends none.
      ...(details && Array.isArray(details.items) && JSON.stringify(details).length < 20000 ? { quote_details: details } : {}),
      quote_sent_at: new Date().toISOString(),
      status: "quoted",
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "שגיאה ביצירת הצעת המחיר" }, { status: 500 });
  }

  await scheduleLeadQuoteFollowUp(supabase, leadId);

  return NextResponse.json({ lead });
}
