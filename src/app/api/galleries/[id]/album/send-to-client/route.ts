import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientLangFor } from "@/lib/clientLang";
import { shortClientUrl } from "@/lib/shortLinks";
import { SITE_URL } from "@/lib/siteUrl";
import { ALBUM_CLIENT_SEARCH, albumApprovalMessage, albumApprovalSubject, type AlbumClientInfo } from "@/lib/albumApproval";
import { scheduleAlbumApprovalReminder } from "@/lib/clientReminders";

type GalleryPick = {
  id: string;
  title: string | null;
  event_id: string | null;
  client_phone: string | null;
  client_email: string | null;
  access_token: string;
  published: boolean;
  archived_at: string | null;
};
type EventPick = { client_name: string; client_phone: string | null; client_email: string | null; client_lang: string | null };

const CHANNEL_LABEL: Record<string, string> = { whatsapp: "וואטסאפ", sms: "SMS", email: "מייל", copy: "הודעה שהועתקה" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(supabase: any, galleryId: string) {
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, title, event_id, client_phone, client_email, access_token, published, archived_at")
    .eq("id", galleryId)
    .maybeSingle();
  if (!gallery) return null;
  const g = gallery as GalleryPick;
  const { data: event } = g.event_id
    ? await supabase.from("events").select("client_name, client_phone, client_email, client_lang").eq("id", g.event_id).maybeSingle()
    : { data: null };
  return { gallery: g, event: (event ?? null) as EventPick | null };
}

// The album tool's "שליחה לאישור הלקוח/ה" (lib/albumApproval.ts). GET: what the send window needs —
// the client (the gallery's event, else the gallery's own contact), the gallery's short link that
// opens the album, and the message ready in the client's language. Read-only: the window opens on it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const found = await load(supabase, id);
  if (!found) return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  const { gallery, event } = found;
  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, email, whatsapp_signature")
    .eq("id", user.id)
    .maybeSingle<{ name: string | null; email: string | null; whatsapp_signature: string | null }>();

  const lang = clientLangFor(photographer?.email ?? user.email, event?.client_lang ?? null);
  const link = shortClientUrl(SITE_URL, "gallery", gallery.access_token, ALBUM_CLIENT_SEARCH);
  const clientName = event?.client_name?.trim() ?? "";
  const info: AlbumClientInfo = {
    published: gallery.published && !gallery.archived_at,
    client: {
      name: clientName,
      phone: event?.client_phone?.trim() || gallery.client_phone?.trim() || null,
      email: event?.client_email?.trim() || gallery.client_email?.trim() || null,
      lang,
    },
    link,
    message: albumApprovalMessage({ clientName, link, signature: photographer?.whatsapp_signature, senderName: photographer?.name, lang }),
    subject: albumApprovalSubject(lang),
  };
  return NextResponse.json(info);
}

// POST { channel }: the photographer sent it (recorded on the way out, keepalive). The album shows
// as sent from now on, the event's log says so, and the reminder to nudge the client is scheduled.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body: { channel?: string } = await request.json().catch(() => ({}));

  const found = await load(supabase, id);
  if (!found) return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  const { gallery } = found;

  const now = new Date().toISOString();
  const { data: album } = await supabase
    .from("gallery_albums")
    .update({ status: "sent", sent_at: now })
    .eq("gallery_id", gallery.id)
    .neq("status", "approved")
    .select("id, status, sent_at")
    .maybeSingle<{ id: string; status: string; sent_at: string }>();
  if (!album) return NextResponse.json({ error: "האלבום לא נמצא או שכבר אושר" }, { status: 404 });
  // A new round with the client: what they changed so far is now part of the design that was sent,
  // so "undo all my changes" and "back" start from this one (lib/albumClientEdit.ts).
  await supabase
    .from("gallery_album_spreads")
    .update({ client_original: null, client_history: null, client_edited_at: null })
    .eq("album_id", album.id)
    .or("client_original.not.is.null,client_history.not.is.null,client_edited_at.not.is.null");

  let reminderDays: number | null = null;
  if (gallery.event_id) {
    const channel = CHANNEL_LABEL[body.channel ?? ""] ?? null;
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: channel ? `עיצוב האלבום נשלח ללקוח לאישור (${channel})` : "עיצוב האלבום נשלח ללקוח לאישור",
    });
    const eventId = gallery.event_id;
    reminderDays = await (async () => scheduleAlbumApprovalReminder(createServiceRoleClient(), eventId))().catch((e) => {
      console.error("Album reminder schedule failed:", e);
      return null;
    });
  }
  return NextResponse.json({ ok: true, album, reminderDays });
}
