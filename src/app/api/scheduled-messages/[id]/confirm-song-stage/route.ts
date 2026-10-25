import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markClientDone } from "@/lib/clientReminders";

// The photographer's answer to the song-stage reminder window on the home screen
// (lib/songStageReminder.ts): send=true records that the reminder to choose the clip songs went out
// (the window itself opened WhatsApp / SMS / email or copied it, in the tap), send=false records
// the skip. The next reminder comes 3 days later if the songs still aren't chosen.
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
    .select("id, event_id, events(songs_chosen_at)")
    .eq("id", id)
    .eq("kind", "song_stage_reminder")
    .eq("status", "awaiting_confirmation")
    .maybeSingle<{ id: string; event_id: string; events: { songs_chosen_at: string | null } | null }>();
  if (!message) return NextResponse.json({ error: "הבקשה כבר טופלה או לא נמצאה" }, { status: 404 });

  if (!send) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({ event_id: message.event_id, text: "דילגת על התזכורת לבחירת שירים לקליפ" });
    return NextResponse.json({ ok: true, sent: false });
  }

  // Chosen in the meantime: nothing to record as sent (markClientDone closed the rest already).
  if (message.events?.songs_chosen_at) {
    await markClientDone(supabase, message.event_id, "client_song_selection");
    return NextResponse.json({ ok: true, sent: false, done: true });
  }

  await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: `נשלחה ללקוח תזכורת לבחירת שירים לקליפ ${CHANNEL_LABEL[channel ?? ""] ?? ""}`.trim(),
  });
  return NextResponse.json({ ok: true, sent: true });
}
