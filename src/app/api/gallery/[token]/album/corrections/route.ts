import { NextResponse, after } from "next/server";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { correctedPageNumbers, parseCorrectionPages } from "@/lib/albumCorrections";
import { clientChangedPages } from "@/lib/albumClientEdit";
import { sendPushToPhotographer } from "@/lib/push";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { photographerLang } from "@/lib/clientLang";
import { PAGE_LINK_TTL, shortPageUrl } from "@/lib/shortFileLinks";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";

// The client's corrections on the album design (owner, 2026-10-27): "צריך תיקונים" in the gallery's
// album view, marks drawn on the pages and a note per page, sent at once (lib/albumCorrections.ts).
// Only the client's own gallery link (galleries.access_token, published, not archived): a read-only
// share link has a token of its own and never reaches the album. The album goes back to the
// photographer (status changes_requested), and they get an email and a phone notification with a
// short link to the marks (/album-corrections/<id>).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Each submission notifies the photographer; a ceiling per device stops a flood.
  const { allowed } = await checkRateLimit(`album-corrections:${clientIpFrom(request)}`, { maxRequests: 10, windowSeconds: 600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות" }, { status: 429 });

  const body: unknown = await request.json().catch(() => null);
  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<GalleryRow>();
  if (!gallery) return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });

  const { data: album } = await supabase
    .from("gallery_albums")
    .select("*")
    .eq("gallery_id", gallery.id)
    .neq("status", "draft")
    .maybeSingle<GalleryAlbumRow>();
  if (!album) return NextResponse.json({ error: "האלבום לא נמצא" }, { status: 404 });
  if (album.status === "approved") return NextResponse.json({ error: "העיצוב כבר אושר" }, { status: 409 });

  const { data: spreads } = await supabase
    .from("gallery_album_spreads")
    .select("id, client_edited_at")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .returns<{ id: string; client_edited_at: string | null }[]>();
  const spreadOrder = (spreads ?? []).map((s) => s.id);
  const pages = parseCorrectionPages(body, spreadOrder);
  if (!pages) return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("gallery_album_corrections")
    .insert({ album_id: album.id, gallery_id: gallery.id, photographer_id: gallery.photographer_id, pages })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) return NextResponse.json({ error: "השליחה נכשלה" }, { status: 500 });

  // The design goes back to the photographer.
  if (album.status !== "changes_requested") {
    await supabase.from("gallery_albums").update({ status: "changes_requested" }).eq("id", album.id);
  }
  if (gallery.event_id) {
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: "הלקוח/ה סימנו תיקונים בעיצוב האלבום",
      is_client_action: true,
    });
  }

  const pageNumbers = correctedPageNumbers(pages, spreadOrder);
  // Pages the client also changed themselves (lib/albumClientEdit.ts), which stay as they left them.
  const changedPages = clientChangedPages(spreads ?? []);
  after(() => notifyPhotographer(gallery, row.id, pageNumbers, changedPages).catch((e) => console.error("[album/corrections] notify failed", e)));
  return NextResponse.json({ ok: true });
}

// An email and a phone notification, in the photographer's language, with a short link to the marks.
// Best-effort: the client's corrections are saved either way.
async function notifyPhotographer(gallery: GalleryRow, correctionId: string, pageNumbers: number[], changedPages: number[]) {
  const supabase = createServiceRoleClient();
  const [{ data: photographer }, { data: event }] = await Promise.all([
    supabase.from("photographers").select("name, email, ui_lang").eq("id", gallery.photographer_id).maybeSingle<{ name: string | null; email: string | null; ui_lang: string | null }>(),
    gallery.event_id
      ? supabase.from("events").select("client_name").eq("id", gallery.event_id).maybeSingle<{ client_name: string | null }>()
      : Promise.resolve({ data: null as { client_name: string | null } | null }),
  ]);
  const t = makeT(messagesFor(photographerLang(photographer?.ui_lang)));
  const name = event?.client_name?.trim() || gallery.title?.trim() || t("האלבום");
  const path = `/album-corrections/${correctionId}`;
  const title = t("יש תיקונים לביצוע באלבום {name}", { name });
  const pagesLine = t("עמודים עם תיקונים: {pages}", { pages: pageNumbers.join(", ") });

  await sendPushToPhotographer(gallery.photographer_id, {
    title,
    body: `${pagesLine}. ${t("לחצו לצפייה בתיקונים")}`,
    url: path,
    tag: `album-${gallery.event_id ?? gallery.id}`,
  });

  if (!photographer?.email) return;
  const link = await shortPageUrl(path, { photographerId: gallery.photographer_id, ttlSeconds: PAGE_LINK_TTL });
  await sendEmail({
    to: notificationEmailFor(photographer.email),
    subject: title,
    text:
      `${t("שלום {name},", { name: photographer.name ?? "" })}\n\n` +
      `${t("{client} סימנו תיקונים בעיצוב האלבום.", { client: name })}\n` +
      `${pagesLine}\n` +
      (changedPages.length ? `${t("הם גם שינו בעצמם את העיצוב בעמודים: {pages}.", { pages: changedPages.join(", ") })}\n` : "") +
      "\n" +
      `${t("לצפייה בתיקונים:")}\n${link}`,
  });
}
