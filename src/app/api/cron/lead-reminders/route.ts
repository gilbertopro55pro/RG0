import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isLockedOut, type AccessRow } from "@/lib/appAccess";
import { photographerLang } from "@/lib/clientLang";
import { sendPushToPhotographer } from "@/lib/push";
import { FOLLOW_UP_LEAD_COLUMNS, quoteFollowUpHandled, type FollowUpLeadState } from "@/lib/leadFollowUp";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Every minute: the phone notification for a lead reminder set from the new-lead popup ("תזכורת",
// api/leads/assistant-new; owner, 2026-10-14) that just fell due, unless the lead was handled by hand
// in the meantime (the same conditions as the popup). Once per reminder: assistant_remind_pushed_at,
// which setting a new reminder clears. The popup shows the lead again when the app is next opened.
// The same for a quote follow-up put off with "תזכורת" (owner, 2026-10-15; scheduled_messages
// remind_at / remind_pushed_at): one handled by hand since (lib/leadFollowUp.ts) is closed instead.

type DueFollowUp = {
  id: string;
  remind_set_at: string | null;
  leads:
    | (FollowUpLeadState & {
        id: string;
        name: string;
        quoted_amount: number | null;
        photographer_id: string;
        photographers: (AccessRow & { ui_lang: string | null }) | null;
      })
    | null;
};

type DueLead = {
  id: string;
  photographer_id: string;
  name: string;
  event_type_name: string | null;
  event_date_interest: string | null;
  photographers: (AccessRow & { ui_lang: string | null }) | null;
};

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .select("id, photographer_id, name, event_type_name, event_date_interest, photographers(email, subscription_status, trial_ends_at, ui_lang)")
    .eq("source", "assistant")
    .is("archived_at", null)
    .lte("assistant_remind_at", now)
    .is("assistant_remind_pushed_at", null)
    .eq("status", "new")
    .is("quote_sent_at", null)
    .is("quoted_amount", null)
    .is("converted_event_id", null)
    .limit(100)
    .returns<DueLead[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const lead of data ?? []) {
    // Claim it first, so two overlapping runs can't both send.
    const { data: claimed } = await supabase
      .from("leads")
      .update({ assistant_remind_pushed_at: now })
      .eq("id", lead.id)
      .is("assistant_remind_pushed_at", null)
      .select("id");
    if (!claimed?.length || isLockedOut(lead.photographers)) continue;
    const lang = photographerLang(lead.photographers?.ui_lang);
    const t = makeT(messagesFor(lang));
    const date = lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString(dateLocale(lang)) : null;
    const delivered = await sendPushToPhotographer(lead.photographer_id, {
      title: t("תזכורת: {name} עדיין מחכה לתשובה", { name: lead.name }),
      body: [lead.event_type_name, date].filter(Boolean).join(" · ") || t("לחצו לפתיחת הלידים"),
      url: "/leads",
      tag: `lead-reminder-${lead.id}`,
    });
    sent += delivered;
  }

  const { data: followUps, error: followUpsError } = await supabase
    .from("scheduled_messages")
    .select(`id, remind_set_at, leads(id, name, quoted_amount, photographer_id, ${FOLLOW_UP_LEAD_COLUMNS}, photographers(email, subscription_status, trial_ends_at, ui_lang))`)
    .eq("kind", "lead_quote_followup")
    .eq("status", "awaiting_confirmation")
    .lte("remind_at", now)
    .is("remind_pushed_at", null)
    .limit(100)
    .returns<DueFollowUp[]>();
  if (followUpsError) return NextResponse.json({ error: followUpsError.message }, { status: 500 });

  let followUpsSent = 0;
  for (const f of followUps ?? []) {
    const lead = f.leads;
    // Claimed first (as above); a follow-up whose lead was handled meanwhile is closed with it.
    const handled = quoteFollowUpHandled(lead, f.remind_set_at);
    const { data: claimed } = await supabase
      .from("scheduled_messages")
      .update(handled ? { remind_pushed_at: now, status: "canceled" } : { remind_pushed_at: now })
      .eq("id", f.id)
      .eq("status", "awaiting_confirmation")
      .is("remind_pushed_at", null)
      .select("id");
    if (handled || !claimed?.length || !lead || isLockedOut(lead.photographers)) continue;
    const lang = photographerLang(lead.photographers?.ui_lang);
    const t = makeT(messagesFor(lang));
    const amount = lead.quoted_amount ?? 0;
    followUpsSent += await sendPushToPhotographer(lead.photographer_id, {
      title: t("תזכורת: מעקב אחרי ההצעה ל{name}", { name: lead.name }),
      body: t("הצעת מחיר של ₪{amount}. לחצו כדי לשלוח תזכורת בוואטסאפ.", { amount: lang === "he" ? amount : Number(amount).toLocaleString(dateLocale(lang)) }),
      url: "/",
      tag: `quote-followup-${f.id}`,
    });
  }
  return NextResponse.json({ due: data?.length ?? 0, sent, followUps: followUps?.length ?? 0, followUpsSent });
}
