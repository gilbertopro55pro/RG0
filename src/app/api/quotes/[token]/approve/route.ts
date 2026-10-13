import { NextResponse } from "next/server";
import { sendPushToPhotographer } from "@/lib/push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { LeadRow } from "@/lib/types";
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import { findDateConflict } from "@/lib/dateConflict";
import { notifyDateTaken } from "@/lib/dateTakenNotify";
import { photographerLang } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// Public, token-authenticated (the client has no login) — admin-gated for now, same staged-rollout
// pattern as every other "עדכון אדמין" feature this app has shipped: the tool needs to be flawless
// on the real account before it goes out to every photographer's clients.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*, photographers(name, email, ui_lang)")
    .eq("quote_token", token)
    .maybeSingle<LeadRow & { quote_details: LeadQuoteDetails | null; photographers: { name: string; email: string; ui_lang: string | null } | null }>();

  if (!lead || !lead.quoted_amount) {
    return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });
  }
  if (lead.quote_approved_at) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  // The quote's date taken in the meantime (owner, 2026-10-12): the quote isn't approved, the client
  // page asks the client to call the photographer, and the photographer is told. The same check the
  // questionnaire runs next (events in the app, not Google Calendar, where a photographer often holds
  // this very client's date), so a client is never let through here only to be stopped there.
  const date = [lead.quote_details?.eventDate, lead.event_date_interest].find((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (date) {
    const takenBy = await findDateConflict(supabase, {
      photographerId: lead.photographer_id,
      date,
      start: lead.quote_details?.startTime || null,
      end: lead.quote_details?.endTime || null,
      calendar: false,
      excludeEventId: lead.converted_event_id ?? undefined,
    });
    if (takenBy) {
      await notifyDateTaken(supabase, lead, { date, clientName: lead.name, clientPhone: lead.phone ?? "", takenBy, stage: "approve" });
      return NextResponse.json({ dateTaken: true, date, error: "התאריך הזה כבר לא פנוי. עדכנו את הצלם, והוא ייצור איתכם קשר כדי לתאם." }, { status: 409 });
    }
  }

  const { error } = await supabase.from("leads").update({ quote_approved_at: new Date().toISOString() }).eq("id", lead.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // No "the quote is still open" nudge after the client approved it.
  await supabase
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("lead_id", lead.id)
    .eq("kind", "lead_quote_followup")
    .eq("status", "pending");

  // To the photographer, in their own language (photographers.ui_lang).
  const t = makeT(messagesFor(photographerLang(lead.photographers?.ui_lang)));
  await sendPushToPhotographer(lead.photographer_id, {
    title: t("{name} אישרו את הצעת המחיר", { name: lead.name }),
    body: t("לחצו לפתיחת הלידים"),
    url: "/leads",
    tag: `quote-${lead.id}`,
  });

  // No event_notifications entry here — that table's event_id is NOT NULL (no event exists yet at
  // this point). The photographer finds out once the questionnaire step actually creates the
  // event and its own email fires.
  return NextResponse.json({ ok: true });
}
