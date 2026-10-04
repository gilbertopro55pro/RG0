import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientLangFor } from "@/lib/clientLang";
import { reminderStillNeeded, type ClientReminderKind } from "@/lib/clientReminders";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// The photographer's answer to the dashboard prompt for an album-approval / song-selection
// reminder (lib/clientReminders.ts). send=true → the ready WhatsApp text to the client (opened
// client-side, like the review/payment prompts); send=false → skipped. If the client did it in
// the meantime, nothing is sent (done: true).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { send }: { send: boolean } = await request.json();

  // RLS: only the photographer's own rows.
  const { data: message } = await supabase
    .from("scheduled_messages")
    .select("id, event_id, kind, status")
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .in("kind", ["album_approval_reminder", "song_selection_reminder"])
    .maybeSingle<{ id: string; event_id: string; kind: ClientReminderKind; status: string }>();
  if (!message) return NextResponse.json({ error: "הבקשה כבר טופלה או לא נמצאה" }, { status: 404 });

  const album = message.kind === "album_approval_reminder";
  if (!send) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({
      event_id: message.event_id,
      text: album ? "דילגת על התזכורת לאישור עיצוב האלבום" : "דילגת על התזכורת לבחירת שירים לקליפ",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  if (!(await reminderStillNeeded(createServiceRoleClient(), message.event_id, message.kind))) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return NextResponse.json({ ok: true, sent: false, done: true });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_phone, client_lang, client_access_token, photographers(whatsapp_signature)")
    .eq("id", message.event_id)
    .maybeSingle<{
      client_name: string;
      client_phone: string | null;
      client_lang: string | null;
      client_access_token: string;
      photographers: { whatsapp_signature: string | null } | null;
    }>();
  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון לקוח" }, { status: 400 });
  }

  const t = makeT(messagesFor(clientLangFor(user.email, event.client_lang)));
  const link = `${request.nextUrl.origin}/portal/${event.client_access_token}`;
  let text = album
    ? t("היי {name} 😊\nרק מזכירים שעיצוב האלבום מחכה לאישור שלכם. אפשר לצפות ולאשר בפורטל האישי:\n{link}\n\nרוצים לשנות משהו? פשוט כתבו לי כאן.", { name: event.client_name, link })
    : t("היי {name} 😊\nרק מזכירים שהסרט המלא מחכה לכם להורדה בפורטל האישי.\nוגם, אשמח שתבחרו שיר או שניים לקליפ: שיר שקט ושיר קצבי 🎵\n{link}", { name: event.client_name, link });
  const signature = event.photographers?.whatsapp_signature?.trim();
  if (signature) text += `\n\n${signature}`;

  await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: album ? `נשלחה תזכורת לאישור עיצוב האלבום ל-${event.client_phone}` : `נשלחה תזכורת לבחירת שירים ל-${event.client_phone}`,
  });
  return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: text });
}
