import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { notifyPhotographerOfAlbumActivity } from "@/lib/albumNotify";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";
import { markClientDone } from "@/lib/clientReminders";

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
    .select("*")
    .eq("gallery_id", gallery.id)
    .neq("status", "draft")
    .maybeSingle<GalleryAlbumRow>();
  if (!album) {
    return NextResponse.json({ error: "האלבום לא נמצא" }, { status: 404 });
  }

  await supabase
    .from("gallery_albums")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", album.id);

  if (gallery.event_id) {
    // Counts as the client's album approval for the 3-day reminder (lib/clientReminders.ts).
    await markClientDone(supabase, gallery.event_id, "album_approval");
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: "הלקוח/ה אישרו את עיצוב האלבום",
      is_client_action: true,
    });
    await notifyPhotographerOfAlbumActivity(supabase, gallery.event_id, "אישרו את עיצוב האלבום הסופי");
  }

  return NextResponse.json({ ok: true });
}
