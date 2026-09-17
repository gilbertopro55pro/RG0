import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { GalleryRow } from "@/lib/types";

// Saves immediately on the client's own confirm (not batched with favorites) — a free-text label
// on a single photo is a much smaller, self-contained edit than the whole favorites set, and
// there's no natural "unsaved until you leave" moment for it the way there is for favorite-picking.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { photoId, label }: { photoId: string; label: string | null } = await request.json();

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

  const trimmed = label?.trim() || null;

  // Scoped to this gallery's own id, not just the photo id — a client can only ever label a photo
  // that's actually inside the gallery their access token opens, same boundary the favorite route
  // enforces for the whole favorites set.
  const { error } = await supabase
    .from("gallery_photos")
    .update({ custom_label: trimmed })
    .eq("id", photoId)
    .eq("gallery_id", gallery.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
