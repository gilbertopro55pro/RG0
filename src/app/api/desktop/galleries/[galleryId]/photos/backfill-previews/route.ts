import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { getOrCreatePreviewUrl } from "@/lib/galleryPhotoPreview";
import type { GalleryPhotoRow } from "@/lib/types";

export const runtime = "nodejs";

// The desktop app's own self-heal call (see photoApi.ts's backfillMissingPreviews) — this route
// used to not exist at all, so every call 404'd silently and photos uploaded through the desktop
// app (or the FTP watcher) were left with preview_storage_path: null forever, shown as a broken-
// image glyph everywhere previewUrlFor() is used. The web app's own upload flow avoids this by
// firing an eager warm-up request right after each upload (GalleryManageView.tsx); the desktop app
// has no cookie session to make that same call with, so it instead calls this bearer-authenticated
// route once per gallery load, which is a no-op once every photo in the gallery already has one.
// One batch per call (not the whole gallery) to stay well under a serverless function's own time
// limit on a large backlog — the caller re-invokes this on every load until `remaining` hits 0.
const BATCH_SIZE = 15;

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

  const { data: photos } = await serviceRole
    .from("gallery_photos")
    .select("id, gallery_id, storage_path, preview_storage_path")
    .eq("gallery_id", galleryId)
    .is("preview_storage_path", null)
    .order("sort_order", { ascending: true })
    .limit(BATCH_SIZE)
    .returns<Pick<GalleryPhotoRow, "id" | "gallery_id" | "storage_path" | "preview_storage_path">[]>();

  if (photos && photos.length > 0) {
    await Promise.all(photos.map((photo) => getOrCreatePreviewUrl(serviceRole, photo).catch(() => null)));
  }

  const { count } = await serviceRole
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId)
    .is("preview_storage_path", null);

  return NextResponse.json({ remaining: count ?? 0 });
}
