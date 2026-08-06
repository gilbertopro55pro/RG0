import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import type { GalleryRow } from "@/lib/types";

type GalleryWithRelations = GalleryRow & {
  photographers: { name: string; email: string } | null;
  events: { client_name: string } | null;
};

const ARCHIVE_TO_DELETE_DAYS = 7;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

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
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: `הגלריה עברה לארכיון ותימחק סופית בתאריך ${deleteDateHe}`,
    });

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
      .select("storage_path")
      .eq("gallery_id", gallery.id)
      .returns<{ storage_path: string }[]>();

    if (photos && photos.length > 0) {
      await supabase.storage.from("galleries").remove(photos.map((p) => p.storage_path));
    }

    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: "הגלריה נמחקה סופית מהאחסון",
    });

    await supabase.from("galleries").delete().eq("id", gallery.id);
    deletedCount++;
  }

  return NextResponse.json({ archived: archivedCount, deleted: deletedCount });
}
