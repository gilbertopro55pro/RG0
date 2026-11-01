import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientLangFor } from "@/lib/clientLang";
import { reminderStillNeeded, type ClientReminderKind } from "@/lib/clientReminders";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import { shortClientUrl } from "@/lib/shortLinks";
import { ALBUM_CLIENT_SEARCH } from "@/lib/albumApproval";
import { formatClientMessage } from "@/lib/clientMessageFormat";

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

  const { send, dryRun }: { send: boolean; dryRun?: boolean } = await request.json();

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
    .select("client_name, client_phone, client_lang, client_access_token, photographers(whatsapp_signature, name)")
    .eq("id", message.event_id)
    .maybeSingle<{
      client_name: string;
      client_phone: string | null;
      client_lang: string | null;
      client_access_token: string;
      photographers: { whatsapp_signature: string | null; name: string | null } | null;
    }>();
  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון לקוח" }, { status: 400 });
  }

  const lang = clientLangFor(user.email, event.client_lang);
  const t = makeT(messagesFor(lang));
  // An album sent from the album tool waits in the client's gallery: the reminder links right to it
  // (it opens on the album, lib/albumApproval.ts). Otherwise the portal, as before.
  const { data: albumGallery } = album
    ? await supabase
        .from("galleries")
        .select("access_token, gallery_albums!inner(status)")
        .eq("event_id", message.event_id)
        .eq("published", true)
        .is("archived_at", null)
        .in("gallery_albums.status", ["sent", "changes_requested"])
        .limit(1)
        .maybeSingle<{ access_token: string }>()
    : { data: null };
  const link = albumGallery
    ? shortClientUrl(request.nextUrl.origin, "gallery", albumGallery.access_token, ALBUM_CLIENT_SEARCH)
    : shortClientUrl(request.nextUrl.origin, "portal", event.client_access_token);
  // The fixed client-message shape (lib/clientMessageFormat.ts): greeting, body, "קישור:" line,
  // blank line, the photographer's signature (or name).
  const body = album
    ? albumGallery
      ? t("עיצוב האלבום שלכם ממתין לאישורכם.\nאפשר לדפדף בו, ובסוף לאשר את העיצוב או לסמן תיקונים, כשיתאפשר לכם.")
      : t("עיצוב האלבום שלכם ממתין לאישורכם.\nאפשר לצפות בו ולאשר אותו בפורטל האישי שלכם, ואם תרצו לשנות משהו, נשמח לשמוע.")
    : t("רצינו לעדכן שהסרט המלא ממתין לכם להורדה בפורטל האישי שלכם.\nכדי שנוכל להתחיל בעריכת הקליפ, נשמח שתבחרו שיר או שניים: שיר שקט ושיר קצבי 🎵");
  const text = formatClientMessage({
    lang,
    name: event.client_name,
    body,
    link,
    signature: event.photographers?.whatsapp_signature,
    senderName: event.photographers?.name,
  });

  // A preview (dryRun): the prompt fetches the message when it shows, so the send button opens
  // WhatsApp right in the tap (iPhone blocks it after a request) and only then records the send.
  if (dryRun) return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: text });

  await supabase.from("scheduled_messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: album ? `נשלחה תזכורת לאישור עיצוב האלבום ל-${event.client_phone}` : `נשלחה תזכורת לבחירת שירים ל-${event.client_phone}`,
  });
  return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: text });
}
