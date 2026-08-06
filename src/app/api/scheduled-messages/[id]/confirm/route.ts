import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_REMINDER_TEMPLATE } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      text: "אושר שהיתרה שולמה — לא נשלחה תזכורת ללקוח",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_phone")
    .eq("id", message.event_id)
    .single<{ client_name: string; client_phone: string | null }>();
  const { data: payment } = await supabase
    .from("event_payments")
    .select("balance_amount")
    .eq("event_id", message.event_id)
    .single<{ balance_amount: number }>();

  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון לקוח" }, { status: 400 });
  }

  try {
    await sendWhatsAppTemplate(event.client_phone, PAYMENT_REMINDER_TEMPLATE, [
      event.client_name,
      String(payment?.balance_amount ?? 0),
    ]);
    await supabase
      .from("scheduled_messages")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", message.id);
    await supabase.from("event_notifications").insert({
      event_id: message.event_id,
      text: `נשלחה תזכורת תשלום ל-${event.client_phone}`,
    });
    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
    const errorText = friendlyWhatsAppError(raw);
    await supabase.from("event_notifications").insert({ event_id: message.event_id, text: errorText });
    return NextResponse.json({ error: errorText }, { status: 500 });
  }
}
