import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryAlbumRow, GalleryRow } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { spreadId, text }: { spreadId: string; text: string } = await request.json();

  if (!spreadId || !text?.trim()) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

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

  const { data: spread } = await supabase
    .from("gallery_album_spreads")
    .select("id")
    .eq("id", spreadId)
    .eq("album_id", album.id)
    .maybeSingle<{ id: string }>();
  if (!spread) {
    return NextResponse.json({ error: "העמוד לא נמצא" }, { status: 404 });
  }

  const { error: insertError } = await supabase
    .from("gallery_album_comments")
    .insert({ album_id: album.id, spread_id: spreadId, text: text.trim() });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // A comment means the client wants something changed — reopen the album for the photographer.
  if (album.status !== "changes_requested") {
    await supabase.from("gallery_albums").update({ status: "changes_requested" }).eq("id", album.id);
  }

  if (gallery.event_id) {
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: `הלקוח/ה הוסיפו הערה על האלבום`,
      is_client_action: true,
    });
  }

  return NextResponse.json({ ok: true });
}
