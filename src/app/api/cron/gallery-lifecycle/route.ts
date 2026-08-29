import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { GENERIC_STAGE_UPDATE_TEMPLATE } from "@/lib/stages";
import { removeObjects } from "@/lib/storage";
import type { GalleryRow } from "@/lib/types";

type GalleryWithRelations = GalleryRow & {
  photographers: { name: string; email: string } | null;
  events: { client_name: string } | null;
};

const ARCHIVE_TO_DELETE_DAYS = 7;
const REMINDER_DAYS_BEFORE_EXPIRY = 7;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  // 0. Email the client a heads-up exactly a week before their gallery expires (this is what
  // GalleryManageView's "client_email" field and copy actually promises — before this, the field
  // was collected but nothing ever sent). reminder_sent_at guards against re-sending on every
  // day's cron run while a gallery sits in its final week.
  const reminderCutoff = new Date(now.getTime() + REMINDER_DAYS_BEFORE_EXPIRY * 24 * 60 * 60 * 1000);
  const { data: toRemind } = await supabase
    .from("galleries")
    .select("*, events(client_name)")
    .eq("published", true)
    .is("archived_at", null)
    .is("reminder_sent_at", null)
    .not("client_email", "is", null)
    .not("expires_at", "is", null)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", reminderCutoff.toISOString())
    .returns<(GalleryRow & { events: { client_name: string } | null })[]>();

  let remindedCount = 0;
  for (const gallery of toRemind ?? []) {
    const clientLabel = gallery.events?.client_name ?? gallery.title;
    const expiryDateHe = new Date(gallery.expires_at!).toLocaleDateString("he-IL");
    try {
      await sendEmail({
        to: gallery.client_email!,
        subject: `תזכורת: הגלריה "${gallery.title}" תפוג בקרוב`,
        text:
          `שלום,\n\n` +
          `הגלריה "${gallery.title}"${clientLabel !== gallery.title ? ` (${clientLabel})` : ""} תהיה זמינה לצפייה והורדה עד ${expiryDateHe}.\n` +
          `לאחר מכן היא תוסר ולא תהיה נגישה יותר — מומלץ להוריד את התמונות שרציתם לפני כן.`,
      });
    } catch (e) {
      console.error("Gallery expiry reminder email failed:", e);
    }
    await supabase.from("galleries").update({ reminder_sent_at: now.toISOString() }).eq("id", gallery.id);
    remindedCount++;
  }

  // 0b. Same heads-up, over WhatsApp, to whichever galleries have a client_phone set — a fully
  // independent channel from the email reminder above (own dedupe column, own not-null filter), so
  // a photographer can fill in either field, both, or neither. Business-initiated messages need an
  // approved template outside the 24h session window (see sendWhatsAppTemplate's own comment) —
  // reuses the same generic "stage update" template already used for ad-hoc custom-stage notices
  // elsewhere in this app (client_name + free-text body), rather than requiring a brand new
  // Meta-approved template just for this one notice.
  const { data: toRemindWhatsApp } = await supabase
    .from("galleries")
    .select("*, events(client_name)")
    .eq("published", true)
    .is("archived_at", null)
    .is("whatsapp_reminder_sent_at", null)
    .not("client_phone", "is", null)
    .not("expires_at", "is", null)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", reminderCutoff.toISOString())
    .returns<(GalleryRow & { events: { client_name: string } | null })[]>();

  let remindedWhatsAppCount = 0;
  for (const gallery of toRemindWhatsApp ?? []) {
    const clientLabel = gallery.events?.client_name ?? gallery.title;
    const expiryDateHe = new Date(gallery.expires_at!).toLocaleDateString("he-IL");
    try {
      await sendWhatsAppTemplate(gallery.client_phone!, GENERIC_STAGE_UPDATE_TEMPLATE, [
        clientLabel,
        `הגלריה "${gallery.title}" תהיה זמינה לצפייה והורדה עד ${expiryDateHe} ולאחר מכן תוסר — מומלץ להוריד את התמונות שרציתם לפני כן`,
      ]);
    } catch (e) {
      console.error("Gallery expiry reminder WhatsApp message failed:", e);
    }
    await supabase.from("galleries").update({ whatsapp_reminder_sent_at: now.toISOString() }).eq("id", gallery.id);
    remindedWhatsAppCount++;
  }

  // 1. Archive galleries whose validity period has ended.
  const { data: toArchive } = await supabase
    .from("galleries")
    .select("*, photographers(name, email), events(client_name)")
    .eq("published", true)
    .is("archived_at", null)
    .not("expires_at", "is", null)
    .lte("expires_at", now.toISOString())
    .returns<GalleryWithRelations[]>();

  let archivedCount = 0;
  for (const gallery of toArchive ?? []) {
    const permanentDeleteAt = new Date(now.getTime() + ARCHIVE_TO_DELETE_DAYS * 24 * 60 * 60 * 1000);
    await supabase
      .from("galleries")
      .update({ archived_at: now.toISOString(), permanent_delete_at: permanentDeleteAt.toISOString() })
      .eq("id", gallery.id);

    const deleteDateHe = permanentDeleteAt.toLocaleDateString("he-IL");
    // Standalone galleries (no event) have nothing to attach an event_notifications row to —
    // the email below (keyed off photographer_id, not event_id) is their only heads-up.
    if (gallery.event_id) {
      await supabase.from("event_notifications").insert({
        event_id: gallery.event_id,
        text: `הגלריה עברה לארכיון ותימחק סופית בתאריך ${deleteDateHe}`,
      });
    }

    if (gallery.photographers?.email) {
      try {
        await sendEmail({
          to: gallery.photographers.email,
          subject: `הגלריה של ${gallery.events?.client_name ?? "האירוע"} עברה לארכיון`,
          text:
            `שלום ${gallery.photographers.name},\n\n` +
            `תוקף הגלריה "${gallery.title}" (${gallery.events?.client_name ?? ""}) הסתיים והיא עברה לארכיון.\n` +
            `הגלריה תימחק סופית מהאחסון בתאריך ${deleteDateHe}, כולל כל התמונות שבה.\n\n` +
            `אם תרצה/י לחדש את תוקף הגלריה לפני המחיקה, אפשר לעשות זאת מתוך כרטיס האירוע במערכת.`,
        });
      } catch (e) {
        console.error("Gallery archive email failed:", e);
      }
    }
    archivedCount++;
  }

  // 2. Permanently delete galleries whose week in archive is up.
  const { data: toDelete } = await supabase
    .from("galleries")
    .select("*")
    .not("archived_at", "is", null)
    .not("permanent_delete_at", "is", null)
    .lte("permanent_delete_at", now.toISOString())
    .returns<GalleryRow[]>();

  let deletedCount = 0;
  for (const gallery of toDelete ?? []) {
    const { data: photos } = await supabase
      .from("gallery_photos")
      .select("storage_path, preview_storage_path")
      .eq("gallery_id", gallery.id)
      .returns<{ storage_path: string; preview_storage_path: string | null }[]>();

    if (photos && photos.length > 0) {
      const paths = photos.flatMap((p) => [p.storage_path, p.preview_storage_path].filter((x): x is string => !!x));
      await removeObjects("galleries", paths);
    }

    if (gallery.event_id) {
      await supabase.from("event_notifications").insert({
        event_id: gallery.event_id,
        text: "הגלריה נמחקה סופית מהאחסון",
      });
    }

    await supabase.from("galleries").delete().eq("id", gallery.id);
    deletedCount++;
  }

  return NextResponse.json({
    reminded: remindedCount,
    remindedWhatsApp: remindedWhatsAppCount,
    archived: archivedCount,
    deleted: deletedCount,
  });
}
