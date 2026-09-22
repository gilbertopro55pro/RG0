import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { getOrCreatePreviewUrl } from "@/lib/galleryPhotoPreview";

export const runtime = "nodejs";

// Self-healing backfill for photos the desktop app can never correctly show a preview for, for
// TWO separate reasons:
//
// 1. preview_storage_path IS NULL — the desktop app's own upload route (and the FTP-server one)
//    used to insert the gallery_photos row and trigger nothing else, relying entirely on some
//    VIEWING route to lazily generate the preview — but the desktop app never calls a /preview
//    route itself (it reads preview_storage_path straight from Supabase), so a gallery uploaded
//    only through desktop/FTP and never opened in a browser stayed broken forever. Both upload
//    routes now trigger generation themselves going forward (see their own comments), but existing
//    rows from before that fix still need this.
//
// 2. preview_storage_path is set but NOT a .webp file — a real, separate bug: legacy previews
//    (generated before the public-CDN/.webp system existed) are .jpg files living in the OLD
//    PRIVATE bucket, which need a signed, expiring URL to read (see getOrCreatePreviewUrl's own
//    branch for this). The desktop app's previewUrlFor(), though, always builds a bare PUBLIC CDN
//    URL from whatever path is stored — for a legacy .jpg path that URL 404s, showing a real
//    broken-image glyph (not a blank box) since the desktop app has no code path that could ever
//    call the private, signed-URL branch. Passing `preview_storage_path: null` here (even though
//    the real row has one) forces getOrCreatePreviewUrl to treat it as missing and regenerate a
//    fresh .webp in the public bucket instead of returning the old private path back unchanged.
//
// Called by the desktop app itself, fire-and-forget, whenever it notices a gallery it just loaded
// has a photo it can't build a working preview URL for — so the fix applies automatically the next
// time this exact gallery is opened, no manual/admin action needed. Capped per call so one gallery
// with a large backlog can't run into a serverless timeout; the desktop app can just call it again
// if `remaining > 0`.
const BATCH_SIZE = 15;
const NEEDS_BACKFILL_FILTER = "preview_storage_path.is.null,preview_storage_path.not.like.%.webp";

export async function POST(request: Request, { params }: { params: Promise<{ galleryId: string }> }) {
  const { galleryId } = await params;
  const auth = await authenticateGalleryRequest(request);
  if ("error" in auth) return auth.error;

  const serviceRole = createServiceRoleClient();
  const { data: gallery } = await serviceRole
    .from("galleries")
    .select("id, photographer_id")
    .eq("id", galleryId)
    .maybeSingle<{ id: string; photographer_id: string }>();
  if (!gallery || gallery.photographer_id !== auth.userId) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  const { data: rows } = await serviceRole
    .from("gallery_photos")
    .select("id, gallery_id, storage_path, preview_storage_path")
    .eq("gallery_id", galleryId)
    .or(NEEDS_BACKFILL_FILTER)
    .limit(BATCH_SIZE)
    .returns<{ id: string; gallery_id: string; storage_path: string; preview_storage_path: string | null }[]>();

  const photos = rows ?? [];
  let fixed = 0;
  for (const photo of photos) {
    try {
      // Force regeneration for a legacy (non-.webp) path — see this route's own comment above for
      // why the OLD path can never be reused as-is.
      const needsRegenerate = !!photo.preview_storage_path && !photo.preview_storage_path.endsWith(".webp");
      const url = await getOrCreatePreviewUrl(serviceRole, needsRegenerate ? { ...photo, preview_storage_path: null } : photo);
      if (url) fixed++;
    } catch (e) {
      console.error("[backfill-previews] failed", photo.id, e);
    }
  }

  const { count: remaining } = await serviceRole
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId)
    .or(NEEDS_BACKFILL_FILTER);

  return NextResponse.json({ attempted: photos.length, fixed, remaining: remaining ?? 0 });
}
