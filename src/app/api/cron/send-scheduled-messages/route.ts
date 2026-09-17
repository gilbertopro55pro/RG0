import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { LEAD_FOLLOW_UP_TEMPLATES } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";

type ScheduledMessage = {
  id: string;
  event_id: string | null;
  lead_id: string | null;
  kind: "review_request" | "payment_reminder" | "lead_follow_up" | "lead_quote_followup";
  sequence_step: number | null;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: due } = await supabase
    .from("scheduled_messages")
    .select("id, event_id, lead_id, kind, sequence_step")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .returns<ScheduledMessage[]>();

  const results = [];

  for (const message of due ?? []) {
    if (message.kind === "lead_follow_up") {
      results.push(await processLeadFollowUp(supabase, message));
      continue;
    }
    if (message.kind === "lead_quote_followup") {
      results.push(await processLeadQuoteFollowup(supabase, message));
      continue;
    }

    const { data: event } = await supabase
      .from("events")
      .select("client_name, client_phone")
      .eq("id", message.event_id)
      .single<{ client_name: string; client_phone: string | null }>();

    if (!event?.client_phone) {
      await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
      results.push({ id: message.id, status: "failed", reason: "no client phone" });
      continue;
    }

    // Neither payment reminders nor review requests message the client directly from here —
    // both need a live browser to open the wa.me deep link, so this just flags them pending;
    // the photographer taps to actually send from the dashboard prompt (see
    // PaymentReminderPrompts.tsx / ReviewRequestPrompts.tsx and their confirm routes).
    const pendingText =
      message.kind === "payment_reminder"
        ? "הגיע מועד תזכורת התשלום — ממתין לאישורך שהיתרה עדיין לא שולמה"
        : "הגיע מועד בקשת הביקורת — ממתין לאישורך לשליחה";
    await supabase.from("scheduled_messages").update({ status: "awaiting_confirmation" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({ event_id: message.event_id, text: pendingText });
    results.push({ id: message.id, status: "awaiting_confirmation" });
  }

  return NextResponse.json({ processed: results.length, results });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processLeadFollowUp(supabase: SupabaseClient<any>, message: ScheduledMessage) {
  const { data: lead } = await supabase
    .from("leads")
    .select("name, phone, status")
    .eq("id", message.lead_id)
    .single<{ name: string; phone: string | null; status: string }>();

  // The lead converted or died since this step was scheduled — nothing to send. This is a
  // defensive fallback; the normal path cancels these rows outright when status changes
  // (see cancelLeadFollowUps), so this should rarely actually trigger.
  if (!lead || lead.status === "won" || lead.status === "lost") {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "lead no longer active" };
  }
  if (!lead.phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return { id: message.id, status: "failed", reason: "no lead phone" };
  }

  const step = LEAD_FOLLOW_UP_TEMPLATES[(message.sequence_step ?? 1) - 1];
  try {
    await sendWhatsAppTemplate(lead.phone, step.template, [lead.name]);
    await supabase
      .from("scheduled_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", message.id);
    return { id: message.id, status: "sent" };
  } catch (e) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return { id: message.id, status: "failed", reason: e instanceof Error ? e.message : "unknown" };
  }
}

type FollowUpLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  event_date_interest: string | null;
  event_type_name: string | null;
  quoted_amount: number | null;
  status: string;
  photographer_id: string;
};

// Fires 2 days after a quote is sent from the leads page. Unlike processLeadFollowUp above, this
// notifies the PHOTOGRAPHER, not the lead — a free-form email carries the full name/phone/date/
// type/amount block (a WhatsApp Business template can't: Meta only approves templates with a
// fixed body and a handful of named variable slots, see src/lib/whatsapp.ts's comment on
// sendWhatsAppTemplate), and the dashboard "awaiting_confirmation" prompt gives the photographer
// a one-tap wa.me link to the lead itself, the same pattern payment/review reminders already use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processLeadQuoteFollowup(supabase: SupabaseClient<any>, message: ScheduledMessage) {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, email, event_date_interest, event_type_name, quoted_amount, status, photographer_id")
    .eq("id", message.lead_id)
    .single<FollowUpLead>();

  if (!lead || lead.status === "won" || lead.status === "lost") {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return { id: message.id, status: "canceled", reason: "lead no longer active" };
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("email")
    .eq("id", lead.photographer_id)
    .maybeSingle<{ email: string }>();

  const detailsBlock =
    `שם מלא: ${lead.name}\n` +
    `טלפון: ${lead.phone ?? "לא צוין"}\n` +
    `תאריך האירוע: ${lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString("he-IL") : "לא צוין"}\n` +
    `סוג האירוע: ${lead.event_type_name ?? "לא צוין"}\n` +
    `סכום ההצעה: ₪${lead.quoted_amount ?? 0}`;

  if (photographer?.email) {
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: `תזכורת מעקב אחרי הצעת מחיר — ${lead.name}`,
        text: `שלום,\n\nעברו יומיים מאז שנשלחה הצעת מחיר ל${lead.name} ועדיין לא התקבלה תשובה — כדאי לבצע פולואפ:\n\n${detailsBlock}\n\nאפשר לבצע את הפולואפ ישירות מהאפליקציה, בעמוד הלידים.`,
      });
    } catch (e) {
      console.error("Lead quote follow-up email to photographer failed:", e);
    }
  }

  // Bonus: a gentle automatic nudge straight to the client too, when we actually have an email
  // for them — free-form, so no WhatsApp-template limitation applies here.
  if (lead.email) {
    try {
      await sendEmail({
        to: lead.email,
        subject: "רק מזכירים את ההצעה שלנו",
        text: `שלום ${lead.name},\n\nרצינו להזכיר שההצעת מחיר ששלחנו לכם עדיין פתוחה, ונשמח לעמוד לרשותכם לכל שאלה או לתיאום.`,
      });
    } catch (e) {
      console.error("Lead quote follow-up email to lead failed:", e);
    }
  }

  await supabase.from("scheduled_messages").update({ status: "awaiting_confirmation" }).eq("id", message.id);
  await supabase.from("event_notifications").insert({
    lead_id: lead.id,
    text: "הגיע מועד המעקב אחרי הצעת המחיר שנשלחה — ממתין לאישורך לשליחה בוואטסאפ",
  });

  return { id: message.id, status: "awaiting_confirmation" };
}
