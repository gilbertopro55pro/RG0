import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryRow } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { favoritePhotoIds }: { favoritePhotoIds: string[] } = await request.json();

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

  const { error: clearError } = await supabase
    .from("gallery_photos")
    .update({ is_favorite: false })
    .eq("gallery_id", gallery.id)
    .eq("is_favorite", true);

  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 });
  }

  if (favoritePhotoIds.length > 0) {
    const { error: setError } = await supabase
      .from("gallery_photos")
      .update({ is_favorite: true })
      .eq("gallery_id", gallery.id)
      .in("id", favoritePhotoIds);

    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500 });
    }
  }

  // Only notify the photographer for post-confirmation edits — the first-ever confirmation
  // already sends its own (louder) email via /confirm-selection, so this stays in-app only.
  // Standalone galleries (no event) have no event_notifications feed to write to.
  if (gallery.selection_confirmed_at && gallery.event_id) {
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: `הלקוח/ה עדכנו את בחירת התמונות מהגלריה, נבחרו כעת ${favoritePhotoIds.length} תמונות`,
      is_client_action: true,
    });
  }

  return NextResponse.json({ ok: true });
}
