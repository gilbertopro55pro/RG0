import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, event_id, status")
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .single<{ id: string; event_id: string; status: string }>();

  if (!message) {
    return NextResponse.json({ error: "הבקשה כבר טופלה או לא נמצאה" }, { status: 404 });
  }

  if (!send) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({
      event_id: message.event_id,
      text: "דילגת על בקשת הביקורת",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_phone, client_lang")
    .eq("id", message.event_id)
    .single<{ client_name: string; client_phone: string | null; client_lang: string | null }>();

  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון לקוח" }, { status: 400 });
  }

  // The actual send happens client-side (wa.me deep link — see ReviewRequestPrompts.tsx); this
  // just builds the message and marks the request handled.
  const reviewLink = process.env.GOOGLE_REVIEW_LINK || "";
  // In the client's language (UI languages phase 3); "he" for every non-admin account.
  const message_text = makeT(messagesFor(clientLangFor(user.email, event.client_lang)))(
    "שלום {name},\nתודה שבחרתם בנו! נשמח מאוד אם תוכלו להשאיר לנו כמה מילים וביקורת 🙏\n\n{link}",
    { name: event.client_name, link: reviewLink }
  );

  await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: `נשלחה בקשת ביקורת ל-${event.client_phone}`,
  });

  return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: message_text });
}
