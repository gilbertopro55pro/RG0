import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { notifyPhotographerOfAlbumActivity } from "@/lib/albumNotify";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";
import { markClientDone } from "@/lib/clientReminders";
import { autoPrintLogLine, autoSendApprovedAlbum, markAlbumApprovalStageDone, type AutoPrintResult } from "@/lib/albumApproved";
import { sendPushToPhotographer } from "@/lib/push";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { photographerLang } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import { shortPageUrl, PAGE_LINK_TTL } from "@/lib/shortFileLinks";
import { clientChangedPages } from "@/lib/albumClientEdit";

export const runtime = "nodejs";

// The client approves the album design in the gallery (GalleryAlbumProofing's "אישור העיצוב").
// The album turns approved, and (owner, 2026-10-27; lib/albumApproved.ts) the event's album
// approval stage is marked done, the photographer is told (push and email), and the album goes to
// the print house by itself unless switched off. Once only: approving an approved album does nothing,
// so a second tap never sends the album to print twice.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<GalleryRow>();
  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { data: album } = await supabase
    .from("gallery_albums")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("gallery_id", gallery.id)
    // Only the design as sent: after the client marked corrections it waits for the photographer's
    // update, and approving the old one would send it to print.
    .eq("status", "sent")
    .select("*")
    .maybeSingle<GalleryAlbumRow>();
  if (!album) {
    const { data: existing } = await supabase.from("gallery_albums").select("status").eq("gallery_id", gallery.id).neq("status", "draft").maybeSingle<{ status: string }>();
    if (existing?.status === "approved") return NextResponse.json({ ok: true, already: true });
    if (existing?.status === "changes_requested") return NextResponse.json({ error: "העיצוב מחכה לעדכון של הצלם" }, { status: 409 });
    return NextResponse.json({ error: "האלבום לא נמצא" }, { status: 404 });
  }

  // The pages the client changed themselves before approving (lib/albumClientEdit.ts): they go to
  // print as the client left them, so the photographer hears which.
  const { data: pageRows } = await supabase
    .from("gallery_album_spreads")
    .select("client_edited_at")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .returns<{ client_edited_at: string | null }[]>();
  const changedPages = clientChangedPages(pageRows ?? []);

  const print = await autoSendApprovedAlbum(supabase, {
    galleryId: gallery.id,
    album,
    photographerId: gallery.photographer_id,
    origin: new URL(request.url).origin,
  }).catch((e): AutoPrintResult => {
    console.error("[album approve] auto print failed", e);
    return { kind: "failed" };
  });

  if (gallery.event_id) {
    // Counts as the client's album approval for the reminder (lib/clientReminders.ts).
    await markClientDone(supabase, gallery.event_id, "album_approval");
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: "הלקוח/ה אישרו את עיצוב האלבום",
      is_client_action: true,
    });
    if (changedPages.length) {
      await supabase.from("event_notifications").insert({
        event_id: gallery.event_id,
        text: `הלקוח/ה שינו בעצמם את העיצוב בעמודים ${changedPages.join(", ")} לפני האישור`,
        is_client_action: true,
      });
    }
    await markAlbumApprovalStageDone(supabase, gallery.event_id).catch((e) => console.error("[album approve] stage", e));
    const printLine = autoPrintLogLine(print);
    if (printLine) await supabase.from("event_notifications").insert({ event_id: gallery.event_id, text: printLine });
    await notifyPhotographerOfAlbumActivity(supabase, gallery.event_id, "אישרו את עיצוב האלבום הסופי");
  }

  await tellPhotographer(supabase, gallery, print, changedPages).catch((e) => console.error("[album approve] notify failed", e));
  return NextResponse.json({ ok: true });
}

// The photographer's email (approved, and what happened with the print house), and the phone
// notification for a gallery without an event (an event's goes through notifyPhotographerOfAlbumActivity).
async function tellPhotographer(supabase: ReturnType<typeof createServiceRoleClient>, gallery: GalleryRow, print: AutoPrintResult, changedPages: number[]) {
  const [{ data: photographer }, { data: event }] = await Promise.all([
    supabase.from("photographers").select("name, email, ui_lang").eq("id", gallery.photographer_id).maybeSingle<{ name: string | null; email: string | null; ui_lang: string | null }>(),
    gallery.event_id
      ? supabase.from("events").select("client_name").eq("id", gallery.event_id).maybeSingle<{ client_name: string }>()
      : Promise.resolve({ data: null as { client_name: string } | null }),
  ]);
  const t = makeT(messagesFor(photographerLang(photographer?.ui_lang)));
  const name = event?.client_name ?? gallery.title ?? "";
  const path = gallery.event_id ? `/events/${gallery.event_id}` : `/galleries/${gallery.id}?openAlbum=1`;
  if (!gallery.event_id) {
    await sendPushToPhotographer(gallery.photographer_id, {
      title: t("עיצוב האלבום אושר: {name}", { name }),
      body: t("לחצו לפתיחת האלבום"),
      url: path,
      tag: `album-${gallery.id}`,
    });
  }
  if (!photographer?.email) return;
  const link = await shortPageUrl(path, { photographerId: gallery.photographer_id, ttlSeconds: PAGE_LINK_TTL });
  const printText =
    print.kind === "sent"
      ? t("האלבום נשלח לבית הדפוס ({email}) בקבצי JPG במידות האלבום. כשהשליחה תסתיים, זה יופיע גם בכרטיס האירוע.", { email: print.email })
      : print.kind === "no_print_house"
        ? t("האלבום לא נשלח לדפוס, כי אין כתובת שמורה של בית דפוס. אפשר לשלוח מכלי האלבום.")
        : print.kind === "busy"
          ? t("האלבום לא נשלח לדפוס, כי ייצוא אחר רץ באותו זמן. אפשר לשלוח מכלי האלבום.")
          : print.kind === "failed"
            ? t("השליחה האוטומטית לדפוס נכשלה. אפשר לשלוח מכלי האלבום.")
            : "";
  await sendEmail({
    to: notificationEmailFor(photographer.email),
    subject: t("עיצוב האלבום אושר: {name}", { name }),
    text:
      `${t("שלום {name},", { name: photographer.name ?? "" })}\n\n` +
      `${t("{client} אישרו את עיצוב האלבום בגלריה.", { client: name })}\n` +
      (changedPages.length ? `${t("לפני האישור הם שינו בעצמם את העיצוב בעמודים: {pages}.", { pages: changedPages.join(", ") })}\n` : "") +
      (printText ? `${printText}\n` : "") +
      `\n${link}`,
  });
}
