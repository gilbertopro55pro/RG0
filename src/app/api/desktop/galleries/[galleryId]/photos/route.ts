import { NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { getOrCreatePreviewUrl } from "@/lib/galleryPhotoPreview";

export const runtime = "nodejs";

// Step 2 of the desktop app's upload pipeline — called after the desktop app has already PUT the
// file bytes straight to R2 using the presigned URL from .../upload-url. Registers the row so the
// photo shows up in the gallery, then warms its preview the same way the web app's own upload flow
// does (GalleryManageView.tsx fires an equivalent request right after each browser upload) — via
// `after()` so it runs post-response instead of adding sharp's decode/resize/encode time to the
// desktop app's own upload latency. Without this, a photo uploaded here would sit with
// preview_storage_path: null until something else happened to view it — nothing in the desktop app
// ever does, since it reads previews straight off the public CDN URL (see photoApi.ts) rather than
// through a route that can generate one on demand.
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

  const { path, filename, fileSizeBytes }: { path?: string; filename?: string; fileSizeBytes?: number } = await request
    .json()
    .catch(() => ({}));
  if (!path || !filename || !path.startsWith(`${auth.userId}/${galleryId}/`)) {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }

  const { count } = await serviceRole
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", galleryId);

  const { data: photo, error } = await serviceRole
    .from("gallery_photos")
    .insert({
      gallery_id: galleryId,
      photographer_id: auth.userId,
      storage_path: path,
      original_filename: filename,
      file_size_bytes: fileSizeBytes ?? 0,
      sort_order: count ?? 0,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !photo) {
    return NextResponse.json({ error: error?.message ?? "שגיאה בשמירת התמונה" }, { status: 500 });
  }

  after(() =>
    getOrCreatePreviewUrl(serviceRole, { id: photo.id, gallery_id: galleryId, storage_path: path, preview_storage_path: null }).catch(
      () => null
    )
  );

  return NextResponse.json({ id: photo.id });
}
