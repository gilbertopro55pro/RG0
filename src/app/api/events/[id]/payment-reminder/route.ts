import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { PAYMENT_REMINDER_CHANNELS, type PaymentReminderChannel } from "@/lib/paymentReminder";

// Records a payment reminder sent from the dashboard's open balances (lib/paymentReminder.ts; the
// send itself is a wa.me / sms: / mailto: link opened on the tap). The event's log gets the line the
// dashboard reads back as "the last reminder", and the home screen's payment reminder prompt for the
// event, if it's showing, is closed: this was that reminder. Admin only for now (owner, 2026-10-19).
const CHANNEL_TEXT: Record<PaymentReminderChannel, string> = {
  whatsapp: "נשלחה תזכורת תשלום בוואטסאפ",
  sms: "נשלחה תזכורת תשלום ב-SMS",
  email: "נשלחה תזכורת תשלום במייל",
  copy: "הועתקה הודעת תזכורת תשלום לשליחה",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  if (user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { channel?: unknown } | null;
  const channel = PAYMENT_REMINDER_CHANNELS.find((c) => c === body?.channel);
  if (!channel) return NextResponse.json({ error: "ערוץ לא תקין" }, { status: 400 });

  const { data: event } = await supabase.from("events").select("id").eq("id", id).eq("photographer_id", user.id).maybeSingle<{ id: string }>();
  if (!event) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

  const sentAt = new Date().toISOString();
  const [{ error }] = await Promise.all([
    supabase.from("event_notifications").insert({ event_id: id, text: CHANNEL_TEXT[channel] }),
    supabase
      .from("scheduled_messages")
      .update({ status: "sent", sent_at: sentAt })
      .eq("event_id", id)
      .eq("kind", "payment_reminder")
      .eq("status", "awaiting_confirmation"),
  ]);
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ ok: true, sentAt });
}
