import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leadQuoteFollowUpMessage } from "@/lib/leadFollowUp";
import { clientLangFor } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { send }: { send: boolean } = await request.json();

  const { data: message } = await supabase
    .from("scheduled_messages")
    .select("id, lead_id, status")
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .single<{ id: string; lead_id: string; status: string }>();

  if (!message) {
    return NextResponse.json({ error: "התזכורת כבר טופלה או לא נמצאה" }, { status: 404 });
  }

  if (!send) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({
      lead_id: message.lead_id,
      text: "דילגת על תזכורת המעקב",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("name, phone, client_lang")
    .eq("id", message.lead_id)
    .single<{ name: string; phone: string | null; client_lang: string | null }>();

  if (!lead?.phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון ללקוח/ה" }, { status: 400 });
  }

  // Same pattern as payment/review reminders: the actual send happens client-side via a wa.me
  // deep link the photographer taps themselves (see PendingClientMessagePrompts.tsx) — no server
  // callback confirms the tap actually happened, just that the prompt was resolved.
  const { data: photographer } = await supabase
    .from("photographers")
    .select("whatsapp_signature, email")
    .eq("id", user.id)
    .maybeSingle<{ whatsapp_signature: string | null; email: string | null }>();
  // In the lead's language (UI languages phase 3): Hebrew (every non-admin account) is the shared
  // lib text unchanged; en/ru translate the same greeting + line, and the photographer's own
  // signature is appended as written, exactly like leadQuoteFollowUpMessage does.
  const lang = clientLangFor(photographer?.email, lead.client_lang);
  let message_text = leadQuoteFollowUpMessage(lead.name, photographer?.whatsapp_signature);
  if (lang !== "he") {
    const body = makeT(messagesFor(lang))(
      "שלום {name},\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.",
      { name: lead.name }
    );
    const signature = photographer?.whatsapp_signature?.trim();
    message_text = signature ? `${body}\n\n${signature}` : body;
  }

  await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", message.id);
  await supabase.from("event_notifications").insert({
    lead_id: message.lead_id,
    text: `נשלחה תזכורת מעקב ל-${lead.phone}`,
  });

  return NextResponse.json({ ok: true, sent: true, clientPhone: lead.phone, message: message_text });
}
