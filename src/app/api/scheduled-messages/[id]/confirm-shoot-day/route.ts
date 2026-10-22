import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The photographer's answer to the shoot-day reminder window on the home screen
// (lib/shootDayReminder.ts): send=true records that the "יום הצילום" message went out (the window
// itself opened WhatsApp / SMS / email or copied it, in the tap), send=false records the cancel.
const CHANNEL_LABEL: Record<string, string> = { whatsapp: "בוואטסאפ", sms: "ב-SMS", email: "במייל", copy: "(הועתקה)" };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { send, channel }: { send: boolean; channel?: string } = await request.json();

  // RLS: only the photographer's own rows.
  const { data: message } = await supabase
    .from("scheduled_messages")
    .select("id, event_id")
    .eq("id", id)
    .eq("kind", "shoot_day_reminder")
    .eq("status", "awaiting_confirmation")
    .maybeSingle<{ id: string; event_id: string }>();
  if (!message) return NextResponse.json({ error: "הבקשה כבר טופלה או לא נמצאה" }, { status: 404 });

  if (!send) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({ event_id: message.event_id, text: "ביטלת את התזכורת לשליחת הודעת יום הצילום" });
    return NextResponse.json({ ok: true, sent: false });
  }

  await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: `נשלחה ללקוח הודעת יום הצילום ${CHANNEL_LABEL[channel ?? ""] ?? ""}`.trim(),
  });
  return NextResponse.json({ ok: true, sent: true });
}
