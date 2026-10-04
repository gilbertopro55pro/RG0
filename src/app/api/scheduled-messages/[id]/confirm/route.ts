import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientLangFor } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
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

  const { paid }: { paid: boolean } = await request.json();

  const { data: message } = await supabase
    .from("scheduled_messages")
    .select("id, event_id, status")
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .single<{ id: string; event_id: string; status: string }>();

  if (!message) {
    return NextResponse.json({ error: "התזכורת כבר טופלה או לא נמצאה" }, { status: 404 });
  }

  if (paid) {
    await supabase
      .from("event_payments")
      .update({ balance_paid: true, balance_paid_at: new Date().toISOString() })
      .eq("event_id", message.event_id);
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({
      event_id: message.event_id,
      text: "אושר שהיתרה שולמה. לא נשלחה תזכורת ללקוח",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_phone, client_access_token, client_lang")
    .eq("id", message.event_id)
    .single<{ client_name: string; client_phone: string | null; client_access_token: string; client_lang: string | null }>();
  const { data: payment } = await supabase
    .from("event_payments")
    .select("balance_amount")
    .eq("event_id", message.event_id)
    .single<{ balance_amount: number }>();

  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון לקוח" }, { status: 400 });
  }

  // The actual send now happens client-side (a wa.me deep link the photographer confirms
  // themselves — see PaymentReminderPrompts.tsx). This just builds the message and marks the
  // reminder handled; there's no server callback to confirm the tap actually happened, same
  // as the other interactive wa.me flows.
  const portalLink = `${new URL(request.url).origin}/portal/${event.client_access_token}`;
  // In the client's language (UI languages phase 3); "he" for every non-admin account, where the
  // amount stays unformatted exactly as before.
  const lang = clientLangFor(user.email, event.client_lang);
  const balance = payment?.balance_amount ?? 0;
  const message_text = makeT(messagesFor(lang))(
    "שלום {name},\nתזכורת ידידותית, נשארה יתרה של ₪{amount} לתשלום עבור האירוע שלכם.\n\nלצפייה בפרטי התשלום ניתן להיכנס לפורטל האישי שלכם:\n{link}",
    { name: event.client_name, amount: lang === "he" ? balance : Number(balance).toLocaleString(dateLocale(lang)), link: portalLink }
  );

  await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: `נשלחה תזכורת תשלום ל-${event.client_phone}`,
  });

  return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: message_text });
}
