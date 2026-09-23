import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("client_name, client_phone, client_access_token")
    .eq("id", message.event_id)
    .single<{ client_name: string; client_phone: string | null; client_access_token: string }>();
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
  const message_text =
    `שלום ${event.client_name},\nתזכורת ידידותית, נשארה יתרה של ₪${payment?.balance_amount ?? 0} לתשלום עבור האירוע שלכם.\n\n` +
    `לצפייה בפרטי התשלום ניתן להיכנס לפורטל האישי שלכם:\n${portalLink}`;

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
