import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryRow } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 200;

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)) : [];
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body: { favoritePhotoIds?: unknown; added?: unknown; removed?: unknown } = await request.json().catch(() => ({}));

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

  const setFavorite = async (photoIds: string[], value: boolean) => {
    for (let i = 0; i < photoIds.length; i += CHUNK) {
      const { error } = await supabase
        .from("gallery_photos")
        .update({ is_favorite: value })
        .eq("gallery_id", gallery.id)
        .in("id", photoIds.slice(i, i + CHUNK));
      if (error) return error;
    }
    return null;
  };

  // Only what changed since the last save (2026-10-13). The client's link can be narrowed to some
  // tabs or photos (?folders= / ?photos=), and replacing the whole set with what that page could
  // see erased every favorite outside it. A page from before this change still sends the whole set.
  if (Array.isArray(body.added) || Array.isArray(body.removed)) {
    const error = (await setFavorite(ids(body.removed), false)) ?? (await setFavorite(ids(body.added), true));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const favoritePhotoIds = ids(body.favoritePhotoIds);
    const { error: clearError } = await supabase
      .from("gallery_photos")
      .update({ is_favorite: false })
      .eq("gallery_id", gallery.id)
      .eq("is_favorite", true);
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }
    const setError = await setFavorite(favoritePhotoIds, true);
    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500 });
    }
  }

  // Only notify the photographer for post-confirmation edits — the first-ever confirmation
  // already sends its own (louder) email via /confirm-selection, so this stays in-app only.
  // Standalone galleries (no event) have no event_notifications feed to write to.
  if (gallery.selection_confirmed_at && gallery.event_id) {
    const { count } = await supabase
      .from("gallery_photos")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", gallery.id)
      .eq("is_favorite", true);
    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: `הלקוח/ה עדכנו את בחירת התמונות מהגלריה, נבחרו כעת ${count ?? 0} תמונות`,
      is_client_action: true,
    });
  }

  return NextResponse.json({ ok: true });
}
